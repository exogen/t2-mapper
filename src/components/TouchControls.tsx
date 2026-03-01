import { useEffect, useRef, type RefObject } from "react";
import { Euler, Vector3 } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type nipplejs from "nipplejs";
import { useControls } from "./SettingsProvider";
import styles from "./TouchControls.module.css";

/** Apply styles to nipplejs-generated `.back` and `.front` elements imperatively. */
function applyNippleStyles(zone: HTMLElement) {
  const back = zone.querySelector<HTMLElement>(".back");
  if (back) {
    back.style.background = "rgba(3, 79, 76, 0.6)";
    back.style.border = "1px solid rgba(0, 219, 223, 0.5)";
    back.style.boxShadow = "inset 0 0 10px rgba(0, 0, 0, 0.7)";
  }
  const front = zone.querySelector<HTMLElement>(".front");
  if (front) {
    front.style.background =
      "radial-gradient(circle at 50% 50%, rgba(23, 247, 198, 0.9) 0%, rgba(9, 184, 170, 0.95) 100%)";
    front.style.border = "2px solid rgba(255, 255, 255, 0.4)";
    front.style.boxShadow =
      "0 2px 4px rgba(0, 0, 0, 0.5), 0 1px 1px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.15), inset 0 -1px 2px rgba(0, 0, 0, 0.3)";
  }
}

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

type SharedProps = {
  joystickState: RefObject<JoystickState>;
  joystickZone: RefObject<HTMLDivElement | null>;
  lookJoystickState: RefObject<JoystickState>;
  lookJoystickZone: RefObject<HTMLDivElement | null>;
};

/** Renders the joystick zone(s). Place inside canvasContainer, outside Canvas. */
export function TouchJoystick({
  joystickState,
  joystickZone,
  lookJoystickState,
  lookJoystickZone,
}: SharedProps) {
  const { touchMode } = useControls();
  // Move joystick
  useEffect(() => {
    const zone = joystickZone.current;
    if (!zone) return;

    let manager: nipplejs.JoystickManager | null = null;
    let cancelled = false;

    import("nipplejs").then((mod) => {
      if (cancelled) return;
      manager = mod.default.create({
        zone,
        mode: "static",
        position: { left: "70px", bottom: "70px" },
        size: 120,
        restOpacity: 0.9,
      });

      applyNippleStyles(zone);

      manager.on("move", (_event, data) => {
        joystickState.current.angle = data.angle.radian;
        joystickState.current.force = Math.min(1, data.force);
      });

      manager.on("end", () => {
        joystickState.current.force = 0;
      });
    });

    return () => {
      cancelled = true;
      manager?.destroy();
    };
  }, [joystickState, joystickZone, touchMode]);

  // Look joystick (dual stick mode only)
  useEffect(() => {
    if (touchMode !== "dualStick") return;

    const zone = lookJoystickZone.current;
    if (!zone) return;

    let manager: nipplejs.JoystickManager | null = null;
    let cancelled = false;

    import("nipplejs").then((mod) => {
      if (cancelled) return;
      manager = mod.default.create({
        zone,
        mode: "static",
        position: { right: "70px", bottom: "70px" },
        size: 120,
        restOpacity: 0.9,
      });

      applyNippleStyles(zone);

      manager.on("move", (_event, data) => {
        lookJoystickState.current.angle = data.angle.radian;
        lookJoystickState.current.force = Math.min(1, data.force);
      });

      manager.on("end", () => {
        lookJoystickState.current.force = 0;
      });
    });

    return () => {
      cancelled = true;
      manager?.destroy();
    };
  }, [touchMode, lookJoystickState, lookJoystickZone]);

  const blurActiveElement = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  if (touchMode === "dualStick") {
    return (
      <>
        <div
          ref={joystickZone}
          className={styles.Left}
          onContextMenu={(e) => e.preventDefault()}
          onTouchStart={blurActiveElement}
        />
        <div
          ref={lookJoystickZone}
          className={styles.Right}
          onContextMenu={(e) => e.preventDefault()}
          onTouchStart={blurActiveElement}
        />
      </>
    );
  }

  return (
    <div
      ref={joystickZone}
      className={styles.Joystick}
      onContextMenu={(e) => e.preventDefault()}
      onTouchStart={blurActiveElement}
    />
  );
}

/** Handles touch look and joystick-driven movement. Place inside Canvas. */
export function TouchCameraMovement({
  joystickState,
  joystickZone,
  lookJoystickState,
}: SharedProps) {
  const { speedMultiplier, touchMode } = useControls();
  const { camera, gl } = useThree();

  // Touch look state
  const euler = useRef(new Euler(0, 0, 0, "YXZ"));
  const lookTouchId = useRef<number | null>(null);
  const lastTouchPos = useRef({ x: 0, y: 0 });

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

    const isTouchOnJoystick = (touch: Touch) => {
      const zone = joystickZone.current;
      if (!zone) return false;
      const rect = zone.getBoundingClientRect();
      return (
        touch.clientX >= rect.left &&
        touch.clientX <= rect.right &&
        touch.clientY >= rect.top &&
        touch.clientY <= rect.bottom
      );
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (lookTouchId.current !== null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (!isTouchOnJoystick(touch)) {
          lookTouchId.current = touch.identifier;
          lastTouchPos.current = { x: touch.clientX, y: touch.clientY };
          break;
        }
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

          euler.current.setFromQuaternion(camera.quaternion, "YXZ");
          euler.current.y -= dx * LOOK_SENSITIVITY;
          euler.current.x -= dy * LOOK_SENSITIVITY;
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
  }, [camera, gl.domElement, joystickZone, touchMode]);

  useFrame((_state, delta) => {
    const { force, angle } = joystickState.current;

    if (touchMode === "dualStick") {
      // Right stick → camera rotation
      const look = lookJoystickState.current;
      if (look.force > DUAL_LOOK_DEADZONE) {
        const lookForce =
          (look.force - DUAL_LOOK_DEADZONE) / (1 - DUAL_LOOK_DEADZONE);
        const lookX = Math.cos(look.angle);
        const lookY = Math.sin(look.angle);

        euler.current.setFromQuaternion(camera.quaternion, "YXZ");
        euler.current.y -= lookX * lookForce * STICK_LOOK_SENSITIVITY * delta;
        euler.current.x += lookY * lookForce * STICK_LOOK_SENSITIVITY * delta;
        euler.current.x = Math.max(
          -MAX_PITCH,
          Math.min(MAX_PITCH, euler.current.x),
        );
        camera.quaternion.setFromEuler(euler.current);
      }

      // Left stick → movement
      if (force > DUAL_MOVE_DEADZONE) {
        const moveForce =
          (force - DUAL_MOVE_DEADZONE) / (1 - DUAL_MOVE_DEADZONE);
        const speed = BASE_SPEED * speedMultiplier * moveForce;
        const joyX = Math.cos(angle);
        const joyY = Math.sin(angle);

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
      if (force > 0) {
        // Move forward at half the configured speed.
        const speed = BASE_SPEED * speedMultiplier * 0.5;
        camera.getWorldDirection(forwardVec.current);
        forwardVec.current.normalize();
        moveVec.current.copy(forwardVec.current).multiplyScalar(speed * delta);
        camera.position.add(moveVec.current);

        if (force >= SINGLE_STICK_DEADZONE) {
          // Outer zone: also control camera look (yaw + pitch).
          const lookX = Math.cos(angle);
          const lookY = Math.sin(angle);
          const lookForce =
            (force - SINGLE_STICK_DEADZONE) / (1 - SINGLE_STICK_DEADZONE);

          euler.current.setFromQuaternion(camera.quaternion, "YXZ");
          euler.current.y -=
            lookX * lookForce * STICK_LOOK_SENSITIVITY * 0.5 * delta;
          euler.current.x +=
            lookY * lookForce * STICK_LOOK_SENSITIVITY * 0.5 * delta;
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
