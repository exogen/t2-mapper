import { buildGraph } from "@react-three/fiber";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SRGBColorSpace, Texture, TextureLoader, Vector3 } from "three";
import { createDIFModel, DIFLoader } from "./difLoader";
import { createDIFTestBuffer } from "./difTestFixtures";

afterEach(() => vi.restoreAllMocks());

describe("native DIF meshes", () => {
  it("builds outward CCW strips and flat normals in scene coordinates", () => {
    const model = createDIFModel(createDIFTestBuffer().buffer);
    expect(model.surfaceMeshes).toHaveLength(2);
    const geometry = model.surfaceMeshes[0].geometry;
    expect(Array.from(geometry.attributes.position.array)).toEqual([
      0, 0, 0, 2, 0, 0, 0, 0, 3, 2, 0, 3,
    ]);
    expect(Array.from(geometry.index!.array)).toEqual([0, 2, 1, 1, 2, 3]);
    for (const mesh of model.surfaceMeshes) {
      const g = mesh.geometry;
      for (let i = 0; i < g.index!.count; i += 3) {
        const indices = [0, 1, 2].map((j) => g.index!.getX(i + j));
        const [a, b, c] = indices.map((j) =>
          new Vector3().fromBufferAttribute(g.attributes.position, j),
        );
        const normal = new Vector3().fromBufferAttribute(
          g.attributes.normal,
          indices[0],
        );
        expect(b.sub(a).cross(c.sub(a)).normalize().dot(normal)).toBeCloseTo(1);
      }
      expect(mesh.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    }
  });

  it("keeps inside/outside materials separate and uses native texture fields", () => {
    const model = createDIFModel(createDIFTestBuffer().buffer);
    const [inside, outside] = model.surfaceMeshes.map((mesh) => mesh.material);
    expect(inside.outsideVisible).toBe(false);
    expect(outside.outsideVisible).toBe(true);
    expect(inside.resourcePath).toBe("test");
    expect(inside.lightMap).toBe(outside.lightMap);
    expect(inside.lightMap).toMatchObject({
      channel: 1,
      flipY: false,
      colorSpace: SRGBColorSpace,
    });
    expect(inside.userData).toEqual({});
    expect(outside.clone().surfaceFlags).toBe(16);
    const geometry = model.surfaceMeshes[0].geometry;
    expect(Array.from(geometry.attributes.uv.array)).toEqual([
      0.125, -0.25, 0.125, 0.75, 0.875, -0.25, 0.875, 0.75,
    ]);
    expect(Array.from(geometry.attributes.uv1.array)).toEqual([
      0.125, 0.5, 0.125, 1, 0.5, 0.5, 0.5, 1,
    ]);
  });

  it("retains surface meshes when React Three Fiber adds its scene graph lookups", () => {
    const model = createDIFModel(createDIFTestBuffer().buffer);
    const original = model.surfaceMeshes;
    const loaded = Object.assign(model, buildGraph(model.scene));
    expect(loaded.surfaceMeshes).toBe(original);
    expect(loaded.surfaceMeshes.map((mesh) => mesh.name)).toHaveLength(2);
    expect(Array.isArray(loaded.meshes)).toBe(false);
  });

  it("selects a single LOD without a DOM", () => {
    const { buffer } = createDIFTestBuffer({ details: 2 });
    expect(new DIFLoader().parse(buffer).interior.detailLevel).toBe(0);
    expect(createDIFModel(buffer, 1).interior.detailLevel).toBe(1);
    expect(
      createDIFModel(buffer, 1).surfaceMeshes[0].material.resourcePath,
    ).toBe("test-lod1");
    expect(() => createDIFModel(buffer, 2)).toThrow(/out of range/);
  });

  it("selects normal lighting when a distinct alarm atlas is present", () => {
    const model = createDIFModel(createDIFTestBuffer({ alarm: true }).buffer);
    const material = model.surfaceMeshes[0].material;
    expect(material.lightMap).toBe(model.lightMaps[0]);
    expect(material.lightMap).not.toBe(
      model.lightMaps[material.alarmLightMapIndex],
    );
    expect(material.clone().alarmLightMapIndex).toBe(1);
  });

  it("uses 32-bit indices for batches exceeding the WebGL 16-bit limit", () => {
    const model = createDIFModel(
      createDIFTestBuffer({ surfacePairs: 16384 }).buffer,
    );
    for (const mesh of model.surfaceMeshes) {
      const index = mesh.geometry.index!;
      expect(mesh.geometry.attributes.position.count).toBe(65536);
      expect(index.array).toBeInstanceOf(Uint32Array);
      expect(Array.from(index.array.slice(-6))).toEqual([
        65532, 65534, 65533, 65533, 65534, 65535,
      ]);
    }
  });

  it("decodes embedded lightmaps and revokes temporary URLs", async () => {
    const image = { width: 1, height: 1 };
    vi.spyOn(TextureLoader.prototype, "loadAsync").mockResolvedValue(
      new Texture(image as HTMLImageElement),
    );
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const model = await new DIFLoader().parseAsync(
      createDIFTestBuffer().buffer,
    );
    expect(model.surfaceMeshes[0].material.lightMap!.image).toBe(image);
    expect(revoke).toHaveBeenCalledOnce();
  });

  it("rejects image errors and cleans up URLs", async () => {
    vi.spyOn(TextureLoader.prototype, "loadAsync").mockRejectedValue(
      new Error("PNG decode failed"),
    );
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    await expect(
      new DIFLoader().parseAsync(createDIFTestBuffer().buffer),
    ).rejects.toThrow("PNG decode failed");
    expect(revoke).toHaveBeenCalledOnce();
  });
});
