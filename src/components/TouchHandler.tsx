import { useEffect, useEffectEvent, useRef } from "react";
import { Euler, Vector3 } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useControls } from "./SettingsProvider";
import { useJoystick } from "./JoystickContext";

const BASE_SPEED = 80;
const LOOK_SENSITIVITY = 0.004;
const STICK_LOOK_SENSITIVITY = 2.5;
const DUAL_MOVE_DEADZONE = 0.08;
const DUAL_LOOK_DEADZONE = 0.15;
const SINGLE_STICK_DEADZONE = 0.15;
const MAX_PITCH = Math.PI / 2 - 0.01; // ~89°

export type JoystickState = {
  angle: number;
  force: number;
};

/** Handles touch look and joystick-driven movement. Place inside Canvas. */
export function TouchHandler() {
  const { speedMultiplier, touchMode, invertDrag, invertJoystick } =
    useControls();
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const { moveState, lookState } = useJoystick();

  // Touch look state
  const euler = useRef(new Euler(0, 0, 0, "YXZ"));
  const lookTouchId = useRef<number | null>(null);
  const lastTouchPos = useRef({ x: 0, y: 0 });
  const getInvertDrag = useEffectEvent(() => invertDrag);

  // Scratch vectors
  const forwardVec = useRef(new Vector3());
  const sideVec = useRef(new Vector3());
  const moveVec = useRef(new Vector3());

  // Initialize euler from current camera rotation on mount
  useEffect(() => {
    euler.current.setFromQuaternion(camera.quaternion, "YXZ");
  }, [camera]);

  // Touch-drag look handling (moveLookStick mode)
  useEffect(() => {
    if (touchMode !== "moveLookStick") return;

    const canvas = gl.domElement;

    // const isTouchOnJoystick = (touch: Touch) => {
    //   const zone = joystickZone.current;
    //   if (!zone) return false;
    //   const rect = zone.getBoundingClientRect();
    //   return (
    //     touch.clientX >= rect.left &&
    //     touch.clientX <= rect.right &&
    //     touch.clientY >= rect.top &&
    //     touch.clientY <= rect.bottom
    //   );
    // };

    const handleTouchStart = (e: TouchEvent) => {
      if (lookTouchId.current !== null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        // if (!isTouchOnJoystick(touch)) {
        lookTouchId.current = touch.identifier;
        lastTouchPos.current = { x: touch.clientX, y: touch.clientY };
        break;
        // }
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

          const dragSign = getInvertDrag() ? -1 : 1;
          euler.current.setFromQuaternion(camera.quaternion, "YXZ");
          euler.current.y += dragSign * dx * LOOK_SENSITIVITY;
          euler.current.x += dragSign * dy * LOOK_SENSITIVITY;
          euler.current.x = Math.max(
            -MAX_PITCH,
            Math.min(MAX_PITCH, euler.current.x),
          );
          camera.quaternion.setFromEuler(euler.current);
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
  }, [camera, gl.domElement, touchMode]);

  useFrame((_state, delta) => {
    const { force: moveForce, angle: moveAngle } = moveState.current;
    const { force: lookForce, angle: lookAngle } = lookState.current;

    if (touchMode === "dualStick") {
      // Right stick → camera rotation
      if (lookForce > DUAL_LOOK_DEADZONE) {
        const normalizedLookForce =
          (lookForce - DUAL_LOOK_DEADZONE) / (1 - DUAL_LOOK_DEADZONE);
        const lookX = Math.cos(lookAngle);
        const lookY = Math.sin(lookAngle);

        const joySign = invertJoystick ? -1 : 1;
        euler.current.setFromQuaternion(camera.quaternion, "YXZ");
        euler.current.y -=
          joySign *
          lookX *
          normalizedLookForce *
          STICK_LOOK_SENSITIVITY *
          delta;
        euler.current.x +=
          joySign *
          lookY *
          normalizedLookForce *
          STICK_LOOK_SENSITIVITY *
          delta;
        euler.current.x = Math.max(
          -MAX_PITCH,
          Math.min(MAX_PITCH, euler.current.x),
        );
        camera.quaternion.setFromEuler(euler.current);
      }

      // Left stick → movement
      if (moveForce > DUAL_MOVE_DEADZONE) {
        const normalizedMoveForce =
          (moveForce - DUAL_MOVE_DEADZONE) / (1 - DUAL_MOVE_DEADZONE);
        const speed = BASE_SPEED * speedMultiplier * normalizedMoveForce;
        const joyX = Math.cos(moveAngle);
        const joyY = Math.sin(moveAngle);

        camera.getWorldDirection(forwardVec.current);
        forwardVec.current.normalize();
        sideVec.current.crossVectors(camera.up, forwardVec.current).normalize();

        moveVec.current
          .set(0, 0, 0)
          .addScaledVector(forwardVec.current, joyY)
          .addScaledVector(sideVec.current, -joyX);

        if (moveVec.current.lengthSq() > 0) {
          moveVec.current.normalize().multiplyScalar(speed * delta);
          camera.position.add(moveVec.current);
        }
      }
    } else if (touchMode === "moveLookStick") {
      if (moveForce > 0) {
        // Move forward at half the configured speed.
        const speed = BASE_SPEED * speedMultiplier * 0.5;
        camera.getWorldDirection(forwardVec.current);
        forwardVec.current.normalize();
        moveVec.current.copy(forwardVec.current).multiplyScalar(speed * delta);
        camera.position.add(moveVec.current);

        if (moveForce >= SINGLE_STICK_DEADZONE) {
          // Outer zone: also control camera look (yaw + pitch).
          const lookX = Math.cos(moveAngle);
          const lookY = Math.sin(moveAngle);
          const normalizedLookForce =
            (moveForce - SINGLE_STICK_DEADZONE) / (1 - SINGLE_STICK_DEADZONE);

          const singleJoySign = invertJoystick ? -1 : 1;
          euler.current.setFromQuaternion(camera.quaternion, "YXZ");
          euler.current.y -=
            singleJoySign *
            lookX *
            normalizedLookForce *
            STICK_LOOK_SENSITIVITY *
            0.5 *
            delta;
          euler.current.x +=
            singleJoySign *
            lookY *
            normalizedLookForce *
            STICK_LOOK_SENSITIVITY *
            0.5 *
            delta;
          euler.current.x = Math.max(
            -MAX_PITCH,
            Math.min(MAX_PITCH, euler.current.x),
          );
          camera.quaternion.setFromEuler(euler.current);
        }
      }
    }
  });

  return null;
}
