import { resolveCameraOwner } from "../state/cameraOwner";
import {
  inputControlsStore,
  type PinchState,
  type TouchState,
} from "../state/inputControls";
import { inputModeStore } from "../state/inputModeStore";
import { joystickState } from "../state/joystickState";
import { settingsStore } from "../state/settingsStore";
import {
  MAX_ORBIT_DISTANCE,
  MIN_ORBIT_DISTANCE,
  streamPlaybackStore,
} from "../state/streamPlaybackStore";
import { FramePriority } from "./framePriority";
import type { GameEngine } from "./gameEngine";

const LOOK_SENSITIVITY = 0.004;
const STICK_LOOK_SENSITIVITY = 2.5;
const DUAL_MOVE_DEADZONE = 0.08;
const DUAL_LOOK_DEADZONE = 0.15;
const SINGLE_STICK_DEADZONE = 0.15;

/** Canvas look/orbit gestures and on-screen joystick movement on touch devices. */
export function installTouchInput(engine: GameEngine): () => void {
  const touchQuery = window.matchMedia("(pointer: coarse)");
  let stop: (() => void) | null = null;
  const update = () => {
    stop?.();
    stop = touchQuery.matches ? startTouchInput(engine) : null;
  };
  update();
  touchQuery.addEventListener("change", update);
  return () => {
    touchQuery.removeEventListener("change", update);
    stop?.();
  };
}

function startTouchInput(engine: GameEngine): () => void {
  return engine.scheduler.add(FramePriority.InputTouch, ({ delta }) => {
    if (resolveCameraOwner() !== "input") return;

    const { speedMultiplier, touchMode, invertDrag, invertJoystick } =
      settingsStore.getState();
    const { force: moveForce, angle: moveAngle } = joystickState.move;
    const { force: lookForce, angle: lookAngle } = joystickState.look;

    // Read touch deltas from InputControls store.
    const inputState = inputControlsStore.getState().actions;
    const touch = inputState.touchLook as TouchState | undefined;
    const cameraMode = streamPlaybackStore.getState().cameraMode;
    const orbit =
      cameraMode === "orbitOverride" ||
      (inputModeStore.getState().mode === "follow" &&
        cameraMode !== "firstPersonOverride");
    const pinch = inputState.orbitPinchZoom as PinchState | undefined;
    const dragSign = (invertDrag ? 1 : -1) * (orbit ? -1 : 1);

    if (orbit && pinch && pinch.deltaScale !== 1) {
      const distance = streamPlaybackStore.getState().orbitOverrideDistance;
      streamPlaybackStore.setState({
        orbitOverrideDistance: Math.max(
          MIN_ORBIT_DISTANCE,
          Math.min(MAX_ORBIT_DISTANCE, distance / pinch.deltaScale),
        ),
      });
    }

    let deltaYaw = 0;
    let deltaPitch = 0;

    // Follow always uses canvas drags, regardless of the free-fly stick layout.
    // The binding queues only single-finger rotation, even across a pinch.
    // Read queued movement after release too, before the frame clears it.
    if (
      (orbit || touchMode === "moveLookStick") &&
      touch &&
      (touch.deltaX !== 0 || touch.deltaY !== 0)
    ) {
      deltaYaw = dragSign * touch.deltaX * LOOK_SENSITIVITY;
      deltaPitch = dragSign * touch.deltaY * LOOK_SENSITIVITY;
    }

    let x = 0;
    let y = 0;
    const z = 0;

    if (!orbit && touchMode === "dualStick") {
      // Right stick -> camera rotation
      if (lookForce > DUAL_LOOK_DEADZONE) {
        const normalizedLookForce =
          (lookForce - DUAL_LOOK_DEADZONE) / (1 - DUAL_LOOK_DEADZONE);
        const lookX = Math.cos(lookAngle);
        const lookY = Math.sin(lookAngle);

        const joySign = invertJoystick ? 1 : -1;
        deltaYaw -=
          joySign *
          lookX *
          normalizedLookForce *
          STICK_LOOK_SENSITIVITY *
          delta;
        deltaPitch +=
          joySign *
          lookY *
          normalizedLookForce *
          STICK_LOOK_SENSITIVITY *
          delta;
      }

      // Left stick -> movement
      if (moveForce > DUAL_MOVE_DEADZONE) {
        const normalizedMoveForce =
          (moveForce - DUAL_MOVE_DEADZONE) / (1 - DUAL_MOVE_DEADZONE);
        const joyX = Math.cos(moveAngle);
        const joyY = Math.sin(moveAngle);

        // Map joystick to movement axes, pre-scaled by speedMultiplier.
        x = Math.max(
          -1,
          Math.min(
            1,
            joyX * normalizedMoveForce * (0.8 * speedMultiplier + 0.05),
          ),
        );
        y = Math.max(
          -1,
          Math.min(
            1,
            joyY * normalizedMoveForce * (0.8 * speedMultiplier + 0.05),
          ),
        );
      }
    } else if (!orbit && touchMode === "moveLookStick") {
      if (moveForce > 0) {
        // Move forward at half speed.
        y = Math.min(1, 0.5 * speedMultiplier + 0.05);

        if (moveForce >= SINGLE_STICK_DEADZONE) {
          // Outer zone: also control camera look (yaw + pitch).
          const lookX = Math.cos(moveAngle);
          const lookY = Math.sin(moveAngle);
          const normalizedLookForce =
            (moveForce - SINGLE_STICK_DEADZONE) / (1 - SINGLE_STICK_DEADZONE);

          const singleJoySign = invertJoystick ? 1 : -1;
          deltaYaw -=
            singleJoySign *
            lookX *
            normalizedLookForce *
            STICK_LOOK_SENSITIVITY *
            0.5 *
            delta;
          deltaPitch +=
            singleJoySign *
            lookY *
            normalizedLookForce *
            STICK_LOOK_SENSITIVITY *
            0.5 *
            delta;
        }
      }
    }

    // Only emit if there's actual input.
    const hasLook = deltaYaw !== 0 || deltaPitch !== 0;
    const hasMove = x !== 0 || y !== 0 || z !== 0;
    if (!hasLook && !hasMove) return;

    engine.input.push({
      deltaYaw,
      deltaPitch,
      x,
      y,
      z,
      triggers: [],
      delta,
    });
  });
}
