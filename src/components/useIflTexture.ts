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
import { useTick } from "./TickProvider";
import { useSettings } from "./SettingsProvider";

interface IflAtlas {
  texture: CanvasTexture;
  columns: number;
  rows: number;
  frameCount: number;
  /** Tick at which each frame starts (cumulative). */
  frameStartTicks: number[];
  /** Total ticks for one complete animation cycle. */
  totalTicks: number;
  /** Last rendered frame index, to avoid redundant offset updates. */
  lastFrame: number;
}

// Module-level cache for atlas textures, shared across all components.
const atlasCache = new Map<string, IflAtlas>();

function createAtlas(textures: Texture[]): IflAtlas {
  const firstImage = textures[0].image as HTMLImageElement;
  const frameWidth = firstImage.width;
  const frameHeight = firstImage.height;
  const frameCount = textures.length;

  // Arrange frames in a roughly square grid.
  const columns = Math.ceil(Math.sqrt(frameCount));
  const rows = Math.ceil(frameCount / columns);

  const canvas = document.createElement("canvas");
  canvas.width = frameWidth * columns;
  canvas.height = frameHeight * rows;

  const ctx = canvas.getContext("2d")!;
  textures.forEach((tex, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    ctx.drawImage(tex.image as CanvasImageSource, col * frameWidth, row * frameHeight);
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
    frameCount,
    frameStartTicks: [],
    totalTicks: 0,
    lastFrame: -1,
  };
}

function computeTiming(
  atlas: IflAtlas,
  frames: { name: string; frameCount: number }[],
) {
  let totalTicks = 0;
  atlas.frameStartTicks = frames.map((frame) => {
    const start = totalTicks;
    totalTicks += frame.frameCount;
    return start;
  });
  atlas.totalTicks = totalTicks;
}

function updateAtlasFrame(atlas: IflAtlas, frameIndex: number) {
  if (frameIndex === atlas.lastFrame) return;
  atlas.lastFrame = frameIndex;

  const col = frameIndex % atlas.columns;
  // Flip row: canvas Y=0 is top, but texture V=0 is bottom.
  const row = atlas.rows - 1 - Math.floor(frameIndex / atlas.columns);
  atlas.texture.offset.set(col / atlas.columns, row / atlas.rows);
}

function getFrameIndexForTick(atlas: IflAtlas, tick: number): number {
  if (atlas.totalTicks === 0) return 0;

  const cycleTick = tick % atlas.totalTicks;
  const { frameStartTicks } = atlas;

  // Binary search would be faster for many frames, but linear is fine for typical IFLs.
  for (let i = frameStartTicks.length - 1; i >= 0; i--) {
    if (cycleTick >= frameStartTicks[i]) {
      return i;
    }
  }
  return 0;
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

  const textureUrls = useMemo(
    () => frames.map((frame) => iflTextureToUrl(frame.name, iflPath)),
    [frames, iflPath],
  );

  const textures = useTexture(textureUrls);

  const atlas = useMemo(() => {
    let cached = atlasCache.get(iflPath);
    if (!cached) {
      cached = createAtlas(textures);
      atlasCache.set(iflPath, cached);
    }
    computeTiming(cached, frames);
    return cached;
  }, [iflPath, textures, frames]);

  useTick((tick) => {
    const frameIndex = animationEnabled ? getFrameIndexForTick(atlas, tick) : 0;
    updateAtlasFrame(atlas, frameIndex);
  });

  return atlas.texture;
}
