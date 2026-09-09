import {
  CanvasTexture,
  ClampToEdgeWrapping,
  NearestFilter,
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
import { DTSMaterialFlags } from "./dts/dtsTypes";
import { iflTextureToUrl, loadImageFrameList } from "./loaders";
import { loadTextureAsync } from "./textureUtils";
import { normalizePath } from "./stringUtils";

// Cache in-flight work too: simultaneous spawns must not build duplicate atlases.
const atlasCache = new Map<string, Promise<DTSImageFrames>>();
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

async function buildFrames(
  iflPath: string,
  flags: number,
): Promise<DTSImageFrames> {
  const entries = (await loadImageFrameList(iflPath)).filter(
    (e) => e.frameCount > 0,
  );
  if (!entries.length) return { frames: [], duration: 0 };
  const names = [...new Set(entries.map((entry) => entry.name))];
  const textures = await Promise.all(
    names.map((name) => loadTextureAsync(iflTextureToUrl(name, iflPath))),
  );
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
  const byName = new Map(names.map((name, i) => [name, frames[i]]));
  return createDTSImageFrames(entries, (name) => byName.get(name)!);
}

export function loadIflAtlas(
  iflPath: string,
  flags = 0,
): Promise<DTSImageFrames> {
  const key = `${normalizePath(iflPath).toLowerCase()}:${flags & samplerFlags}`;
  let pending = atlasCache.get(key);
  if (!pending) {
    pending = buildFrames(iflPath, flags).catch((error) => {
      atlasCache.delete(key);
      throw error;
    });
    atlasCache.set(key, pending);
  }
  return pending;
}

/** Publish into a shared list so clones made before decoding finishes receive
 * the frames too. No mesh traversal or per-instance loading is necessary. */
export async function loadShapeImageLists(model: DTSModel): Promise<void> {
  const animations: DTSImageAnimation[] = [];
  model.scene.imageAnimations = animations;
  await Promise.all(
    model.data.iflMaterials.map(async (ifl, iflIndex) => {
      const material = model.data.materials[ifl.materialSlot];
      if (!material || !(material.flags & DTSMaterialFlags.IflMaterial)) return;
      const name = model.data.names[ifl.nameIndex] || `${material.name}.ifl`;
      const path = `textures/${normalizePath(name).replace(/\.ifl$/i, "")}.ifl`;
      const frames = await loadIflAtlas(path, material.flags);
      animations.push(createDTSImageAnimation(model.data, iflIndex, frames));
    }),
  );
}
