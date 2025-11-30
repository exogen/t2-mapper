import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import orderBy from "lodash.orderby";
import ignore from "ignore";
import { normalizePath } from "@/src/stringUtils";
import { walkDirectory } from "@/src/fileUtils";
import { parseMissionScript } from "@/src/mission";

const baseDir = process.env.BASE_DIR || "docs/base";

// Most files we're not interested in would have already been ignored by the
// `extract-assets` script - but some extra files still may have popped up from
// the host sytem.
const ignoreList = ignore().add(`
.DS_Store
`);

type SourceTuple =
  // If casing of the path within this source is the same as "first seen" casing
  | [sourcePath: string]
  // If casing of the path within this source is different
  | [sourceName: string, actualPath: string];

// Resource entry: [firstSeenActualPath, ...sourceTuples]
type ResourceEntry = [firstSeenActualPath: string, ...SourceTuple[]];

/**
 * Log and return the manifest of files for the given game asset directory.
 * The assets used to build the mapper are a filtered set of relevant files
 * (map related assets) from the `Tribes2/GameData/base` folder. The manifest
 * consists of the set of unique paths represented by the file tree AND the vl2
 * files as if they had been unzipped. Keys are normalized (lowercased) paths
 * for case-insensitive lookup.
 *
 * Values are arrays where the first element is the first-seen casing of the
 * path, followed by source tuples. Each source tuple is either:
 * - [sourcePath] if the file has the same casing as firstSeenPath
 * - [sourcePath, actualPath] if the file has different casing in that source
 *
 * If the file appears outside of a vl2, the source path will be the empty
 * string. Each vl2 containing the file will then be listed in order. To resolve
 * an asset, the engine uses a layering approach where paths inside
 * lexicographically-higher vl2 files win over the same path outside of a vl2
 * or in a lexicographically-lower vl2 file. So, to choose the same final asset
 * as the engine, choose the last source in the list for any given path.
 *
 * Example:
 *
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
async function buildManifest() {
  // Map from normalized (lowercased) path to [firstSeenActualPath, ...sourceTuples]
  const fileSources = new Map<string, ResourceEntry>();

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

  for (const resourcePath of looseFiles) {
    const normalizedKey = resourcePath.toLowerCase();
    const existing = fileSources.get(normalizedKey);
    if (existing) {
      const [firstSeenPath] = existing;
      if (resourcePath === firstSeenPath) {
        existing.push([""]);
      } else {
        existing.push(["", resourcePath]);
      }
    } else {
      fileSources.set(normalizedKey, [resourcePath, [""]]);
    }
  }

  let archiveDirs: string[] = [];
  await walkDirectory(`${baseDir}/@vl2`, {
    onFile: () => {},
    onDir: ({ entry }) => {
      if (/\.vl2$/i.test(entry.name)) {
        const archivePath = path.join(entry.parentPath, entry.name);
        archiveDirs.push(archivePath);
      }
      return true;
    },
  });

  archiveDirs = orderBy(
    archiveDirs,
    [(archivePath) => path.basename(archivePath).toLowerCase()],
    ["asc"],
  );

  for (const archivePath of archiveDirs) {
    const relativeArchivePath = normalizePath(
      path.relative(`${baseDir}/@vl2`, archivePath),
    );
    await walkDirectory(archivePath, {
      onFile: ({ entry }) => {
        const resourcePath = normalizePath(
          path.relative(archivePath, path.join(entry.parentPath, entry.name)),
        );
        if (ignoreList.ignores(resourcePath)) {
          return;
        }
        const normalizedKey = resourcePath.toLowerCase();
        const existing = fileSources.get(normalizedKey);
        if (existing) {
          const [firstSeenPath] = existing;
          if (resourcePath === firstSeenPath) {
            existing.push([relativeArchivePath]);
          } else {
            existing.push([relativeArchivePath, resourcePath]);
          }
        } else {
          fileSources.set(normalizedKey, [resourcePath, [relativeArchivePath]]);
        }
      },
    });
  }

  const resources: Record<string, ResourceEntry> = {};

  const missions: Record<
    string,
    { resourcePath: string; displayName: string | null; missionTypes: string[] }
  > = {};

  const sortedResourceKeys = Array.from(fileSources.keys()).sort();

  for (const resourceKey of sortedResourceKeys) {
    const entry = fileSources.get(resourceKey)!;
    resources[resourceKey] = entry;
    const [firstSeenPath, ...sourceTuples] = entry;
    const lastSourceTuple = sourceTuples[sourceTuples.length - 1];
    const lastSource = lastSourceTuple[0];
    const lastActualPath = lastSourceTuple[1] ?? firstSeenPath;

    console.log(
      `${firstSeenPath}${sourceTuples[0][0] ? ` 📦 ${sourceTuples[0][0]}` : ""}${
        sourceTuples.length > 1
          ? sourceTuples
              .slice(1)
              .map((tuple) => ` ❗️ ${tuple[0]}`)
              .join("")
          : ""
      }`,
    );

    const resolvedPath = lastSource
      ? path.join(baseDir, "@vl2", lastSource, lastActualPath)
      : path.join(baseDir, lastActualPath);

    if (resourceKey.endsWith(".mis")) {
      const missionScript = await fs.readFile(resolvedPath, "utf8");
      const mission = parseMissionScript(missionScript);
      const baseName = path.basename(firstSeenPath, ".mis");
      missions[baseName] = {
        resourcePath: resourceKey,
        displayName: mission.displayName,
        missionTypes: mission.missionTypes,
      };
    }
  }

  return { resources, missions };
}

const { values } = parseArgs({
  options: {
    output: {
      type: "string",
      short: "o",
    },
  },
});

const manifest = await buildManifest();

if (values.output) {
  await fs.writeFile(values.output, JSON.stringify(manifest), "utf8");
}
