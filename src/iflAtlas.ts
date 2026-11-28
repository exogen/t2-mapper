import {
  CanvasTexture,
  ClampToEdgeWrapping,
  NearestFilter,
  Source,
  SRGBColorSpace,
  Texture,
} from "three";
import {
  configureDTSImageTexture,
  createDTSImageAnimation,
  createDTSImageFrames,
  type DTSImageAnimation,
  type DTSImageFrames,
} from "./dts/dtsTextures";
import type { DTSModel } from "./dts/dtsModel";
import { DTSMaterialFlags, type DTSIflMaterial } from "./dts/dtsTypes";
import { iflTextureToUrl, loadImageFrameList } from "./loaders";
import {
  loadBitmapTextureAsync,
  promoteBitmapTexture,
  retainBitmapTexture,
} from "./assets/bitmapTextures";
import type { AssetLoadPriority } from "./assets/assetLoadQueue";
import { normalizePath } from "./stringUtils";
import { sharedSceneAssets, type SceneAssets } from "./assets/sceneAssets";

// Cache in-flight work too: simultaneous spawns must not build duplicate atlases.
const iflCache = {};
type FrameList = Awaited<ReturnType<typeof loadImageFrameList>>;
interface AtlasSources {
  entries: FrameList;
  urls: Map<string, string>;
}
interface AtlasEntry {
  pending: Promise<DTSImageFrames>;
  priority: AssetLoadPriority;
  sources?: AtlasSources;
  frames?: DTSImageFrames;
}

const samplerFlags =
  DTSMaterialFlags.SWrap |
  DTSMaterialFlags.TWrap |
  DTSMaterialFlags.NoMipMap |
  DTSMaterialFlags.MipMapZeroBorder;

/** Independent UV/sampler state without re-uploading the shared image Source. */
function frameTexture(source: Texture): Texture {
  const texture = new Texture();
  texture.source = source.source;
  texture.colorSpace = source.colorSpace;
  texture.generateMipmaps = source.generateMipmaps;
  texture.minFilter = source.minFilter;
  texture.magFilter = source.magFilter;
  texture.wrapS = source.wrapS;
  texture.wrapT = source.wrapT;
  texture.flipY = source.flipY;
  texture.repeat.copy(source.repeat);
  texture.version = 1;
  return texture;
}

/** One immutable texture transform per unique frame, shared by every instance. */
function packFrames(textures: Texture[]): Texture[] {
  const { width, height } = textures[0].image as ImageBitmap;
  const columns = Math.ceil(Math.sqrt(textures.length));
  const rows = Math.ceil(textures.length / columns);
  const canvas = document.createElement("canvas");
  canvas.width = width * columns;
  canvas.height = height * rows;
  const context = canvas.getContext("2d")!;
  textures.forEach((texture, i) => {
    context.drawImage(
      texture.image as CanvasImageSource,
      (i % columns) * width,
      Math.floor(i / columns) * height,
    );
  });
  const atlas = new CanvasTexture(canvas);
  atlas.colorSpace = SRGBColorSpace;
  atlas.generateMipmaps = false;
  atlas.minFilter = atlas.magFilter = NearestFilter;
  atlas.wrapS = atlas.wrapT = ClampToEdgeWrapping;
  atlas.repeat.set(1 / columns, 1 / rows);
  return textures.map((_, i) => {
    const texture = frameTexture(atlas);
    // Canvas starts at the top; texture V starts at the bottom.
    texture.offset.set(
      (i % columns) / columns,
      (rows - 1 - Math.floor(i / columns)) / rows,
    );
    return texture;
  });
}

function atlasSources(iflPath: string, entries: FrameList): AtlasSources {
  const urls = new Map<string, string>();
  for (const { name } of entries) {
    if (!urls.has(name)) urls.set(name, iflTextureToUrl(name, iflPath));
  }
  return { entries, urls };
}

async function buildFrames(
  { entries, urls }: AtlasSources,
  flags: number,
  assets: SceneAssets,
  priority: AssetLoadPriority,
): Promise<DTSImageFrames> {
  assets.signal.throwIfAborted();
  if (!entries.length) return { frames: [], duration: 0 };
  const textures = await Promise.all(
    Array.from(urls.values(), (url) =>
      loadBitmapTextureAsync(url, assets, priority),
    ),
  );
  assets.signal.throwIfAborted();
  // An atlas cannot tile or preserve differently sized frames. Keep those
  // as ordinary textures, with separate sampler state from the image cache.
  const individual =
    !!(flags & (DTSMaterialFlags.SWrap | DTSMaterialFlags.TWrap)) ||
    textures.some(
      (texture) =>
        (texture.image as ImageBitmap).width !==
          (textures[0].image as ImageBitmap).width ||
        (texture.image as ImageBitmap).height !==
          (textures[0].image as ImageBitmap).height,
    );
  const frames = individual
    ? textures.map((texture) =>
        configureDTSImageTexture(frameTexture(texture), flags),
      )
    : packFrames(textures);
  const byName = new Map(
    Array.from(urls.keys(), (name, i) => [name, frames[i]]),
  );
  return createDTSImageFrames(entries, (name) => byName.get(name)!);
}

function disposeIflFrames({ frames }: DTSImageFrames): void {
  for (const texture of new Set(frames.map((frame) => frame.texture))) {
    texture.dispose();
    // DTS instances can still reference a frame while its replacement loads.
    texture.source = new Source(null);
    texture.version = 0;
  }
}

function getIflCache(assets: SceneAssets) {
  return assets.cache<string, AtlasEntry>(iflCache, ({ frames }) => {
    if (frames) disposeIflFrames(frames);
  });
}

function iflKey(path: string, flags: number): string {
  return `${normalizePath(path).toLowerCase()}:${flags & samplerFlags}`;
}

function promoteIflAtlas(entry: AtlasEntry, assets: SceneAssets): void {
  if (entry.priority === "critical" || entry.frames) return;
  entry.priority = "critical";
  entry.sources?.urls.forEach((url) =>
    promoteBitmapTexture(url, assets, "critical"),
  );
}

export function loadIflAtlas(
  iflPath: string,
  flags = 0,
  assets: SceneAssets = sharedSceneAssets,
  priority: AssetLoadPriority = "demand",
): Promise<DTSImageFrames> {
  const atlasCache = getIflCache(assets);
  const key = iflKey(iflPath, flags);
  const cached = atlasCache.get(key);
  if (cached) {
    if (priority === "critical") promoteIflAtlas(cached, assets);
    return cached.pending;
  }

  let nextSources: AtlasSources | undefined;
  const sameAtlas = assets.adoptCached<string, AtlasEntry>(
    iflCache,
    key,
    (old) => {
      const previousSources = old.sources;
      if (!previousSources) return false;
      nextSources = atlasSources(iflPath, previousSources.entries);
      return (
        old.frames !== undefined &&
        Array.from(
          nextSources.urls,
          ([name, url]) =>
            url === previousSources.urls.get(name) &&
            retainBitmapTexture(url, assets),
        ).every(Boolean)
      );
    },
  );
  if (sameAtlas) return sameAtlas.pending;

  // Start known frame URLs now, while settled bitmaps can still transfer
  // from the retiring owner. Remember newly parsed URLs during decoding too.
  const loading = nextSources
    ? buildFrames(nextSources, flags, assets, priority)
    : loadImageFrameList(iflPath, assets.signal).then((entries) => {
        const sources = atlasSources(
          iflPath,
          entries.filter(({ frameCount }) => frameCount > 0),
        );
        entry.sources = sources;
        return buildFrames(sources, flags, assets, entry.priority);
      });
  const entry: AtlasEntry = {
    priority,
    sources: nextSources,
    pending: loading
      .then((frames) => {
        if (assets.disposed) {
          disposeIflFrames(frames);
          assets.signal.throwIfAborted();
        }
        entry.frames = frames;
        return frames;
      })
      .catch((error) => {
        if (atlasCache.get(key) === entry) atlasCache.delete(key);
        throw error;
      }),
  };
  atlasCache.set(key, entry);
  return entry.pending;
}

function shapeImageList(model: DTSModel, ifl: DTSIflMaterial) {
  const material = model.data.materials[ifl.materialSlot];
  if (!material || !(material.flags & DTSMaterialFlags.IflMaterial)) return;
  const name = model.data.names[ifl.nameIndex] || `${material.name}.ifl`;
  const path = `textures/${normalizePath(name).replace(/\.ifl$/i, "")}.ifl`;
  return { path, flags: material.flags };
}

/** An upcoming effect can need frames already queued by a background job. */
export function promoteShapeImageLists(model: DTSModel, assets: SceneAssets) {
  const cache = getIflCache(assets);
  for (const ifl of model.data.iflMaterials) {
    const list = shapeImageList(model, ifl);
    if (!list) continue;
    const entry = cache.get(iflKey(list.path, list.flags));
    if (entry) promoteIflAtlas(entry, assets);
  }
}

/** Publish into a shared list so clones made before decoding finishes receive
 * the frames too. No mesh traversal or per-instance loading is necessary. */
export async function loadShapeImageLists(
  model: DTSModel,
  assets: SceneAssets = sharedSceneAssets,
  priority: AssetLoadPriority = "demand",
): Promise<void> {
  // Clones share this array. Retrying a failed atlas must update the same list,
  // including successful lists from an earlier partial attempt.
  const animations = model.scene.imageAnimations as DTSImageAnimation[];
  const results = await Promise.allSettled(
    model.data.iflMaterials.map(async (ifl, iflIndex) => {
      const list = shapeImageList(model, ifl);
      if (!list) return;
      const frames = await loadIflAtlas(
        list.path,
        list.flags,
        assets,
        priority,
      );
      assets.signal.throwIfAborted();
      const animation = createDTSImageAnimation(model.data, iflIndex, frames);
      const index = animations.findIndex(
        (current) => current.iflIndex === iflIndex,
      );
      if (index === -1) animations.push(animation);
      else animations[index] = animation;
    }),
  );
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}
