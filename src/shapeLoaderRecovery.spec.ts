import { afterEach, expect, it, vi } from "vitest";
import { LoadingManager, Mesh, Texture, type Object3D } from "three";
import { loadBitmapTextureInstance } from "./assets/bitmapTextures";
import { SceneAssets } from "./assets/sceneAssets";
import { buildDTS } from "./dts/dtsBuilder";
import { DTSLoader } from "./dts/dtsLoader";
import { createDTSTestShape } from "./dts/dtsTestFixtures";
import { createShapeInstance } from "./engine/shapeInstance";
import { getPlayerSkinSelection, loadSkinManifest } from "./engine/playerSkins";
import * as loaders from "./loaders";
import { ShapeLoader } from "./shapeLoader";
import { settingsStore } from "./state/settingsStore";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function samplers(scene: Object3D): Texture[] {
  const textures: Texture[] = [];
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials)
      if ("map" in material && material.map instanceof Texture)
        textures.push(material.map);
  });
  return textures;
}

it("switches a mounted custom skin with paired resolutions and keeps a single-resolution skin", async () => {
  const paired = "ResolutionTest";
  const originalOnly = "OriginalOnly";
  const base = "https://assets.tribes2.online/skins/files/";
  const stockUrl = `${base}${paired}.lmale@1x.png`;
  const hdUrl = `${base}${paired}.lmale.png`;
  const originalUrl = `${base}${originalOnly}.lmale.png`;
  const images = new Map([
    [stockUrl, { width: 512, height: 512, close: vi.fn() }],
    [hdUrl, { width: 1024, height: 1024, close: vi.fn() }],
    [originalUrl, { width: 512, height: 512, close: vi.fn() }],
  ]);
  const fetch = vi.fn(async (url: string) =>
    url.endsWith("/manifest.json")
      ? Response.json({
          customSkins: { lmale: [paired, originalOnly] },
          sizeMultiplier: { [`${paired}.lmale.png`]: 2 },
        })
      : new Response(new Blob([url])),
  );
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("createImageBitmap", async (blob: Blob) => {
    const url = await blob.text();
    const image = images.get(url);
    if (!image) throw new Error(`Unexpected skin URL: ${url}`);
    return { ...image };
  });
  const assets = new SceneAssets();
  const previous = settingsStore.getState().hdTexturesEnabled;
  settingsStore.setState({ hdTexturesEnabled: false });
  await loadSkinManifest();
  const data = createDTSTestShape();
  data.materials[0].name = "skins/base.lmale";
  const model = buildDTS(data);
  const createPlayer = (name: string) =>
    createShapeInstance({
      model,
      assets,
      playerSkin: getPlayerSkinSelection("light_male.dts", name),
    });
  const player = createPlayer(paired);
  const stockOnly = createPlayer(originalOnly);
  try {
    const [map] = samplers(player.scene);
    const [original] = samplers(stockOnly.scene);
    await vi.waitFor(() => {
      expect(map.image).toMatchObject({ width: 512 });
      expect(original.image).toMatchObject({ width: 512 });
    });
    const originalSource = original.source;
    settingsStore.setState({ hdTexturesEnabled: true });
    assets.refreshTextures();
    await vi.waitFor(() => expect(map.image).toMatchObject({ width: 1024 }));
    expect(images.get(stockUrl)?.close).toHaveBeenCalledOnce();
    expect(samplers(player.scene)[0]).toBe(map);
    settingsStore.setState({ hdTexturesEnabled: false });
    assets.refreshTextures();
    await vi.waitFor(() => expect(map.image).toMatchObject({ width: 512 }));
    expect(images.get(hdUrl)?.close).toHaveBeenCalledOnce();
    expect(original.source).toBe(originalSource);
    expect(
      fetch.mock.calls.filter(([url]) => url === originalUrl),
    ).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalledWith(
      `${base}${originalOnly}.lmale@1x.png`,
      expect.anything(),
    );
  } finally {
    player.dispose();
    stockOnly.dispose();
    assets.dispose();
    settingsStore.setState({ hdTexturesEnabled: previous });
  }
});

it("tries regular, team and authored skins after hi-res fetch and regular decode failures", async () => {
  const path = (name: string) => loaders.textureToUrl(`skins/${name}`, null);
  const hiRes = path("swolf_lmale_512");
  const regular = path("swolf.lmale");
  const team = path("baseb.lmale");
  const original = path("base.lmale");
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      requests.push(url);
      return url === hiRes
        ? new Response(null, { status: 404 })
        : new Response(new Blob([url]));
    }),
  );
  const teamImage = { width: 16, height: 16 } as ImageBitmap;
  const baseImage = { width: 8, height: 8 } as ImageBitmap;
  vi.stubGlobal("createImageBitmap", async (blob: Blob) => {
    const url = await blob.text();
    if (url === regular) throw new Error("bad image");
    return url === team ? teamImage : baseImage;
  });
  const data = createDTSTestShape();
  data.materials[0].name = "skins/base.lmale";
  const model = buildDTS(data);
  const instance = (teamName?: string) =>
    createShapeInstance({
      model,
      playerSkin: getPlayerSkinSelection("light_male.dts", "swolf", teamName),
    });
  const gameplay = instance("baseb");
  const preview = instance();
  try {
    const gameMaps = samplers(gameplay.scene);
    const previewMaps = samplers(preview.scene);
    expect(gameMaps.length).toBeGreaterThan(0);
    expect(previewMaps.length).toBeGreaterThan(0);
    await vi.waitFor(() => {
      for (const map of gameMaps) expect(map.image).toBe(teamImage);
      for (const map of previewMaps) expect(map.image).toBe(baseImage);
    });
    expect(requests.slice(0, 2)).toEqual([hiRes, regular]);
    expect(requests.slice(2).sort()).toEqual([team, original].sort());
  } finally {
    gameplay.dispose();
    preview.dispose();
  }
});

it("recovers real processed view samplers after a shared decode fails and dependency readiness retries", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(loaders, "textureToUrl").mockImplementation(
    (name) => `https://images.test/retry/${name}`,
  );
  vi.stubGlobal("fetch", async () => new Response(new Blob()));
  const image = { width: 16, height: 16 } as ImageBitmap;
  const decode = vi
    .fn()
    .mockRejectedValueOnce(new Error("transient decode error"))
    .mockResolvedValue(image);
  vi.stubGlobal("createImageBitmap", decode);
  const data = createDTSTestShape();
  const model = buildDTS(data, {
    texture: (name) =>
      loadBitmapTextureInstance(() => [loaders.textureToUrl(name)]),
  });
  vi.spyOn(DTSLoader.prototype, "load").mockImplementation((_url, done) =>
    done(model),
  );
  const instance = createShapeInstance({ model, anisotropy: 8 });
  const disposedInstance = createShapeInstance({ model });
  const disposedTextures: Texture[] = [];
  disposedInstance.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials)
      if ("map" in material && material.map instanceof Texture)
        disposedTextures.push(material.map);
  });
  disposedInstance.dispose();
  const viewTextures: Texture[] = [];
  instance.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials)
      if ("map" in material && material.map instanceof Texture)
        viewTextures.push(material.map);
  });
  const sourceTexture = model.materials[0].map!;
  const failedSource = sourceTexture.source;
  expect(viewTextures).not.toHaveLength(0);
  expect(viewTextures[0]).not.toBe(sourceTexture);
  expect(viewTextures[0].source).toBe(sourceTexture.source);
  expect(viewTextures[0].version).toBe(0);
  const loader = new ShapeLoader(new LoadingManager());
  try {
    await expect(loader.loadDependencies("visible-retry.dts")).rejects.toThrow(
      "Failed to load texture",
    );
    expect(warning).toHaveBeenCalledOnce();
    expect(viewTextures[0].image).toBeNull();
    await loader.loadDependencies("visible-retry.dts");
    for (const texture of viewTextures) {
      expect(texture.image).toBe(image);
      expect(texture.version).toBeGreaterThan(0);
      expect(texture.anisotropy).toBe(8);
      expect(texture.source).toBe(sourceTexture.source);
    }
    for (const texture of disposedTextures) {
      expect(texture.source).toBe(failedSource);
      expect(texture.version).toBe(0);
    }
    expect(decode).toHaveBeenCalledTimes(2);
  } finally {
    instance.dispose();
  }
});

it.each([2, 3])(
  "recovers default views created between %i consecutive failed decode generations",
  async (failures) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(loaders, "textureToUrl").mockImplementation(
      (name) => `https://images.test/generations-${failures}/${name}`,
    );
    vi.stubGlobal("fetch", async () => new Response(new Blob()));
    const image = { width: 16, height: 16 } as ImageBitmap;
    const decode = vi.fn();
    for (let i = 0; i < failures; i++)
      decode.mockRejectedValueOnce(new Error(`decode ${i}`));
    decode.mockResolvedValue(image);
    vi.stubGlobal("createImageBitmap", decode);
    const model = buildDTS(createDTSTestShape(), {
      texture: (name) =>
        loadBitmapTextureInstance(() => [loaders.textureToUrl(name)]),
    });
    vi.spyOn(DTSLoader.prototype, "load").mockImplementation((_url, done) =>
      done(model),
    );
    const instances = [createShapeInstance({ model, anisotropy: 8 })];
    const loader = new ShapeLoader(new LoadingManager());
    try {
      for (let i = 0; i < failures; i++) {
        await expect(
          loader.loadDependencies(`generations-${failures}.dts`),
        ).rejects.toThrow("Failed to load texture");
        // A newly visible entity independently requests the same still-empty URL.
        instances.push(createShapeInstance({ model, anisotropy: 8 }));
      }
      await loader.loadDependencies(`generations-${failures}.dts`);
      const native = model.materials[0].map!;
      expect(native.image).toBe(image);
      for (const instance of instances)
        for (const texture of samplers(instance.scene)) {
          expect(texture.image).toBe(image);
          expect(texture.source).toBe(native.source);
          expect(texture.version).toBeGreaterThan(0);
          expect(texture.anisotropy).toBe(8);
        }
      expect(decode).toHaveBeenCalledTimes(failures + 1);
    } finally {
      for (const instance of instances) instance.dispose();
    }
  },
);

it("keeps a pending custom skin independent while the native default source recovers", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(loaders, "textureToUrl").mockImplementation(
    (name) => `https://images.test/skin-isolation/${name}`,
  );
  vi.stubGlobal("fetch", async (url: string) => new Response(new Blob([url])));
  const customUrl = "https://images.test/custom-skin-generation.png";
  const defaultImage = { width: 16, height: 16 } as ImageBitmap;
  const customImage = { width: 32, height: 32 } as ImageBitmap;
  let resolveSkin!: (image: ImageBitmap) => void;
  const skin = new Promise<ImageBitmap>((resolve) => {
    resolveSkin = resolve;
  });
  let defaultAttempts = 0;
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async (blob: Blob) => {
      if ((await blob.text()) === customUrl) return skin;
      if (defaultAttempts++ === 0) throw new Error("default decode failed");
      return defaultImage;
    }),
  );
  const data = createDTSTestShape();
  data.materials[0].name = "skins/base.recovering-skin";
  const model = buildDTS(data, {
    texture: (name) =>
      loadBitmapTextureInstance(() => [loaders.textureToUrl(name)]),
  });
  vi.spyOn(DTSLoader.prototype, "load").mockImplementation((_url, done) =>
    done(model),
  );
  const loader = new ShapeLoader(new LoadingManager());
  await expect(loader.loadDependencies("skin-isolation.dts")).rejects.toThrow(
    "Failed to load texture",
  );
  const instance = createShapeInstance({
    model,
    skinUrl: customUrl,
    anisotropy: 8,
  });
  try {
    const textures = samplers(instance.scene);
    expect(textures).not.toHaveLength(0);
    for (const texture of textures)
      expect(texture.source).not.toBe(model.materials[0].map!.source);
    await loader.loadDependencies("skin-isolation.dts");
    expect(model.materials[0].map!.image).toBe(defaultImage);
    for (const texture of textures) expect(texture.image).toBeNull();
    resolveSkin(customImage);
    await vi.waitFor(() => {
      for (const texture of textures) {
        expect(texture.image).toBe(customImage);
        expect(texture.version).toBeGreaterThan(0);
        expect(texture.source).not.toBe(model.materials[0].map!.source);
        expect(texture.anisotropy).toBe(8);
      }
    });
    expect(defaultAttempts).toBe(2);
  } finally {
    resolveSkin(customImage);
    instance.dispose();
  }
});
