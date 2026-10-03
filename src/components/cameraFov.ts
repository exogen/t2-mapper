import type { PerspectiveCamera } from "three";
import { engineStore } from "../state/engineStore";
import { resolveCameraOwner } from "../state/cameraOwner";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { streamRenderFrame } from "../stream/interpolateEntity";
import { torqueHorizontalFovToThreeVerticalFov } from "../stream/playbackUtils";

function isValidFov(fov: number | undefined): fov is number {
  return fov !== undefined && Number.isFinite(fov) && fov > 0 && fov < 180;
}

/** One FOV owner for map, demo and live cameras, including paused playback. */
export function updateObserverCameraFov(
  camera: PerspectiveCamera,
  preferredFov: number,
): void {
  const { recording } = engineStore.getState().playback;
  const stream = streamPlaybackStore.getState();
  const owner = resolveCameraOwner();
  const recordedFov = streamRenderFrame.camera?.fov;
  let fov = isValidFov(preferredFov) ? preferredFov : 90;
  if (
    recording?.source === "demo" &&
    recording.streamingPlayback === stream.playback &&
    stream.cameraMode === "original" &&
    owner !== "tour" &&
    owner !== "director" &&
    isValidFov(recordedFov)
  ) {
    // Tribes2.exe handleRecordedBlock (0x005fb170) restores the captured
    // FOV directly. Samples already contain the recorder's zoom easing.
    fov = recordedFov;
  }
  const verticalFov = torqueHorizontalFovToThreeVerticalFov(fov, camera.aspect);
  if (camera.fov !== verticalFov) {
    camera.fov = verticalFov;
    camera.updateProjectionMatrix();
  }
}
