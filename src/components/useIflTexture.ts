import { useMemo } from "react";
import { useTexture } from "@react-three/drei";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  CanvasTexture,
  ClampToEdgeWrapping,
  NearestFilter,
  SRGBColorSpace,
  Texture,
} from "three";
import { iflTextureToUrl, loadImageFrameList } from "../loaders";
import { loadTextureAsync } from "../textureUtils";
import { useTick, TICK_RATE } from "./TickProvider";
import { useSettings } from "./SettingsProvider";

/** One IFL tick in seconds (Torque converts at 1/30s per tick). */
export const IFL_TICK_SECONDS = 1 / 30;

export interface IflAtlas {
  texture: CanvasTexture;
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
export function updateAtlasFrame(atlas: IflAtlas, frameIndex: number) {
  const slot = atlas.frameToSlot[frameIndex] ?? 0;
  if (slot === atlas.lastSlot) return;
  atlas.lastSlot = slot;

  const col = slot % atlas.columns;
  // Flip row: canvas Y=0 is top, but texture V=0 is bottom.
  const row = atlas.rows - 1 - Math.floor(slot / atlas.columns);
  atlas.texture.offset.set(col / atlas.columns, row / atlas.rows);
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
export async function loadIflAtlas(iflPath: string): Promise<IflAtlas> {
  const cached = atlasCache.get(iflPath);
  if (cached) return cached;

  const frames = await loadImageFrameList(iflPath);
  const { uniqueNames, frameToSlot } = deduplicateFrames(frames);
  const urls = uniqueNames.map((name) => iflTextureToUrl(name, iflPath));
  const textures = await Promise.all(urls.map(loadTextureAsync));

  const atlas = createAtlas(textures, frameToSlot);
  computeTiming(atlas, frames);
  atlasCache.set(iflPath, atlas);

  return atlas;
}

/**
 * Loads an IFL (Image File List) and returns an animated texture.
 * The texture atlas is shared across all components using the same IFL path.
 */
export function useIflTexture(iflPath: string): Texture {
  const { animationEnabled } = useSettings();

  const { data: frames } = useSuspenseQuery({
    queryKey: ["ifl", iflPath],
    queryFn: () => loadImageFrameList(iflPath),
  });

  const { uniqueNames, frameToSlot } = useMemo(
    () => deduplicateFrames(frames),
    [frames],
  );

  const textureUrls = useMemo(
    () => uniqueNames.map((name) => iflTextureToUrl(name, iflPath)),
    [uniqueNames, iflPath],
  );

  const textures = useTexture(textureUrls);

  const atlas = useMemo(() => {
    let cached = atlasCache.get(iflPath);
    if (!cached) {
      cached = createAtlas(textures, frameToSlot);
      atlasCache.set(iflPath, cached);
    }
    computeTiming(cached, frames);
    return cached;
  }, [iflPath, textures, frames, frameToSlot]);

  useTick((tick) => {
    const time = tick / TICK_RATE;
    const frameIndex = animationEnabled ? getFrameIndexForTime(atlas, time) : 0;
    updateAtlasFrame(atlas, frameIndex);
  });

  return atlas.texture;
}
