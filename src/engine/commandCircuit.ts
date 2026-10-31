import {
  Box3,
  Euler,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  type Object3D,
} from "three";
import {
  commandCircuitStore,
  isCommandFollowActive,
} from "../state/commandCircuitStore";
import {
  enterWatchFollow,
  exitToFreeFly,
  exitWatchFollow,
  isWatchSpectator,
  toggleWatchFollow,
} from "../state/watchFollow";
import {
  cameraTourStore,
  computeTravelDuration,
} from "../state/cameraTourStore";
import type { TourAnimation } from "../state/cameraTourStore";
import {
  createTourHighlightMesh,
  removeTourHighlightMeshes,
  tourFlash,
} from "./commandCircuitTourFlash";
import { isAttachedToScene } from "./screenRectTracker";
import { cameraRegistry } from "../state/cameraRegistry";
import {
  gameEntityStore,
  isFlagEntity,
  isStreamingSource,
  selectMissionAreaData,
} from "../state/gameEntityStore";
import { streamSnapshotStore } from "../state/streamSnapshotStore";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { liveConnectionStore } from "../state/liveConnectionStore";
import { computeCommandCircuitFrame } from "../stats/commandCircuitFrame";
import { parseViewHash } from "../viewHash";
import { FramePriority } from "./framePriority";
import { combineCleanups, reaction } from "./storeReaction";
import type { GameEngine } from "./gameEngine";
import { computeObjectBounds } from "../sceneBounds";
import {
  isPressed,
  subscribeAction,
  inputControlsStore,
  clearInputDeltas,
  type DragState,
  type PinchState,
  type ScrollState,
  type TouchState,
} from "../state/inputControls";

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

const MIN_ZOOM_FACTOR = 0.5;
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

/**
 * World-space bounds of the object's *visible* meshes only — shapes keep
 * hidden meshes around (damage states, vis sequences) that must not skew
 * the measured size.
 */
function visibleWorldBounds(object: Object3D): Box3 {
  computeObjectBounds(object, _tourBounds, { visibleOnly: true });
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

/**
 * Command circuit mode: a top-down orthographic overview of the whole map,
 * named for Tribes 2's in-game command map. Always mounted; renders the
 * orthographic camera rig only while the mode is active.
 */
/**
 * The command circuit (C): a top-down tactical map. While it's open the
 * scene renders through the orthographic rig, and in live mode the server
 * scopes every object to this client.
 */
export function installCommandCircuit(engine: GameEngine): () => void {
  return combineCleanups(
    subscribeAction("toggleCommandCircuit", () => {
      commandCircuitStore.getState().toggle();
    }),
    subscribeAction("exitCommandCircuit", () => {
      commandCircuitStore.getState().deactivate();
    }),
    // Streaming (demo/live) only — the binding is mounted just for those.
    // Live mode never touches the local flag: the fly/follow state is
    // server-owned and shared with the 3D observer view, so request the
    // server-side toggle (trigger 2) and let the confirmed camera state
    // flow back down. Spectate mode's follow is client-side but likewise
    // shared with the 3D view.
    subscribeAction("toggleCommandFollow", () => {
      if (gameEntityStore.getState().dataSource === "live") {
        if (isWatchSpectator()) {
          toggleWatchFollow();
        } else {
          commandCircuitStore.getState().requestObserverToggle();
        }
      } else {
        // Demo: shared with the 3D view — follow ↔ pan maps to orbit-follow
        // ↔ free-fly. The recorded "original" view counts as pan, so F from
        // there enters follow.
        if (isCommandFollowActive()) {
          exitToFreeFly();
        } else {
          enterWatchFollow();
        }
      }
    }),
    // Entering command circuit exits pointer lock. Tours are unaffected —
    // they continue as top-down pans while the mode is active.
    reaction(
      commandCircuitStore,
      (state) => state.active,
      (active) => {
        if (active && document.pointerLockElement) {
          document.exitPointerLock();
        }
      },
    ),
    // In live mode, tell the server the command map is open — the real
    // client's `commandToServer('ScopeCommanderMap', %bool)`. The server
    // then scopes EVERYTHING to this connection (GameConnection::
    // doneScopingScene, binary FUN_005fd530), instead of the usual 1000m
    // sphere + sensor-visible targets, so the map shows all players.
    // Observers are unaffected by the server's resetControlObject call
    // (no %client.player → control stays on the observer camera). Also
    // re-sent if the connection completes or comes back while it's open.
    reaction(
      commandCircuitStore,
      (state) => state.active,
      (active) =>
        active
          ? reaction(
              liveConnectionStore,
              (state) => state.gameStatus === "connected",
              (connected) => {
                if (!connected) return;
                liveConnectionStore
                  .getState()
                  .sendCommand("ScopeCommanderMap", "1");
                return () => {
                  // Re-check at cleanup time: on disconnect there's no one
                  // to tell.
                  const live = liveConnectionStore.getState();
                  if (live.gameStatus === "connected") {
                    live.sendCommand("ScopeCommanderMap", "0");
                  }
                };
              },
            )
          : undefined,
    ),
    // Exit the mode when the data source changes (map ↔ demo ↔ live ↔
    // nothing) — each transition starts at its default camera view.
    reaction(
      gameEntityStore,
      (state) => state.dataSource,
      () => commandCircuitStore.getState().deactivate(),
    ),
    reaction(
      commandCircuitStore,
      (state) => state.active,
      (active) => {
        if (!active) return;
        engine.cameras.setActive(engine.cameras.ortho);
        return combineCleanups(
          () => engine.cameras.setActive(engine.cameras.perspective),
          startOrthoRig(engine),
          startTourHighlight(engine),
        );
      },
    ),
  );
}

/**
 * Flashes a neon silhouette over the active tour target so it's findable
 * from above even when occluded (e.g. an item inside a base). The overlay
 * meshes share the target's geometry, are parented inside its meshes so
 * they track transforms, and render without depth testing above everything.
 */
function startTourHighlight(engine: GameEngine): () => void {
  const material = new MeshBasicMaterial({
    color: FLASH_COLOR,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });
  let currentOverlay: {
    animation: TourAnimation;
    index: number;
    meshes: Mesh[];
  } | null = null;
  const teardown = () => {
    if (currentOverlay) removeTourHighlightMeshes(currentOverlay.meshes);
    currentOverlay = null;
  };
  return combineCleanups(
    () => material.dispose(),
    teardown,
    engine.scheduler.add(FramePriority.CameraCommandCircuit, ({ scene }) => {
      const animation = cameraTourStore.getState().animation;
      if (!animation) {
        teardown();
        return;
      }

      let overlay = currentOverlay;
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
        currentOverlay = overlay;
      }

      // If the meshes we attached to were replaced (e.g. a placeholder swapped
      // for the streamed-in model), our clones went with them — rebuild.
      if (overlay.meshes.some((mesh) => !isAttachedToScene(mesh, scene)))
        removeTourHighlightMeshes(overlay.meshes);

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
            if (child instanceof Mesh) sources.push(child);
          });
          for (const source of sources) {
            const clone = createTourHighlightMesh(source, material);
            clone.renderOrder = FLASH_RENDER_ORDER;
            source.add(clone);
            overlay.meshes.push(clone);
          }
        }
      }

      // The rig owns the flash clock; just apply its opacity.
      material.opacity = tourFlash.opacity;
    }),
  );
}

/**
 * The command circuit's top-down orthographic view: pans, zooms, follows
 * the observed player during playback, and flies tours. Fresh view state
 * each time the command circuit opens.
 */
function startOrthoRig(engine: GameEngine): () => void {
  const camera = engine.cameras.ortho;
  camera.near = CAMERA_NEAR;
  camera.far = CAMERA_FAR;
  camera.updateProjectionMatrix();
  const size = engine.cameras.viewport;
  let frame = computeCommandCircuitFrame(
    selectMissionAreaData(gameEntityStore.getState()),
  );
  // The ortho frustum is pixel-sized, so zoom is pixels per world unit;
  // fitting both spans is a simple min over the two axes. With north (+X)
  // up, the frame's Z span (depth) lies along the screen's horizontal axis.
  const computeFitZoom = () =>
    Math.min(size.x / frame.depth, size.y / frame.width);
  let fitZoom = computeFitZoom();

  // Restore the pan/zoom from a shared `#c` view hash (e.g. a link copied
  // while in command circuit mode); otherwise center and fit to the frame.
  const initialView = parseViewHash(window.location.hash);
  let pan = initialView
    ? { x: initialView.position.x, z: initialView.position.z }
    : { x: frame.centerX, z: frame.centerZ };
  let zoom =
    initialView?.zoom != null ? clampZoom(initialView.zoom, fitZoom) : fitZoom;
  let userAdjusted = initialView !== null;

  // Per-target pan animation state while a tour is active.
  let tourPan: {
    animation: TourAnimation;
    index: number;
    fromX: number;
    fromZ: number;
    fromZoom: number;
    elapsed: number;
    duration: number;
    /** * World-space pan distance to the target, for the arc's apex zoom. */ distance: number;
    /** * Per-target zoom, sized from the target's initial world bounds; null * until the target's model has resolvable bounds (it may still be * streaming in when the target activates). */ zoomTarget:
      number | null;
  } | null | null = null;

  // Post-tour settle animation: zoom back out to the baseline tour zoom.
  let endZoom: { from: number; elapsed: number } | null | null = null;

  // Refit on viewport/mission changes until the user takes over.
  const refit = () => {
    fitZoom = computeFitZoom();
    if (!userAdjusted) {
      pan = { x: frame.centerX, z: frame.centerZ };
      zoom = fitZoom;
    }
  };

  /**
   * Applies a user zoom change anchored at a canvas point: the pan shifts
   * so the world position under (px, py) keeps its screen position. The
   * zoom itself no-ops when the clamp leaves it unchanged, so anchoring
   * can't drift at the limits.
   */
  const zoomAnchoredAt = (targetZoom: number, px: number, py: number) => {
    userAdjusted = true;
    endZoom = null;
    const oldZoom = zoom;
    const newZoom = clampZoom(targetZoom, fitZoom);
    if (newZoom === oldZoom) return;
    zoom = newZoom;
    // Point offsets from the viewport center map to world axes via
    // screen-right = +Z and screen-down = -X (see TOP_DOWN_QUATERNION).
    const sx = px - size.x / 2;
    const sy = py - size.y / 2;
    const shift = 1 / oldZoom - 1 / newZoom;
    pan.z += sx * shift;
    pan.x -= sy * shift;
  };

  const viewSize = { x: size.x, y: size.y };

  return combineCleanups(
    reaction(gameEntityStore, selectMissionAreaData, (missionArea) => {
      frame = computeCommandCircuitFrame(missionArea);
      refit();
    }),
    subscribeAction("commandZoom", () => {
      const scroll = inputControlsStore.getState().actions.commandZoom as
        ScrollState | undefined;
      if (!scroll || scroll.deltaY === 0) return;
      zoomAnchoredAt(
        zoom * Math.exp(-scroll.deltaY * ZOOM_SENSITIVITY),
        scroll.x,
        scroll.y,
      );
    }),
    engine.scheduler.add(
      FramePriority.CameraCommandCircuit,
      ({ delta, scene }) => {
        if (viewSize.x !== size.x || viewSize.y !== size.y) {
          viewSize.x = size.x;
          viewSize.y = size.y;
          refit();
        }
        const view = commandCircuitStore.getState().viewRequest;
        if (view) {
          pan = { x: view.x, z: view.z };
          zoom = clampZoom(view.zoom, fitZoom);
          userAdjusted = true;
          tourPan = null;
          endZoom = null;
          commandCircuitStore.setState({ viewRequest: null });
        }

        const isStreaming = isStreamingSource(
          gameEntityStore.getState().dataSource,
        );

        // Pressing a pan key (or drag-panning) while following switches to
        // pan mode. In demos the switch is local and takes effect this same
        // frame; in live mode it requests the server-side fly toggle (the
        // shared observer state) and panning engages once confirmed.
        if (isStreaming && isCommandFollowActive()) {
          const inputState = inputControlsStore.getState().actions;
          const followDrag = inputState.commandPanDrag as DragState | undefined;
          const followTouch = inputState.commandPanTouch as
            TouchState | undefined;
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
              // Demo: panning breaks follow → free-fly in the 3D view too.
              exitToFreeFly();
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
          // A client-side follow target (demo click-to-follow, watch spectate)
          // wins over the recorded/server camera's own orbit target — the
          // latter only drives live non-watcher (server-authoritative) follow,
          // where followEntityId is null.
          const followId =
            streamPlaybackStore.getState().followEntityId ??
            (cam?.mode === "third-person"
              ? (cam.orbitTargetId ?? cam.controlEntityId)
              : cam?.mode === "first-person"
                ? cam.controlEntityId
                : undefined) ??
            undefined;
          const root = streamPlaybackStore.getState().root;
          const followObj = followId ? root?.getObjectByName(followId) : null;
          if (followObj) {
            pan.x = followObj.position.x;
            pan.z = followObj.position.z;
          } else if (cameraRegistry.perspective) {
            // Free-flying observer (or no follow target yet): center on the
            // spectator camera, which StreamPlaybackSession keeps updated.
            pan.x = cameraRegistry.perspective.position.x;
            pan.z = cameraRegistry.perspective.position.z;
          }
          clearInputDeltas();
          camera.position.set(pan.x, CAMERA_HEIGHT, pan.z);
          camera.quaternion.copy(TOP_DOWN_QUATERNION);
          camera.zoom = zoom;
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
          let tour = tourPan;
          if (
            !tour ||
            tour.animation !== animation ||
            tour.index !== animation.currentIndex
          ) {
            const distance = Math.hypot(
              target.position[0] - pan.x,
              target.position[2] - pan.z,
            );
            tour = {
              animation,
              index: animation.currentIndex,
              fromX: pan.x,
              fromZ: pan.z,
              fromZoom: zoom,
              elapsed: 0,
              duration: computeTravelDuration(distance),
              distance,
              zoomTarget: null,
            };
            tourPan = tour;
          }

          // Dynamic zoom, computed once per target (screen axes map to world
          // X/Z under the top-down camera); retried while null since the
          // target's model may still be streaming in.
          tour.zoomTarget ??= computeTourZoomTarget(
            scene,
            target.entityId,
            tour.fromZoom,
            fitZoom,
          );

          tour.elapsed += delta;
          const t = Math.min(1, tour.elapsed / tour.duration);
          // Pan: early velocity peak, then a long gentle deceleration.
          const eased = easeInOut(t, 2, 3);
          pan.x = tour.fromX + (target.position[0] - tour.fromX) * eased;
          pan.z = tour.fromZ + (target.position[2] - tour.fromZ) * eased;

          // Zoom rides the pan's timeline, back-loaded (barely moving while
          // the pan covers distance, fastest near arrival) but easing out into
          // a soft landing. Interpolated in log space so it feels linear.
          const targetZoom = tour.zoomTarget ?? fitZoom * TOUR_ZOOM_FACTOR;
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
              fitZoom,
              TOUR_ARC_SCREEN_SPAN / tour.distance,
            );
            const logFlightMid =
              logFrom + (logTarget - logFrom) * easeInOut(0.5, 3, 2);
            const dip = Math.max(0, logFlightMid - Math.log(apex));
            const bump = Math.sin(Math.PI * t) ** 2;
            logZoom -= dip * TOUR_ARC_STRENGTH * bump;
          }
          zoom = Math.exp(logZoom);

          // Flash the target for the whole pan plus half the dwell, with a
          // short taper so the final pulse doesn't cut off abruptly.
          const flashWindow = tour.duration + TOUR_DWELL_DURATION / 2;
          if (tour.elapsed < flashWindow) {
            const pulse = Math.sin(
              Math.PI * ((tour.elapsed / FLASH_DURATION) % 1),
            );
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
          userAdjusted = true;
          endZoom = null;
          // Dwell after arriving, then move on.
          if (tour.elapsed - tour.duration >= TOUR_DWELL_DURATION) {
            const isLastTarget =
              animation.currentIndex >= animation.targets.length - 1;
            if (isLastTarget) {
              cameraTourStore.getState().cancel();
              // Settle: keep the final target centered but glide back out
              // to the baseline zoom if the target zoomed in deeper.
              if (zoom > fitZoom * TOUR_ZOOM_FACTOR) {
                endZoom = { from: zoom, elapsed: 0 };
              }
            } else {
              cameraTourStore.getState().advanceTarget();
            }
          }
        } else {
          tourPan = null;
          tourFlash.opacity = 0;
          tourFlash.idleTime = 0;
          const inputState = inputControlsStore.getState().actions;

          // Post-tour zoom-out glide; any user input below interrupts it.
          const settle = endZoom;
          if (settle) {
            settle.elapsed += delta;
            const t = Math.min(1, settle.elapsed / TOUR_END_ZOOM_DURATION);
            const to = fitZoom * TOUR_ZOOM_FACTOR;
            zoom = settle.from * Math.pow(to / settle.from, easeInOut(t, 2, 3));
            if (t >= 1) endZoom = null;
          }

          // WASD pan at constant screen speed regardless of zoom. Screen-up is
          // world +X and screen-right is world +Z (see TOP_DOWN_QUATERNION).
          const panDistance = (PAN_SPEED / zoom) * delta;
          if (isPressed(inputState, "commandPanUp")) dx += panDistance;
          if (isPressed(inputState, "commandPanDown")) dx -= panDistance;
          if (isPressed(inputState, "commandPanLeft")) dz -= panDistance;
          if (isPressed(inputState, "commandPanRight")) dz += panDistance;

          // Drag/touch pan: map content follows the cursor or finger.
          const drag = inputState.commandPanDrag as DragState | undefined;
          if (drag?.dragging && (drag.deltaX !== 0 || drag.deltaY !== 0)) {
            dz -= drag.deltaX / zoom;
            dx += drag.deltaY / zoom;
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
            dz -= touch.deltaX / zoom;
            dx += touch.deltaY / zoom;
          }

          // Pinch (touch devices): pan with the midpoint's movement, zoom
          // anchored on the midpoint so the world point between the fingers
          // stays put — matching Google Maps-style focal point gestures.
          if (pinch && pinching) {
            if (pinch.deltaX !== 0 || pinch.deltaY !== 0) {
              dz -= pinch.deltaX / zoom;
              dx += pinch.deltaY / zoom;
            }
            if (pinch.deltaDistance !== 0) {
              zoomAnchoredAt(
                zoom * Math.exp(pinch.deltaDistance * PINCH_SENSITIVITY),
                pinch.x,
                pinch.y,
              );
            }
          }

          if (dx !== 0 || dz !== 0) {
            userAdjusted = true;
            endZoom = null;
          }
        }

        // Clear deltas in both branches: while a tour drives the view, user
        // pan/pinch input is ignored, and letting it accumulate would apply
        // the whole backlog as a jump when the tour ends.
        clearInputDeltas();

        // No pan bounds: Torque terrain repeats infinitely in every direction,
        // so there's always map to see.
        pan.x += dx;
        pan.z += dz;

        // Re-assert the full transform every frame; other camera writers are
        // gated while this mode is active, but effects (like the URL-hash
        // restore) may still write once on camera changes.
        camera.position.set(pan.x, CAMERA_HEIGHT, pan.z);
        camera.quaternion.copy(TOP_DOWN_QUATERNION);
        camera.zoom = zoom;
        camera.updateProjectionMatrix();
      },
    ),
  );
}
