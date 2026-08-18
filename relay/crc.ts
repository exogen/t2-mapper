import fs from "node:fs/promises";
import path from "node:path";
import { crcLog } from "./logger.js";

// CRC-32 lookup table (reflected polynomial 0xEDB88320)
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let crc = i;
  for (let j = 0; j < 8; j++) {
    crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  crcTable[i] = crc;
}

/**
 * Raw CRC-32 over a buffer, continuing from an initial value.
 * Tribes 2 uses raw CRC (no XOR-in/XOR-out) — verified against
 * decompiled FUN_004411b0 in Tribes2.exe.
 */
function crc32(data: Uint8Array, initial = 0): number {
  let crc = initial;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xff];
  }
  return crc >>> 0;
}

/**
 * Classes that derive from ShapeBaseData in Tribes 2.
 * Determined by which DataBlockParser unpack functions call shapeBaseDataUnpack.
 */
const SHAPE_BASE_DATA_CLASSES = new Set([
  "ShapeBaseData",
  "PlayerData",
  "VehicleData",
  "FlyingVehicleData",
  "HoverVehicleData",
  "WheeledVehicleData",
  "StaticShapeData",
  "TurretData",
  "ItemData",
  "CameraData",
  "MissionMarkerData",
]);

export interface CRCDataBlock {
  objectId: number;
  className: string;
  shapeName: string;
}

// Manifest types (mirrored from src/manifest.ts)
type SourceTuple =
  [sourcePath: string] | [sourcePath: string, actualPath: string];
type ResourceEntry = [firstSeenPath: string, ...SourceTuple[]];
interface Manifest {
  resources: Record<string, ResourceEntry>;
}

let cachedManifest: Manifest | null = null;

/** In-memory cache of shape file bytes, keyed by resolved local path. */
const fileCache = new Map<string, Uint8Array>();

/**
 * Path to manifest.json. Defaults to `src/manifest.json` relative to the
 * project root, but can be overridden via `MANIFEST_PATH` env var for
 * deployment outside the monorepo layout.
 */
async function loadManifest(basePath: string): Promise<Manifest> {
  if (cachedManifest) return cachedManifest;
  const manifestPath =
    process.env.MANIFEST_PATH ||
    path.join(basePath, "..", "..", "src", "manifest.json");
  const raw = await fs.readFile(manifestPath, "utf-8");
  cachedManifest = JSON.parse(raw) as Manifest;
  return cachedManifest;
}

/** Resolve a game resource path to a local file path using the manifest. */
async function resolveGameFile(
  resourcePath: string,
  basePath: string,
): Promise<string | null> {
  const manifest = await loadManifest(basePath);
  const key = resourcePath.toLowerCase().replace(/\\/g, "/");
  const entry = manifest.resources[key];
  if (!entry) return null;
  const [firstSeenPath, ...sources] = entry;
  const [sourcePath, actualPath] = sources[sources.length - 1];
  if (sourcePath) {
    return path.join(basePath, "@vl2", sourcePath, actualPath ?? firstSeenPath);
  }
  return path.join(basePath, actualPath ?? firstSeenPath);
}

/**
 * Compute the game CRC matching Tribes 2's FUN_00440580.
 *
 * Algorithm:
 * 1. Start with seed as initial CRC value
 * 2. For each ShapeBaseData datablock (sorted by objectId):
 *    - CRC-32 the shape file ("shapes/<shapeName>"), using running CRC
 *    - Accumulate file size
 *    - If includeTextures and not PlayerData: also CRC texture files
 * 3. Final: crc += totalSize
 */
export async function computeGameCRC(
  seed: number,
  datablocks: CRCDataBlock[],
  basePath: string,
  includeTextures = false,
): Promise<{ crc: number; totalSize: number }> {
  // Sort by objectId to match the binary's iteration order (0-2047)
  const sorted = [...datablocks]
    .filter((db) => SHAPE_BASE_DATA_CLASSES.has(db.className) && db.shapeName)
    .sort((a, b) => a.objectId - b.objectId);

  let crc = seed;
  let totalSize = 0;
  let filesFound = 0;
  let filesMissing = 0;

  const startTime = performance.now();

  crcLog.info(
    {
      seed: `0x${(seed >>> 0).toString(16)}`,
      shapeDataBlocks: sorted.length,
      totalDataBlocks: datablocks.length,
      includeTextures,
    },
    "Starting CRC computation",
  );

  for (const db of sorted) {
    const shapePath = `shapes/${db.shapeName}`;
    const localPath = await resolveGameFile(shapePath, basePath);
    if (!localPath) {
      crcLog.warn(
        { objectId: db.objectId, className: db.className, shape: db.shapeName },
        "Skipping datablock — shape not found in manifest",
      );
      filesMissing++;
      continue;
    }

    let data = fileCache.get(localPath);
    if (data) {
      crcLog.trace({ localPath }, "Cache hit");
    } else {
      crcLog.trace({ localPath }, "Cache miss, reading file");
      try {
        data = new Uint8Array(await fs.readFile(localPath));
        fileCache.set(localPath, data);
      } catch {
        crcLog.warn(
          {
            objectId: db.objectId,
            className: db.className,
            shape: db.shapeName,
          },
          "Skipping datablock — file read failed",
        );
        filesMissing++;
        continue;
      }
    }

    const prevCrc = crc;
    crc = crc32(data, crc);
    totalSize += data.length;
    filesFound++;

    crcLog.trace(
      {
        n: filesFound,
        objectId: db.objectId,
        className: db.className,
        shape: db.shapeName,
        size: data.length,
        crc: `0x${prevCrc.toString(16)}→0x${crc.toString(16)}`,
      },
      "CRC'd shape file",
    );

    // TODO: If includeTextures && db.className !== "PlayerData",
    // parse the DTS to enumerate textures and CRC each
    // textures/<name>.png and textures/<name>.bm8 file.
    // Most servers don't enable $Host::CRCTextures, so this is deferred.
    if (includeTextures && db.className !== "PlayerData") {
      // Texture CRC not yet implemented — would need DTS parsing
      // to enumerate material textures for each shape.
    }
  }

  crc = (crc + totalSize) >>> 0;

  const elapsed = performance.now() - startTime;

  const cacheSizeBytes = [...fileCache.values()].reduce(
    (sum, buf) => sum + buf.length,
    0,
  );
  crcLog.info(
    {
      filesFound,
      filesMissing,
      crc: `0x${crc.toString(16)}`,
      totalSize,
      elapsedMs: Math.round(elapsed),
      cacheFiles: fileCache.size,
      cacheKB: Math.round(cacheSizeBytes / 1024),
    },
    "CRC computation complete",
  );

  return { crc, totalSize };
}
