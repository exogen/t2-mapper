import { useEffect, useRef, type RefObject } from "react";
import { Euler, Vector3 } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type nipplejs from "nipplejs";
import { useControls } from "./SettingsProvider";

const BASE_SPEED = 80;
const LOOK_SENSITIVITY = 0.004;
const MAX_PITCH = Math.PI / 2 - 0.01; // ~89°

export type JoystickState = {
  angle: number;
  force: number;
};

type SharedProps = {
  joystickState: RefObject<JoystickState>;
  joystickZone: RefObject<HTMLDivElement | null>;
};

/** Renders the joystick zone. Place inside canvasContainer, outside Canvas. */
export function TouchJoystick({ joystickState, joystickZone }: SharedProps) {
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

      manager.on("move", (_event, data) => {
        joystickState.current.angle = data.angle.radian;
        // Clamp force to 0–1 range (nipplejs force can exceed 1)
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
  }, [joystickState, joystickZone]);

  return <div ref={joystickZone} className="TouchJoystick" />;
}

/** Handles touch look and joystick-driven movement. Place inside Canvas. */
export function TouchCameraMovement({
  joystickState,
  joystickZone,
}: SharedProps) {
  const { speedMultiplier } = useControls();
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

  // Touch look handling
  useEffect(() => {
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
    };
  }, [camera, gl.domElement, joystickZone]);

  useFrame((_state, delta) => {
    const { force, angle } = joystickState.current;
    if (force === 0) return;

    const speed = BASE_SPEED * speedMultiplier * force;

    // Decompose joystick angle into forward/sideways components
    // nipplejs angle: 0 = right, π/2 = up, π = left, 3π/2 = down
    const joyX = Math.cos(angle); // right component
    const joyY = Math.sin(angle); // forward component

    // Forward/backward: use full camera direction (including Y) so
    // looking up and pushing forward moves upward, like ObserverControls.
    camera.getWorldDirection(forwardVec.current);
    forwardVec.current.normalize();

    // Left/right: move along XZ plane
    sideVec.current.crossVectors(camera.up, forwardVec.current).normalize();

    // Combine: joyY pushes forward, joyX pushes right.
    // sideVec points left (up × forward), so negate joyX.
    moveVec.current
      .set(0, 0, 0)
      .addScaledVector(forwardVec.current, joyY)
      .addScaledVector(sideVec.current, -joyX);

    if (moveVec.current.lengthSq() > 0) {
      moveVec.current.normalize().multiplyScalar(speed * delta);
      camera.position.add(moveVec.current);
    }
  });

  return null;
}
