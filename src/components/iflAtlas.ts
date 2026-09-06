import {
  CanvasTexture,
  ClampToEdgeWrapping,
  NearestFilter,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
} from "three";
import type { Material, Mesh, Object3D } from "three";
import { iflTextureToUrl, loadImageFrameList } from "../loaders";
import { loadTextureAsync } from "../textureUtils";

/** One IFL tick in seconds (Torque converts at 1/30s per tick). */
const IFL_TICK_SECONDS = 1 / 30;

interface IflAtlas {
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
    if (tex.image) {
      tex.needsUpdate = true;
    }
  }
  return {
    texture: uniqueTextures[0],
    columns: 1,
    rows: 1,
    slotCount: uniqueTextures.length,
    frameToSlot,
    frameOffsetSeconds: [],
    totalDurationSeconds: 0,
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
 * A texture for one consumer of the atlas. Atlas mode shares the image and
 * GPU upload (the Source) but owns its offset — the offset IS the current
 * frame, and every shape animating the same IFL through one texture
 * overwrote the others' frame each render (a mortar's three sub-explosions
 * at three play speeds visibly thrashed). Built by hand rather than with
 * Texture.clone(): copy() sets needsUpdate, which bumps the shared Source's
 * version and re-uploads the whole atlas for every consumer on each spawn.
 * Swap mode already keeps one texture per frame; it returns the first.
 */
export function createAtlasInstance(atlas: IflAtlas): Texture {
  if (atlas.swapMode && atlas.frameTextures) return atlas.frameTextures[0];
  const src = atlas.texture;
  const tex = new Texture();
  tex.source = src.source;
  tex.colorSpace = src.colorSpace;
  tex.generateMipmaps = src.generateMipmaps;
  tex.minFilter = src.minFilter;
  tex.magFilter = src.magFilter;
  tex.wrapS = src.wrapS;
  tex.wrapT = src.wrapT;
  tex.flipY = src.flipY;
  tex.repeat.copy(src.repeat);
  // Registers with the renderer (version > 0) without touching the Source.
  tex.version = 1;
  return tex;
}

/**
 * Show IFL entry `frameIndex` on an instance texture from
 * createAtlasInstance. Returns the texture the material must map — a
 * different object only in swap mode.
 */
export function applyAtlasFrame(
  atlas: IflAtlas,
  texture: Texture,
  frameIndex: number,
): Texture {
  const slot = atlas.frameToSlot[frameIndex] ?? 0;
  if (atlas.swapMode && atlas.frameTextures) {
    return atlas.frameTextures[slot] ?? atlas.frameTextures[0];
  }
  const col = slot % atlas.columns;
  // Flip row: canvas Y=0 is top, but texture V=0 is bottom.
  const row = atlas.rows - 1 - Math.floor(slot / atlas.columns);
  texture.offset.set(col / atlas.columns, row / atlas.rows);
  return texture;
}

/** An IFL-textured mesh found in a converted DTS, before its materials are
 *  replaced (processShapeScene drops the userData this reads). */
export interface IflMeshInfo {
  mesh: Mesh;
  iflPath: string;
  /** SWrap/TWrap: the texture tiles, which an atlas cannot (swap mode). */
  repeat: boolean;
  /** Set when a sequence's ifl_matters drives this material's frame. */
  sequenceName?: string;
  /** That sequence's duration in seconds. */
  duration?: number;
  cyclic?: boolean;
  /** Torque `toolBegin`: offset into the IFL timeline (seconds). */
  toolBegin?: number;
  /** The mesh also carries a vis (opacity) track, a separate system. */
  hasVisSequence: boolean;
}

/** Collect IFL meshes from a cloned shape scene. Call BEFORE processShapeScene. */
export function collectIflMeshes(scene: Object3D): IflMeshInfo[] {
  const infos: IflMeshInfo[] = [];
  scene.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const flags = new Set<string>(mat?.userData?.flag_names ?? []);
    const rp: string | undefined = mat?.userData?.resource_path;
    if (!flags.has("IflMaterial") || !rp) return;
    const ud = mesh.userData;
    // ifl_sequence is the controlling sequence; vis_sequence is the
    // independent opacity track and must not stand in for it.
    const driven = !!ud?.ifl_sequence;
    infos.push({
      mesh,
      iflPath: `textures/${rp}.ifl`,
      repeat: flags.has("SWrap") || flags.has("TWrap"),
      sequenceName: driven ? String(ud.ifl_sequence).toLowerCase() : undefined,
      duration: ud?.ifl_duration ? Number(ud.ifl_duration) : undefined,
      cyclic: driven ? !!ud.ifl_cyclic : undefined,
      toolBegin:
        ud?.ifl_tool_begin != null ? Number(ud.ifl_tool_begin) : undefined,
      hasVisSequence: !!ud?.vis_sequence,
    });
  });
  return infos;
}

type MappedMaterial = Material & { map?: Texture | null };

/** One mesh's live IFL: its atlas, its own texture, and the material to map. */
export interface IflMaterialInstance {
  atlas: IflAtlas;
  texture: Texture;
  material: MappedMaterial;
  info: IflMeshInfo;
}

/**
 * Load the atlas for an IFL mesh and map the mesh's (already replaced)
 * material to a fresh instance texture. Null when the mesh has no material.
 */
export async function loadIflMaterialInstance(
  info: IflMeshInfo,
): Promise<IflMaterialInstance | null> {
  const atlas = await loadIflAtlas(info.iflPath, { repeat: info.repeat });
  const material = (
    Array.isArray(info.mesh.material)
      ? info.mesh.material[0]
      : info.mesh.material
  ) as MappedMaterial | undefined;
  if (!material) return null;
  const texture = createAtlasInstance(atlas);
  material.map = texture;
  material.needsUpdate = true;
  return { atlas, texture, material, info };
}

/**
 * Where a sequence-driven IFL is at `threadSec` into its controlling
 * sequence — Torque's animateIfls (tsAnimate.cc): pos wraps [0,1) when
 * cyclic, clamps to [0,1] otherwise; time = pos × duration + toolBegin. A
 * non-cyclic sequence must hold its last frame, so its time is also clamped
 * to the IFL's own length (the DTS duration carries float noise above the
 * frame sum, and the lookup wraps past it). An IFL with no controlling
 * sequence free-runs on the thread time.
 */
export function iflSequenceTime(
  info: IflMeshInfo,
  atlas: IflAtlas,
  threadSec: number,
): number {
  if (!info.duration) return threadSec;
  const pos = info.cyclic
    ? (threadSec / info.duration) % 1
    : Math.min(threadSec / info.duration, 1);
  const time = pos * info.duration + (info.toolBegin ?? 0);
  return info.cyclic ? time : Math.min(time, atlas.totalDurationSeconds);
}

/** Show the IFL frame for `iflTime` seconds on a material instance. */
export function showIflFrame(inst: IflMaterialInstance, iflTime: number): void {
  const frame = applyAtlasFrame(
    inst.atlas,
    inst.texture,
    getFrameIndexForTime(inst.atlas, iflTime),
  );
  if (inst.material.map !== frame) {
    inst.material.map = frame;
    inst.material.needsUpdate = true;
  }
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
 * per-frame with `createAtlasInstance` + `applyAtlasFrame` + `getFrameIndexForTime`.
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
