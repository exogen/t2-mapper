import type { PerspectiveCamera } from "three";
import { engineStore } from "../state/engineStore";
import { casterStore } from "../state/casterStore";
import { resolveCameraOwner } from "../state/cameraOwner";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { streamRenderFrame } from "../stream/interpolateEntity";
import { torqueHorizontalFovToThreeVerticalFov } from "../stream/playbackUtils";

function isValidFov(fov: number | undefined): fov is number {
  return fov !== undefined && Number.isFinite(fov) && fov > 0 && fov < 180;
}

export function applyVerticalFov(camera: PerspectiveCamera, fov: number): void {
  if (camera.fov === fov) return;
  camera.fov = fov;
  camera.updateProjectionMatrix();
}

/** Base framing and viewer zoom availability for the current observer mode. */
export function resolveObserverFov(preferredFov: number) {
  const { recording } = engineStore.getState().playback;
  const stream = streamPlaybackStore.getState();
  const owner = resolveCameraOwner();
  const isOriginalDemoView =
    recording?.source === "demo" &&
    stream.cameraMode === "original" &&
    owner !== "tour" &&
    owner !== "director";
  const recordedFov = streamRenderFrame.camera?.fov;
  let fov = isValidFov(preferredFov) ? preferredFov : 90;
  const savedFov = casterStore.getState().fov;
  if (
    recording != null &&
    isValidFov(savedFov ?? undefined) &&
    owner !== "tour" &&
    owner !== "director"
  )
    fov = savedFov!;
  if (
    isOriginalDemoView &&
    recording.streamingPlayback === stream.playback &&
    isValidFov(recordedFov)
  ) {
    // Tribes2.exe handleRecordedBlock (0x005fb170) restores the captured
    // FOV directly. Samples already contain the recorder's zoom easing.
    fov = recordedFov;
  }
  return { fov, allowViewerZoom: !isOriginalDemoView };
}

export function applyHorizontalFov(
  camera: PerspectiveCamera,
  fov: number,
): void {
  applyVerticalFov(
    camera,
    torqueHorizontalFovToThreeVerticalFov(fov, camera.aspect),
  );
}
