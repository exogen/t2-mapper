import { expect, it } from "vitest";
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from "three";
import {
  registerStaticShapeCollider,
  unregisterStaticShapeCollider,
} from "../collision/worldCollision";
import { DTSShape } from "../dts/dtsModel";
import { createDTSTestShape } from "../dts/dtsTestFixtures";
import { yawPitchToQuaternion } from "../stream/streamHelpers";
import { recordedCameraBlend } from "../stream/playerCameraBlend";
import type { StreamCamera } from "../stream/types";
import { SHAPE_MODEL_ROTATION_Y } from "../world/placement";
import { registerEyeNode } from "./eyePositions";
import {
  applyObserverOrbit,
  applyPlayerControlCamera,
  recordedObserverRotation,
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

it("interpolates the two observer angles across a yaw wrap", () => {
  const previous = { yaw: Math.PI - 0.1, pitch: -0.5 } as StreamCamera;
  const current = { yaw: -Math.PI + 0.3, pitch: 0.7 } as StreamCamera;
  const camera = new PerspectiveCamera();
  camera.quaternion.fromArray(
    recordedObserverRotation(previous, current, 0.5)!,
  );
  const expected = new PerspectiveCamera();
  expected.quaternion.fromArray(yawPitchToQuaternion(Math.PI + 0.1, 0.1));
  expect(camera.quaternion.angleTo(expected.quaternion)).toBeCloseTo(0);
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

it("uses a mounted shape's full animated eye transform and a world-up offset", () => {
  const mount = new Group();
  mount.position.set(10, 20, 30);
  mount.rotation.z = Math.PI / 2;
  const scene = new DTSShape();
  scene.data = createDTSTestShape();
  scene.rotation.y = SHAPE_MODEL_ROTATION_Y;
  mount.add(scene);
  const eye = new Object3D();
  eye.position.set(0, 0, 2);
  eye.rotation.y = Math.PI / 2;
  scene.add(eye);
  const unregister = registerEyeNode("mounted", eye, scene);
  try {
    const camera = new PerspectiveCamera();
    const shape = { shapeEye: true, cameraOffset: 3 };
    applyPlayerControlCamera(camera, undefined, "mounted", 8, 0, shape);
    expect(camera.position.distanceTo(new Vector3(10, 22, 30))).toBeLessThan(
      1e-8,
    );
    expect(
      camera.getWorldDirection(new Vector3()).distanceTo(new Vector3(0, 0, -1)),
    ).toBeLessThan(1e-8);
    applyPlayerControlCamera(camera, undefined, "mounted", 8, 0.5, shape);
    expect(camera.position.distanceTo(new Vector3(10, 25, 34))).toBeLessThan(
      1e-8,
    );

    const mountedPlayerLook = new Quaternion().fromArray(
      yawPitchToQuaternion(0, 0),
    );
    applyPlayerControlCamera(camera, undefined, "mounted", 8, 0, {
      mountedPlayerLook,
    });
    expect(camera.position.distanceTo(new Vector3(10, 22, 30))).toBeLessThan(
      1e-8,
    );
    expect(
      camera.getWorldDirection(new Vector3()).distanceTo(new Vector3(0, 1, 0)),
    ).toBeLessThan(1e-8);
  } finally {
    unregister();
  }
});

it("casts from the unoffset cam, excludes the control object and mount, and retracts only the pullback", () => {
  const geometry = new BoxGeometry(10, 2, 1);
  const material = new MeshBasicMaterial();
  const fixtures = [
    ["controlled", new Vector3(0, 0.3, 1)],
    ["mount", new Vector3(0, 0.6, 2)],
    ["wall", new Vector3(0, 1.2, 4.5)],
  ] as const;
  for (const [id, position] of fixtures) {
    const mesh = new Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.updateMatrixWorld();
    registerStaticShapeCollider(id, [mesh]);
  }
  try {
    const camera = new PerspectiveCamera();
    applyPlayerControlCamera(camera, undefined, "body", 10, 1, {
      cameraOffset: 3,
      colliderId: "controlled",
      mountColliderId: "mount",
    });
    expect(camera.position.x).toBeCloseTo(0);
    expect(camera.position.y).toBeCloseTo(3);
    expect(camera.position.z).toBeCloseTo(3);
  } finally {
    for (const [id] of fixtures) unregisterStaticShapeCollider(id);
    material.dispose();
    geometry.dispose();
  }
});

it("uses an independent four-unit orbit about the corpse's center", () => {
  const camera = new PerspectiveCamera();
  applyObserverOrbit(camera, new Vector3(10, 2, 3));
  expect(camera.position.toArray()).toEqual([10, 2, 7]);
});

it("skips the orbit target's hull and still retracts against other vehicles", () => {
  const geometry = new BoxGeometry(2, 2, 2);
  const material = new MeshBasicMaterial();
  const followed = new Mesh(geometry, material);
  followed.position.z = 2;
  followed.updateMatrixWorld();
  const other = new Mesh(geometry, material);
  other.position.z = 5;
  other.updateMatrixWorld();
  registerStaticShapeCollider("ghost:3", [followed]);
  registerStaticShapeCollider("ghost:4", [other]);
  try {
    const camera = new PerspectiveCamera();
    const center = new Vector3();
    applyObserverOrbit(camera, center, 9);
    expect(camera.position.z).toBeCloseTo(0.95);
    applyObserverOrbit(camera, center, 9, "ghost:3");
    expect(camera.position.z).toBeCloseTo(3.95);
  } finally {
    unregisterStaticShapeCollider("ghost:3");
    unregisterStaticShapeCollider("ghost:4");
    material.dispose();
    geometry.dispose();
  }
});
