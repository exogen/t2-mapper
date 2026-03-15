import { useEffect, useEffectEvent, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useControls } from "./SettingsProvider";
import { useJoystick } from "./JoystickContext";
import { useOnInput } from "./InputContext";

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
  const gl = useThree((state) => state.gl);
  const { moveState, lookState } = useJoystick();
  const onInput = useOnInput();

  // Touch look state
  const lookTouchId = useRef<number | null>(null);
  const lastTouchPos = useRef({ x: 0, y: 0 });
  const getInvertDrag = useEffectEvent(() => invertDrag);

  // Accumulated touch-drag deltas between frames.
  const touchDeltaYaw = useRef(0);
  const touchDeltaPitch = useRef(0);

  // Touch-drag look handling (moveLookStick mode)
  useEffect(() => {
    if (touchMode !== "moveLookStick") return;

    const canvas = gl.domElement;

    const handleTouchStart = (e: TouchEvent) => {
      if (lookTouchId.current !== null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        lookTouchId.current = touch.identifier;
        lastTouchPos.current = { x: touch.clientX, y: touch.clientY };
        break;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (lookTouchId.current === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === lookTouchId.current) {
          const dx = touch.clientX - lastTouchPos.current.x;
          const dy = touch.clientY - lastTouchPos.current.y;
          lastTouchPos.current = { x: touch.clientX, y: touch.clientY };

          const dragSign = getInvertDrag() ? 1 : -1;
          touchDeltaYaw.current += dragSign * dx * LOOK_SENSITIVITY;
          touchDeltaPitch.current += dragSign * dy * LOOK_SENSITIVITY;
          break;
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === lookTouchId.current) {
          lookTouchId.current = null;
          break;
        }
      }
    };

    canvas.addEventListener("touchstart", handleTouchStart, { passive: true });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: true });
    canvas.addEventListener("touchend", handleTouchEnd, { passive: true });
    canvas.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", handleTouchEnd);
      canvas.removeEventListener("touchcancel", handleTouchEnd);
      lookTouchId.current = null;
    };
  }, [gl.domElement, touchMode]);

  useFrame((_state, delta) => {
    const { force: moveForce, angle: moveAngle } = moveState.current;
    const { force: lookForce, angle: lookAngle } = lookState.current;

    let deltaYaw = touchDeltaYaw.current;
    let deltaPitch = touchDeltaPitch.current;
    touchDeltaYaw.current = 0;
    touchDeltaPitch.current = 0;

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
          Math.min(1, joyX * normalizedMoveForce * speedMultiplier),
        );
        y = Math.max(
          -1,
          Math.min(1, joyY * normalizedMoveForce * speedMultiplier),
        );
      }
    } else if (touchMode === "moveLookStick") {
      if (moveForce > 0) {
        // Move forward at half speed.
        y = Math.max(-1, Math.min(1, 0.5 * speedMultiplier));

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
