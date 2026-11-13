import { describe, expect, it, vi } from "vitest";
import { Mesh, MeshLambertMaterial, Texture } from "three";
import { buildDTS } from "../dts/dtsBuilder";
import { DTSNode, DTSRigidMeshBatch, type DTSShape } from "../dts/dtsModel";
import { batchDTSRigidMeshes } from "../dts/dtsRigidBatch";
import {
  createDTSRigidTestShape,
  createDTSTestShape,
} from "../dts/dtsTestFixtures";
import { createShapeInstance } from "./shapeInstance";

vi.mock("../loaders", () => ({
  textureToUrl: (name: string) => name,
}));
vi.mock("../textureUtils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../textureUtils")>();
  const { Texture } = await import("three");
  const images = new Map<string, Texture>();
  return {
    ...actual,
    loadTextureInstance: (url: string) => {
      let shared = images.get(url);
      if (!shared) {
        shared = new Texture();
        shared.image = { width: 2, height: 2 };
        images.set(url, shared);
      }
      const texture = new Texture();
      texture.name = url;
      texture.source = shared.source;
      return texture;
    },
  };
});

function meshes(scene: DTSShape) {
  const result: Mesh[] = [];
  scene.traverse((object) => {
    if (object instanceof Mesh) result.push(object);
  });
  return result;
}

function material(mesh: Mesh): MeshLambertMaterial {
  const result = Array.isArray(mesh.material)
    ? mesh.material[0]
    : mesh.material;
  expect(result).toBeInstanceOf(MeshLambertMaterial);
  return result as MeshLambertMaterial;
}

describe("createShapeInstance", () => {
  it("shares native geometry and decoded images while isolating materials and samplers", () => {
    const model = buildDTS(createDTSRigidTestShape());
    const first = createShapeInstance({
      model,
      skinUrl: "custom.lmale.png",
      anisotropy: 8,
      emap: true,
    });
    const second = createShapeInstance({
      model,
      skinUrl: "custom.lmale.png",
      anisotropy: 2,
      emap: false,
    });
    const sourceMeshes = meshes(model.scene);
    const firstMeshes = meshes(first.scene);
    const secondMeshes = meshes(second.scene);
    expect(firstMeshes).toHaveLength(sourceMeshes.length);
    expect(first.scene.matrixAutoUpdate).toBe(false);
    for (let index = 0; index < firstMeshes.length; index++) {
      expect(firstMeshes[index].geometry).toBe(sourceMeshes[index].geometry);
      expect(firstMeshes[index].matrixAutoUpdate).toBe(false);
      const a = material(firstMeshes[index]);
      const b = material(secondMeshes[index]);
      expect(a).not.toBe(b);
      expect(a).not.toBe(sourceMeshes[index].material);
      expect(a.map).toBeInstanceOf(Texture);
      expect(a.map!.name).toBe("custom.lmale.png");
      expect(a.map).not.toBe(b.map);
      expect(a.map!.source).toBe(b.map!.source);
      expect(a.map!.anisotropy).toBe(8);
      expect(b.map!.anisotropy).toBe(2);
      a.map!.repeat.set(3, 4);
      expect(b.map!.repeat.toArray()).toEqual([1, 1]);
    }
    first.dispose();
    second.dispose();
  });

  it("owns the cloned skeleton and releases instance resources without invalidating another instance", () => {
    const model = buildDTS(createDTSRigidTestShape());
    const [sourceBatch] = batchDTSRigidMeshes(model.scene);
    expect(sourceBatch).toBeInstanceOf(DTSRigidMeshBatch);
    const first = createShapeInstance({ model });
    const second = createShapeInstance({ model });
    const firstBatch = meshes(first.scene).find(
      (mesh): mesh is DTSRigidMeshBatch => mesh instanceof DTSRigidMeshBatch,
    )!;
    const secondBatch = meshes(second.scene).find(
      (mesh): mesh is DTSRigidMeshBatch => mesh instanceof DTSRigidMeshBatch,
    )!;
    const sourceSkeleton = (sourceBatch as DTSRigidMeshBatch).skeleton;
    expect(firstBatch.skeleton).not.toBe(sourceSkeleton);
    expect(
      firstBatch.skeleton.bones.every(
        (bone) =>
          bone instanceof DTSNode &&
          bone === first.scene.getNode(bone.nodeIndex),
      ),
    ).toBe(true);
    firstBatch.skeleton.bones[0].position.x = 20;
    expect(secondBatch.skeleton.bones[0].position.x).not.toBe(20);
    expect(sourceSkeleton.bones[0].position.x).not.toBe(20);

    const geometryDisposed = vi.fn();
    firstBatch.geometry.addEventListener("dispose", geometryDisposed);
    const firstSkeletonDisposed = vi.spyOn(firstBatch.skeleton, "dispose");
    const secondSkeletonDisposed = vi.spyOn(secondBatch.skeleton, "dispose");
    const sourceSkeletonDisposed = vi.spyOn(sourceSkeleton, "dispose");
    const firstMaterial = material(firstBatch);
    const materialDisposed = vi.fn();
    firstMaterial.addEventListener("dispose", materialDisposed);
    const textureDisposed = vi.fn();
    firstMaterial.map!.addEventListener("dispose", textureDisposed);
    first.dispose();
    expect(firstSkeletonDisposed).toHaveBeenCalledOnce();
    expect(materialDisposed).toHaveBeenCalledOnce();
    expect(textureDisposed).toHaveBeenCalledOnce();
    expect(geometryDisposed).not.toHaveBeenCalled();
    expect(secondSkeletonDisposed).not.toHaveBeenCalled();
    expect(sourceSkeletonDisposed).not.toHaveBeenCalled();
    second.dispose();
  });

  it("processes and freezes DTS details realized after the instance was created", () => {
    const data = createDTSTestShape();
    data.materials[0].name = "skins\\base.lmale";
    data.objects[0].numMeshes = 2;
    data.meshes.push({ ...data.meshes[0] });
    data.details.push({ ...data.details[0], objectDetail: 1, size: 0.1 });
    const model = buildDTS(data);
    const instance = createShapeInstance({ model, skinName: "beagle" });
    const initial = new Set(meshes(instance.scene));
    instance.scene.ensureDetail(1);
    const realized = meshes(instance.scene).filter(
      (mesh) => !initial.has(mesh),
    );
    expect(realized).not.toHaveLength(0);
    for (const mesh of realized) {
      expect(mesh.matrixAutoUpdate).toBe(false);
      expect(material(mesh).map!.name).toBe("skins/beagle.lmale");
    }
    instance.dispose();
  });
});
