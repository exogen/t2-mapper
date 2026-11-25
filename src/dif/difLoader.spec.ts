import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LoadingManager,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
} from "three";
import { createDIFModel, DIFLoader } from "./difLoader";
import { createDIFTestBuffer } from "./difTestFixtures";
import { imageWorkQueue } from "../assets/imageWorkQueue";
import { loadBitmapTextureAsync } from "../assets/bitmapTextures";
import { readResourceMetrics } from "../diagnostics/resourceMetricRegistry";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function lightmapModel(count: number) {
  const model = createDIFModel(createDIFTestBuffer().buffer);
  const map = model.interior.lightMaps[0];
  model.interior.lightMaps = Array.from({ length: count }, () => ({ ...map }));
  model.lightMaps = Array.from(
    { length: count },
    (_, index) => model.lightMaps[index] ?? new Texture(),
  );
  model.collisionLightMaps = model.lightMaps;
  return model;
}

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
    const model = lightmapModel(1);
    const geometry = vi.spyOn(model.surfaceMeshes[0].geometry, "dispose");
    const material = vi.spyOn(model.surfaceMeshes[0].material, "dispose");
    const lightmap = vi.spyOn(model.lightMaps[0], "dispose");
    const collision = vi.spyOn(model.collision, "dispose");
    const complete = vi.fn();
    const manager = new LoadingManager(complete);
    const loader = new DIFLoader(manager);
    vi.spyOn(loader, "parse").mockReturnValue(model);
    await expect(
      loader.parseAsync(createDIFTestBuffer().buffer),
    ).rejects.toThrow("PNG decode failed");
    expect(revoke).toHaveBeenCalledOnce();
    expect(geometry).toHaveBeenCalledOnce();
    expect(material).toHaveBeenCalledOnce();
    expect(lightmap).toHaveBeenCalledOnce();
    expect(collision).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledOnce();
    expect(imageWorkQueue.active).toBe(0);
  });

  it("shares the concurrency budget with URL sources and allocates Blob URLs only inside active slots", async () => {
    const fetchResult = deferred<Response>();
    const bitmap = deferred<ImageBitmap>();
    const fetchImage = vi.fn(() => fetchResult.promise);
    const decode = vi.fn(() => bitmap.promise);
    vi.stubGlobal("fetch", fetchImage);
    vi.stubGlobal("createImageBitmap", decode);
    vi.stubGlobal("ProgressEvent", Event);
    const urlSource = loadBitmapTextureAsync(
      "https://dif-images.test/shared-queue.png",
    );
    expect(fetchImage).toHaveBeenCalledOnce();
    const started: Array<
      ReturnType<typeof deferred<Texture<HTMLImageElement>>>
    > = [];
    vi.spyOn(TextureLoader.prototype, "loadAsync").mockImplementation(() => {
      const job = deferred<Texture<HTMLImageElement>>();
      started.push(job);
      return job.promise;
    });
    const createURL = vi.spyOn(URL, "createObjectURL");
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const complete = vi.fn();
    const manager = new LoadingManager(complete);
    const loader = new DIFLoader(manager);
    const count = imageWorkQueue.concurrency + 1;
    const model = lightmapModel(count);
    vi.spyOn(loader, "parse").mockReturnValue(model);
    const loadedModel = loader.parseAsync(createDIFTestBuffer().buffer);
    expect(started).toHaveLength(imageWorkQueue.concurrency - 1);
    expect(createURL).toHaveBeenCalledTimes(imageWorkQueue.concurrency - 1);
    expect(complete).not.toHaveBeenCalled();
    fetchResult.resolve(new Response(new Blob([Uint8Array.of(1)])));
    await vi.waitFor(() => expect(decode).toHaveBeenCalledOnce());
    expect(imageWorkQueue.active).toBe(imageWorkQueue.concurrency);
    expect(imageWorkQueue.queued).toBe(2);
    bitmap.resolve({ width: 1, height: 1 } as ImageBitmap);
    await urlSource;
    expect(started).toHaveLength(imageWorkQueue.concurrency);
    expect(complete).not.toHaveBeenCalled();
    for (let index = 0; index < count; index++) {
      await vi.waitFor(() => expect(started.length).toBeGreaterThan(index));
      started[index].resolve(
        new Texture({ width: 1, height: 1 } as HTMLImageElement),
      );
      if (index < count - 1) expect(complete).not.toHaveBeenCalled();
    }
    await expect(loadedModel).resolves.toBe(model);
    expect(createURL).toHaveBeenCalledTimes(count);
    expect(revoke).toHaveBeenCalledTimes(count);
    expect(complete).toHaveBeenCalledOnce();
    expect(imageWorkQueue.active).toBe(0);
    expect(readResourceMetrics()).toMatchObject({
      "imageWorkQueue.queued": 0,
      "imageWorkQueue.peakActive": imageWorkQueue.concurrency,
    });
  });

  it("balances LoadingManager activity for empty lightmaps and synchronous parse failures", async () => {
    const complete = vi.fn();
    const manager = new LoadingManager(complete);
    const start = vi.spyOn(manager, "itemStart");
    const end = vi.spyOn(manager, "itemEnd");
    const loader = new DIFLoader(manager);
    const model = lightmapModel(0);
    const parse = vi.spyOn(loader, "parse").mockReturnValue(model);
    await expect(loader.parseAsync(createDIFTestBuffer().buffer)).resolves.toBe(
      model,
    );
    expect(start).toHaveBeenCalledOnce();
    expect(end).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledOnce();
    parse.mockImplementationOnce(() => {
      throw new Error("bad DIF");
    });
    await expect(
      loader.parseAsync(createDIFTestBuffer().buffer),
    ).rejects.toThrow("bad DIF");
    expect(start).toHaveBeenCalledTimes(2);
    expect(end).toHaveBeenCalledTimes(2);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("disposes a fully queued interior on abort while the replacement stays queued", async () => {
    const blocker = deferred<void>();
    const slots = Array.from({ length: imageWorkQueue.concurrency }, () =>
      imageWorkQueue.run(() => blocker.promise),
    );
    const decode = vi
      .spyOn(TextureLoader.prototype, "loadAsync")
      .mockResolvedValue(
        new Texture({ width: 1, height: 1 } as HTMLImageElement),
      );
    const complete = vi.fn();
    const loader = new DIFLoader(new LoadingManager(complete));
    const controller = new AbortController();
    loader.signal = controller.signal;
    const old = lightmapModel(3);
    const dispose = vi.spyOn(old.collision, "dispose");
    vi.spyOn(loader, "parse").mockReturnValue(old);
    const buffer = createDIFTestBuffer().buffer;
    const retired = loader.parseAsync(buffer);
    const replacement = new DIFLoader().parseAsync(buffer);
    try {
      expect(imageWorkQueue.queued).toBe(4);
      controller.abort();
      expect(imageWorkQueue.queued).toBe(1);
      await expect(retired).rejects.toBe(controller.signal.reason);
      expect(dispose).toHaveBeenCalledOnce();
      expect(complete).toHaveBeenCalledOnce();
      expect(decode).not.toHaveBeenCalled();
    } finally {
      blocker.resolve();
      await Promise.all([...slots, replacement]);
    }
    expect(decode).toHaveBeenCalledOnce();
  });

  it("waits for remaining queued decodes before disposing a failed model and completing its manager", async () => {
    const started: Array<
      ReturnType<typeof deferred<Texture<HTMLImageElement>>>
    > = [];
    vi.spyOn(TextureLoader.prototype, "loadAsync").mockImplementation(() => {
      const job = deferred<Texture<HTMLImageElement>>();
      started.push(job);
      return job.promise;
    });
    const count = imageWorkQueue.concurrency + 1;
    const model = lightmapModel(count);
    const disposed = vi.spyOn(model.collision, "dispose");
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const complete = vi.fn();
    const loader = new DIFLoader(new LoadingManager(complete));
    vi.spyOn(loader, "parse").mockReturnValue(model);
    const result = loader.parseAsync(createDIFTestBuffer().buffer);
    const rejection = expect(result).rejects.toThrow("bad PNG");
    started[0].reject(new Error("bad PNG"));
    await vi.waitFor(() => expect(started).toHaveLength(count));
    expect(disposed).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    for (const job of started.slice(1))
      job.resolve(new Texture({ width: 1, height: 1 } as HTMLImageElement));
    await rejection;
    expect(disposed).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledTimes(count);
    expect(complete).toHaveBeenCalledOnce();
    expect(imageWorkQueue.active).toBe(0);
  });
});
