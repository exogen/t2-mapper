import {
  MAX_SPEED_MULTIPLIER,
  MIN_SPEED_MULTIPLIER,
  setPreference,
  settingsStore,
} from "../state/settingsStore";
import { cameraTourStore } from "../state/cameraTourStore";
import { isWelcomeSplashOpen } from "../state/welcomeSplashState";
import {
  commandCircuitStore,
  isCommandFollowActive,
} from "../state/commandCircuitStore";
import { liveConnectionStore } from "../state/liveConnectionStore";
import { resolveCameraOwner } from "../state/cameraOwner";
import { inputModeStore } from "../state/inputModeStore";
import {
  streamPlaybackStore,
  MIN_ORBIT_DISTANCE,
  MAX_ORBIT_DISTANCE,
} from "../state/streamPlaybackStore";
import {
  clearInputDeltas,
  inputControlsStore,
  isPressed,
  subscribeAction,
  type DragState,
  type ScrollState,
} from "../state/inputControls";
import { missionCameraCount, selectMissionCamera } from "./missionCameras";
import { FramePriority } from "./framePriority";
import { combineCleanups } from "./storeReaction";
import type { GameEngine } from "./gameEngine";

export const ARROW_LOOK_SPEED = 1; // radians/sec

const MIN_SPEED_ADJUSTMENT = 1;
const MAX_SPEED_ADJUSTMENT = 11;
/** Orbit-distance zoom per scroll-delta unit (matches the CC map's feel). */
const ORBIT_ZOOM_SENSITIVITY = 0.002;

/** Hardcoded drag sensitivity for non-locked drag (not affected by user setting). */
const DRAG_SENSITIVITY = 0.002;

/** Keep keyboard movement on the server Move's 16 nonzero axis levels. */
function quantizeSpeed(speedMultiplier: number): number {
  const t =
    (speedMultiplier - MIN_SPEED_MULTIPLIER) /
    (MAX_SPEED_MULTIPLIER - MIN_SPEED_MULTIPLIER);
  const steps = Math.round(t * 15);
  return (steps + 1) / 16;
}

const isTouchDevice = () => window.matchMedia("(pointer: coarse)").matches;

/**
 * Keyboard and mouse camera input: look (pointer lock, drag, arrow keys),
 * movement, observer triggers, the scroll wheel (fly speed or orbit
 * distance) and number-key mission cameras. Reports one InputFrame per
 * frame to the engine's input queue.
 */
export function installKeyboardMouseInput(engine: GameEngine): () => void {
  // Trigger flags set by event handlers, consumed in the frame callback.
  let triggerFire = false;
  let triggerJet = false;
  let triggerObserve = false;

  // Exit pointer lock when switching to touch mode.
  const touchQuery = window.matchMedia("(pointer: coarse)");
  const onTouchChange = () => {
    if (touchQuery.matches && document.pointerLockElement) {
      document.exitPointerLock();
    }
  };
  touchQuery.addEventListener("change", onTouchChange);

  const selectCamera = (i: number) => {
    if (i < missionCameraCount()) selectMissionCamera(i);
  };

  return combineCleanups(
    () => touchQuery.removeEventListener("change", onTouchChange),
    // Exit pointer lock when a tour starts.
    cameraTourStore.subscribe((state) => {
      if (state.animation && document.pointerLockElement) {
        document.exitPointerLock();
      }
    }),
    // Canvas click: lock pointer (only fires when not already locked).
    // Suppressed while the welcome splash is up — clicking around it
    // shouldn't capture the mouse.
    engine.withHost(({ renderer }) =>
      subscribeAction("canvasClick", () => {
        if (
          !isTouchDevice() &&
          !cameraTourStore.getState().animation &&
          !isWelcomeSplashOpen()
        ) {
          renderer.domElement.requestPointerLock();
        }
      }),
    ),
    // Next/prev player (live observer follow mode): fire trigger 0 cycles
    // forward, jet trigger 3 cycles backward (camera.cs observerFollow).
    subscribeAction("nextPlayer", () => {
      triggerFire = true;
    }),
    subscribeAction("prevPlayer", () => {
      triggerJet = true;
    }),
    subscribeAction("nextPlayerKey", () => {
      triggerFire = true;
    }),
    subscribeAction("prevPlayerKey", () => {
      triggerJet = true;
    }),
    // Next/prev observed player from the live command circuit. In follow
    // mode these are the real client's fire/jet triggers (camera.cs
    // observerFollow onTrigger cycles next/prev); from fly mode,
    // ObserveClient -1 enters follow mode at the server's next observable
    // player (the server has no enter-at-prev, so both arrows enter there).
    subscribeAction("observeNextPlayer", () => {
      // Live only — demo cycling is handled by demoCameraSelection.
      if (!liveConnectionStore.getState().adapter) return;
      if (isCommandFollowActive()) {
        triggerFire = true;
      } else {
        liveConnectionStore.getState().sendCommand("ObserveClient", "-1");
      }
    }),
    subscribeAction("observePrevPlayer", () => {
      if (!liveConnectionStore.getState().adapter) return;
      if (isCommandFollowActive()) {
        triggerJet = true;
      } else {
        liveConnectionStore.getState().sendCommand("ObserveClient", "-1");
      }
    }),
    // Handle mousewheel for speed adjustment.
    subscribeAction("adjustSpeed", () => {
      const scroll = inputControlsStore.getState().actions.adjustSpeed as
        ScrollState | undefined;
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

      const scrollSign = settingsStore.getState().invertScroll ? -1 : 1;
      const direction = (scroll.deltaY > 0 ? -1 : 1) * scrollSign;
      const scaledDeltaY = Math.ceil(Math.log2(Math.abs(scroll.deltaY) + 1));
      const speedDelta =
        Math.max(
          MIN_SPEED_ADJUSTMENT,
          Math.min(MAX_SPEED_ADJUSTMENT, scaledDeltaY),
        ) * direction;

      setPreference("speedMultiplier", (prev) => {
        const newSpeed = (Math.round(prev * 100) + speedDelta) / 100;
        return Math.max(
          MIN_SPEED_MULTIPLIER,
          Math.min(MAX_SPEED_MULTIPLIER, newSpeed),
        );
      });
    }),
    // Number keys 1-9 select mission cameras.
    ...Array.from({ length: 9 }, (_, i) =>
      subscribeAction(`camera${i + 1}`, () => selectCamera(i)),
    ),
    // 'O' key: toggle observer mode (sets trigger 2).
    subscribeAction("toggleObserverMode", () => {
      triggerObserve = true;
    }),
    // Build and emit InputFrame each render frame.
    engine.scheduler.add(FramePriority.InputKeyboardMouse, ({ delta }) => {
      // Suppress all input while anything but local input owns the camera.
      // (The director unmounts these bindings anyway — this stops
      // pointer-locked deltas from accumulating.)
      const cameraOwner = resolveCameraOwner();
      if (cameraOwner === "tour" || cameraOwner === "director") return;
      if (cameraOwner === "commandCircuit") {
        // Camera look/move stays suppressed, but observer triggers (player
        // cycling from the CC view) must still reach the server via moves.
        // Deltas are NOT cleared here — the CC rig consumes drag/scroll/
        // pinch for panning and clears them at the end of its own frame.
        const triggers = [false, false, false, false, false, false];
        if (triggerFire) {
          triggers[0] = true;
          triggerFire = false;
        }
        if (triggerJet) {
          triggers[3] = true;
          triggerJet = false;
        }
        if (commandCircuitStore.getState().consumeObserverToggle()) {
          triggers[2] = true;
        }
        if (triggers.some(Boolean)) {
          engine.input.push({
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

      const inputState = inputControlsStore.getState().actions;
      const { speedMultiplier, mouseSensitivity, invertDrag } =
        settingsStore.getState();

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
        const orbitFlip = inputModeStore.getState().mode === "follow" ? -1 : 1;
        const dragSign = (invertDrag ? 1 : -1) * orbitFlip;
        deltaYaw += dragSign * drag.deltaX * DRAG_SENSITIVITY;
        deltaPitch += dragSign * drag.deltaY * DRAG_SENSITIVITY;
      }

      // Arrow keys contribute to look deltas.
      if (isPressed(inputState, "lookLeft"))
        deltaYaw -= ARROW_LOOK_SPEED * delta;
      if (isPressed(inputState, "lookRight"))
        deltaYaw += ARROW_LOOK_SPEED * delta;
      if (isPressed(inputState, "lookUp"))
        deltaPitch -= ARROW_LOOK_SPEED * delta;
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
      if (triggerFire) {
        triggers[0] = true;
        triggerFire = false;
      }
      if (triggerJet) {
        triggers[3] = true;
        triggerJet = false;
      }
      if (triggerObserve) {
        triggers[2] = true;
        triggerObserve = false;
      }

      // Always clear deltas so stale values don't linger in the store.
      clearInputDeltas();

      // Only emit if there's actual input.
      const hasLook = deltaYaw !== 0 || deltaPitch !== 0;
      const hasMove = x !== 0 || y !== 0 || z !== 0;
      const hasTriggers = triggers.some(Boolean);
      if (!hasLook && !hasMove && !hasTriggers) return;

      engine.input.push({
        deltaYaw,
        deltaPitch,
        x,
        y,
        z,
        triggers,
        delta,
      });
    }),
  );
}
