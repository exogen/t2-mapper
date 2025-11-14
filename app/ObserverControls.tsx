import { KeyboardControls, PointerLockControls } from "@react-three/drei";

import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useKeyboardControls } from "@react-three/drei";
import * as THREE from "three";

enum Controls {
  forward = "forward",
  backward = "backward",
  left = "left",
  right = "right",
  up = "up",
  down = "down",
}

const BASE_SPEED = 100; // units per second

function CameraMovement() {
  const [subscribe, getKeys] = useKeyboardControls<Controls>();
  const { camera } = useThree();

  // Scratch vectors to avoid allocations each frame
  const forwardVec = useRef(new THREE.Vector3());
  const sideVec = useRef(new THREE.Vector3());
  const moveVec = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    const { forward, backward, left, right, up, down } = getKeys();

    if (!forward && !backward && !left && !right && !up && !down) {
      return;
    }

    const speed = BASE_SPEED;

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
      <PointerLockControls makeDefault />
    </KeyboardControls>
  );
}
