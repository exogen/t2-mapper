import type { CameraEntity, WayPointEntity } from "../state/gameEntityTypes";
import { createDebugMarker, showWhileDebugTourTarget } from "./debugVisuals";
import { createPositionedRoot, type EntityView } from "./entityViews";
import { combineCleanups } from "./storeReaction";
import { WorldLabel } from "./worldLabel";

/**
 * A mission camera. Observer cameras are presets the number keys jump to
 * (missionCameras.ts); the view only marks one during a debug tour.
 */
export function createCameraView(entity: CameraEntity): EntityView {
  const { root, model } = createPositionedRoot(entity);
  return {
    root,
    dispose: showWhileDebugTourTarget(model, entity.id, () =>
      createDebugMarker(1.5),
    ),
  };
}

/** A waypoint: its label, plus a marker during a debug tour. */
export function createWayPointView(entity: WayPointEntity): EntityView {
  const { root, model } = createPositionedRoot(entity);
  const label = entity.label
    ? new WorldLabel(model, entity.label, { opacity: 0.6 })
    : null;
  return {
    root,
    dispose: combineCleanups(
      () => label?.dispose(),
      showWhileDebugTourTarget(model, entity.id, () => createDebugMarker(1.5)),
    ),
  };
}
