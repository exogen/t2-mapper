import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrthographicCamera } from "@react-three/drei";
import {
  Euler,
  Quaternion,
  type OrthographicCamera as ThreeOrthographicCamera,
} from "three";
import {
  commandCircuitStore,
  useCommandCircuit,
} from "../state/commandCircuitStore";
import { cameraTourStore } from "../state/cameraTourStore";
import { cameraRegistry } from "../state/cameraRegistry";
import { gameEntityStore, useSceneMissionArea } from "../state/gameEntityStore";
import { computeCommandCircuitFrame } from "./commandCircuitFrame";
import { parseViewHash } from "./viewHash";
import {
  useInputAction,
  useInputState,
  clearInputDeltas,
  type ActionState,
  type DragState,
  type KeyState,
  type ScrollState,
} from "./InputControls";

/**
 * Camera altitude; with far below, covers the flight ceiling (~2000) down to
 * well below any terrain.
 */
const CAMERA_HEIGHT = 2500;
const CAMERA_NEAR = 1;
const CAMERA_FAR = 5000;

/**
 * WASD pan speed in screen pixels per second (world speed scales with zoom).
 */
const PAN_SPEED = 500;

/**
 * Wheel zoom sensitivity (exponent per scroll delta unit).
 */
const ZOOM_SENSITIVITY = 0.002;

const MIN_ZOOM_FACTOR = 0.25;
const MAX_ZOOM_FACTOR = 40;

/**
 * Looking straight down Three -Y with screen-up = world -Z.
 */
const TOP_DOWN_QUATERNION = new Quaternion().setFromEuler(
  new Euler(-Math.PI / 2, 0, 0),
);

function isPressed(state: Record<string, ActionState>, name: string): boolean {
  const s = state[name];
  return s != null && "pressed" in s && (s as KeyState).pressed;
}

/**
 * Command circuit mode: a top-down orthographic overview of the whole map,
 * named for Tribes 2's in-game command map. Always mounted; renders the
 * orthographic camera rig only while the mode is active.
 */
export function CommandCircuitCamera() {
  const active = useCommandCircuit((s) => s.active);

  useInputAction("toggleCommandCircuit", () => {
    commandCircuitStore.getState().toggle();
  });
  useInputAction("exitCommandCircuit", () => {
    commandCircuitStore.getState().deactivate();
  });

  // Entering command circuit exits any active tour and pointer lock.
  useEffect(() => {
    if (active) {
      cameraTourStore.getState().cancel();
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    }
  }, [active]);

  // Starting a tour (e.g. from the map tour panel) takes over the camera.
  useEffect(() => {
    return cameraTourStore.subscribe((state) => {
      if (state.animation) {
        commandCircuitStore.getState().deactivate();
      }
    });
  }, []);

  // The mode only applies to static map viewing.
  useEffect(() => {
    return gameEntityStore.subscribe((state) => {
      if (state.dataSource !== "map") {
        commandCircuitStore.getState().deactivate();
      }
    });
  }, []);

  return active ? <CommandCircuitOrthoRig /> : null;
}

function CommandCircuitOrthoRig() {
  const cameraRef = useRef<ThreeOrthographicCamera>(null);
  const missionArea = useSceneMissionArea();

  useEffect(() => {
    cameraRegistry.ortho = cameraRef.current;
    return () => {
      cameraRegistry.ortho = null;
    };
  }, []);
  const size = useThree((state) => state.size);
  const [, getInputState] = useInputState();

  const frame = useMemo(
    () => computeCommandCircuitFrame(missionArea),
    [missionArea],
  );

  // drei's ortho frustum is pixel-sized, so zoom is pixels per world unit;
  // fitting both spans is a simple min over the two axes.
  const fitZoom = Math.min(size.width / frame.width, size.height / frame.depth);

  // Restore the pan/zoom from a shared `#c` view hash (e.g. a link copied
  // while in command circuit mode); otherwise center and fit to the frame.
  const [initialView] = useState(() => parseViewHash(window.location.hash));
  const pan = useRef(
    initialView
      ? { x: initialView.position.x, z: initialView.position.z }
      : { x: frame.centerX, z: frame.centerZ },
  );
  const zoom = useRef(
    initialView?.zoom != null
      ? Math.min(
          fitZoom * MAX_ZOOM_FACTOR,
          Math.max(fitZoom * MIN_ZOOM_FACTOR, initialView.zoom),
        )
      : fitZoom,
  );
  const userAdjusted = useRef(initialView !== null);

  // Track the latest fit for the zoom handler's clamp range.
  const fitZoomRef = useRef(fitZoom);

  // Refit on viewport/mission changes until the user takes over.
  useEffect(() => {
    fitZoomRef.current = fitZoom;
    if (!userAdjusted.current) {
      pan.current = { x: frame.centerX, z: frame.centerZ };
      zoom.current = fitZoom;
    }
  }, [frame, fitZoom]);

  useInputAction("commandZoom", () => {
    const scroll = getInputState().commandZoom as ScrollState | undefined;
    if (!scroll || scroll.deltaY === 0) return;
    const fit = fitZoomRef.current;
    zoom.current = Math.min(
      fit * MAX_ZOOM_FACTOR,
      Math.max(
        fit * MIN_ZOOM_FACTOR,
        zoom.current * Math.exp(-scroll.deltaY * ZOOM_SENSITIVITY),
      ),
    );
    userAdjusted.current = true;
  });

  useFrame((_state, delta) => {
    const camera = cameraRef.current;
    if (!camera) return;
    const inputState = getInputState();

    // WASD pan at constant screen speed regardless of zoom.
    const panDistance = (PAN_SPEED / zoom.current) * delta;
    let dx = 0;
    let dz = 0;
    if (isPressed(inputState, "commandPanUp")) dz -= panDistance;
    if (isPressed(inputState, "commandPanDown")) dz += panDistance;
    if (isPressed(inputState, "commandPanLeft")) dx -= panDistance;
    if (isPressed(inputState, "commandPanRight")) dx += panDistance;

    // Drag pan: map content follows the cursor.
    const drag = inputState.commandPanDrag as DragState | undefined;
    if (drag?.dragging && (drag.deltaX !== 0 || drag.deltaY !== 0)) {
      dx -= drag.deltaX / zoom.current;
      dz -= drag.deltaY / zoom.current;
    }
    clearInputDeltas();

    if (dx !== 0 || dz !== 0) {
      userAdjusted.current = true;
    }

    // Clamp pan to twice the frame extent so the map can't be lost.
    pan.current.x = Math.min(
      frame.centerX + frame.width,
      Math.max(frame.centerX - frame.width, pan.current.x + dx),
    );
    pan.current.z = Math.min(
      frame.centerZ + frame.depth,
      Math.max(frame.centerZ - frame.depth, pan.current.z + dz),
    );

    // Re-assert the full transform every frame; other camera writers are
    // gated while this mode is active, but effects (like the URL-hash
    // restore) may still write once on camera changes.
    camera.position.set(pan.current.x, CAMERA_HEIGHT, pan.current.z);
    camera.quaternion.copy(TOP_DOWN_QUATERNION);
    camera.zoom = zoom.current;
    camera.updateProjectionMatrix();
  });

  return (
    <OrthographicCamera
      ref={cameraRef}
      makeDefault
      near={CAMERA_NEAR}
      far={CAMERA_FAR}
    />
  );
}
