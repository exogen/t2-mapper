import { expect, it } from "vitest";
import { Group, Object3D, PerspectiveCamera, Vector3 } from "three";
import { DTSShape } from "../dts/dtsModel";
import { createDTSTestShape } from "../dts/dtsTestFixtures";
import type { StreamCamera } from "../stream/types";
import { registerEyeNode } from "./eyePositions";
import {
  applyObserverOrbit,
  applyPlayerControlCamera,
  recordedCameraBlend,
} from "./playerViewCamera";

it("interpolates the recorded tick even when the preceding snapshot was skipped", () => {
  const camera = {
    mode: "third-person",
    previousControlCameraBlend: 0.32,
    controlCameraBlend: 0.64,
  } as StreamCamera;
  expect(recordedCameraBlend(camera, 0.5)).toBeCloseTo(0.48);
  expect(
    recordedCameraBlend({ mode: "first-person" } as StreamCamera, 0.5),
  ).toBe(0);
});

it("pulls back from cam along the current look direction, and uses eye at zero", () => {
  const scene = new DTSShape();
  scene.data = createDTSTestShape();
  scene.data.names[0] = "cam";
  scene.data.defaultTranslations.set([0, 0, 3]);
  const eye = new Object3D();
  eye.position.set(0, 2, 0);
  scene.add(eye);
  const unregister = registerEyeNode("body", eye, scene);
  try {
    const player = new Group();
    const camera = new PerspectiveCamera();
    camera.position.set(10, 2, 3);
    applyPlayerControlCamera(camera, player, "body", 2.8, 0);
    expect(camera.position.toArray()).toEqual([10, 4, 3]);
    camera.position.set(10, 2, 3);
    applyPlayerControlCamera(camera, player, "body", 2.8, 0.5);
    expect(camera.position.toArray()).toEqual([10, 5, 4.4]);
  } finally {
    unregister();
  }
});

it("uses an independent four-unit orbit about the corpse's center", () => {
  const camera = new PerspectiveCamera();
  applyObserverOrbit(camera, new Vector3(10, 2, 3));
  expect(camera.position.toArray()).toEqual([10, 2, 7]);
});
