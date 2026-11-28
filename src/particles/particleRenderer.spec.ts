import { afterAll, beforeAll, expect, it, vi } from "vitest";
import {
  ClampToEdgeWrapping,
  InstancedBufferAttribute,
  LinearFilter,
  LinearMipmapNearestFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  type BufferAttribute,
} from "three";
import { loadBitmapTexture } from "../assets/bitmapTextures";
import { SceneAssets, sharedSceneAssets } from "../assets/sceneAssets";
import {
  getParticleTexture,
  createParticleMaterial,
  particleTexturesReady,
  warmParticleTexture,
  createParticleGeometry,
  syncBuffers,
  type ParticleBuffers,
} from "./particleRenderer";
import { EmitterInstance, resolveEmitterData } from "./ParticleSystem";
import { transparentTexture } from "../textureUtils";

const pending = new Map<string, (image: unknown) => void>();
const failed = new Map<string, (error: Error) => void>();
const quality = vi.hoisted(() => ({ hd: true }));
vi.mock("../loaders", () => ({
  textureToUrl: (name: string) =>
    `/${name === "refresh-dust" && !quality.hd ? "stock-" : ""}${name}.png`,
}));

beforeAll(() => {
  vi.stubGlobal("createImageBitmap", async (image: unknown) => image);
  vi.stubGlobal(
    "fetch",
    (url: string) =>
      new Promise((resolve, reject) => {
        pending.set(url, (image) =>
          resolve({ ok: true, blob: async () => image }),
        );
        failed.set(url, reject);
      }),
  );
});
afterAll(() => vi.unstubAllGlobals());

it("shares particle image data without changing another renderer's texture settings", async () => {
  const source = loadBitmapTexture(
    "/dust.png",
    undefined,
    undefined,
    sharedSceneAssets.textures,
  );
  source.colorSpace = SRGBColorSpace;
  source.minFilter = LinearFilter;
  source.wrapS = ClampToEdgeWrapping;
  source.repeat.set(2, 3);
  const particle = getParticleTexture("dust");
  expect(particle).not.toBe(source);
  expect(particle.source).toBe(source.source);
  expect(particleTexturesReady.has(particle)).toBe(false);
  const image = { width: 64, height: 64 };
  pending.get("/dust.png")!(image);
  await vi.waitFor(() => expect(particle.image).toBe(image));
  expect(particle.image).toBe(image);
  expect(particleTexturesReady.has(particle)).toBe(true);
  expect(particle.version).toBeGreaterThan(0);
  expect(particle.colorSpace).toBe(NoColorSpace);
  expect(particle.minFilter).toBe(LinearMipmapNearestFilter);
  expect(particle.wrapS).toBe(RepeatWrapping);
  expect(particle.repeat.toArray()).toEqual([1, 1]);
  expect(source.colorSpace).toBe(SRGBColorSpace);
  expect(source.minFilter).toBe(LinearFilter);
  expect(source.wrapS).toBe(ClampToEdgeWrapping);
  source.colorSpace = "other";
  expect(particle.colorSpace).toBe(NoColorSpace);
  expect(getParticleTexture("dust")).toBe(particle);
});

it("makes an already-decoded particle texture ready immediately", async () => {
  const source = loadBitmapTexture(
    "/footprint.png",
    undefined,
    undefined,
    sharedSceneAssets.textures,
  );
  pending.get("/footprint.png")!({ width: 32, height: 64 });
  await vi.waitFor(() => expect(source.image).toHaveProperty("width", 32));
  const particle = getParticleTexture("footprint");
  expect(particle.source).toBe(source.source);
  expect(particleTexturesReady.has(particle)).toBe(true);
  expect(particle.version).toBeGreaterThan(0);
  expect(source.source.version).toBe(1);
});

it("hides a pending named particle texture and warms the sampler its material uses", async () => {
  const assets = new SceneAssets();
  const texture = getParticleTexture("mortar-smoke", assets);
  const pendingMaterial = createParticleMaterial(texture, true);
  const solid = getParticleTexture("", assets);
  const solidMaterial = createParticleMaterial(solid, true);
  try {
    expect(pendingMaterial.uniforms.particleTexture.value).toBe(
      transparentTexture,
    );
    expect(solidMaterial.uniforms.particleTexture.value).toBe(solid);

    const warmed = warmParticleTexture("mortar-smoke", assets, "critical");
    const image = { width: 128, height: 128, close: vi.fn() };
    pending.get("/mortar-smoke.png")!(image);
    expect(await warmed).toBe(texture);
    expect(texture.image).toBe(image);
    const material = createParticleMaterial(texture, true);
    expect(material.uniforms.particleTexture.value).toBe(texture);
    material.dispose();
  } finally {
    solidMaterial.dispose();
    pendingMaterial.dispose();
    assets.dispose();
  }
});

it("retries a failed bitmap on later demand and updates existing particle samplers", async () => {
  const path = "/retry-dust.png";
  const clock = vi.spyOn(performance, "now").mockReturnValue(100);
  const texture = getParticleTexture("retry-dust");
  const firstLoad = pending.get(path);
  try {
    const settled = new Promise<void>((resolve) => {
      loadBitmapTexture(
        path,
        undefined,
        () => resolve(),
        sharedSceneAssets.textures,
      );
    });
    failed.get(path)!(new Error("offline"));
    await settled;
    expect(particleTexturesReady.has(texture)).toBe(false);
    expect(getParticleTexture("retry-dust")).toBe(texture);
    expect(pending.get(path)).toBe(firstLoad);

    clock.mockReturnValue(10_100);
    expect(getParticleTexture("retry-dust")).toBe(texture);
    const retryLoad = pending.get(path);
    expect(retryLoad).not.toBe(firstLoad);
    expect(getParticleTexture("retry-dust")).toBe(texture);
    expect(pending.get(path)).toBe(retryLoad);
    const image = { width: 8, height: 8 };
    retryLoad!(image);
    await vi.waitFor(() =>
      expect(particleTexturesReady.has(texture)).toBe(true),
    );
    expect(texture.image).toBe(image);
    expect(texture.source.version).toBe(1);
  } finally {
    clock.mockRestore();
  }
});

it("reuses the particle sampler and releases its old pixels on a graphics change", async () => {
  const assets = new SceneAssets();
  try {
    const sampler = getParticleTexture("refresh-dust", assets);
    const oldImage = { width: 64, height: 64, close: vi.fn() };
    pending.get("/refresh-dust.png")!(oldImage);
    await vi.waitFor(() => expect(sampler.image).toBe(oldImage));
    const oldSource = sampler.source;
    const freeGpuTexture = vi.fn(() => expect(sampler.source).toBe(oldSource));
    sampler.addEventListener("dispose", freeGpuTexture);

    quality.hd = false;
    assets.refreshTextures();
    expect(freeGpuTexture).toHaveBeenCalledOnce();
    sampler.removeEventListener("dispose", freeGpuTexture);
    expect(sampler.image).toBeNull();
    expect(sampler.version).toBe(0);
    expect(particleTexturesReady.has(sampler)).toBe(false);
    expect(getParticleTexture("refresh-dust", assets)).toBe(sampler);
    expect(oldImage.close).toHaveBeenCalledOnce();

    const image = { width: 16, height: 16, close: vi.fn() };
    pending.get("/stock-refresh-dust.png")!(image);
    await vi.waitFor(() => expect(sampler.image).toBe(image));
    expect(sampler.source).not.toBe(oldSource);
    expect(particleTexturesReady.has(sampler)).toBe(true);
    expect(sampler.wrapS).toBe(RepeatWrapping);
    expect(sampler.colorSpace).toBe(NoColorSpace);
  } finally {
    quality.hd = true;
    assets.dispose();
  }
});

it("keeps the particle sampler ready when graphics quality selects the same image", async () => {
  const assets = new SceneAssets();
  const path = "/unmodified-dust.png";
  try {
    const sampler = getParticleTexture("unmodified-dust", assets);
    const request = pending.get(path)!;
    const image = { width: 64, height: 64, close: vi.fn() };
    request(image);
    await vi.waitFor(() => expect(sampler.image).toBe(image));
    const source = sampler.source;
    const version = sampler.version;
    const disposed = vi.fn();
    sampler.addEventListener("dispose", disposed);

    quality.hd = false;
    assets.refreshTextures();
    expect(pending.get(path)).toBe(request);
    expect(sampler.source).toBe(source);
    expect(sampler.image).toBe(image);
    expect(sampler.version).toBe(version);
    expect(particleTexturesReady.has(sampler)).toBe(true);
    expect(disposed).not.toHaveBeenCalled();
    expect(image.close).not.toHaveBeenCalled();

    assets.dispose();
    expect(disposed).toHaveBeenCalledOnce();
    expect(image.close).toHaveBeenCalledOnce();
  } finally {
    quality.hd = true;
    assets.dispose();
  }
});

it.each([false, true])(
  "allocates one record per particle with interpolation %s",
  (interpolate) => {
    const floatArray = Float32Array;
    const existing = createParticleGeometry(8, interpolate);
    const floats = vi
      .spyOn(globalThis, "Float32Array")
      .mockImplementation(function (...args) {
        return Reflect.construct(floatArray, args);
      });
    try {
      const geometry = createParticleGeometry(8, interpolate);
      const attributes = Object.values(geometry.attributes).filter(
        (attribute) => attribute instanceof InstancedBufferAttribute,
      );
      expect(attributes).toHaveLength(interpolate ? 8 : 5);
      expect(floats).toHaveBeenCalledTimes(attributes.length);
      for (const [i, attribute] of attributes.entries()) {
        expect(attribute.count).toBe(8);
        expect(attribute.meshPerAttribute).toBe(1);
        expect(attribute.array).toBe(floats.mock.results[i].value);
      }
      expect(geometry.instanceCount).toBe(0);
      const corners = geometry.getAttribute("quadCorner");
      const existingCorners = existing.getAttribute("quadCorner");
      expect(corners.count).toBe(4);
      expect(corners.array).toBe(existingCorners.array);
      expect(corners).not.toBe(existingCorners);
      expect(geometry.index?.count).toBe(6);
      expect(geometry.index?.array).toBe(existing.index?.array);
      expect(geometry.index).not.toBe(existing.index);
      geometry.dispose();
    } finally {
      floats.mockRestore();
      existing.dispose();
    }
  },
);

it("uploads only live instances and excludes expired particles", () => {
  const emitter = new EmitterInstance(
    resolveEmitterData({ particles: [1], ejectionVelocity: 0 }, () => ({
      lifetimeMS: 1,
    }))!,
    4096,
  );
  const geometry = createParticleGeometry(emitter.maxParticles, true);
  const buffers: ParticleBuffers = { emitter, geometry };
  const size = geometry.getAttribute("particleSize") as BufferAttribute;
  const position = geometry.getAttribute("position") as BufferAttribute;
  const acceleration = geometry.getAttribute(
    "particleAcceleration",
  ) as BufferAttribute;
  emitter.emitBurst([1, 2, 3], 1);
  syncBuffers(buffers);
  expect(geometry.instanceCount).toBe(1);
  expect(size.updateRanges).toEqual([{ start: 0, count: 1 }]);
  expect(acceleration.updateRanges).toEqual([{ start: 0, count: 3 }]);
  const version = size.version;
  syncBuffers(buffers);
  expect(size.version).toBe(version);

  emitter.update(33);
  syncBuffers(buffers);
  expect(geometry.instanceCount).toBe(0);
  expect(size.version).toBe(version);
  expect(size.updateRanges).toEqual([]);

  emitter.emitBurst([4, 5, 6], 2);
  syncBuffers(buffers);
  expect(geometry.instanceCount).toBe(2);
  expect(size.updateRanges).toEqual([{ start: 0, count: 2 }]);
  expect(position.updateRanges).toEqual([{ start: 0, count: 6 }]);
  expect(acceleration.updateRanges).toEqual([{ start: 0, count: 6 }]);
  for (let i = 0; i < geometry.instanceCount; i++) {
    expect(size.getX(i)).toBeGreaterThan(0);
    expect([position.getX(i), position.getY(i), position.getZ(i)]).toEqual([
      5, 6, 4,
    ]);
  }
  geometry.dispose();
});
