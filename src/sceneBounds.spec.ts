import { describe, expect, it } from "vitest";
import {
  Box3,
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
} from "three";
import { buildDTS } from "./dts/dtsBuilder";
import { DTSDetail, DTSObject, DTSRigidMeshBatch } from "./dts/dtsModel";
import { batchDTSRigidMeshes } from "./dts/dtsRigidBatch";
import { createDTSRigidTestShape } from "./dts/dtsTestFixtures";
import { computeObjectBounds } from "./sceneBounds";

function expectBounds(box: Box3, min: number[], max: number[]) {
  box.min.toArray().forEach((value, i) => expect(value).toBeCloseTo(min[i]));
  box.max.toArray().forEach((value, i) => expect(value).toBeCloseTo(max[i]));
}

describe("tour object bounds", () => {
  it("refreshes hidden DTS branches even after render cleared the root's dirty flag", () => {
    const root = new Group();
    const object = new DTSObject();
    const detail = new DTSDetail();
    const mesh = new Mesh(new BoxGeometry(2, 4, 6));
    mesh.position.set(2, 4, 6);
    root.add(object);
    object.add(detail);
    detail.add(mesh);
    root.updateMatrixWorld(true);
    object.visible = false;
    root.position.set(500, 200, 300);
    root.rotation.y = Math.PI / 2;
    root.scale.set(2, 3, 4);
    root.updateMatrix();
    root.matrixAutoUpdate = false;
    root.updateMatrixWorld(true);
    expect(mesh.matrixWorld.elements[12]).toBe(2);
    expect(root.matrixWorldNeedsUpdate).toBe(false);

    const world = new Box3(),
      local = new Box3();
    computeObjectBounds(root, world, { localBounds: local });
    expectBounds(local, [1, 2, 3], [3, 6, 9]);
    expectBounds(world, [512, 206, 294], [536, 218, 298]);
    expect(object.visible).toBe(false);

    computeObjectBounds(root, world, { localBounds: local, visibleOnly: true });
    expect(world.isEmpty()).toBe(true);
    expect(local.isEmpty()).toBe(true);
  });

  it("measures posed rigid batches and refreshes bounds after moving before a render", () => {
    const { scene, nodes } = buildDTS(createDTSRigidTestShape());
    const root = new Group();
    root.add(scene);
    const [batch] = batchDTSRigidMeshes(scene);
    expect(batch).toBeInstanceOf(DTSRigidMeshBatch);
    scene.update(new PerspectiveCamera());
    expect(batch.visible).toBe(true);
    root.position.set(500, 200, 300);
    root.rotation.y = Math.PI / 2;
    root.updateMatrixWorld(true);

    const world = new Box3(),
      local = new Box3();
    for (const visibleOnly of [false, true]) {
      computeObjectBounds(root, world, { localBounds: local, visibleOnly });
      expectBounds(local, [-4, 3, 1], [0, 3, 3]);
      expectBounds(world, [501, 203, 300], [503, 203, 304]);
    }

    // The child moves independently; cached rest/batch bounds are now stale.
    nodes[1].position.z += 5;
    root.position.x = 700;
    for (const visibleOnly of [true, false]) {
      computeObjectBounds(root, world, { localBounds: local, visibleOnly });
      expectBounds(local, [-4, 3, 1], [0, 3, 8]);
      expectBounds(world, [701, 203, 300], [708, 203, 304]);
    }
  });

  it("keeps single-tile terrain sizing while including all instances in world bounds", () => {
    const terrain = new InstancedMesh(
      new BoxGeometry(10, 2, 10),
      new MeshBasicMaterial(),
      2,
    );
    terrain.setMatrixAt(0, new Matrix4());
    terrain.setMatrixAt(1, new Matrix4().makeTranslation(100, 0, 0));
    terrain.position.y = 50;
    const world = new Box3(),
      local = new Box3();
    computeObjectBounds(terrain, world, { localBounds: local });
    expectBounds(local, [-5, -1, -5], [5, 1, 5]);
    expectBounds(world, [-5, 49, -5], [105, 51, 5]);

    terrain.setMatrixAt(1, new Matrix4().makeTranslation(200, 0, 0));
    computeObjectBounds(terrain, world, { localBounds: local });
    expectBounds(local, [-5, -1, -5], [5, 1, 5]);
    expectBounds(world, [-5, 49, -5], [205, 51, 5]);
  });

  it("excludes inactive DTS batches and their overlays when measuring authored parts", () => {
    const data = createDTSRigidTestShape();
    data.sequences = [];
    const { scene, nodes } = buildDTS(data);
    const [batch] = batchDTSRigidMeshes(scene);
    batch.add(new Mesh(batch.geometry));
    nodes[0].position.x = 100;
    scene.updateMatrixWorld(true);
    scene.update(new PerspectiveCamera());
    expect(batch.visible).toBe(false);

    const world = new Box3();
    computeObjectBounds(scene, world);
    expectBounds(world, [96, 3, 1], [100, 3, 3]);
  });
});
