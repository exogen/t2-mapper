import { useEffect, useRef } from "react";
import { Euler, Vector3 } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { KeyboardControls, useKeyboardControls } from "@react-three/drei";
import { PointerLockControls } from "three-stdlib";
import { useControls } from "./SettingsProvider";
import { useCameras } from "./CamerasProvider";

enum Controls {
  forward = "forward",
  backward = "backward",
  left = "left",
  right = "right",
  up = "up",
  down = "down",
  camera1 = "camera1",
  camera2 = "camera2",
  camera3 = "camera3",
  camera4 = "camera4",
  camera5 = "camera5",
  camera6 = "camera6",
  camera7 = "camera7",
  camera8 = "camera8",
  camera9 = "camera9",
}

const BASE_SPEED = 80;
const MIN_SPEED_ADJUSTMENT = 0.05;
const MAX_SPEED_ADJUSTMENT = 0.5;
const DRAG_SENSITIVITY = 0.003;
const MAX_PITCH = Math.PI / 2 - 0.01; // ~89°
const DRAG_THRESHOLD = 3; // px of movement before it counts as a drag

function CameraMovement() {
  const { speedMultiplier, setSpeedMultiplier } = useControls();
  const [subscribe, getKeys] = useKeyboardControls<Controls>();
  const { camera, gl } = useThree();
  const { nextCamera, setCameraIndex, cameraCount } = useCameras();
  const controlsRef = useRef<PointerLockControls | null>(null);

  // Scratch vectors to avoid allocations each frame
  const forwardVec = useRef(new Vector3());
  const sideVec = useRef(new Vector3());
  const moveVec = useRef(new Vector3());

  // Setup pointer lock controls
  useEffect(() => {
    const controls = new PointerLockControls(camera, gl.domElement);
    controlsRef.current = controls;

    return () => {
      controls.dispose();
    };
  }, [camera, gl.domElement]);

  // When pointer is locked: click cycles camera.
  // When pointer is unlocked: drag rotates camera, click locks pointer.
  useEffect(() => {
    const canvas = gl.domElement;
    const euler = new Euler(0, 0, 0, "YXZ");
    let dragging = false;
    let didDrag = false;
    let startX = 0;
    let startY = 0;

    const handleMouseDown = (e: MouseEvent) => {
      if (controlsRef.current?.isLocked) return;
      if (e.target !== canvas) return;
      dragging = true;
      didDrag = false;
      startX = e.clientX;
      startY = e.clientY;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging) return;
      if (
        !didDrag &&
        Math.abs(e.clientX - startX) < DRAG_THRESHOLD &&
        Math.abs(e.clientY - startY) < DRAG_THRESHOLD
      ) {
        return;
      }
      didDrag = true;

      euler.setFromQuaternion(camera.quaternion, "YXZ");
      euler.y -= e.movementX * DRAG_SENSITIVITY;
      euler.x -= e.movementY * DRAG_SENSITIVITY;
      euler.x = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, euler.x));
      camera.quaternion.setFromEuler(euler);
    };

    const handleMouseUp = () => {
      dragging = false;
    };

    const handleClick = (e: MouseEvent) => {
      const controls = controlsRef.current;
      if (!controls || controls.isLocked) {
        nextCamera();
      } else if (e.target === canvas && !didDrag) {
        controls.lock();
      }
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("click", handleClick);

    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("click", handleClick);
    };
  }, [camera, gl.domElement, nextCamera]);

  // Handle number keys 1-9 for camera selection
  useEffect(() => {
    const cameraControls = [
      Controls.camera1,
      Controls.camera2,
      Controls.camera3,
      Controls.camera4,
      Controls.camera5,
      Controls.camera6,
      Controls.camera7,
      Controls.camera8,
      Controls.camera9,
    ];

    return subscribe((state) => {
      for (let i = 0; i < cameraControls.length; i++) {
        if (state[cameraControls[i]] && i < cameraCount) {
          setCameraIndex(i);
          break;
        }
      }
    });
  }, [subscribe, setCameraIndex, cameraCount]);

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
          Math.min(MAX_SPEED_ADJUSTMENT, Math.abs(e.deltaY * 0.01)),
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
  }, [gl.domElement, setSpeedMultiplier]);

  useFrame((state, delta) => {
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
  { name: Controls.camera1, keys: ["Digit1"] },
  { name: Controls.camera2, keys: ["Digit2"] },
  { name: Controls.camera3, keys: ["Digit3"] },
  { name: Controls.camera4, keys: ["Digit4"] },
  { name: Controls.camera5, keys: ["Digit5"] },
  { name: Controls.camera6, keys: ["Digit6"] },
  { name: Controls.camera7, keys: ["Digit7"] },
  { name: Controls.camera8, keys: ["Digit8"] },
  { name: Controls.camera9, keys: ["Digit9"] },
];

export function ObserverControls() {
  // Don't let KeyboardControls handle stuff when metaKey is held.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Let Cmd/Ctrl+K pass through for search focus.
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        return;
      }
      if (e.metaKey) {
        e.stopImmediatePropagation();
      }
    };

    window.addEventListener("keydown", handleKey, { capture: true });
    window.addEventListener("keyup", handleKey, { capture: true });

    return () => {
      window.removeEventListener("keydown", handleKey, { capture: true });
      window.removeEventListener("keyup", handleKey, { capture: true });
    };
  }, []);

  return (
    <KeyboardControls map={KEYBOARD_CONTROLS}>
      <CameraMovement />
    </KeyboardControls>
  );
}
