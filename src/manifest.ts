import untypedManifest from "@/public/manifest.json";
import { normalizePath } from "./stringUtils";

// Source tuple: [sourcePath] or [sourcePath, actualPath] if casing differs
type SourceTuple = [string] | [string, string];
// Resource entry: [firstSeenPath, ...sourceTuples]
type ResourceEntry = [string, ...SourceTuple[]];

/**
 * Manifest format: keys are normalized (lowercased) paths, values are
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

function normalizeKey(resourcePath: string): string {
  return normalizePath(resourcePath).toLowerCase();
}

function getEntry(resourcePath: string): ResourceEntry | undefined {
  return manifest.resources[normalizeKey(resourcePath)];
}

/**
 * Get the source vl2 archive for a resource (or empty string for loose files).
 * Returns the last/winning source since later vl2s override earlier ones.
 */
export function getSource(resourcePath: string): string {
  const entry = getEntry(resourcePath);
  if (entry && entry.length > 1) {
    const lastSourceTuple = entry[entry.length - 1] as SourceTuple;
    return lastSourceTuple[0];
  } else {
    throw new Error(`Resource not found in manifest: ${resourcePath}`);
  }
}

/**
 * Get the actual resource path with its original casing as seen in the filesystem.
 * This handles case-insensitive lookups by normalizing the input path.
 */
export function getActualResourcePath(resourcePath: string): string {
  const entry = getEntry(resourcePath);
  if (entry) {
    return entry[0]; // First element is the first-seen casing
  }

  // Fallback: try stripping numeric suffixes (e.g., "generator0.png" -> "generator.png")
  const pathWithoutNumber = resourcePath.replace(/\d+(\.(png))$/i, "$1");
  if (pathWithoutNumber !== resourcePath) {
    const entryWithoutNumber = getEntry(pathWithoutNumber);
    if (entryWithoutNumber) {
      return entryWithoutNumber[0];
    }
  }

  // Fallback: try nested texture paths
  const normalized = normalizeKey(resourcePath);
  if (normalized.startsWith("textures/")) {
    for (const key of Object.keys(manifest.resources)) {
      const stripped = key.replace(
        /^(textures\/)((lush|desert|badlands|lava|ice|jaggedclaw|terraintiles)\/)/,
        "$1",
      );
      if (stripped === normalized) {
        return manifest.resources[key][0];
      }
    }
  }

  return resourcePath;
}

export function getResourceList(): string[] {
  return Object.keys(manifest.resources);
}

export function getFilePath(resourcePath: string): string {
  const entry = getEntry(resourcePath);
  if (!entry) {
    return `docs/base/${resourcePath}`;
  }
  const [firstSeenPath, ...sourceTuples] = entry;
  const lastSourceTuple = sourceTuples[sourceTuples.length - 1];
  const lastSource = lastSourceTuple[0];
  const actualPath = lastSourceTuple[1] ?? firstSeenPath;
  if (lastSource) {
    return `docs/base/@vl2/${lastSource}/${actualPath}`;
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

export function getMissionList() {
  return Object.keys(manifest.missions);
}
