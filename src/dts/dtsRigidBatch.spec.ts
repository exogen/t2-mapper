import { describe, expect, it } from "vitest";
import {
  Matrix3,
  Matrix4,
  MeshLambertMaterial,
  PerspectiveCamera,
  Raycaster,
  Vector3,
} from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { buildDTS } from "./dtsBuilder";
import { batchDTSRigidMeshes } from "./dtsRigidBatch";
import {
  DTSMesh,
  DTSRigidMeshBatch,
  DTSStaticMeshBatch,
  type DTSShape,
} from "./dtsModel";
import { getDTSObject } from "./dtsScene";
import { createDTSRigidTestShape, createDTSSequence } from "./dtsTestFixtures";

const camera = new PerspectiveCamera();
function update(scene: DTSShape) {
  scene.updateMatrixWorld(true);
  scene.update(camera);
}
function parts(scene: DTSShape) {
  const result: DTSMesh[] = [];
  scene.traverse((node) => {
    if (node instanceof DTSMesh) result.push(node);
  });
  return result;
}

describe("rigid DTS body batching", () => {
  it("merges stationary parts into cached ordinary geometry with correct bounds", () => {
    const data = createDTSRigidTestShape();
    data.sequences = [];
    const model = buildDTS(data);
    const original = parts(model.scene);
    const [batch] = batchDTSRigidMeshes(model.scene);
    expect(batch).toBeInstanceOf(DTSStaticMeshBatch);
    expect(batch.geometry.hasAttribute("skinIndex")).toBe(false);
    expect(batch.geometry.hasAttribute("skinWeight")).toBe(false);
    model.scene.position.set(90, -40, 5);
    model.scene.rotation.set(0.2, 0.5, 0.3);
    model.scene.scale.set(2, 3, 4);
    update(model.scene);
    expect(batch.visible).toBe(true);
    let offset = 0;
    for (const part of original) {
      part.parent!.updateWorldMatrix(true, true, true);
      for (let i = 0; i < part.geometry.getAttribute("position").count; i++) {
        const expected = part
          .getVertexPosition(i, new Vector3())
          .applyMatrix4(part.matrixWorld);
        const actual = batch.getVertexPosition(offset++, new Vector3());
        expect(batch.geometry.boundingSphere!.containsPoint(actual)).toBe(true);
        expect(batch.geometry.boundingBox!.containsPoint(actual)).toBe(true);
        expect(
          actual.applyMatrix4(batch.matrixWorld).distanceTo(expected),
        ).toBeLessThan(1e-5);
      }
    }
    const copy = clone(model.scene) as DTSShape;
    const [copiedBatch] = batchDTSRigidMeshes(copy);
    update(copy);
    expect(copiedBatch.visible).toBe(true);
    expect(copiedBatch.geometry).toBe(batch.geometry);
    expect(copiedBatch.material).not.toBe(batch.material);
    // Native node edits still work, including edits before the first render.
    model.nodes[0].position.x = 2;
    update(model.scene);
    expect(batch.visible).toBe(false);
    expect(original.every((part) => part.parent!.visible)).toBe(true);
    model.nodes[0].position.x = 0;
    update(model.scene);
    expect(batch.visible).toBe(true);
  });

  it("leaves missing material descriptors on the original draw path", () => {
    const model = buildDTS(createDTSRigidTestShape());
    (
      parts(model.scene)[0].material as import("./dtsModel").DTSMaterial
    ).source = undefined;
    expect(batchDTSRigidMeshes(model.scene)).toHaveLength(0);
  });

  it("matches articulated positions, normals and UVs under a transformed instance", () => {
    const { scene, nodes } = buildDTS(createDTSRigidTestShape());
    const original = parts(scene);
    const [batch] = batchDTSRigidMeshes(scene);
    if (!(batch instanceof DTSRigidMeshBatch))
      throw new Error("Expected animated batch");
    scene.position.set(100, 50, -20);
    scene.rotation.set(0.1, 0.4, -0.2);
    scene.scale.set(2, 3, 4);
    nodes[0].rotation.set(0.5, -0.4, 0.3);
    nodes[1].rotation.set(-0.7, 0.4, 0.9);
    update(scene);
    batch.skeleton.update();
    expect(batch.visible).toBe(true);
    let offset = 0;
    for (const part of original) {
      expect(part.parent!.visible).toBe(false);
      part.parent!.updateWorldMatrix(true, true, true);
      const p = part.geometry.getAttribute("position"),
        n = part.geometry.getAttribute("normal");
      const normalMatrix = new Matrix3().getNormalMatrix(part.matrixWorld);
      for (let i = 0; i < p.count; i++) {
        const expected = new Vector3()
          .fromBufferAttribute(p, i)
          .applyMatrix4(part.matrixWorld);
        const actual = batch
          .getVertexPosition(offset + i, new Vector3())
          .applyMatrix4(batch.matrixWorld);
        expect(actual.distanceTo(expected)).toBeLessThan(1e-5);
        const boneIndex = batch.geometry
          .getAttribute("skinIndex")
          .getX(offset + i);
        const skin = new Matrix4()
          .fromArray(batch.skeleton.boneMatrices!, boneIndex * 16)
          .premultiply(batch.bindMatrixInverse);
        const actualNormal = new Vector3()
          .fromBufferAttribute(
            batch.geometry.getAttribute("normal"),
            offset + i,
          )
          .applyMatrix3(new Matrix3().setFromMatrix4(skin))
          .applyNormalMatrix(new Matrix3().getNormalMatrix(batch.matrixWorld));
        const expectedNormal = new Vector3()
          .fromBufferAttribute(n, i)
          .applyNormalMatrix(normalMatrix);
        expect(actualNormal.distanceTo(expectedNormal)).toBeLessThan(1e-5);
        for (const name of ["uv"]) {
          expect(batch.geometry.getAttribute(name).getX(offset + i)).toBe(
            part.geometry.getAttribute(name).getX(i),
          );
          expect(batch.geometry.getAttribute(name).getY(offset + i)).toBe(
            part.geometry.getAttribute(name).getY(i),
          );
        }
      }
      offset += p.count;
    }
    expect(Array.from(batch.geometry.index!.array)).toEqual([2, 1, 0, 5, 4, 3]);
    expect(batch.frustumCulled).toBe(false);
  });

  it("shares geometry across players, but clones skeletons, poses and materials", () => {
    const { scene } = buildDTS(createDTSRigidTestShape());
    const a = clone(scene) as DTSShape,
      b = clone(scene) as DTSShape;
    const [left] = batchDTSRigidMeshes(a),
      [right] = batchDTSRigidMeshes(b);
    if (
      !(left instanceof DTSRigidMeshBatch) ||
      !(right instanceof DTSRigidMeshBatch)
    )
      throw new Error("Expected animated batches");
    expect(left.geometry).toBe(right.geometry);
    expect(left.skeleton).not.toBe(right.skeleton);
    expect(left.material).not.toBe(right.material);
    left.skeleton.bones[0].position.x = 12;
    expect(right.skeleton.bones[0].position.x).toBe(0);
    update(a);
    const copied = clone(a) as DTSShape;
    update(copied);
    const copyBatch = copied.children.find(
      (child) => child instanceof DTSRigidMeshBatch,
    )!;
    expect(copyBatch.geometry).toBe(left.geometry);
    expect(copyBatch.skeleton.bones[0]).not.toBe(left.skeleton.bones[0]);
    expect(copyBatch.visible).toBe(true);
    expect(parts(copied).every((part) => !part.parent!.visible)).toBe(true);
  });

  it("restores authored draws for LOD merging, visibility and fades without losing state", () => {
    const { scene } = buildDTS(createDTSRigidTestShape());
    const original = parts(scene),
      owner = getDTSObject(original[0])!;
    const [batch] = batchDTSRigidMeshes(scene);
    update(scene);
    scene.intraDetailLevel = 0.5;
    update(scene);
    expect(batch.visible).toBe(false);
    expect(original.every((part) => part.parent!.visible)).toBe(true);
    scene.intraDetailLevel = 1;
    owner.opacity = 0.5;
    update(scene);
    expect(batch.visible).toBe(false);
    expect((original[0].material as MeshLambertMaterial).opacity).toBe(0.5);
    owner.opacity = 1;
    original[0].visible = false;
    update(scene);
    expect(batch.visible).toBe(false);
    expect(original[0].visible).toBe(false);
    original[0].visible = true;
    (batch.material as MeshLambertMaterial).transparent = true;
    update(scene);
    expect(batch.visible).toBe(false);
    (batch.material as MeshLambertMaterial).transparent = false;
    update(scene);
    expect(batch.visible).toBe(true);
    scene.detailLevel = -1;
    update(scene);
    expect(batch.visible).toBe(false);
    expect(original.every((part) => !part.parent!.visible)).toBe(true);
    scene.detailLevel = 0;
    update(scene);
    expect(batch.visible).toBe(true);
  });

  it("keeps incompatible materials and scale animations on the original paths", () => {
    const data = createDTSRigidTestShape();
    data.materials.push({ ...data.materials[0], name: "otherSkin" });
    data.meshes[1] = {
      ...data.meshes[1],
      primitives: [{ ...data.meshes[1].primitives[0], material: 0x20000001 }],
    };
    expect(batchDTSRigidMeshes(buildDTS(data).scene)).toHaveLength(0);
    const scaled = createDTSRigidTestShape();
    scaled.uniformScales = new Float32Array([1]);
    scaled.sequences.push(
      createDTSSequence({ scaleMatters: [0], numKeyframes: 1, flags: 1 }),
    );
    expect(batchDTSRigidMeshes(buildDTS(scaled).scene)).toHaveLength(0);
  });

  it("raycasts the current pose once even while authored draws skip matrix updates", () => {
    const data = createDTSRigidTestShape();
    data.defaultTranslations = new Float32Array([0, 0, 0, 10, 0, 0]);
    const { scene, nodes } = buildDTS(data);
    batchDTSRigidMeshes(scene);
    update(scene);
    nodes[0].position.x = 4;
    update(scene);
    const hits = new Raycaster(
      new Vector3(4, -5, 0),
      new Vector3(0, 1, 0),
    ).intersectObject(scene, true);
    expect(hits).toHaveLength(1);
    expect(hits[0].point.distanceTo(new Vector3(4, 0, 0))).toBeLessThan(1e-6);
    expect(hits[0].object).toBeInstanceOf(DTSMesh);
  });
});
