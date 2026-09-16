import { describe, expect, it, vi } from "vitest";
import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  DataTexture,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  SkinnedMesh,
  Vector3,
} from "three";
import { buildDTS } from "../dts/dtsBuilder";
import { batchDTSRigidMeshes } from "../dts/dtsRigidBatch";
import { createDTSRigidTestShape } from "../dts/dtsTestFixtures";
import { computeObjectBounds } from "../sceneBounds";
import {
  createTourHighlightMesh,
  removeTourHighlightMeshes,
} from "./commandCircuitTourFlash";

describe("command circuit tour highlights", () => {
  it("shares the rendered DTS pose without pulling bounds toward unposed vertices", () => {
    const { scene, nodes } = buildDTS(createDTSRigidTestShape());
    const [batch] = batchDTSRigidMeshes(scene);
    if (!(batch instanceof SkinnedMesh)) throw new Error("Expected skin batch");
    scene.position.set(500, 200, 300);
    scene.rotation.y = Math.PI / 2;
    nodes[0].position.x = 100;
    scene.updateMatrixWorld(true);
    scene.update(new PerspectiveCamera());

    const before = new Box3(),
      after = new Box3();
    computeObjectBounds(scene, before, { visibleOnly: true });
    const highlight = createTourHighlightMesh(batch, new MeshBasicMaterial());
    batch.add(highlight);
    expect(highlight).toBeInstanceOf(SkinnedMesh);
    expect(highlight.geometry).toBe(batch.geometry);
    expect((highlight as SkinnedMesh).skeleton).toBe(batch.skeleton);
    computeObjectBounds(scene, after, { visibleOnly: true });
    expect(after.equals(before)).toBe(true);

    nodes[1].rotation.y = 0.5;
    nodes[1].position.z = 5;
    scene.updateMatrixWorld(true);
    for (let i = 0; i < batch.geometry.attributes.position.count; i++) {
      const actual = highlight
        .getVertexPosition(i, new Vector3())
        .applyMatrix4(highlight.matrixWorld);
      const expected = batch
        .getVertexPosition(i, new Vector3())
        .applyMatrix4(batch.matrixWorld);
      expect(actual.distanceTo(expected)).toBeLessThan(1e-6);
    }
    highlight.removeFromParent();
    expect(batch.skeleton.bones).toHaveLength(2);
  });

  it("shares morph animation weights instead of freezing the highlight at frame zero", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute([1, 2, 3], 3));
    geometry.morphAttributes.position = [
      new Float32BufferAttribute([5, 6, 7], 3),
    ];
    const source = new Mesh(geometry);
    const highlight = createTourHighlightMesh(source, new MeshBasicMaterial());
    source.add(highlight);
    source.morphTargetInfluences![0] = 0.75;
    expect(highlight.getVertexPosition(0, new Vector3()).toArray()).toEqual([
      4, 5, 6,
    ]);
  });

  it("tracks pooled instance changes without recopying unchanged buffers or disposing shared assets", () => {
    const geometry = new BoxGeometry(2, 2, 2);
    const material = new MeshBasicMaterial();
    const source = new InstancedMesh(geometry, material, 2);
    source.setMatrixAt(0, new Matrix4().makeTranslation(100, 0, 0));
    source.setMatrixAt(1, new Matrix4().makeTranslation(200, 0, 0));
    source.count = 1;
    const texture = new DataTexture();
    source.morphTexture = texture;
    const highlight = createTourHighlightMesh(source, material);
    if (!(highlight instanceof InstancedMesh))
      throw new Error("Expected instances");
    source.add(highlight);
    expect(highlight.geometry).toBe(geometry);
    expect(highlight.instanceMatrix).not.toBe(source.instanceMatrix);
    expect(highlight.count).toBe(1);
    const world = new Box3();
    computeObjectBounds(source, world, { visibleOnly: true });
    expect(world.min.toArray()).toEqual([99, -1, -1]);
    expect(world.max.toArray()).toEqual([101, 1, 1]);

    const version = highlight.instanceMatrix.version;
    source.updateMatrixWorld(true);
    expect(highlight.instanceMatrix.version).toBe(version);
    source.setMatrixAt(1, new Matrix4().makeTranslation(300, 0, 0));
    source.instanceMatrix.needsUpdate = true;
    source.count = 2;
    source.updateMatrixWorld(true);
    expect(highlight.count).toBe(2);
    const matrix = new Matrix4();
    highlight.getMatrixAt(1, matrix);
    expect(matrix.elements[12]).toBe(300);
    expect(highlight.instanceMatrix.version).toBeGreaterThan(version);

    const disposeShared = vi.fn(),
      disposeOverlay = vi.fn();
    geometry.addEventListener("dispose", disposeShared);
    material.addEventListener("dispose", disposeShared);
    texture.addEventListener("dispose", disposeShared);
    highlight.addEventListener("dispose", disposeOverlay);
    const overlays = [highlight];
    removeTourHighlightMeshes(overlays);
    expect(overlays).toHaveLength(0);
    expect(source.children).toHaveLength(0);
    expect(disposeOverlay).toHaveBeenCalledOnce();
    expect(disposeShared).not.toHaveBeenCalled();
    expect(source.morphTexture).toBe(texture);
  });
});
