import { expect, it, vi } from "vitest";
import { Group, Mesh, type BufferAttribute } from "three";
import { WorldDecalRenderer } from "./WorldDecalRenderer";
import type { GroundDecal } from "./GroundEffectSimulation";
import type { StreamingPlayback } from "../stream/types";

vi.mock("./particleRenderer", async () => {
  const { Texture } = await import("three");
  const texture = new Texture();
  return {
    getParticleTexture: () => texture,
    particleTexturesReady: new Set([texture]),
  };
});

it("uploads fixed footprint geometry only when its contents change, while fading alpha", () => {
  const group = new Group();
  const renderer = new WorldDecalRenderer(group, {
    getDataBlockData: () => ({
      textureName: "footprint",
      sizeX: 0.1,
      sizeY: 0.2,
    }),
  } as unknown as StreamingPlayback);
  const decal: GroundDecal = {
    id: 0,
    timeSec: 0,
    dataBlockId: 1,
    point: [0, 0, 0],
    normal: [0, 0, 1],
    forward: [0, 1, 0],
  };
  renderer.update([decal], 0, 5);
  const mesh = group.children[0] as Mesh;
  const position = mesh.geometry.getAttribute("position") as BufferAttribute;
  const alpha = mesh.geometry.getAttribute("decalAlpha") as BufferAttribute;
  const version = position.version;
  const alphaVersion = alpha.version;
  renderer.update([decal], 1, 5);
  expect(position.version).toBe(version);
  expect(alpha.version).toBe(alphaVersion);
  renderer.update([decal], 4, 5);
  expect(position.version).toBe(version);
  expect(alpha.version).toBe(alphaVersion + 1);
  expect(alpha.getX(0)).toBeCloseTo(0.8);
  renderer.update([decal], 4, 5);
  expect(alpha.version).toBe(alphaVersion + 1);

  // A seek may reuse an ID at a different position.
  renderer.update([{ ...decal, point: [10, 0, 0] }], 1, 5);
  expect(position.version).toBe(version + 1);
  expect(position.getZ(0)).toBeCloseTo(10.1);
  renderer.update([], 1, 5);
  expect(mesh.visible).toBe(false);
  expect(mesh.geometry.drawRange.count).toBe(0);
  renderer.dispose();
  expect(group.children).toHaveLength(0);
});

it("releases old GPU resources and reloads reused decal IDs after a world reset", () => {
  const group = new Group();
  const db = { textureName: "footprint", sizeX: 0.1, sizeY: 0.2 };
  const renderer = new WorldDecalRenderer(group, {
    getDataBlockData: () => db,
  } as unknown as StreamingPlayback);
  const decal: GroundDecal = {
    id: 0,
    timeSec: 0,
    dataBlockId: 1,
    point: [0, 0, 0],
    normal: [0, 0, 1],
    forward: [0, 1, 0],
  };
  renderer.update([decal], 0, 5);
  const old = group.children[0] as Mesh;
  const geometryDisposed = vi.fn(),
    materialDisposed = vi.fn();
  old.geometry.addEventListener("dispose", geometryDisposed);
  const material = Array.isArray(old.material) ? old.material[0] : old.material;
  material.addEventListener("dispose", materialDisposed);
  db.sizeX = 0.5;
  renderer.dispose();
  renderer.update([decal], 0, 5);
  const next = group.children[0] as Mesh;
  expect(next).not.toBe(old);
  expect(next.geometry.getAttribute("position").getZ(0)).toBeCloseTo(0.5);
  expect(geometryDisposed).toHaveBeenCalledOnce();
  expect(materialDisposed).toHaveBeenCalledOnce();
  expect(group.children).toHaveLength(1);
  renderer.dispose();
});
