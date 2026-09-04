/**
 * Builds `src/manifest.json` from an extracted game asset directory: the
 * resource index (every path across loose files and the unpacked VL2s,
 * with per-source casing), the mission list, and the shape mount-node
 * transforms the TorqueScript runtime needs before any GLB is loaded.
 */
import fs from "node:fs/promises";
import path from "node:path";
import orderBy from "lodash.orderby";
import ignore from "ignore";
import { normalizePath } from "@/src/stringUtils";
import { walkDirectory } from "@/src/fileUtils";
import { parseMissionScript } from "@/src/mission";
import type { MountTransformTable } from "@/src/manifest";
import { extractMountTransforms } from "./mounts";
import { parseGlbJson } from "./glb";

export type SourceTuple =
  // If casing of the path within this source is the same as "first seen" casing
  | [sourcePath: string]
  // If casing of the path within this source is different
  | [sourceName: string, actualPath: string];

/** Resource entry: [firstSeenActualPath, ...sourceTuples] */
export type ResourceEntry = [firstSeenActualPath: string, ...SourceTuple[]];

export interface MissionEntry {
  resourcePath: string;
  displayName: string | null;
  missionTypes: string[];
}

export interface Manifest {
  resources: Record<string, ResourceEntry>;
  missions: Record<string, MissionEntry>;
  /**
   * Mount-node transforms per shape, keyed by the lowercased .dts basename
   * (how datablock `shapeFile`s are looked up), taken from the winning
   * source's sibling .glb.
   */
  mounts: MountTransformTable;
}

export interface ManifestBuildResult {
  manifest: Manifest;
  /** .dts/.dif resources whose winning source has no .glb beside it. */
  missingGlbs: string[];
}

/**
 * Most files we're not interested in would have already been ignored by the
 * `extract-assets` script - but some extra files still may have popped up
 * from the host system, and derived files (.glb, .m4a) are resolved from
 * their source's entry rather than listed.
 */
const ignoreList = ignore().add(`
.DS_Store
*.glb
*.m4a
*.ogg
*.md
*.db
.gitattributes
.gitignore
`);

/**
 * The lowercased VL2 basename, which is all the engine's layering order
 * looks at: a path in a lexicographically-higher VL2 wins over the same
 * path outside a VL2 or in a lower one.
 */
export function archiveSortKey(archivePath: string): string {
  return path.basename(archivePath).toLowerCase();
}

/** The last (winning) source of a resource entry, with its actual path. */
export function winningSource(entry: ResourceEntry): {
  source: string;
  actualPath: string;
} {
  const [firstSeenPath, ...sourceTuples] = entry;
  const last = sourceTuples[sourceTuples.length - 1];
  return { source: last[0], actualPath: last[1] ?? firstSeenPath };
}

/** The on-disk location of a resource's winning source. */
export function resolveResourcePath(
  baseDir: string,
  entry: ResourceEntry,
): string {
  const { source, actualPath } = winningSource(entry);
  return source
    ? path.join(baseDir, "@vl2", source, actualPath)
    : path.join(baseDir, actualPath);
}

/**
 * Build the manifest for the given game asset directory. The assets used to
 * build the mapper are a filtered set of relevant files (map related assets)
 * from the `Tribes2/GameData/base` folder. The manifest consists of the set
 * of unique paths represented by the file tree AND the vl2 files as if they
 * had been unzipped. Keys are normalized (lowercased) paths for
 * case-insensitive lookup.
 *
 * Values are arrays where the first element is the first-seen casing of the
 * path, followed by source tuples. Each source tuple is either:
 * - [sourcePath] if the file has the same casing as firstSeenPath
 * - [sourcePath, actualPath] if the file has different casing in that source
 *
 * If the file appears outside of a vl2, the source path will be the empty
 * string. Each vl2 containing the file will then be listed in order. To
 * resolve an asset, the engine uses a layering approach where paths inside
 * lexicographically-higher vl2 files win over the same path outside of a vl2
 * or in a lexicographically-lower vl2 file. So, to choose the same final
 * asset as the engine, choose the last source in the list for any given
 * path.
 *
 * @example
 * ```
 * {
 *   "textures/terraintiles/green.png": [
 *     "textures/terrainTiles/green.png",
 *     ["textures.vl2"],
 *     ["otherTextures.vl2", "Textures/TerrainTiles/Green.PNG"]
 *   ]
 * }
 * ```
 */
export async function buildManifest({
  baseDir = "docs/base",
  onResource,
}: {
  baseDir?: string;
  /** Called per resource in key order, for progress logging. */
  onResource?: (resourceKey: string, entry: ResourceEntry) => void;
} = {}): Promise<ManifestBuildResult> {
  // Map from normalized (lowercased) path to [firstSeenActualPath, ...sourceTuples]
  const fileSources = new Map<string, ResourceEntry>();

  const addSource = (resourcePath: string, source: string) => {
    const normalizedKey = resourcePath.toLowerCase();
    const existing = fileSources.get(normalizedKey);
    if (existing) {
      const [firstSeenPath] = existing;
      if (resourcePath === firstSeenPath) {
        existing.push([source]);
      } else {
        existing.push([source, resourcePath]);
      }
    } else {
      fileSources.set(normalizedKey, [resourcePath, [source]]);
    }
  };

  const looseFiles: string[] = [];
  await walkDirectory(baseDir, {
    onFile: ({ entry }) => {
      const resourcePath = normalizePath(
        path.relative(baseDir, path.join(entry.parentPath, entry.name)),
      );
      if (!ignoreList.ignores(resourcePath)) {
        looseFiles.push(resourcePath);
      }
    },
    onDir: ({ entry }) => {
      return entry.name !== "@vl2";
    },
  });
  for (const resourcePath of looseFiles) addSource(resourcePath, "");

  let archiveDirs: string[] = [];
  await walkDirectory(`${baseDir}/@vl2`, {
    onFile: () => {},
    onDir: ({ entry }) => {
      if (/\.vl2$/i.test(entry.name)) {
        archiveDirs.push(path.join(entry.parentPath, entry.name));
      }
      return true;
    },
  });
  archiveDirs = orderBy(archiveDirs, [archiveSortKey], ["asc"]);

  for (const archivePath of archiveDirs) {
    const relativeArchivePath = normalizePath(
      path.relative(`${baseDir}/@vl2`, archivePath),
    );
    await walkDirectory(archivePath, {
      onFile: ({ entry }) => {
        const resourcePath = normalizePath(
          path.relative(archivePath, path.join(entry.parentPath, entry.name)),
        );
        if (!ignoreList.ignores(resourcePath)) {
          addSource(resourcePath, relativeArchivePath);
        }
      },
    });
  }

  const resources: Record<string, ResourceEntry> = {};
  const missions: Record<string, MissionEntry> = {};
  const mounts: MountTransformTable = {};
  const missingGlbs: string[] = [];

  for (const resourceKey of [...fileSources.keys()].sort()) {
    const entry = fileSources.get(resourceKey)!;
    resources[resourceKey] = entry;
    onResource?.(resourceKey, entry);
    const resolvedPath = resolveResourcePath(baseDir, entry);

    if (resourceKey.endsWith(".mis")) {
      const missionScript = await fs.readFile(resolvedPath, "utf8");
      const mission = parseMissionScript(missionScript);
      missions[path.basename(entry[0], ".mis")] = {
        resourcePath: resourceKey,
        displayName: mission.displayName,
        missionTypes: mission.missionTypes,
      };
    } else if (resourceKey.endsWith(".dts")) {
      const glbPath = resolvedPath.replace(/\.dts$/i, ".glb");
      let glb: Buffer;
      try {
        glb = await fs.readFile(glbPath);
      } catch {
        missingGlbs.push(resourceKey);
        continue;
      }
      const shapeMounts = extractMountTransforms(parseGlbJson(glb));
      if (shapeMounts) {
        // Keyed by basename: a later (higher-sorting) key wins when two
        // shape directories hold the same basename, matching the
        // resource sort order above.
        mounts[path.basename(resourceKey, ".dts")] = shapeMounts;
      }
    } else if (resourceKey.endsWith(".dif")) {
      try {
        await fs.access(resolvedPath.replace(/\.dif$/i, ".glb"));
      } catch {
        missingGlbs.push(resourceKey);
      }
    }
  }

  return { manifest: { resources, missions, mounts }, missingGlbs };
}

export function serializeManifest(manifest: Manifest): string {
  return JSON.stringify(manifest);
}
