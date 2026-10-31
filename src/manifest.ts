import untypedManifest from "./manifest.json";
import {
  ASSET_BASE_DIR,
  winningSource,
  winningSourcePath,
  type ResourceEntry,
} from "./resourcePaths";
import { normalizePath } from "./stringUtils";

/**
 * Manifest format: keys are normalized (lowercased, forward-slash) paths,
 * values are ResourceEntry arrays (see `./resourcePaths`):
 * [firstSeenPath, ...sourceTuples] where each source tuple is either:
 * - [sourcePath] if the file has the same casing as firstSeenPath
 * - [sourcePath, actualPath] if the file has different casing in that source
 */
const manifest = untypedManifest as unknown as {
  resources: Record<string, ResourceEntry>;
  missions: Record<
    string,
    {
      resourcePath: string;
      displayName: string | null;
      missionTypes: string[];
    }
  >;
  mounts: MountTransformTable;
};

export interface MountTransform {
  /** Entity-local Three.js space. */
  position: number[];
  /** Quaternion [x, y, z, w], entity-local Three.js space. */
  rotation: number[];
}

/**
 * Mount-node transforms per shape (lowercased .dts basename → lowercased
 * node name), from the winning source's DTS. See scripts/lib/mounts.ts.
 */
export type MountTransformTable = Record<
  string,
  Record<string, MountTransform>
>;

export function getMountTransforms(): MountTransformTable {
  return manifest.mounts;
}

export function getResourceKey(resourcePath: string): string {
  return normalizePath(resourcePath).toLowerCase();
}

export function getResourceMap() {
  return manifest.resources;
}

/**
 * Get the source vl2 archive for a resource (or empty string for loose files).
 * Returns the last/winning source since later vl2s override earlier ones.
 */
export function getSourceAndPath(
  resourceKey: string,
): [sourceName: string, pathInSource: string] {
  const { source, actualPath } = winningSource(manifest.resources[resourceKey]);
  return [source, actualPath];
}

/**
 * Where a resource's winning source lives, relative to the asset root:
 * `@vl2/<source>/<path>` inside a VL2, `<path>` for a loose file.
 */
export function getWinningSourcePath(resourceKey: string): string {
  return winningSourcePath(manifest.resources[resourceKey]);
}

/**
 * Given a file path, check the manifest for an exact match (but case insensitive),
 * followed by removing numeric suffixes and certain intermediate directories.
 * Return the normalized resource path that was found.
 *
 * FIXME: Figure out how T2/Torque actually resolves these.
 */
export function getActualResourceKey(resourcePath: string): string {
  const resourceKey = getResourceKey(resourcePath);

  if (manifest.resources[resourceKey]) {
    return resourceKey;
  }

  // Fallback: try stripping numeric suffixes (e.g., "generator0.png" -> "generator.png")
  const keyWithoutNumber = resourceKey.replace(/\d+(\.(png))$/i, "$1");
  if (manifest.resources[keyWithoutNumber]) {
    return keyWithoutNumber;
  }

  // // Fallback: try nested texture paths
  // if (resourcePath.startsWith("textures/")) {
  //   for (const key of getResourceList()) {
  //     const stripped = key.replace(
  //       /^(textures\/)((lush|desert|badlands|lava|ice|jaggedclaw|terraintiles)\/)/,
  //       "$1",
  //     );
  //     if (stripped === normalized) {
  //       return manifest.resources[key][0];
  //     }
  //   }
  // }

  throw new Error(`Resource not found in manifest: ${resourcePath}`);
}

export function getResourceList(): string[] {
  return Object.keys(manifest.resources);
}

/**
 * Standard texture file extension loading order:
 *
 * 1. "" (no extension - exact filename match)
 * 2. .jpg
 * 3. .png
 * 4. .gif
 * 5. .bmp
 */
const standardTextureExt = ["", ".jpg", ".png", ".gif", ".bmp"];

export function getStandardTextureResourceKey(resourcePath: string) {
  const baseResourceKey = getResourceKey(resourcePath);
  for (const ext of standardTextureExt) {
    const resourceKey = `${baseResourceKey}${ext}`;
    if (manifest.resources[resourceKey]) {
      return resourceKey;
    }
  }
  return baseResourceKey;
}

/**
 * Paletted texture file extension loading order:
 *
 * 1. "" (no extension - exact filename match)
 * 2. .bm8
 * 3. .bmp
 * 4. .jpg
 * 5. .png
 * 6. .gif
 */
// Not used for now!
// const palettedTextureExt = ["", ".bm8", ".bmp", ".jpg", ".png", ".gif"];

export function getLocalFilePath(resourcePath: string): string {
  return `${ASSET_BASE_DIR}/${getWinningSourcePath(getResourceKey(resourcePath))}`;
}

export function getMissionInfo(missionName: string) {
  const missionInfo = manifest.missions[missionName];
  if (!missionInfo) {
    throw new Error(`Mission not found: ${missionName}`);
  }
  return missionInfo;
}

export function hasMission(missionName: string): boolean {
  return missionName in manifest.missions;
}

const missionsByLowerName = new Map(
  Object.keys(manifest.missions).map((key) => [key.toLowerCase(), key]),
);

/**
 * Case-insensitive mission lookup — mission names from the network and
 * demo files are often lowercased (Torque file names are
 * case-insensitive), while manifest keys preserve the original casing.
 */
export function findMissionInfo(
  missionName: string,
): (typeof manifest.missions)[string] | undefined {
  const key = missionsByLowerName.get(missionName.toLowerCase());
  return key ? manifest.missions[key] : undefined;
}

export function getMissionList() {
  return Object.keys(manifest.missions);
}
