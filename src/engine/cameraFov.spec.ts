import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PerspectiveCamera } from "three";
import { engineStore } from "../state/engineStore";
import { casterStore } from "../state/casterStore";
import { cameraTourStore } from "../state/cameraTourStore";
import { demoDirectorStore } from "../state/demoDirectorStore";
import {
  resetStreamPlayback,
  streamPlaybackStore,
} from "../state/streamPlaybackStore";
import { streamRenderFrame } from "../stream/interpolateEntity";
import type { StreamRecording } from "../stream/types";
import { updateObserverCameraFov } from "./cameraFov";

const camera = new PerspectiveCamera(60, 16 / 9);
let recording: StreamRecording;

function horizontalFov() {
  return (
    (2 *
      Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect) *
      180) /
    Math.PI
  );
}

beforeEach(() => {
  recording = {
    source: "demo",
    duration: 100,
    streamingPlayback: {},
  } as StreamRecording;
  engineStore.getState().setRecording(recording);
  streamPlaybackStore.setState({ playback: recording.streamingPlayback });
  streamRenderFrame.camera = {
    time: 1,
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    mode: "first-person",
    fov: 20.8,
  };
  camera.aspect = 16 / 9;
});

afterEach(() => {
  casterStore.getState().suspend();
  vi.restoreAllMocks();
  resetStreamPlayback();
  engineStore.getState().setRecording(null);
  cameraTourStore.getState().cancel();
  demoDirectorStore.setState({ status: "idle" });
});

it.each(["freeFly", "orbitOverride", "firstPersonOverride"] as const)(
  "applies the recalled camera's FOV in demo %s and preserves Original zoom",
  (cameraMode) => {
    casterStore.setState({ fov: 110 });
    streamPlaybackStore.setState({ cameraMode });
    updateObserverCameraFov(camera, 90);
    expect(horizontalFov()).toBeCloseTo(110);
    streamPlaybackStore.setState({ cameraMode: "original" });
    updateObserverCameraFov(camera, 90);
    expect(horizontalFov()).toBeCloseTo(20.8);
  },
);

it("uses absolute recorded FOVs, including fractional zoom and normal FOV", () => {
  for (const fov of [104, 20.8, 10.4, 104]) {
    streamRenderFrame.camera!.fov = fov;
    updateObserverCameraFov(camera, 90);
    expect(horizontalFov()).toBeCloseTo(fov, 10);
  }
});

it.each(["freeFly", "orbitOverride", "firstPersonOverride"] as const)(
  "restores the preference in %s and recorded zoom when returning to Original",
  (cameraMode) => {
    updateObserverCameraFov(camera, 90);
    expect(horizontalFov()).toBeCloseTo(20.8);
    streamPlaybackStore.setState({ cameraMode });
    updateObserverCameraFov(camera, 90);
    expect(horizontalFov()).toBeCloseTo(90);
    streamPlaybackStore.setState({ cameraMode: "original" });
    updateObserverCameraFov(camera, 90);
    expect(horizontalFov()).toBeCloseTo(20.8);
  },
);

it("ignores live FOV and stale frames on eject or recording replacement", () => {
  updateObserverCameraFov(camera, 90);
  engineStore.getState().setRecording(null);
  updateObserverCameraFov(camera, 90);
  expect(horizontalFov()).toBeCloseTo(90);
  engineStore.getState().setRecording({ ...recording, source: "live" });
  updateObserverCameraFov(camera, 95);
  expect(horizontalFov()).toBeCloseTo(95);
  engineStore.getState().setRecording({
    ...recording,
    streamingPlayback: {} as StreamRecording["streamingPlayback"],
  });
  updateObserverCameraFov(camera, 100);
  expect(horizontalFov()).toBeCloseTo(100);
});

it("keeps tours and the director at the viewer's FOV", () => {
  cameraTourStore.getState().flyTo({
    entityId: "test",
    label: "Test",
    position: [1, 2, 3],
  });
  updateObserverCameraFov(camera, 90);
  expect(horizontalFov()).toBeCloseTo(90);
  cameraTourStore.getState().cancel();
  demoDirectorStore.setState({ status: "playing" });
  updateObserverCameraFov(camera, 100);
  expect(horizontalFov()).toBeCloseTo(100);
});

it("preserves paused zoom through resizing without rebuilding an unchanged projection", () => {
  engineStore.getState().setPlaybackStatus("paused");
  updateObserverCameraFov(camera, 90);
  const projection = camera.projectionMatrix.clone();
  const update = vi.spyOn(camera, "updateProjectionMatrix");
  updateObserverCameraFov(camera, 90);
  expect(update).not.toHaveBeenCalled();
  camera.aspect = 4 / 3;
  updateObserverCameraFov(camera, 90);
  expect(update).toHaveBeenCalledOnce();
  expect(horizontalFov()).toBeCloseTo(20.8);
  expect(camera.projectionMatrix.equals(projection)).toBe(false);
  expect(camera.projectionMatrix.elements.every(Number.isFinite)).toBe(true);
});

it.each([NaN, Infinity, -10, 0, 180, 200])(
  "falls back to the preference for an invalid recorded FOV: %s",
  (fov) => {
    streamRenderFrame.camera!.fov = fov;
    updateObserverCameraFov(camera, 90);
    expect(horizontalFov()).toBeCloseTo(90);
    expect(camera.projectionMatrix.elements.every(Number.isFinite)).toBe(true);
  },
);

it("clears recorded FOV along with the rest of the stream on reset", () => {
  updateObserverCameraFov(camera, 90);
  resetStreamPlayback();
  expect(streamRenderFrame.camera).toBeNull();
  updateObserverCameraFov(camera, 90);
  expect(horizontalFov()).toBeCloseTo(90);
});
