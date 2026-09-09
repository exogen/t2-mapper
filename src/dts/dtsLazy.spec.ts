import { describe, expect, it, vi } from "vitest";
import {
  AnimationMixer,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  SkinnedMesh,
  Vector3,
} from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { buildDTS } from "./dtsBuilder";
import {
  DTSNode,
  isDTSMesh,
  type DTSShape,
  type DTSRenderable,
} from "./dtsModel";
import {
  createDTSSequence,
  createDTSTestShape,
  createDTSCollisionTestShape,
} from "./dtsTestFixtures";
import { getDTSCollisionMeshes } from "./dtsCollision";
import { observeShapeMeshes } from "./dtsScene";

const camera = new PerspectiveCamera();
function parts(scene: DTSShape) {
  const meshes: DTSRenderable[] = [];
  scene.traverse((node) => {
    if (isDTSMesh(node)) meshes.push(node);
  });
  return meshes;
}
function twoDetails() {
  const data = createDTSTestShape();
  data.objects[0].numMeshes = 2;
  data.meshes.push({ ...data.meshes[0] });
  data.details.push({ ...data.details[0], objectDetail: 1, size: 0.1 });
  return data;
}

describe("lazy DTS branches", () => {
  it("retains disabled decals when mesh initialization requests details recursively", () => {
    const data = createDTSTestShape(),
      source = data.meshes[0];
    data.decals = Array.from({ length: 3 }, () => ({
      nameIndex: 1,
      objectIndex: 0,
      numMeshes: 1,
      startMeshIndex: 1,
    }));
    data.subShapes[0].numDecals = 3;
    data.decalStates = new Int32Array([-1, -1, -1]);
    data.meshes.push({
      ...source,
      type: 2,
      decal: {
        startPrimitive: new Int32Array([0]),
        texgenS: new Float32Array([1, 0, 0, 0]),
        texgenT: new Float32Array([0, 1, 0, 0]),
        materialIndex: 0,
      },
    });
    const { scene } = buildDTS(data);
    const stop = scene.onMeshAdded(() => scene.ensureDetail(0));
    scene.decalFrames[0] = scene.decalFrames[1] = 0;
    scene.update(camera);
    expect(parts(scene)).toHaveLength(3);
    scene.decalFrames[2] = 0;
    scene.update(camera);
    expect(parts(scene)).toHaveLength(4);
    stop();
  });

  it("keeps pending details independent after cloning and explicit expansion", () => {
    const { scene } = buildDTS(twoDetails());
    scene.ensureDetail(0);
    const a = clone(scene) as DTSShape,
      b = clone(scene) as DTSShape;
    a.ensureAllDetails();
    a.ensureDetail(1);
    expect(parts(scene)).toHaveLength(1);
    expect(parts(b)).toHaveLength(1);
    b.ensureDetail(1);
    expect(parts(a)).toHaveLength(2);
    expect(parts(b)).toHaveLength(2);
    const expanded = clone(b) as DTSShape;
    expanded.ensureDetail(0);
    expanded.ensureDetail(1);
    expect(parts(expanded)).toHaveLength(2);
  });

  it("compiles an unused LOD once across instances, initializing before its first draw", () => {
    const { scene } = buildDTS(twoDetails());
    const branch = scene.branches[1];
    const create = vi.spyOn(branch, "create");
    const a = clone(scene) as DTSShape,
      b = clone(scene) as DTSShape;
    const initialize = vi.fn((mesh: Mesh) => {
      mesh.frustumCulled = false;
    });
    const stop = observeShapeMeshes(a, initialize);
    expect(parts(a)).toHaveLength(1);
    expect(create).not.toHaveBeenCalled();
    a.position.set(4, 5, 6);
    a.updateMatrixWorld(true);
    a.getShapeObject(0)!.opacity = 0.4;
    a.detailLevel = 1;
    a.update(camera);
    const late = parts(a)[1];
    expect(initialize).toHaveBeenCalledTimes(2);
    expect(late.frustumCulled).toBe(false);
    expect((late.material as any).opacity).toBe(0.4);
    expect(new Vector3().setFromMatrixPosition(late.matrixWorld)).toEqual(
      a.position,
    );
    expect(parts(a)[0].parent!.visible).toBe(false);
    expect(late.parent!.visible).toBe(true);
    expect(parts(scene)).toHaveLength(1);
    b.detailLevel = 1;
    b.update(camera);
    expect(parts(b)[1].geometry).toBe(late.geometry);
    expect(parts(b)[1].material).not.toBe(late.material);
    for (const level of [0, 1, 0, 1]) {
      a.detailLevel = level;
      a.update(camera);
    }
    expect(parts(a)).toHaveLength(2);
    expect(create).toHaveBeenCalledTimes(2); // cached template, two instance clones
    expect(initialize).toHaveBeenCalledTimes(2);
    stop();
  });

  it("binds a late GPU skin to the clone's currently animated bones", () => {
    const data = twoDetails(),
      source = data.meshes[1];
    source.type = 1;
    source.skin = {
      initialVertices: source.vertices,
      initialNormals: source.normals,
      encodedNormals: new Uint8Array(),
      inverseBindMatrices: new Float32Array(new Matrix4().elements),
      vertexIndices: new Int32Array([0, 1, 2]),
      boneIndices: new Int32Array(3),
      weights: new Float32Array([1, 1, 1]),
      nodeIndices: new Int32Array([0]),
    };
    data.translations = new Float32Array([3, 2, 1]);
    data.sequences = [
      createDTSSequence({ numKeyframes: 1, translationMatters: [0] }),
    ];
    const model = buildDTS(data),
      instance = clone(model.scene) as DTSShape;
    const mixer = new AnimationMixer(instance);
    mixer.clipAction(model.animations[0]).play();
    mixer.update(0);
    instance.updateMatrixWorld(true);
    instance.detailLevel = 1;
    instance.update(camera);
    const mesh = parts(instance)[1] as SkinnedMesh;
    expect(mesh.isSkinnedMesh).toBe(true);
    expect(mesh.skeleton.bones[0]).not.toBe(model.nodes[0]);
    expect(mesh.skeleton.bones[0]).toBeInstanceOf(DTSNode);
    expect(mesh.skeleton.bones[0].matrixWorld.elements[12]).toBe(-3);
    const again = clone(instance) as DTSShape;
    expect((parts(again)[1] as SkinnedMesh).skeleton.bones[0]).not.toBe(
      mesh.skeleton.bones[0],
    );
  });

  it("queries animated collision hulls without expanding any visual collision LOD", () => {
    const data = createDTSCollisionTestShape();
    const { scene } = buildDTS(data);
    const before = parts(scene);
    const [hull] = getDTSCollisionMeshes(scene, "TSStatic");
    expect(hull.source).toBe(data.meshes[1]);
    expect(parts(scene)).toEqual(before);
    expect(
      before.every((mesh) => mesh.binding!.detailIndices.includes(0)),
    ).toBe(true);
    const all = buildDTS(data, { lazy: false });
    expect(parts(all.scene)).toHaveLength(3);
    expect([
      ...getDTSCollisionMeshes(all.scene, "TSStatic")[0].geometry.index!.array,
    ]).toEqual([...hull.geometry.index!.array]);
  });
});
