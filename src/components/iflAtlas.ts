import {
  CanvasTexture,
  ClampToEdgeWrapping,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
} from "three";
import { iflTextureToUrl, loadImageFrameList } from "../loaders";
import { loadTextureAsync } from "../textureUtils";

/** One IFL tick in seconds (Torque converts at 1/30s per tick). */
export const IFL_TICK_SECONDS = 1 / 30;

export interface IflAtlas {
  texture: CanvasTexture | Texture;
  columns: number;
  rows: number;
  /** Number of unique image slots in the atlas grid. */
  slotCount: number;
  /**
   * Maps each IFL entry index to its atlas slot. Many entries may point to
   * the same slot since IFL files repeat images with different durations.
   */
  frameToSlot: number[];
  /** Cumulative end time (seconds) for each IFL entry. */
  frameOffsetSeconds: number[];
  /** Total IFL cycle duration in seconds. */
  totalDurationSeconds: number;
  /** Last rendered atlas slot, to avoid redundant offset updates. */
  lastSlot: number;
  /** When true, swap individual textures instead of atlas offsets (for RepeatWrapping). */
  swapMode?: boolean;
  /** Individual textures per unique frame (only set when swapMode=true). */
  frameTextures?: Texture[];
}

// Module-level cache for atlas textures, shared across all components.
const atlasCache = new Map<string, IflAtlas>();

/**
 * Deduplicate IFL frame entries by image name. Returns the list of unique
 * names and a mapping from each IFL entry index to its unique slot.
 */
function deduplicateFrames(frames: { name: string }[]): {
  uniqueNames: string[];
  frameToSlot: number[];
} {
  const nameToSlot = new Map<string, number>();
  const uniqueNames: string[] = [];
  const frameToSlot: number[] = [];
  for (const f of frames) {
    let slot = nameToSlot.get(f.name);
    if (slot === undefined) {
      slot = uniqueNames.length;
      nameToSlot.set(f.name, slot);
      uniqueNames.push(f.name);
    }
    frameToSlot.push(slot);
  }
  return { uniqueNames, frameToSlot };
}

/**
 * Build an atlas texture containing only the unique images. Each IFL entry
 * index maps to an atlas slot via `frameToSlot`.
 */
function createAtlas(
  uniqueTextures: Texture[],
  frameToSlot: number[],
): IflAtlas {
  if (uniqueTextures.length === 0) {
    throw new Error("Cannot create IFL atlas with no textures");
  }
  const firstImage = uniqueTextures[0].image as HTMLImageElement | ImageBitmap;
  const frameWidth = firstImage.width;
  const frameHeight = firstImage.height;
  const slotCount = uniqueTextures.length;

  // Arrange unique frames in a roughly square grid.
  const columns = Math.ceil(Math.sqrt(slotCount));
  const rows = Math.ceil(slotCount / columns);

  const canvas = document.createElement("canvas");
  canvas.width = frameWidth * columns;
  canvas.height = frameHeight * rows;

  const ctx = canvas.getContext("2d")!;
  uniqueTextures.forEach((tex, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    ctx.drawImage(
      tex.image as CanvasImageSource,
      col * frameWidth,
      row * frameHeight,
    );
  });

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.repeat.set(1 / columns, 1 / rows);

  return {
    texture,
    columns,
    rows,
    slotCount,
    frameToSlot,
    frameOffsetSeconds: [],
    totalDurationSeconds: 0,
    lastSlot: -1,
  };
}

/**
 * Create a swap-mode "atlas" for textures that need RepeatWrapping.
 * Instead of packing into a grid, stores individual textures and swaps
 * the material's map on each frame change.
 */
function createSwapAtlas(
  uniqueTextures: Texture[],
  frameToSlot: number[],
): IflAtlas {
  if (uniqueTextures.length === 0) {
    throw new Error("Cannot create IFL swap atlas with no textures");
  }
  // Set up each texture for repeat wrapping.
  for (const tex of uniqueTextures) {
    tex.wrapS = tex.wrapT = RepeatWrapping;
    tex.colorSpace = SRGBColorSpace;
    tex.flipY = false;
    tex.needsUpdate = true;
  }
  return {
    texture: uniqueTextures[0],
    columns: 1,
    rows: 1,
    slotCount: uniqueTextures.length,
    frameToSlot,
    frameOffsetSeconds: [],
    totalDurationSeconds: 0,
    lastSlot: -1,
    swapMode: true,
    frameTextures: uniqueTextures,
  };
}

function computeTiming(
  atlas: IflAtlas,
  frames: { name: string; frameCount: number }[],
) {
  let cumulativeSeconds = 0;
  atlas.frameOffsetSeconds = frames.map((frame) => {
    cumulativeSeconds += frame.frameCount * IFL_TICK_SECONDS;
    return cumulativeSeconds;
  });
  atlas.totalDurationSeconds = cumulativeSeconds;
}

/**
 * Set the atlas texture offset to show the image for the given IFL entry.
 * Uses `frameToSlot` to map the entry index to the atlas grid position.
 */
/**
 * Update the atlas to show the given frame. In atlas mode, adjusts texture
 * offset. In swap mode, updates `atlas.texture` to the frame's texture
 * (caller must apply it to the material's .map).
 * Returns true if the texture changed (swap mode only — caller needs to
 * update material.map).
 */
export function updateAtlasFrame(atlas: IflAtlas, frameIndex: number): boolean {
  const slot = atlas.frameToSlot[frameIndex] ?? 0;
  if (slot === atlas.lastSlot) return false;
  atlas.lastSlot = slot;

  if (atlas.swapMode && atlas.frameTextures) {
    atlas.texture = atlas.frameTextures[slot] ?? atlas.frameTextures[0];
    return true;
  }

  const col = slot % atlas.columns;
  // Flip row: canvas Y=0 is top, but texture V=0 is bottom.
  const row = atlas.rows - 1 - Math.floor(slot / atlas.columns);
  atlas.texture.offset.set(col / atlas.columns, row / atlas.rows);
  return false;
}

/**
 * Find the IFL entry index for a given time in seconds. Matches Torque's
 * `animateIfls()` lookup using cumulative `iflFrameOffTimes`.
 */
export function getFrameIndexForTime(atlas: IflAtlas, seconds: number): number {
  const dur = atlas.totalDurationSeconds;
  if (dur <= 0) return 0;
  let t = seconds;
  if (t > dur) t -= dur * Math.floor(t / dur);
  for (let i = 0; i < atlas.frameOffsetSeconds.length; i++) {
    if (t <= atlas.frameOffsetSeconds[i]) return i;
  }
  return atlas.frameOffsetSeconds.length - 1;
}

/**
 * Imperatively load an IFL atlas (all unique frames). Returns a cached atlas
 * if the same IFL has been loaded before. The returned atlas can be animated
 * per-frame with `updateAtlasFrame` + `getFrameIndexForTime`.
 */
export async function loadIflAtlas(
  iflPath: string,
  options?: { repeat?: boolean },
): Promise<IflAtlas> {
  const cacheKey = options?.repeat ? `${iflPath}:repeat` : iflPath;
  const cached = atlasCache.get(cacheKey);
  if (cached) return cached;

  const frames = await loadImageFrameList(iflPath);
  const { uniqueNames, frameToSlot } = deduplicateFrames(frames);
  const urls = uniqueNames.map((name) => iflTextureToUrl(name, iflPath));
  const textures = await Promise.all(urls.map(loadTextureAsync));

  // Use swap mode for repeating textures (atlas ClampToEdge breaks tiling).
  const atlas = options?.repeat
    ? createSwapAtlas(textures, frameToSlot)
    : createAtlas(textures, frameToSlot);
  computeTiming(atlas, frames);
  atlasCache.set(cacheKey, atlas);

  return atlas;
}
