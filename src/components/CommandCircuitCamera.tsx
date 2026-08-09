import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrthographicCamera } from "@react-three/drei";
import {
  Euler,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  type Object3D,
  type OrthographicCamera as ThreeOrthographicCamera,
} from "three";
import {
  commandCircuitStore,
  useCommandCircuit,
} from "../state/commandCircuitStore";
import { cameraTourStore } from "../state/cameraTourStore";
import type { TourAnimation } from "../state/cameraTourStore";
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
  type PinchState,
  type ScrollState,
  type TouchState,
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

/**
 * Pinch zoom sensitivity (exponent per pixel of finger-distance change).
 */
const PINCH_SENSITIVITY = 0.005;

const MIN_ZOOM_FACTOR = 0.25;
const MAX_ZOOM_FACTOR = 40;

/**
 * Tour pan pacing, mirroring CameraTourConsumer's travel rules: duration
 * scales with distance between these bounds.
 */
const TOUR_PAN_SPEED = 180;
const TOUR_MIN_PAN_DURATION = 1.5;
const TOUR_MAX_PAN_DURATION = 6.0;

/**
 * How long to linger centered over a target before auto-advancing — the
 * top-down stand-in for the orbit phase.
 */
const TOUR_DWELL_DURATION = 2.0;

/**
 * Uniform zoom while touring, as a multiple of the fitted zoom.
 */
const TOUR_ZOOM_FACTOR = 9;

/**
 * Tour target highlight: smooth flashes over the active target, rendered
 * as a filled silhouette above everything. Flashing runs for the whole pan
 * plus half the dwell; the rig owns the clock and publishes the opacity
 * here for the highlight component to apply.
 */
const FLASH_COLOR = "#39ff14";
const FLASH_DURATION = 0.5;
const FLASH_RENDER_ORDER = 999;
const tourFlash = { opacity: 0 };

/**
 * Tunable S-curve easing (rational sigmoid). Higher `inPower` back-loads
 * the motion (slower start, later velocity peak); higher `outPower`
 * lengthens the deceleration tail for a softer landing.
 */
function easeInOut(t: number, inPower: number, outPower: number): number {
  const a = Math.pow(t, inPower);
  const b = Math.pow(1 - t, outPower);
  return a / (a + b);
}

/**
 * Looking straight down Three -Y, oriented like Tribes 2's command map:
 * screen-up = world +X (Torque north), screen-right = world +Z (Torque
 * east).
 */
const TOP_DOWN_QUATERNION = new Quaternion().setFromEuler(
  new Euler(-Math.PI / 2, 0, -Math.PI / 2),
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

  // Entering command circuit exits pointer lock. Tours are unaffected —
  // they continue as top-down pans while the mode is active.
  useEffect(() => {
    if (active && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, [active]);

  // The mode only applies to static map viewing.
  useEffect(() => {
    return gameEntityStore.subscribe((state) => {
      if (state.dataSource !== "map") {
        commandCircuitStore.getState().deactivate();
      }
    });
  }, []);

  return active ? (
    <>
      <CommandCircuitOrthoRig />
      <CommandCircuitTourHighlight />
    </>
  ) : null;
}

/**
 * Flashes a neon silhouette over the active tour target so it's findable
 * from above even when occluded (e.g. an item inside a base). The overlay
 * meshes share the target's geometry, are parented inside its meshes so
 * they track transforms, and render without depth testing above everything.
 */
function CommandCircuitTourHighlight() {
  const scene = useThree((state) => state.scene);

  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: FLASH_COLOR,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        fog: false,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  const overlayRef = useRef<{
    animation: TourAnimation;
    index: number;
    meshes: Mesh[];
  } | null>(null);

  const teardown = () => {
    const overlay = overlayRef.current;
    if (overlay) {
      for (const mesh of overlay.meshes) {
        mesh.removeFromParent();
      }
      overlay.meshes.length = 0;
    }
    overlayRef.current = null;
  };
  useEffect(() => teardown, []);

  useFrame(() => {
    const animation = cameraTourStore.getState().animation;
    if (!animation) {
      teardown();
      return;
    }

    let overlay = overlayRef.current;
    if (
      !overlay ||
      overlay.animation !== animation ||
      overlay.index !== animation.currentIndex
    ) {
      teardown();
      overlay = {
        animation,
        index: animation.currentIndex,
        meshes: [],
      };
      overlayRef.current = overlay;
    }

    // If the meshes we attached to were replaced (e.g. a placeholder swapped
    // for the streamed-in model), our clones went with them — rebuild.
    if (overlay.meshes.length > 0) {
      let root: Object3D = overlay.meshes[0];
      while (root.parent) root = root.parent;
      if (root !== scene) {
        for (const mesh of overlay.meshes) {
          mesh.removeFromParent();
        }
        overlay.meshes.length = 0;
      }
    }

    // Build lazily (and retry) since the target's model may still be
    // streaming in when it becomes the active target.
    if (overlay.meshes.length === 0) {
      const target = animation.targets[animation.currentIndex];
      const object: Object3D | undefined = scene.getObjectByName(
        target.entityId,
      );
      if (object) {
        const sources: Mesh[] = [];
        object.traverse((child) => {
          if ((child as Mesh).isMesh) sources.push(child as Mesh);
        });
        for (const source of sources) {
          const clone = new Mesh(source.geometry, material);
          clone.renderOrder = FLASH_RENDER_ORDER;
          clone.frustumCulled = false;
          source.add(clone);
          overlay.meshes.push(clone);
        }
      }
    }

    // The rig owns the flash clock; just apply its opacity.
    material.opacity = tourFlash.opacity;
  });

  return null;
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
  // fitting both spans is a simple min over the two axes. With north (+X)
  // up, the frame's Z span (depth) lies along the screen's horizontal axis.
  const fitZoom = Math.min(size.width / frame.depth, size.height / frame.width);

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

  // Per-target pan animation state while a tour is active.
  const tourPanRef = useRef<{
    animation: TourAnimation;
    index: number;
    fromX: number;
    fromZ: number;
    fromZoom: number;
    elapsed: number;
    duration: number;
    dwellElapsed: number;
  } | null>(null);

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

    let dx = 0;
    let dz = 0;
    const animation = cameraTourStore.getState().animation;
    if (animation) {
      // An active tour drives the view: glide to a point centered above
      // the current target, dwell, then advance — mirroring the
      // travel/orbit phases of the regular tour.
      const target = animation.targets[animation.currentIndex];
      let tour = tourPanRef.current;
      if (
        !tour ||
        tour.animation !== animation ||
        tour.index !== animation.currentIndex
      ) {
        const distance = Math.hypot(
          target.position[0] - pan.current.x,
          target.position[2] - pan.current.z,
        );
        tour = {
          animation,
          index: animation.currentIndex,
          fromX: pan.current.x,
          fromZ: pan.current.z,
          fromZoom: zoom.current,
          elapsed: 0,
          duration: Math.max(
            TOUR_MIN_PAN_DURATION,
            Math.min(TOUR_MAX_PAN_DURATION, distance / TOUR_PAN_SPEED),
          ),
          dwellElapsed: 0,
        };
        tourPanRef.current = tour;
      }
      tour.elapsed += delta;
      const t = Math.min(1, tour.elapsed / tour.duration);
      // Pan: early velocity peak, then a long gentle deceleration.
      const eased = easeInOut(t, 2, 3);
      pan.current.x = tour.fromX + (target.position[0] - tour.fromX) * eased;
      pan.current.z = tour.fromZ + (target.position[2] - tour.fromZ) * eased;

      // Zoom rides the pan's timeline, back-loaded (barely moving while
      // the pan covers distance, fastest near arrival) but easing out into
      // a soft landing. Interpolated in log space so it feels linear.
      const targetZoom = fitZoomRef.current * TOUR_ZOOM_FACTOR;
      zoom.current =
        tour.fromZoom *
        Math.pow(targetZoom / tour.fromZoom, easeInOut(t, 3, 2));

      // Flash the target for the whole pan plus half the dwell, with a
      // short taper so the final pulse doesn't cut off abruptly.
      const flashWindow = tour.duration + TOUR_DWELL_DURATION / 2;
      if (tour.elapsed < flashWindow) {
        const pulse = Math.sin(Math.PI * ((tour.elapsed / FLASH_DURATION) % 1));
        const taper = Math.min(
          1,
          (flashWindow - tour.elapsed) / (FLASH_DURATION / 2),
        );
        tourFlash.opacity = pulse * taper;
      } else {
        tourFlash.opacity = 0;
      }

      // The tour repositioned the view; don't refit over it on resize.
      userAdjusted.current = true;
      if (t >= 1) {
        tour.dwellElapsed += delta;
        if (tour.dwellElapsed >= TOUR_DWELL_DURATION) {
          const isLastTarget =
            animation.currentIndex >= animation.targets.length - 1;
          if (isLastTarget) {
            cameraTourStore.getState().cancel();
          } else {
            cameraTourStore.getState().advanceTarget();
          }
        }
      }
    } else {
      tourPanRef.current = null;
      tourFlash.opacity = 0;
      const inputState = getInputState();

      // WASD pan at constant screen speed regardless of zoom. Screen-up is
      // world +X and screen-right is world +Z (see TOP_DOWN_QUATERNION).
      const panDistance = (PAN_SPEED / zoom.current) * delta;
      if (isPressed(inputState, "commandPanUp")) dx += panDistance;
      if (isPressed(inputState, "commandPanDown")) dx -= panDistance;
      if (isPressed(inputState, "commandPanLeft")) dz -= panDistance;
      if (isPressed(inputState, "commandPanRight")) dz += panDistance;

      // Drag/touch pan: map content follows the cursor or finger.
      const drag = inputState.commandPanDrag as DragState | undefined;
      if (drag?.dragging && (drag.deltaX !== 0 || drag.deltaY !== 0)) {
        dz -= drag.deltaX / zoom.current;
        dx += drag.deltaY / zoom.current;
      }
      const touch = inputState.commandPanTouch as TouchState | undefined;
      if (touch?.dragging && (touch.deltaX !== 0 || touch.deltaY !== 0)) {
        dz -= touch.deltaX / zoom.current;
        dx += touch.deltaY / zoom.current;
      }

      // Pinch zoom (touch devices).
      const pinch = inputState.commandPinchZoom as PinchState | undefined;
      if (pinch?.pinching && pinch.deltaDistance !== 0) {
        const fit = fitZoomRef.current;
        zoom.current = Math.min(
          fit * MAX_ZOOM_FACTOR,
          Math.max(
            fit * MIN_ZOOM_FACTOR,
            zoom.current * Math.exp(pinch.deltaDistance * PINCH_SENSITIVITY),
          ),
        );
        userAdjusted.current = true;
      }
      clearInputDeltas();

      if (dx !== 0 || dz !== 0) {
        userAdjusted.current = true;
      }
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
