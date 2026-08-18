import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrthographicCamera } from "@react-three/drei";
import {
  Box3,
  Euler,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  type Object3D,
  type OrthographicCamera as ThreeOrthographicCamera,
} from "three";
import {
  commandCircuitStore,
  isCommandFollowActive,
  useCommandCircuit,
} from "../state/commandCircuitStore";
import {
  exitWatchFollow,
  isWatchSpectator,
  toggleWatchFollow,
} from "../state/watchFollow";
import { cameraTourStore } from "../state/cameraTourStore";
import type { TourAnimation } from "../state/cameraTourStore";
import { CommandCircuitTourCallout } from "./CommandCircuitTourCallout";
import { tourFlash } from "./commandCircuitTourFlash";
import { cameraRegistry } from "../state/cameraRegistry";
import {
  gameEntityStore,
  isFlagEntity,
  useSceneMissionArea,
} from "../state/gameEntityStore";
import { streamSnapshotStore } from "../state/streamSnapshotStore";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import {
  liveConnectionStore,
  useLiveSelector,
} from "../state/liveConnectionStore";
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
const MAX_ZOOM_FACTOR = 50;

/**
 * Clamps a zoom value to the allowed range around the fit-to-frame zoom.
 */
function clampZoom(value: number, fitZoom: number): number {
  return Math.min(
    fitZoom * MAX_ZOOM_FACTOR,
    Math.max(fitZoom * MIN_ZOOM_FACTOR, value),
  );
}

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
 * Baseline tour zoom, as a multiple of the fitted zoom. Small targets zoom
 * in further (dynamically, per target) until their bounding box reaches
 * TOUR_TARGET_MIN_PX on screen in at least one dimension.
 */
const TOUR_ZOOM_FACTOR = 9;
const TOUR_TARGET_MIN_PX = 20;
/**
 * Flags are the tour's hero objects; they always zoom to their own (finer)
 * pixel target, with no leeway.
 */
const TOUR_FLAG_TARGET_MIN_PX = 15;
/**
 * Leeway for non-flag targets: if the next target would already measure
 * between TOUR_TARGET_MIN_PX and this at the current zoom, keep the zoom
 * as-is — fewer pointless micro-adjustments between similar-size stops.
 */
const TOUR_TARGET_LEEWAY_MAX_PX = 40;

/**
 * Long pans arc upward (zoom out mid-flight) so the journey reads as a
 * hop instead of terrain streaking past. The apex zoom is chosen so the
 * whole pan spans about this many screen pixels at the apex — short pans
 * don't dip at all (their apex would be above the flight path already),
 * and the dip never goes below the full-map fit. The strength factor eases
 * the dip partway toward that apex rather than all the way, keeping the
 * effect gentle.
 */
const TOUR_ARC_SCREEN_SPAN = 650;
const TOUR_ARC_STRENGTH = 0.6;

/**
 * After a tour completes, glide back out to the baseline tour zoom (if
 * deeper) over this long, keeping the final target centered.
 */
const TOUR_END_ZOOM_DURATION = 1.0;

/**
 * Tour target highlight: smooth flashes over the active target, rendered
 * as a filled silhouette above everything. Flashing runs for the whole pan
 * plus half the dwell; the rig owns the clock and publishes the opacity
 * (and post-flash idle time) via the shared tourFlash channel.
 */
const FLASH_COLOR = "#39ff14";
const FLASH_DURATION = 0.5;
const FLASH_RENDER_ORDER = 999;

const _tourBounds = new Box3();
const _meshBounds = new Box3();

/**
 * World-space bounds of the object's *visible* meshes only — shapes keep
 * hidden meshes around (damage states, vis sequences) that must not skew
 * the measured size.
 */
function visibleWorldBounds(object: Object3D): Box3 {
  _tourBounds.makeEmpty();
  object.updateWorldMatrix(true, true);
  object.traverseVisible((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    _meshBounds.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld);
    _tourBounds.union(_meshBounds);
  });
  return _tourBounds;
}

/**
 * Per-target tour zoom: enough that the target's bounding box spans its
 * pixel target (finer for flags) in one screen dimension, floored at the
 * baseline factor and capped at the max zoom. Non-flag targets that would
 * already measure inside the leeway band at the current zoom keep it
 * unchanged. Null while the target's model has no resolvable bounds (it
 * may still be streaming in).
 */
function computeTourZoomTarget(
  scene: Object3D,
  entityId: string,
  fromZoom: number,
  fit: number,
): number | null {
  const object = scene.getObjectByName(entityId);
  if (!object) return null;
  const bounds = visibleWorldBounds(object);
  if (bounds.isEmpty()) return null;
  const span = Math.max(
    bounds.max.x - bounds.min.x,
    bounds.max.z - bounds.min.z,
  );
  const flag = isFlagEntity(entityId);
  const currentPx = span * fromZoom;
  if (
    !flag &&
    fromZoom >= fit * TOUR_ZOOM_FACTOR &&
    currentPx >= TOUR_TARGET_MIN_PX &&
    currentPx <= TOUR_TARGET_LEEWAY_MAX_PX
  ) {
    // Close enough at the current zoom — skip the adjustment.
    return fromZoom;
  }
  const minPx = flag ? TOUR_FLAG_TARGET_MIN_PX : TOUR_TARGET_MIN_PX;
  return Math.min(
    fit * MAX_ZOOM_FACTOR,
    Math.max(fit * TOUR_ZOOM_FACTOR, span > 0 ? minPx / span : 0),
  );
}

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
  const gameStatus = useLiveSelector((s) => s.gameStatus);

  useInputAction("toggleCommandCircuit", () => {
    commandCircuitStore.getState().toggle();
  });
  useInputAction("exitCommandCircuit", () => {
    commandCircuitStore.getState().deactivate();
  });
  // Streaming (demo/live) only — the binding is mounted just for those.
  // Live mode never touches the local flag: the fly/follow state is
  // server-owned and shared with the 3D observer view, so request the
  // server-side toggle (trigger 2) and let the confirmed camera state
  // flow back down. Spectate mode's follow is client-side but likewise
  // shared with the 3D view.
  useInputAction("toggleCommandFollow", () => {
    if (gameEntityStore.getState().dataSource === "live") {
      if (isWatchSpectator()) {
        toggleWatchFollow();
      } else {
        commandCircuitStore.getState().requestObserverToggle();
      }
    } else {
      commandCircuitStore.getState().toggleFollow();
    }
  });

  // Entering command circuit exits pointer lock. Tours are unaffected —
  // they continue as top-down pans while the mode is active.
  useEffect(() => {
    if (active && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, [active]);

  // In live mode, tell the server the command map is open — the real
  // client's `commandToServer('ScopeCommanderMap', %bool)`. The server
  // then scopes EVERYTHING to this connection (GameConnection::
  // doneScopingScene, binary FUN_005fd530), instead of the usual 1000m
  // sphere + sensor-visible targets, so the map shows all players.
  // Observers are unaffected by the server's resetControlObject call
  // (no %client.player → control stays on the observer camera).
  useEffect(() => {
    if (!active || gameStatus !== "connected") return;
    liveConnectionStore.getState().sendCommand("ScopeCommanderMap", "1");
    return () => {
      // Re-check at cleanup time: on disconnect there's no one to tell.
      const live = liveConnectionStore.getState();
      if (live.gameStatus === "connected") {
        live.sendCommand("ScopeCommanderMap", "0");
      }
    };
    // gameStatus in deps re-sends the signal if the CC is open while the
    // connection completes or comes back after a reconnect.
  }, [active, gameStatus]);

  // Exit the mode when the data source changes (map ↔ demo ↔ live ↔
  // nothing) — each transition starts at its default camera view.
  useEffect(() => {
    let prevSource = gameEntityStore.getState().dataSource;
    return gameEntityStore.subscribe((state) => {
      if (state.dataSource !== prevSource) {
        prevSource = state.dataSource;
        commandCircuitStore.getState().deactivate();
      }
    });
  }, []);

  return active ? (
    <>
      <CommandCircuitOrthoRig />
      <CommandCircuitTourHighlight />
      <CommandCircuitTourCallout />
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
    initialView?.zoom != null ? clampZoom(initialView.zoom, fitZoom) : fitZoom,
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
    /**
     * World-space pan distance to the target, for the arc's apex zoom.
     */
    distance: number;
    /**
     * Per-target zoom, sized from the target's initial world bounds; null
     * until the target's model has resolvable bounds (it may still be
     * streaming in when the target activates).
     */
    zoomTarget: number | null;
  } | null>(null);

  // Post-tour settle animation: zoom back out to the baseline tour zoom.
  const endZoomRef = useRef<{ from: number; elapsed: number } | null>(null);

  // Refit on viewport/mission changes until the user takes over.
  useEffect(() => {
    fitZoomRef.current = fitZoom;
    if (!userAdjusted.current) {
      pan.current = { x: frame.centerX, z: frame.centerZ };
      zoom.current = fitZoom;
    }
  }, [frame, fitZoom]);

  /**
   * Applies a user zoom change anchored at a canvas point: the pan shifts
   * so the world position under (px, py) keeps its screen position. The
   * zoom itself no-ops when the clamp leaves it unchanged, so anchoring
   * can't drift at the limits.
   */
  const zoomAnchoredAt = (targetZoom: number, px: number, py: number) => {
    userAdjusted.current = true;
    endZoomRef.current = null;
    const oldZoom = zoom.current;
    const newZoom = clampZoom(targetZoom, fitZoomRef.current);
    if (newZoom === oldZoom) return;
    zoom.current = newZoom;
    // Point offsets from the viewport center map to world axes via
    // screen-right = +Z and screen-down = -X (see TOP_DOWN_QUATERNION).
    const sx = px - size.width / 2;
    const sy = py - size.height / 2;
    const shift = 1 / oldZoom - 1 / newZoom;
    pan.current.z += sx * shift;
    pan.current.x -= sy * shift;
  };

  useInputAction("commandZoom", () => {
    const scroll = getInputState().commandZoom as ScrollState | undefined;
    if (!scroll || scroll.deltaY === 0) return;
    zoomAnchoredAt(
      zoom.current * Math.exp(-scroll.deltaY * ZOOM_SENSITIVITY),
      scroll.x,
      scroll.y,
    );
  });

  useFrame((state, delta) => {
    const camera = cameraRef.current;
    if (!camera) return;

    const isStreaming = gameEntityStore.getState().isStreaming;

    // Pressing a pan key (or drag-panning) while following switches to
    // pan mode. In demos the switch is local and takes effect this same
    // frame; in live mode it requests the server-side fly toggle (the
    // shared observer state) and panning engages once confirmed.
    if (isStreaming && isCommandFollowActive()) {
      const inputState = getInputState();
      const followDrag = inputState.commandPanDrag as DragState | undefined;
      const followTouch = inputState.commandPanTouch as TouchState | undefined;
      if (
        isPressed(inputState, "commandPanUp") ||
        isPressed(inputState, "commandPanDown") ||
        isPressed(inputState, "commandPanLeft") ||
        isPressed(inputState, "commandPanRight") ||
        (followDrag?.dragging &&
          (followDrag.deltaX !== 0 || followDrag.deltaY !== 0)) ||
        (followTouch?.dragging &&
          (followTouch.deltaX !== 0 || followTouch.deltaY !== 0))
      ) {
        if (gameEntityStore.getState().dataSource === "live") {
          if (isWatchSpectator()) {
            exitWatchFollow();
          } else {
            commandCircuitStore.getState().requestObserverToggle();
          }
        } else {
          commandCircuitStore.getState().setFollow(false);
        }
      }
    }

    // During demo/live playback the view follows the action by default:
    // the observed player's rendered position when the stream follows one,
    // otherwise the spectator camera. Zoom stays user-controlled (same
    // limits as map mode); panning and tours don't apply. F toggles out
    // of follow mode, falling through to the free pan handling.
    if (isStreaming && isCommandFollowActive()) {
      const cam = streamSnapshotStore.getState().snapshot?.camera;
      const followId =
        (cam?.mode === "third-person"
          ? (cam.orbitTargetId ?? cam.controlEntityId)
          : cam?.mode === "first-person"
            ? cam.controlEntityId
            : undefined) ??
        // Spectate mode: the client-side follow target (the stream camera
        // is the relay's stationary observer, never in orbit mode).
        streamPlaybackStore.getState().followEntityId ??
        undefined;
      const root = streamPlaybackStore.getState().root;
      const followObj = followId ? root?.getObjectByName(followId) : null;
      if (followObj) {
        pan.current.x = followObj.position.x;
        pan.current.z = followObj.position.z;
      } else if (cameraRegistry.perspective) {
        // Free-flying observer (or no follow target yet): center on the
        // spectator camera, which StreamingController keeps updated.
        pan.current.x = cameraRegistry.perspective.position.x;
        pan.current.z = cameraRegistry.perspective.position.z;
      }
      clearInputDeltas();
      camera.position.set(pan.current.x, CAMERA_HEIGHT, pan.current.z);
      camera.quaternion.copy(TOP_DOWN_QUATERNION);
      camera.zoom = zoom.current;
      camera.updateProjectionMatrix();
      return;
    }

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
          distance,
          zoomTarget: null,
        };
        tourPanRef.current = tour;
      }

      // Dynamic zoom, computed once per target (screen axes map to world
      // X/Z under the top-down camera); retried while null since the
      // target's model may still be streaming in.
      tour.zoomTarget ??= computeTourZoomTarget(
        state.scene,
        target.entityId,
        tour.fromZoom,
        fitZoomRef.current,
      );

      tour.elapsed += delta;
      const t = Math.min(1, tour.elapsed / tour.duration);
      // Pan: early velocity peak, then a long gentle deceleration.
      const eased = easeInOut(t, 2, 3);
      pan.current.x = tour.fromX + (target.position[0] - tour.fromX) * eased;
      pan.current.z = tour.fromZ + (target.position[2] - tour.fromZ) * eased;

      // Zoom rides the pan's timeline, back-loaded (barely moving while
      // the pan covers distance, fastest near arrival) but easing out into
      // a soft landing. Interpolated in log space so it feels linear.
      const targetZoom =
        tour.zoomTarget ?? fitZoomRef.current * TOUR_ZOOM_FACTOR;
      const logFrom = Math.log(tour.fromZoom);
      const logTarget = Math.log(targetZoom);
      const zoomEase = easeInOut(t, 3, 2);
      let logZoom = logFrom + (logTarget - logFrom) * zoomEase;
      // Arc: on long pans, dip toward a zoomed-out apex mid-flight so the
      // journey reads as a hop rather than terrain streaking past. The
      // apex shows the whole pan within ~TOUR_ARC_SCREEN_SPAN pixels
      // (floored at the full-map fit); short pans have an apex above the
      // flight path, so their dip vanishes and the zoom stays flat. The
      // sin² bump has zero velocity at both ends for an elastic feel.
      if (tour.distance > 0) {
        const apex = Math.max(
          fitZoomRef.current,
          TOUR_ARC_SCREEN_SPAN / tour.distance,
        );
        const logFlightMid =
          logFrom + (logTarget - logFrom) * easeInOut(0.5, 3, 2);
        const dip = Math.max(0, logFlightMid - Math.log(apex));
        const bump = Math.sin(Math.PI * t) ** 2;
        logZoom -= dip * TOUR_ARC_STRENGTH * bump;
      }
      zoom.current = Math.exp(logZoom);

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
        tourFlash.idleTime = 0;
      } else {
        tourFlash.opacity = 0;
        tourFlash.idleTime = tour.elapsed - flashWindow;
      }

      // The tour repositioned the view; don't refit over it on resize.
      userAdjusted.current = true;
      endZoomRef.current = null;
      // Dwell after arriving, then move on.
      if (tour.elapsed - tour.duration >= TOUR_DWELL_DURATION) {
        const isLastTarget =
          animation.currentIndex >= animation.targets.length - 1;
        if (isLastTarget) {
          cameraTourStore.getState().cancel();
          // Settle: keep the final target centered but glide back out
          // to the baseline zoom if the target zoomed in deeper.
          if (zoom.current > fitZoomRef.current * TOUR_ZOOM_FACTOR) {
            endZoomRef.current = { from: zoom.current, elapsed: 0 };
          }
        } else {
          cameraTourStore.getState().advanceTarget();
        }
      }
    } else {
      tourPanRef.current = null;
      tourFlash.opacity = 0;
      tourFlash.idleTime = 0;
      const inputState = getInputState();

      // Post-tour zoom-out glide; any user input below interrupts it.
      const endZoom = endZoomRef.current;
      if (endZoom) {
        endZoom.elapsed += delta;
        const t = Math.min(1, endZoom.elapsed / TOUR_END_ZOOM_DURATION);
        const to = fitZoomRef.current * TOUR_ZOOM_FACTOR;
        zoom.current =
          endZoom.from * Math.pow(to / endZoom.from, easeInOut(t, 2, 3));
        if (t >= 1) endZoomRef.current = null;
      }

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
      const pinch = inputState.commandPinchZoom as PinchState | undefined;
      const pinching = pinch?.pinching ?? false;
      // While two fingers are down, the gesture midpoint drives the view
      // (map-app style) and the single-finger pan is ignored.
      const touch = inputState.commandPanTouch as TouchState | undefined;
      if (
        !pinching &&
        touch?.dragging &&
        (touch.deltaX !== 0 || touch.deltaY !== 0)
      ) {
        dz -= touch.deltaX / zoom.current;
        dx += touch.deltaY / zoom.current;
      }

      // Pinch (touch devices): pan with the midpoint's movement, zoom
      // anchored on the midpoint so the world point between the fingers
      // stays put — matching Google Maps-style focal point gestures.
      if (pinch && pinching) {
        if (pinch.deltaX !== 0 || pinch.deltaY !== 0) {
          dz -= pinch.deltaX / zoom.current;
          dx += pinch.deltaY / zoom.current;
        }
        if (pinch.deltaDistance !== 0) {
          zoomAnchoredAt(
            zoom.current * Math.exp(pinch.deltaDistance * PINCH_SENSITIVITY),
            pinch.x,
            pinch.y,
          );
        }
      }

      if (dx !== 0 || dz !== 0) {
        userAdjusted.current = true;
        endZoomRef.current = null;
      }
    }

    // Clear deltas in both branches: while a tour drives the view, user
    // pan/pinch input is ignored, and letting it accumulate would apply
    // the whole backlog as a jump when the tour ends.
    clearInputDeltas();

    // No pan bounds: Torque terrain repeats infinitely in every direction,
    // so there's always map to see.
    pan.current.x += dx;
    pan.current.z += dz;

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
