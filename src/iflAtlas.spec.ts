import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ClampToEdgeWrapping,
  LinearFilter,
  RepeatWrapping,
  Texture,
} from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { loadImageFrameList } from "./loaders";
import { loadTextureAsync } from "./textureUtils";
import { loadIflAtlas, loadShapeImageLists } from "./iflAtlas";
import { buildDTS } from "./dts/dtsBuilder";
import { createDTSTestShape } from "./dts/dtsTestFixtures";
import type { DTSShape } from "./dts/dtsModel";
import { DTSMaterialFlags } from "./dts/dtsTypes";

vi.mock("./loaders", () => ({
  loadImageFrameList: vi.fn(),
  iflTextureToUrl: (name: string) => name,
}));
vi.mock("./textureUtils", () => ({ loadTextureAsync: vi.fn() }));
const drawImage = vi.fn();
const images = new Map<string, Texture>();

beforeEach(() => {
  vi.clearAllMocks();
  images.clear();
  vi.stubGlobal("document", {
    createElement: vi.fn(() => ({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
    })),
  });
  vi.mocked(loadImageFrameList).mockResolvedValue([
    { name: "a", frameCount: 1 },
    { name: "b", frameCount: 2 },
    { name: "a", frameCount: 3 },
  ]);
  vi.mocked(loadTextureAsync).mockImplementation(async (name) => {
    const texture = new Texture({ width: 16, height: 16 });
    images.set(name, texture);
    return texture;
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("shared DTS IFL resources", () => {
  it("deduplicates concurrent loads and shares fixed frame transforms across consumers", async () => {
    const a = loadIflAtlas("concurrent.ifl"),
      b = loadIflAtlas("concurrent.ifl");
    expect(a).toBe(b);
    const atlas = await a;
    expect(loadImageFrameList).toHaveBeenCalledTimes(1);
    expect(loadTextureAsync).toHaveBeenCalledTimes(2);
    expect(drawImage).toHaveBeenCalledTimes(2);
    const frames = atlas.frames.map((f) => f.texture);
    expect(frames[0]).toBe(frames[2]);
    expect(frames[0]).not.toBe(frames[1]);
    expect(frames[0].source).toBe(frames[1].source);
    expect(frames[0].offset.toArray()).toEqual([0, 0]);
    expect(frames[1].offset.toArray()).toEqual([0.5, 0]);
    expect(atlas.duration).toBeCloseTo(6 / 30);
    const version = frames[0].source.version;
    expect(await loadIflAtlas("concurrent.ifl")).toBe(atlas);
    expect(frames[0].source.version).toBe(version);
  });

  it("preserves independent S/T wrapping and leaves cached source textures untouched", async () => {
    const atlas = await loadIflAtlas(
      "wrapped.ifl",
      DTSMaterialFlags.SWrap | DTSMaterialFlags.NoMipMap,
    );
    const texture = atlas.frames[0].texture;
    const source = images.get("a")!;
    expect(drawImage).not.toHaveBeenCalled();
    expect(texture.source).toBe(source.source);
    expect(texture).not.toBe(source);
    expect(texture.wrapS).toBe(RepeatWrapping);
    expect(texture.wrapT).toBe(ClampToEdgeWrapping);
    expect(texture.generateMipmaps).toBe(false);
    expect(texture.minFilter).toBe(LinearFilter);
    expect(source.wrapS).toBe(ClampToEdgeWrapping);
    expect(source.generateMipmaps).toBe(true);
    expect(source.source.version).toBe(0);
  });

  it("keeps differently sized frames as individual textures", async () => {
    vi.mocked(loadTextureAsync).mockImplementation(
      async (name) =>
        new Texture({
          width: name === "a" ? 16 : 32,
          height: 16,
        }),
    );
    const atlas = await loadIflAtlas("mixed-sizes.ifl");
    expect(drawImage).not.toHaveBeenCalled();
    expect(atlas.frames[0].texture.source).not.toBe(
      atlas.frames[1].texture.source,
    );
  });

  it("publishes late resources to clones made before loading completes", async () => {
    let resolve!: (frames: { name: string; frameCount: number }[]) => void;
    vi.mocked(loadImageFrameList).mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const data = createDTSTestShape();
    data.materials[0].flags |= DTSMaterialFlags.IflMaterial;
    data.iflMaterials = [
      {
        nameIndex: data.names.push("skins\\late.ifl") - 1,
        materialSlot: 0,
        firstFrame: 0,
        firstFrameOffTimeIndex: 0,
        numFrames: 1,
      },
    ];
    const model = buildDTS(data);
    const ready = loadShapeImageLists(model);
    expect(loadImageFrameList).toHaveBeenCalledWith("textures/skins/late.ifl");
    const instance = clone(model.scene) as DTSShape;
    expect(instance.imageAnimations).toHaveLength(0);
    resolve([{ name: "a", frameCount: 1 }]);
    await ready;
    expect(instance.imageAnimations).toBe(model.scene.imageAnimations);
    expect(instance.imageAnimations).toHaveLength(1);
    expect(instance.imageAnimations[0].frames[0].texture).toBeTruthy();
  });

  it("allows retries after a failed load", async () => {
    vi.mocked(loadImageFrameList).mockRejectedValueOnce(new Error("offline"));
    await expect(loadIflAtlas("retry.ifl")).rejects.toThrow("offline");
    await expect(loadIflAtlas("retry.ifl")).resolves.toHaveProperty("duration");
    expect(loadImageFrameList).toHaveBeenCalledTimes(2);
  });
});
