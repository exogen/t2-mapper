import { expect, it, vi } from "vitest";
import {
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapNearestFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  type BufferAttribute,
} from "three";
import { loadTexture } from "../textureUtils";
import {
  getParticleTexture,
  particleTexturesReady,
  createParticleGeometry,
  syncBuffers,
  type ParticleBuffers,
} from "./particleRenderer";
import { EmitterInstance, resolveEmitterData } from "./ParticleSystem";

const pending = vi.hoisted(() => new Map<string, (image: unknown) => void>());
vi.mock("three", async (importOriginal) => ({
  ...(await importOriginal<typeof import("three")>()),
  ImageBitmapLoader: class {
    setOptions() {
      return this;
    }
    load(url: string, load: (image: unknown) => void) {
      pending.set(url, load);
    }
  },
}));
vi.mock("../loaders", () => ({
  textureToUrl: (name: string) => `/${name}.png`,
}));

it("shares particle image data without changing another renderer's texture settings", () => {
  const source = loadTexture("/dust.png");
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

it("makes an already-decoded particle texture ready immediately", () => {
  const source = loadTexture("/footprint.png");
  pending.get("/footprint.png")!({ width: 32, height: 64 });
  const particle = getParticleTexture("footprint");
  expect(particle.source).toBe(source.source);
  expect(particleTexturesReady.has(particle)).toBe(true);
  expect(particle.version).toBeGreaterThan(0);
});

it("uploads only live quads and excludes expired particles using drawRange", () => {
  const emitter = new EmitterInstance(
    resolveEmitterData({ particles: [1], ejectionVelocity: 0 }, () => ({
      lifetimeMS: 1,
    }))!,
    4096,
  );
  const geometry = createParticleGeometry(emitter.maxParticles);
  const buffers: ParticleBuffers = { emitter, geometry };
  const size = geometry.getAttribute("particleSize") as BufferAttribute;
  const position = geometry.getAttribute("position") as BufferAttribute;
  emitter.emitBurst([1, 2, 3], 1);
  syncBuffers(buffers);
  expect(geometry.drawRange.count).toBe(6);
  expect(size.updateRanges).toEqual([{ start: 0, count: 4 }]);
  const version = size.version;
  syncBuffers(buffers);
  expect(size.version).toBe(version);

  emitter.update(33);
  syncBuffers(buffers);
  expect(geometry.drawRange.count).toBe(0);
  expect(size.version).toBe(version);
  expect(size.updateRanges).toEqual([]);

  emitter.emitBurst([4, 5, 6], 2);
  syncBuffers(buffers);
  expect(geometry.drawRange.count).toBe(12);
  expect(size.updateRanges).toEqual([{ start: 0, count: 8 }]);
  for (let i = 0; i < 8; i++) {
    expect(size.getX(i)).toBeGreaterThan(0);
    expect([position.getX(i), position.getY(i), position.getZ(i)]).toEqual([
      5, 6, 4,
    ]);
  }
  geometry.dispose();
});
