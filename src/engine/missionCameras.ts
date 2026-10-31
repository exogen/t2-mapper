import { Quaternion, Vector3 } from "three";
import { cameraRegistry } from "../state/cameraRegistry";
import { gameEntityStore, selectSceneEntities } from "../state/gameEntityStore";
import type { CameraEntity, GameEntity } from "../state/gameEntityTypes";
import { parseViewHash, type ParsedViewHash } from "../viewHash";
import { FramePriority } from "./framePriority";
import { combineCleanups, reaction } from "./storeReaction";
import type { GameEngine } from "./gameEngine";

/** Torque cameras look down +Y; three's look down −Z. */
const CAMERA_CORRECTION = new Quaternion().setFromAxisAngle(
  new Vector3(0, 1, 0),
  -Math.PI / 2,
);

let cameras: readonly CameraEntity[] = [];
let cameraIndex = -1;

function selectObserverCameras(
  state: Parameters<typeof selectSceneEntities>[0],
) {
  return selectSceneEntities(state).filter(
    (entity: GameEntity): entity is CameraEntity =>
      entity.renderType === "Camera" &&
      entity.cameraDataBlock === "Observer" &&
      !entity.hidden &&
      !entity.debugHidden,
  );
}

function sameCameras(a: readonly CameraEntity[], b: readonly CameraEntity[]) {
  return a.length === b.length && a.every((camera, i) => camera === b[i]);
}

/** The mission's preset observer cameras (number keys select them). */
export function missionCameraCount(): number {
  return cameras.length;
}

/**
 * Move the regular perspective camera to a mission camera. It stays put
 * even while the command circuit's ortho camera is rendering; the preset
 * itself never moves, so cycling back returns to the same view.
 */
export function selectMissionCamera(index: number): void {
  const camera = cameraRegistry.perspective;
  const preset = cameras[index];
  if (!camera || !preset) return;
  cameraIndex = index;
  camera.position.set(...(preset.position ?? [0, 0, 0]));
  camera.quaternion
    .set(...(preset.rotation ?? [0, 0, 0, 1]))
    .multiply(CAMERA_CORRECTION);
}

/**
 * Track the mission's observer cameras, and place the camera on load:
 * at the URL's view hash when it has one (re-applied when the hash is
 * edited), otherwise at the mission's first camera.
 */
export function installMissionCameras(engine: GameEngine): () => void {
  let pendingView: ParsedViewHash | null = null;
  let hashPlacesCamera = false;

  const readHash = () => {
    // A command-circuit link's hash describes the ortho camera and is
    // restored by the command circuit rig itself — never apply it to the
    // regular camera. A demo link's hash is the camera for a moment in
    // the demo, applied by DemoMomentLoader once the demo has loaded
    // and seeked; applied here it would be overwritten by playback.
    const search = new URLSearchParams(window.location.search);
    const ownedElsewhere =
      search.get("view") === "cc" || search.get("mode") === "demo";
    const parsed = ownedElsewhere ? null : parseViewHash(window.location.hash);
    pendingView = parsed;
    hashPlacesCamera = parsed != null;
  };
  readHash();
  window.addEventListener("hashchange", readHash);

  return combineCleanups(
    () => {
      window.removeEventListener("hashchange", readHash);
      cameras = [];
      cameraIndex = -1;
    },
    reaction(
      gameEntityStore,
      selectObserverCameras,
      (list) => {
        cameras = list;
        if (list.length === 0) cameraIndex = -1;
      },
      sameCameras,
    ),
    engine.scheduler.add(FramePriority.CameraSelect, () => {
      const camera = cameraRegistry.perspective;
      if (!camera) return;
      if (pendingView) {
        camera.position.copy(pendingView.position);
        if (pendingView.quaternion)
          camera.quaternion.copy(pendingView.quaternion);
        pendingView = null;
      } else if (!hashPlacesCamera && cameraIndex === -1 && cameras.length) {
        selectMissionCamera(0);
      }
    }),
  );
}
