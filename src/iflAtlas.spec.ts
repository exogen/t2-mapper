import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ClampToEdgeWrapping,
  LinearFilter,
  RepeatWrapping,
  Texture,
} from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { loadImageFrameList } from "./loaders";
import {
  loadBitmapTextureAsync,
  promoteBitmapTexture,
  retainBitmapTexture,
} from "./assets/bitmapTextures";
import {
  loadIflAtlas,
  loadShapeImageLists,
  promoteShapeImageLists,
} from "./iflAtlas";
import { buildDTS } from "./dts/dtsBuilder";
import { createDTSTestShape } from "./dts/dtsTestFixtures";
import type { DTSShape } from "./dts/dtsModel";
import { DTSMaterialFlags } from "./dts/dtsTypes";
import { SceneAssets, sharedSceneAssets } from "./assets/sceneAssets";

vi.mock("./loaders", () => ({
  loadImageFrameList: vi.fn(),
  iflTextureToUrl: (name: string) => name,
}));
vi.mock("./assets/bitmapTextures", () => ({
  loadBitmapTextureAsync: vi.fn(),
  promoteBitmapTexture: vi.fn(),
  retainBitmapTexture: vi.fn(() => true),
}));
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
  vi.mocked(loadBitmapTextureAsync).mockImplementation(async (name) => {
    const texture = new Texture({ width: 16, height: 16 });
    images.set(name, texture);
    return texture;
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("shared DTS IFL resources", () => {
  it("keeps a settled atlas when every frame resolves to the same URL", async () => {
    const assets = new SceneAssets();
    const url = "retain.ifl";
    const original = await loadIflAtlas(url, 0, assets.textures);
    let refreshed: Promise<unknown> | undefined;
    assets.onTexturesChanged(() => {
      refreshed = loadIflAtlas(url, 0, assets.textures);
    });
    assets.refreshTextures();

    expect(await refreshed).toBe(original);
    expect(loadImageFrameList).toHaveBeenCalledOnce();
    expect(loadBitmapTextureAsync).toHaveBeenCalledTimes(2);
    expect(retainBitmapTexture).toHaveBeenCalledTimes(2);
    expect(drawImage).toHaveBeenCalledTimes(2);
    expect(original.frames[0].texture.image).not.toBeNull();
    assets.dispose();
  });

  it("keeps settled frame pixels when quality changes during atlas loading", async () => {
    const bitmapTextures = await vi.importActual<
      typeof import("./assets/bitmapTextures")
    >("./assets/bitmapTextures");
    vi.mocked(loadBitmapTextureAsync).mockImplementation(
      bitmapTextures.loadBitmapTextureAsync,
    );
    let firstSlowFrame = true;
    const fetchImage = vi.fn<typeof fetch>(async (url, options) => {
      if (url === "b" && firstSlowFrame) {
        firstSlowFrame = false;
        const signal = options!.signal!;
        return new Promise<Response>((_, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      }
      return new Response(String(url));
    });
    const firstFrame = { width: 16, height: 16, close: vi.fn() };
    vi.stubGlobal("fetch", fetchImage);
    vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
      (await blob.text()) === "a"
        ? firstFrame
        : { width: 16, height: 16, close: vi.fn() },
    );

    const assets = new SceneAssets();
    const oldImages = assets.textures;
    const path = "partial.ifl";
    const flags = DTSMaterialFlags.SWrap;
    const original = loadIflAtlas(path, flags, oldImages);
    await vi.waitFor(() => expect(fetchImage).toHaveBeenCalledTimes(2));
    const source = await bitmapTextures.loadBitmapTextureAsync("a", oldImages);
    const retired = expect(original).rejects.toThrow(
      "Failed to load texture: b",
    );

    let refreshed: ReturnType<typeof loadIflAtlas> | undefined;
    assets.onTexturesChanged(() => {
      refreshed = loadIflAtlas(path, flags, assets.textures);
    });
    assets.refreshTextures();

    await retired;
    expect((await refreshed)?.frames[0].texture.source).toBe(source.source);
    expect(loadImageFrameList).toHaveBeenCalledOnce();
    expect(fetchImage.mock.calls.map(([url]) => url)).toEqual(["a", "b", "b"]);
    expect(firstFrame.close).not.toHaveBeenCalled();
    assets.dispose();
    expect(firstFrame.close).toHaveBeenCalledOnce();
  });

  it("retires unique frame samplers while preserving the replacement scene's frames", async () => {
    const oldAssets = new SceneAssets();
    const newAssets = new SceneAssets();
    const url = "scope.ifl";
    const old = await loadIflAtlas(url, DTSMaterialFlags.SWrap, oldAssets);
    const next = await loadIflAtlas(url, DTSMaterialFlags.SWrap, newAssets);
    const disposed = vi.fn();
    const stillLive = vi.fn();
    expect(old.frames[0].texture).toBe(old.frames[2].texture);
    old.frames[0].texture.addEventListener("dispose", disposed);
    next.frames[0].texture.addEventListener("dispose", stillLive);
    expect(loadBitmapTextureAsync).toHaveBeenCalledWith(
      "a",
      oldAssets,
      "demand",
    );
    expect(loadBitmapTextureAsync).toHaveBeenCalledWith(
      "a",
      newAssets,
      "demand",
    );
    oldAssets.dispose();
    await Promise.resolve();
    expect(disposed).toHaveBeenCalledOnce();
    expect(stillLive).not.toHaveBeenCalled();
    expect(await loadIflAtlas(url, DTSMaterialFlags.SWrap, newAssets)).toBe(
      next,
    );
    newAssets.dispose();
  });

  it("cancels an outgoing frame-list request while its replacement loads", async () => {
    const outgoing = new SceneAssets();
    const replacement = new SceneAssets();
    vi.mocked(loadImageFrameList).mockImplementationOnce(
      (_, signal) =>
        new Promise((_, reject) => {
          signal!.addEventListener("abort", () => reject(signal!.reason), {
            once: true,
          });
        }),
    );
    const retired = loadIflAtlas("interrupted.ifl", 0, outgoing);
    outgoing.dispose();
    await expect(retired).rejects.toBe(outgoing.signal.reason);
    expect(loadBitmapTextureAsync).not.toHaveBeenCalled();
    await expect(
      loadIflAtlas("interrupted.ifl", 0, replacement),
    ).resolves.toHaveProperty("duration");
    expect(loadImageFrameList).toHaveBeenLastCalledWith(
      "interrupted.ifl",
      replacement.signal,
    );
    replacement.dispose();
  });

  it("deduplicates concurrent loads and shares fixed frame transforms across consumers", async () => {
    const a = loadIflAtlas("concurrent.ifl"),
      b = loadIflAtlas("concurrent.ifl");
    expect(a).toBe(b);
    const atlas = await a;
    expect(loadImageFrameList).toHaveBeenCalledTimes(1);
    expect(loadBitmapTextureAsync).toHaveBeenCalledTimes(2);
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
    vi.mocked(loadBitmapTextureAsync).mockImplementation(
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

  it("promotes an effect's already queued image-list frames without restarting them", async () => {
    const assets = new SceneAssets();
    const data = createDTSTestShape();
    data.materials[0].flags |= DTSMaterialFlags.IflMaterial;
    data.iflMaterials = [
      {
        nameIndex: data.names.push("queued.ifl") - 1,
        materialSlot: 0,
        firstFrame: 0,
        firstFrameOffTimeIndex: 0,
        numFrames: 2,
      },
    ];
    const model = buildDTS(data);
    let finish!: (texture: Texture) => void;
    const pending = new Promise<Texture>((resolve) => (finish = resolve));
    vi.mocked(loadBitmapTextureAsync).mockReturnValue(pending);
    const ready = loadShapeImageLists(model, assets);
    await vi.waitFor(() =>
      expect(loadBitmapTextureAsync).toHaveBeenCalledTimes(2),
    );

    promoteShapeImageLists(model, assets);
    expect(promoteBitmapTexture).toHaveBeenCalledWith("a", assets, "critical");
    expect(promoteBitmapTexture).toHaveBeenCalledWith("b", assets, "critical");
    expect(loadBitmapTextureAsync).toHaveBeenCalledTimes(2);

    finish(new Texture({ width: 16, height: 16 }));
    await ready;
    expect(model.scene.imageAnimations).toHaveLength(1);
    assets.dispose();
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
    expect(loadImageFrameList).toHaveBeenCalledWith(
      "textures/skins/late.ifl",
      expect.any(AbortSignal),
    );
    const instance = clone(model.scene) as DTSShape;
    expect(instance.imageAnimations).toHaveLength(0);
    promoteShapeImageLists(model, sharedSceneAssets);
    resolve([{ name: "a", frameCount: 1 }]);
    await ready;
    expect(loadBitmapTextureAsync).toHaveBeenCalledWith(
      "a",
      sharedSceneAssets,
      "critical",
    );
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

  it("updates the same shared animation list on retry so existing clones receive recovered frames", async () => {
    const data = createDTSTestShape();
    data.materials[0].flags |= DTSMaterialFlags.IflMaterial;
    data.iflMaterials = [
      {
        nameIndex: data.names.push("retry-clones.ifl") - 1,
        materialSlot: 0,
        firstFrame: 0,
        firstFrameOffTimeIndex: 0,
        numFrames: 1,
      },
    ];
    const model = buildDTS(data);
    const instance = clone(model.scene) as DTSShape;
    vi.mocked(loadImageFrameList).mockRejectedValueOnce(new Error("offline"));
    await expect(loadShapeImageLists(model)).rejects.toThrow("offline");
    const shared = instance.imageAnimations;
    await loadShapeImageLists(model);
    expect(instance.imageAnimations).toBe(shared);
    expect(model.scene.imageAnimations).toBe(shared);
    expect(shared).toHaveLength(1);
    expect(shared[0].frames).not.toHaveLength(0);
    await loadShapeImageLists(model);
    expect(shared).toHaveLength(1);
  });
});
