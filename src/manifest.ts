import untypedManifest from "./manifest.json";
import { normalizePath } from "./stringUtils";

// Source tuple: [sourcePath] or [sourcePath, actualPath] if casing differs
type SourceTuple =
  [sourcePath: string] | [sourcePath: string, actualPath: string];
// Resource entry: [firstSeenPath, ...sourceTuples]
type ResourceEntry = [firstSeenPath: string, ...SourceTuple[]];

/**
 * Manifest format: keys are normalized (lowercased, forward-slash) paths,
 * values are ResourceEntry arrays (see above):
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
};

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
  const entry = manifest.resources[resourceKey];
  const [firstSeenPath, ...sources] = entry;
  const [sourcePath, actualPath] = sources[sources.length - 1];
  return [sourcePath, actualPath ?? firstSeenPath];
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
  const resourceKey = getResourceKey(resourcePath);
  const [sourcePath, actualPath] = getSourceAndPath(resourceKey);
  if (sourcePath) {
    return `docs/base/@vl2/${sourcePath}/${actualPath}`;
  } else {
    return `docs/base/${actualPath}`;
  }
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

export function getMissionList() {
  return Object.keys(manifest.missions);
}
