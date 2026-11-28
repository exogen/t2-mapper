import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { engineStore } from "../state/engineStore";
import { casterStore } from "../state/casterStore";
import { cameraTourStore } from "../state/cameraTourStore";
import { demoDirectorStore } from "../state/demoDirectorStore";
import { settingsStore } from "../state/settingsStore";
import {
  resetStreamPlayback,
  streamPlaybackStore,
} from "../state/streamPlaybackStore";
import { streamRenderFrame } from "../stream/interpolateEntity";
import type { StreamRecording } from "../stream/types";
import { CameraRig } from "./cameraRig";

let rig: CameraRig;
let frameId: number;
let recording: StreamRecording;

function applyObserverView(fov = 90) {
  settingsStore.setState({ fov });
  rig.applyObserverFov(++frameId);
}

function holdTightestZoom() {
  rig.zoomHeld = true;
  for (let step = 0; step < 3; step++) rig.cycleZoomLevel();
}

function setUpTimedZoom() {
  const now = vi.spyOn(performance, "now").mockReturnValue(1000);
  settingsStore.setState({ zoomSpeedMs: 500 });
  streamPlaybackStore.setState({ cameraMode: "freeFly" });
  applyObserverView();
  return now;
}

function horizontalFov() {
  const camera = rig.perspective;
  return (
    (2 *
      Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect) *
      180) /
    Math.PI
  );
}

beforeEach(() => {
  rig = new CameraRig();
  rig.resize(16, 9);
  frameId = 0;
  settingsStore.setState({ zoomSpeedMs: 0 });
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
});

afterEach(() => {
  casterStore.getState().suspend();
  vi.restoreAllMocks();
  resetStreamPlayback();
  engineStore.getState().setRecording(null);
  cameraTourStore.getState().cancel();
  demoDirectorStore.setState({ status: "idle" });
  const { fov, zoomSpeedMs } = settingsStore.getInitialState();
  settingsStore.setState({ fov, zoomSpeedMs });
});

it.each(["freeFly", "orbitOverride", "firstPersonOverride"] as const)(
  "applies the recalled camera's FOV in demo %s and preserves Original zoom",
  (cameraMode) => {
    casterStore.setState({ fov: 110 });
    streamPlaybackStore.setState({ cameraMode });
    applyObserverView();
    expect(horizontalFov()).toBeCloseTo(110);
    streamPlaybackStore.setState({ cameraMode: "original" });
    applyObserverView();
    expect(horizontalFov()).toBeCloseTo(20.8);
  },
);

it("uses only the recorded FOV in Original view even while viewer zoom is held", () => {
  holdTightestZoom();
  for (const fov of [104, 20.8, 10.4, 155]) {
    streamRenderFrame.camera!.fov = fov;
    applyObserverView();
    expect(horizontalFov()).toBeCloseTo(fov, 10);
  }
});

it("temporarily narrows the camera and restores the current normal framing on release", () => {
  streamPlaybackStore.setState({ cameraMode: "freeFly" });
  rig.zoomHeld = true;
  applyObserverView(110);
  expect(horizontalFov()).toBeCloseTo(45);
  rig.zoomHeld = false;
  applyObserverView(100);
  expect(horizontalFov()).toBeCloseTo(100);

  rig.zoomHeld = true;
  applyObserverView(35);
  expect(horizontalFov()).toBeCloseTo(35);
});

it("moves at a constant angular speed when zooming in and out", () => {
  const now = setUpTimedZoom();
  // The camera may have been idle for a while before zoom input arrives.
  now.mockReturnValue(5000);
  rig.zoomHeld = true;
  applyObserverView();
  expect(horizontalFov()).toBeCloseTo(90);

  now.mockReturnValue(5125);
  applyObserverView();
  expect(horizontalFov()).toBeCloseTo(67.5);
  now.mockReturnValue(5250);
  applyObserverView();
  expect(horizontalFov()).toBeCloseTo(45);

  rig.zoomHeld = false;
  now.mockReturnValue(5375);
  applyObserverView();
  expect(horizontalFov()).toBeCloseTo(67.5);
  now.mockReturnValue(5500);
  applyObserverView();
  expect(horizontalFov()).toBeCloseTo(90);
});

it("reverses from the current FOV when zoom is released mid-transition", () => {
  const now = setUpTimedZoom();
  rig.zoomHeld = true;
  now.mockReturnValue(1100);
  applyObserverView();
  expect(horizontalFov()).toBeCloseTo(72);

  rig.zoomHeld = false;
  now.mockReturnValue(1150);
  applyObserverView();
  expect(horizontalFov()).toBeCloseTo(81);
  now.mockReturnValue(1200);
  applyObserverView();
  expect(horizontalFov()).toBeCloseTo(90);
});

it("shares the same interpolated FOV between input and projection in a frame", () => {
  const now = setUpTimedZoom();
  rig.zoomHeld = true;
  now.mockReturnValue(1100);
  expect(rig.sampleObserverFov(++frameId)).toBeCloseTo(72);

  now.mockReturnValue(1150);
  rig.applyObserverFov(frameId);
  expect(horizontalFov()).toBeCloseTo(72);
  applyObserverView();
  expect(horizontalFov()).toBeCloseTo(63);
});

it("takes the recorded FOV immediately on returning to Original mid-transition", () => {
  const now = setUpTimedZoom();
  rig.zoomHeld = true;
  now.mockReturnValue(1100);
  applyObserverView();
  expect(horizontalFov()).toBeCloseTo(72);

  streamPlaybackStore.setState({ cameraMode: "original" });
  applyObserverView();
  expect(horizontalFov()).toBeCloseTo(20.8);
});

it.each(["freeFly", "orbitOverride", "firstPersonOverride"] as const)(
  "allows viewer zoom in %s and restores recorded framing on entering Original",
  (cameraMode) => {
    applyObserverView();
    expect(horizontalFov()).toBeCloseTo(20.8);
    streamPlaybackStore.setState({ cameraMode });
    applyObserverView();
    expect(horizontalFov()).toBeCloseTo(90);
    holdTightestZoom();
    applyObserverView();
    expect(horizontalFov()).toBeCloseTo(5);
    streamPlaybackStore.setState({ cameraMode: "original" });
    applyObserverView();
    expect(horizontalFov()).toBeCloseTo(20.8);
  },
);

it("ignores live FOV and stale frames on eject or recording replacement", () => {
  applyObserverView();
  engineStore.getState().setRecording(null);
  applyObserverView();
  expect(horizontalFov()).toBeCloseTo(90);
  engineStore.getState().setRecording({ ...recording, source: "live" });
  applyObserverView(95);
  expect(horizontalFov()).toBeCloseTo(95);
  engineStore.getState().setRecording({
    ...recording,
    streamingPlayback: {} as StreamRecording["streamingPlayback"],
  });
  rig.zoomHeld = true;
  applyObserverView(100);
  expect(horizontalFov()).toBeCloseTo(100);
});

it("keeps tours and the director at the viewer's FOV", () => {
  cameraTourStore.getState().flyTo({
    entityId: "test",
    label: "Test",
    position: [1, 2, 3],
  });
  applyObserverView();
  expect(horizontalFov()).toBeCloseTo(90);
  cameraTourStore.getState().cancel();
  demoDirectorStore.setState({ status: "playing" });
  rig.zoomHeld = true;
  applyObserverView(100);
  expect(horizontalFov()).toBeCloseTo(45);
});

it("preserves paused zoom through resizing without rebuilding an unchanged projection", () => {
  engineStore.getState().setPlaybackStatus("paused");
  applyObserverView();
  const camera = rig.perspective;
  const projection = camera.projectionMatrix.clone();
  const update = vi.spyOn(camera, "updateProjectionMatrix");
  applyObserverView();
  expect(update).not.toHaveBeenCalled();
  camera.aspect = 4 / 3;
  applyObserverView();
  expect(update).toHaveBeenCalledOnce();
  expect(horizontalFov()).toBeCloseTo(20.8);
  expect(camera.projectionMatrix.equals(projection)).toBe(false);
  expect(camera.projectionMatrix.elements.every(Number.isFinite)).toBe(true);
});

it.each([NaN, Infinity, -10, 0, 180, 200])(
  "falls back to the preference for an invalid recorded FOV: %s",
  (fov) => {
    streamRenderFrame.camera!.fov = fov;
    holdTightestZoom();
    applyObserverView();
    expect(horizontalFov()).toBeCloseTo(90);
    expect(
      rig.perspective.projectionMatrix.elements.every(Number.isFinite),
    ).toBe(true);
  },
);

it("clears recorded FOV along with the rest of the stream on reset", () => {
  applyObserverView();
  resetStreamPlayback();
  expect(streamRenderFrame.camera).toBeNull();
  applyObserverView();
  expect(horizontalFov()).toBeCloseTo(90);
});
