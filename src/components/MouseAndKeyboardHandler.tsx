import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  MAX_SPEED_MULTIPLIER,
  MIN_SPEED_MULTIPLIER,
  useControls,
} from "./SettingsProvider";
import { useCameras } from "./CamerasProvider";
import { useInputContext } from "./InputContext";
import { useTouchDevice } from "./useTouchDevice";
import { cameraTourStore } from "../state/cameraTourStore";
import {
  commandCircuitStore,
  isCommandFollowActive,
} from "../state/commandCircuitStore";
import { liveConnectionStore } from "../state/liveConnectionStore";
import {
  streamPlaybackStore,
  MIN_ORBIT_DISTANCE,
  MAX_ORBIT_DISTANCE,
} from "../state/streamPlaybackStore";
import {
  useInputAction,
  useInputState,
  clearInputDeltas,
  type ActionState,
  type DragState,
  type KeyState,
  type ScrollState,
} from "./InputControls";

export const ARROW_LOOK_SPEED = 1; // radians/sec

const MIN_SPEED_ADJUSTMENT = 1;
const MAX_SPEED_ADJUSTMENT = 11;
/** Orbit-distance zoom per scroll-delta unit (matches the CC map's feel). */
const ORBIT_ZOOM_SENSITIVITY = 0.002;

/** Hardcoded drag sensitivity for non-locked drag (not affected by user setting). */
const DRAG_SENSITIVITY = 0.002;

function quantizeSpeed(speedMultiplier: number): number {
  const t =
    (speedMultiplier - MIN_SPEED_MULTIPLIER) / (1 - MIN_SPEED_MULTIPLIER);
  const steps = Math.round(t * 15);
  return (steps + 1) / 16;
}

function isPressed(state: Record<string, ActionState>, name: string): boolean {
  const s = state[name];
  return s != null && "pressed" in s && (s as KeyState).pressed;
}

export function MouseAndKeyboardHandler() {
  const isTouch = useTouchDevice();

  const {
    speedMultiplier,
    setSpeedMultiplier,
    mouseSensitivity,
    invertScroll,
    invertDrag,
  } = useControls();
  const { onInput, mode } = useInputContext();
  const [, getInputState] = useInputState();
  const gl = useThree((state) => state.gl);
  const { setCameraIndex, cameraCount } = useCameras();

  // Trigger flags set by event handlers, consumed in useFrame.
  const triggerFire = useRef(false);
  const triggerJet = useRef(false);
  const triggerObserve = useRef(false);

  // Exit pointer lock when switching to touch mode.
  useEffect(() => {
    if (isTouch && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, [isTouch]);

  // Exit pointer lock when a tour starts.
  useEffect(() => {
    return cameraTourStore.subscribe((state) => {
      if (state.animation && document.pointerLockElement) {
        document.exitPointerLock();
      }
    });
  }, []);

  // Canvas click: lock pointer (only fires when not already locked).
  useInputAction("canvasClick", () => {
    if (!isTouch && !cameraTourStore.getState().animation) {
      gl.domElement.requestPointerLock();
    }
  });

  // Next/prev player (live observer follow mode): fire trigger 0 cycles
  // forward, jet trigger 3 cycles backward (camera.cs observerFollow).
  useInputAction("nextPlayer", () => {
    triggerFire.current = true;
  });
  useInputAction("prevPlayer", () => {
    triggerJet.current = true;
  });

  // Next/prev observed player from the live command circuit. In follow
  // mode these are the real client's fire/jet triggers (camera.cs
  // observerFollow onTrigger cycles next/prev); from fly mode,
  // ObserveClient -1 enters follow mode at the server's next observable
  // player (the server has no enter-at-prev, so both arrows enter there).
  useInputAction("observeNextPlayer", () => {
    // Live only — demo cycling is handled by DemoCameraController.
    if (!liveConnectionStore.getState().adapter) return;
    if (isCommandFollowActive()) {
      triggerFire.current = true;
    } else {
      liveConnectionStore.getState().sendCommand("ObserveClient", "-1");
    }
  });
  useInputAction("observePrevPlayer", () => {
    if (!liveConnectionStore.getState().adapter) return;
    if (isCommandFollowActive()) {
      triggerJet.current = true;
    } else {
      liveConnectionStore.getState().sendCommand("ObserveClient", "-1");
    }
  });

  // Handle mousewheel for speed adjustment.
  useInputAction("adjustSpeed", () => {
    const scroll = getInputState().adjustSpeed as ScrollState | undefined;
    if (!scroll || scroll.deltaY === 0) return;

    // In follow (orbit) mode the wheel changes orbit distance, not fly
    // speed. Direction matches the command-circuit map (scroll up = zoom
    // in = closer): distance *= exp(deltaY * k), where up gives deltaY < 0.
    // Like CC, this ignores invertScroll so the two stay in sync.
    if (streamPlaybackStore.getState().cameraMode === "orbitOverride") {
      const prev = streamPlaybackStore.getState().orbitOverrideDistance;
      const next = prev * Math.exp(scroll.deltaY * ORBIT_ZOOM_SENSITIVITY);
      streamPlaybackStore.setState({
        orbitOverrideDistance: Math.max(
          MIN_ORBIT_DISTANCE,
          Math.min(MAX_ORBIT_DISTANCE, next),
        ),
      });
      return;
    }

    const scrollSign = invertScroll ? -1 : 1;
    const direction = (scroll.deltaY > 0 ? -1 : 1) * scrollSign;
    const scaledDeltaY = Math.ceil(Math.log2(Math.abs(scroll.deltaY) + 1));
    const speedDelta =
      Math.max(
        MIN_SPEED_ADJUSTMENT,
        Math.min(MAX_SPEED_ADJUSTMENT, scaledDeltaY),
      ) * direction;

    setSpeedMultiplier((prev) => {
      const newSpeed = Math.round(prev * 100) + speedDelta;
      return Math.max(
        MIN_SPEED_MULTIPLIER,
        Math.min(MAX_SPEED_MULTIPLIER, newSpeed / 100),
      );
    });
  });

  // Handle number keys 1-9 for camera selection.
  const selectCamera = (i: number) => {
    if (i < cameraCount) setCameraIndex(i);
  };
  useInputAction("camera1", () => selectCamera(0));
  useInputAction("camera2", () => selectCamera(1));
  useInputAction("camera3", () => selectCamera(2));
  useInputAction("camera4", () => selectCamera(3));
  useInputAction("camera5", () => selectCamera(4));
  useInputAction("camera6", () => selectCamera(5));
  useInputAction("camera7", () => selectCamera(6));
  useInputAction("camera8", () => selectCamera(7));
  useInputAction("camera9", () => selectCamera(8));

  // 'O' key: toggle observer mode (sets trigger 2).
  useInputAction("toggleObserverMode", () => {
    triggerObserve.current = true;
  });

  // Build and emit InputFrame each render frame.
  useFrame((_state, delta) => {
    // Suppress all input while a camera tour or command circuit is active.
    if (cameraTourStore.getState().animation) return;
    if (commandCircuitStore.getState().active) {
      // Camera look/move stays suppressed, but observer triggers (player
      // cycling from the CC view) must still reach the server via moves.
      // Deltas are NOT cleared here — the CC rig consumes drag/scroll/
      // pinch for panning and clears them at the end of its own frame.
      const triggers = [false, false, false, false, false, false];
      if (triggerFire.current) {
        triggers[0] = true;
        triggerFire.current = false;
      }
      if (triggerJet.current) {
        triggers[3] = true;
        triggerJet.current = false;
      }
      if (commandCircuitStore.getState().consumeObserverToggle()) {
        triggers[2] = true;
      }
      if (triggers.some(Boolean)) {
        onInput({
          deltaYaw: 0,
          deltaPitch: 0,
          x: 0,
          y: 0,
          z: 0,
          triggers,
          delta,
        });
      }
      return;
    }

    const inputState = getInputState();

    // ── Look deltas ──
    let deltaYaw = 0;
    let deltaPitch = 0;

    // Pointer-locked mouse movement (raw deltas, user sensitivity).
    const locked = inputState.lockedLook as DragState | undefined;
    if (locked && (locked.deltaX !== 0 || locked.deltaY !== 0)) {
      deltaYaw = locked.deltaX * mouseSensitivity;
      deltaPitch = locked.deltaY * mouseSensitivity;
    }

    // Drag-to-look (unlocked, fixed sensitivity, orbit flip in follow mode).
    const drag = inputState.dragLook as DragState | undefined;
    if (drag?.dragging && (drag.deltaX !== 0 || drag.deltaY !== 0)) {
      const orbitFlip = mode === "follow" ? -1 : 1;
      const dragSign = (invertDrag ? 1 : -1) * orbitFlip;
      deltaYaw += dragSign * drag.deltaX * DRAG_SENSITIVITY;
      deltaPitch += dragSign * drag.deltaY * DRAG_SENSITIVITY;
    }

    // Arrow keys contribute to look deltas.
    if (isPressed(inputState, "lookLeft")) deltaYaw -= ARROW_LOOK_SPEED * delta;
    if (isPressed(inputState, "lookRight"))
      deltaYaw += ARROW_LOOK_SPEED * delta;
    if (isPressed(inputState, "lookUp")) deltaPitch -= ARROW_LOOK_SPEED * delta;
    if (isPressed(inputState, "lookDown"))
      deltaPitch += ARROW_LOOK_SPEED * delta;

    // ── Movement axes ──
    let x = 0;
    let y = 0;
    let z = 0;
    if (isPressed(inputState, "moveLeft")) x -= 1;
    if (isPressed(inputState, "moveRight")) x += 1;
    if (isPressed(inputState, "moveForward")) y += 1;
    if (isPressed(inputState, "moveBackward")) y -= 1;
    if (isPressed(inputState, "moveUp")) z += 1;
    if (isPressed(inputState, "moveDown")) z -= 1;

    const quantizedSpeedMultiplier = quantizeSpeed(speedMultiplier);
    x = Math.max(-1, Math.min(1, x * quantizedSpeedMultiplier));
    y = Math.max(-1, Math.min(1, y * quantizedSpeedMultiplier));
    z = Math.max(-1, Math.min(1, z * quantizedSpeedMultiplier));

    // ── Triggers ──
    const triggers = [false, false, false, false, false, false];
    if (triggerFire.current) {
      triggers[0] = true;
      triggerFire.current = false;
    }
    if (triggerJet.current) {
      triggers[3] = true;
      triggerJet.current = false;
    }
    if (triggerObserve.current) {
      triggers[2] = true;
      triggerObserve.current = false;
    }

    // Always clear deltas so stale values don't linger in the store.
    clearInputDeltas();

    // Only emit if there's actual input.
    const hasLook = deltaYaw !== 0 || deltaPitch !== 0;
    const hasMove = x !== 0 || y !== 0 || z !== 0;
    const hasTriggers = triggers.some(Boolean);
    if (!hasLook && !hasMove && !hasTriggers) return;

    onInput({
      deltaYaw,
      deltaPitch,
      x,
      y,
      z,
      triggers,
      delta,
    });
  });

  return null;
}
