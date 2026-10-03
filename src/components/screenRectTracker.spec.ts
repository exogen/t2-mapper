import { describe, expect, it } from "vitest";
import {
  BoxGeometry,
  BufferGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  Scene,
} from "three";
import { buildDTS } from "../dts/dtsBuilder";
import { batchDTSRigidMeshes } from "../dts/dtsRigidBatch";
import { createDTSRigidTestShape } from "../dts/dtsTestFixtures";
import { ScreenRectTracker } from "./screenRectTracker";

function makeCamera(x = 0) {
  const camera = new OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
  camera.position.set(x, 0, 10);
  return camera;
}

describe("screen rectangle tracking", () => {
  it("projects the animated DTS pose rather than bone-local vertices", () => {
    const { scene: shape, nodes } = buildDTS(createDTSRigidTestShape());
    const scene = new Scene();
    const camera = makeCamera(100);
    scene.add(shape);
    shape.position.x = 100;
    batchDTSRigidMeshes(shape);
    scene.updateMatrixWorld(true);
    shape.update(camera);
    const tracker = new ScreenRectTracker();
    expect(tracker.update(shape, scene, camera, 200, 200)).toBe(true);
    expect(tracker.rect.minX).toBeCloseTo(60, 2);
    expect(tracker.rect.maxX).toBeCloseTo(100, 2);
    expect(tracker.rect.minY).toBeCloseTo(70, 2);

    nodes[1].position.x -= 2;
    expect(tracker.update(shape, scene, camera, 200, 200)).toBe(true);
    expect(tracker.rect.minX).toBeCloseTo(40, 2);
    expect(tracker.rect.maxX).toBeCloseTo(100, 2);
  });

  it("tracks active instance transforms and count", () => {
    const scene = new Scene();
    const mesh = new InstancedMesh(
      new BoxGeometry(2, 2, 2),
      new MeshBasicMaterial(),
      2,
    );
    mesh.setMatrixAt(0, new Matrix4().makeTranslation(-5, 0, 0));
    mesh.setMatrixAt(1, new Matrix4().makeTranslation(5, 0, 0));
    scene.add(mesh);
    const tracker = new ScreenRectTracker(),
      camera = makeCamera();
    tracker.update(mesh, scene, camera, 200, 200);
    expect(tracker.rect.minX).toBeCloseTo(40);
    expect(tracker.rect.maxX).toBeCloseTo(160);
    mesh.count = 1;
    tracker.update(mesh, scene, camera, 200, 200);
    expect(tracker.rect.minX).toBeCloseTo(40);
    expect(tracker.rect.maxX).toBeCloseTo(60);
  });

  it("discovers lazy DTS detail meshes when the original meshes remain attached", () => {
    const data = createDTSRigidTestShape();
    data.meshes = data.meshes.flatMap((mesh) => [mesh, { ...mesh }]);
    data.objects.forEach((object, index) => {
      object.startMeshIndex = index * 2;
      object.numMeshes = 2;
    });
    data.details.push({ ...data.details[0], size: 0.1, objectDetail: 1 });
    const { scene: shape } = buildDTS(data);
    batchDTSRigidMeshes(shape);
    const scene = new Scene(),
      camera = makeCamera();
    scene.add(shape);
    scene.updateMatrixWorld(true);
    shape.update(camera);
    const tracker = new ScreenRectTracker();
    tracker.update(shape, scene, camera, 200, 200);
    const before = { ...tracker.rect },
      version = tracker.meshesVersion;
    shape.detailLevel = 1;
    shape.update(camera);
    tracker.update(shape, scene, camera, 200, 200);
    expect(tracker.meshesVersion).toBeGreaterThan(version);
    expect(tracker.rect).toEqual(before);
  });

  it("refreshes a replaced part even when the first mesh remains attached", () => {
    const scene = new Scene(),
      root = new Group();
    const first = new Mesh(new BoxGeometry(2, 2, 2));
    const second = new Mesh(first.geometry);
    second.position.x = -5;
    root.add(first, second);
    scene.add(root);
    const tracker = new ScreenRectTracker(),
      camera = makeCamera();
    tracker.update(root, scene, camera, 200, 200);
    const version = tracker.meshesVersion;
    expect(tracker.rect.minX).toBeCloseTo(40);
    second.removeFromParent();
    const replacement = new Mesh(first.geometry);
    replacement.position.x = 5;
    root.add(replacement);
    tracker.update(root, scene, camera, 200, 200);
    expect(tracker.meshesVersion).toBeGreaterThan(version);
    expect(tracker.rect.minX).toBeCloseTo(90);
    expect(tracker.rect.maxX).toBeCloseTo(160);
  });

  it("ignores empty geometry and falls back to a finite point rectangle", () => {
    const scene = new Scene();
    const root = new Mesh(new BufferGeometry());
    scene.add(root);
    const tracker = new ScreenRectTracker();
    expect(tracker.update(root, scene, makeCamera(), 200, 200)).toBe(true);
    expect(tracker.rect).toEqual({
      minX: 100,
      maxX: 100,
      minY: 100,
      maxY: 100,
    });
  });
});
