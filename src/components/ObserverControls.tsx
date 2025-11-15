import { useEffect, useRef } from "react";
import { Vector3 } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { KeyboardControls, useKeyboardControls } from "@react-three/drei";
import { PointerLockControls } from "three-stdlib";
import { useSettings } from "./SettingsProvider";

enum Controls {
  forward = "forward",
  backward = "backward",
  left = "left",
  right = "right",
  up = "up",
  down = "down",
}

const BASE_SPEED = 100; // units per second
const MIN_SPEED_ADJUSTMENT = 0.05;
const MAX_SPEED_ADJUSTMENT = 1;

function CameraMovement() {
  const { speedMultiplier, setSpeedMultiplier } = useSettings();
  const [subscribe, getKeys] = useKeyboardControls<Controls>();
  const { camera, gl } = useThree();
  const controlsRef = useRef<PointerLockControls | null>(null);

  // Scratch vectors to avoid allocations each frame
  const forwardVec = useRef(new Vector3());
  const sideVec = useRef(new Vector3());
  const moveVec = useRef(new Vector3());

  // Setup pointer lock controls
  useEffect(() => {
    const controls = new PointerLockControls(camera, gl.domElement);
    controlsRef.current = controls;

    const handleClick = (e: MouseEvent) => {
      // Only lock if clicking directly on the canvas (not on UI elements)
      if (e.target === gl.domElement) {
        controls.lock();
      }
    };

    gl.domElement.addEventListener("click", handleClick);

    return () => {
      gl.domElement.removeEventListener("click", handleClick);
      controls.dispose();
    };
  }, [camera, gl]);

  // Handle mousewheel for speed adjustment
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const direction = e.deltaY > 0 ? -1 : 1;

      const delta =
        // Helps normalize sensitivity; trackpad scrolling will have many small
        // updates while mouse wheels have fewer updates but large deltas.
        Math.max(
          MIN_SPEED_ADJUSTMENT,
          Math.min(MAX_SPEED_ADJUSTMENT, Math.abs(e.deltaY * 0.01))
        ) * direction;

      setSpeedMultiplier((prev) => {
        const newSpeed = Math.round((prev + delta) * 20) / 20;
        return Math.max(0.1, Math.min(5, newSpeed));
      });
    };

    const canvas = gl.domElement;
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [gl]);

  useFrame((_, delta) => {
    const { forward, backward, left, right, up, down } = getKeys();

    if (!forward && !backward && !left && !right && !up && !down) {
      return;
    }

    const speed = BASE_SPEED * speedMultiplier;

    // Forward/backward: take complete camera angle into account (including Y)
    camera.getWorldDirection(forwardVec.current);
    forwardVec.current.normalize();

    // Left/right: move along XZ plane
    sideVec.current.crossVectors(camera.up, forwardVec.current).normalize();

    moveVec.current.set(0, 0, 0);

    if (forward) {
      moveVec.current.add(forwardVec.current);
    }
    if (backward) {
      moveVec.current.sub(forwardVec.current);
    }
    if (left) {
      moveVec.current.add(sideVec.current);
    }
    if (right) {
      moveVec.current.sub(sideVec.current);
    }
    if (up) {
      moveVec.current.y += 1;
    }
    if (down) {
      moveVec.current.y -= 1;
    }

    if (moveVec.current.lengthSq() > 0) {
      moveVec.current.normalize().multiplyScalar(speed * delta);
      camera.position.add(moveVec.current);
    }
  });

  return null;
}

const KEYBOARD_CONTROLS = [
  { name: Controls.forward, keys: ["KeyW"] },
  { name: Controls.backward, keys: ["KeyS"] },
  { name: Controls.left, keys: ["KeyA"] },
  { name: Controls.right, keys: ["KeyD"] },
  { name: Controls.up, keys: ["Space"] },
  { name: Controls.down, keys: ["ShiftLeft", "ShiftRight"] },
];

export function ObserverControls() {
  return (
    <KeyboardControls map={KEYBOARD_CONTROLS}>
      <CameraMovement />
    </KeyboardControls>
  );
}
