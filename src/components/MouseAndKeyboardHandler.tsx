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

  // Next player (live observer follow mode): fire trigger 0.
  useInputAction("nextPlayer", () => {
    triggerFire.current = true;
  });

  // Handle mousewheel for speed adjustment.
  useInputAction("adjustSpeed", () => {
    const scroll = getInputState().adjustSpeed as ScrollState | undefined;
    if (!scroll || scroll.deltaY === 0) return;

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
    // Suppress all input while a camera tour is active.
    if (cameraTourStore.getState().animation) return;

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
