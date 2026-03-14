import { useEffect, useEffectEvent, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useKeyboardControls } from "@react-three/drei";
import { PointerLockControls } from "three-stdlib";
import {
  MAX_SPEED_MULTIPLIER,
  MIN_SPEED_MULTIPLIER,
  useControls,
} from "./SettingsProvider";
import { useCameras } from "./CamerasProvider";
import { useInputContext } from "./InputContext";

export enum Controls {
  forward = "forward",
  backward = "backward",
  left = "left",
  right = "right",
  up = "up",
  down = "down",
  lookUp = "lookUp",
  lookDown = "lookDown",
  lookLeft = "lookLeft",
  lookRight = "lookRight",
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

export const KEYBOARD_CONTROLS = [
  { name: Controls.forward, keys: ["KeyW"] },
  { name: Controls.backward, keys: ["KeyS"] },
  { name: Controls.left, keys: ["KeyA"] },
  { name: Controls.right, keys: ["KeyD"] },
  { name: Controls.up, keys: ["Space"] },
  { name: Controls.down, keys: ["ShiftLeft", "ShiftRight"] },
  { name: Controls.lookUp, keys: ["ArrowUp"] },
  { name: Controls.lookDown, keys: ["ArrowDown"] },
  { name: Controls.lookLeft, keys: ["ArrowLeft"] },
  { name: Controls.lookRight, keys: ["ArrowRight"] },
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

const MIN_SPEED_ADJUSTMENT = 2;
const MAX_SPEED_ADJUSTMENT = 11;
const DRAG_THRESHOLD = 3; // px of movement before it counts as a drag

/** Shared mouse/look sensitivity used across all modes (.mis, .rec, live). */
export const MOUSE_SENSITIVITY = 0.002;
export const ARROW_LOOK_SPEED = 1; // radians/sec

function quantizeSpeed(speedMultiplier: number): number {
  // Map [0.01, 1] → [1/16, 1], snapped to the 6-bit grid (multiples of 1/16).
  const t =
    (speedMultiplier - MIN_SPEED_MULTIPLIER) / (1 - MIN_SPEED_MULTIPLIER);
  const steps = Math.round(t * 15); // 0..15 → 16 levels (1/16 to 16/16)
  return (steps + 1) / 16;
}

export function MouseAndKeyboardHandler() {
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

  const { speedMultiplier, setSpeedMultiplier, invertScroll, invertDrag } =
    useControls();
  const { onInput, mode } = useInputContext();
  const [subscribe, getKeys] = useKeyboardControls<Controls>();
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const { nextCamera, setCameraIndex, cameraCount } = useCameras();
  const controlsRef = useRef<PointerLockControls | null>(null);

  const getInvertScroll = useEffectEvent(() => invertScroll);
  const getInvertDrag = useEffectEvent(() => invertDrag);
  const getMode = useEffectEvent(() => mode);

  // Accumulated mouse deltas between frames.
  const mouseDeltaYaw = useRef(0);
  const mouseDeltaPitch = useRef(0);

  // Trigger flags set by event handlers, consumed in useFrame.
  const triggerFire = useRef(false);
  const triggerObserve = useRef(false);

  // Setup pointer lock controls
  useEffect(() => {
    const controls = new PointerLockControls(camera, gl.domElement);
    controlsRef.current = controls;

    return () => {
      controls.dispose();
    };
  }, [camera, gl.domElement]);

  // Mouse handling: accumulate deltas for input frames.
  // In local mode, drag-to-look works without pointer lock.
  // Pointer lock and click behavior depend on mode.
  useEffect(() => {
    const canvas = gl.domElement;
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
      if (controlsRef.current?.isLocked) {
        // Pointer is locked: accumulate raw deltas.
        mouseDeltaYaw.current += e.movementX * MOUSE_SENSITIVITY;
        mouseDeltaPitch.current += e.movementY * MOUSE_SENSITIVITY;
        return;
      }

      if (!dragging) return;
      if (
        !didDrag &&
        Math.abs(e.clientX - startX) < DRAG_THRESHOLD &&
        Math.abs(e.clientY - startY) < DRAG_THRESHOLD
      ) {
        return;
      }
      didDrag = true;

      // In follow/orbit mode, drag direction is reversed because the camera
      // orbits around a target — dragging right should move the camera right
      // (decreasing yaw), opposite of fly mode.
      const orbitFlip = getMode() === "follow" ? -1 : 1;
      const dragSign = (getInvertDrag() ? 1 : -1) * orbitFlip;
      mouseDeltaYaw.current += dragSign * e.movementX * MOUSE_SENSITIVITY;
      mouseDeltaPitch.current += dragSign * e.movementY * MOUSE_SENSITIVITY;
    };

    const handleMouseUp = () => {
      dragging = false;
    };

    const handleClick = (e: MouseEvent) => {
      const controls = controlsRef.current;
      if (controls?.isLocked) {
        if (mode === "follow") {
          // In follow mode, click cycles to next player (trigger 0).
          triggerFire.current = true;
        } else if (mode === "local") {
          // In local mode, click while locked cycles preset cameras.
          nextCamera();
        }
        // In fly mode, clicks while locked do nothing special.
      } else if (e.target === canvas && !didDrag) {
        controls?.lock();
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
  }, [camera, gl.domElement, nextCamera, mode]);

  // Handle number keys 1-9 for camera selection (local-only UI action).
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

  // Handle mousewheel for speed adjustment (local setting, stays in KMH).
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const scrollSign = getInvertScroll() ? -1 : 1;
      const direction = (e.deltaY > 0 ? -1 : 1) * scrollSign;

      // scale deltaY in a way that feels natural for both trackpads (often just
      // a deltaY of 1 at a time!) and scroll wheels (can be 100s or more).
      const scaledDeltaY = Math.ceil(Math.log2(Math.abs(e.deltaY) + 1));

      const delta =
        Math.max(
          MIN_SPEED_ADJUSTMENT,
          Math.min(MAX_SPEED_ADJUSTMENT, scaledDeltaY),
        ) * direction;

      setSpeedMultiplier((prev) => {
        const newSpeed = Math.round(prev * 100) + delta;
        return Math.max(
          MIN_SPEED_MULTIPLIER,
          Math.min(MAX_SPEED_MULTIPLIER, newSpeed / 100),
        );
      });
    };

    const canvas = gl.domElement;
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [gl.domElement, setSpeedMultiplier]);

  // 'O' key: toggle observer mode (sets trigger 2).
  useEffect(() => {
    if (mode === "local") return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyO" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
      triggerObserve.current = true;
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [mode]);

  // Build and emit InputFrame each render frame.
  useFrame((_state, delta) => {
    const {
      forward,
      backward,
      left,
      right,
      up,
      down,
      lookUp,
      lookDown,
      lookLeft,
      lookRight,
    } = getKeys();

    // Arrow keys contribute to look deltas.
    let deltaYaw = mouseDeltaYaw.current;
    let deltaPitch = mouseDeltaPitch.current;
    mouseDeltaYaw.current = 0;
    mouseDeltaPitch.current = 0;

    if (lookLeft) deltaYaw -= ARROW_LOOK_SPEED * delta;
    if (lookRight) deltaYaw += ARROW_LOOK_SPEED * delta;
    if (lookUp) deltaPitch -= ARROW_LOOK_SPEED * delta;
    if (lookDown) deltaPitch += ARROW_LOOK_SPEED * delta;

    // Movement axes, pre-scaled by speedMultiplier (clamped to [-1, 1]).
    let x = 0;
    let y = 0;
    let z = 0;
    if (left) x -= 1;
    if (right) x += 1;
    if (forward) y += 1;
    if (backward) y -= 1;
    if (up) z += 1;
    if (down) z -= 1;

    const quantizedSpeedMultiplier = quantizeSpeed(speedMultiplier);

    x = Math.max(-1, Math.min(1, x * quantizedSpeedMultiplier));
    y = Math.max(-1, Math.min(1, y * quantizedSpeedMultiplier));
    z = Math.max(-1, Math.min(1, z * quantizedSpeedMultiplier));

    // Triggers.
    const triggers = [false, false, false, false, false, false];
    if (triggerFire.current) {
      triggers[0] = true;
      triggerFire.current = false;
    }
    if (triggerObserve.current) {
      triggers[2] = true;
      triggerObserve.current = false;
    }

    // Only emit if there's actual input.
    const hasLook = deltaYaw !== 0 || deltaPitch !== 0;
    const hasMove = x !== 0 || y !== 0 || z !== 0;
    const hasTriggers = triggers.some(Boolean);
    if (!hasLook && !hasMove && !hasTriggers) return;

    onInput({
      deltaYaw,
      deltaPitch,
      x,
      y,
      z,
      triggers,
      delta,
    });
  });

  return null;
}
