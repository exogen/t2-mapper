import { useFrame } from "@react-three/fiber";
import { useControls } from "./SettingsProvider";
import { useJoystick } from "./JoystickContext";
import { useOnInput } from "./InputContext";
import { useInputState, type TouchState } from "./InputControls";

const LOOK_SENSITIVITY = 0.004;
const STICK_LOOK_SENSITIVITY = 2.5;
const DUAL_MOVE_DEADZONE = 0.08;
const DUAL_LOOK_DEADZONE = 0.15;
const SINGLE_STICK_DEADZONE = 0.15;

export type JoystickState = {
  angle: number;
  force: number;
};

/** Handles touch look and joystick-driven movement. Place inside Canvas. */
export function TouchHandler() {
  const { speedMultiplier, touchMode, invertDrag, invertJoystick } =
    useControls();
  const { moveState, lookState } = useJoystick();
  const onInput = useOnInput();
  const [, getInputState] = useInputState();

  useFrame((_state, delta) => {
    const { force: moveForce, angle: moveAngle } = moveState.current;
    const { force: lookForce, angle: lookAngle } = lookState.current;

    // Read touch deltas from InputControls store.
    const inputState = getInputState();
    const touch = inputState.touchLook as TouchState | undefined;
    const dragSign = invertDrag ? 1 : -1;

    let deltaYaw = 0;
    let deltaPitch = 0;

    // Touch-drag look (moveLookStick mode only — dualStick uses joystick).
    if (touchMode === "moveLookStick" && touch && touch.dragging) {
      deltaYaw = dragSign * touch.deltaX * LOOK_SENSITIVITY;
      deltaPitch = dragSign * touch.deltaY * LOOK_SENSITIVITY;
    }

    let x = 0;
    let y = 0;
    const z = 0;

    if (touchMode === "dualStick") {
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
    } else if (touchMode === "moveLookStick") {
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

    onInput({
      deltaYaw,
      deltaPitch,
      x,
      y,
      z,
      triggers: [],
      delta,
    });
  });

  return null;
}
