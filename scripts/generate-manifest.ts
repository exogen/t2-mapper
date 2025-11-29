import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { Dirent } from "node:fs";
import orderBy from "lodash.orderby";
import { normalizePath } from "@/src/stringUtils";
import { parseMissionScript } from "@/src/mission";

const baseDir = process.env.BASE_DIR || "docs/base";

async function walkDirectory(
  dir: string,
  {
    onFile,
    onDir = () => true,
  }: {
    onFile: (fileInfo: {
      dir: string;
      entry: Dirent<string>;
      fullPath: string;
    }) => void | Promise<void>;
    onDir?: (dirInfo: {
      dir: string;
      entry: Dirent<string>;
      fullPath: string;
    }) => boolean | Promise<boolean>;
  },
): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const shouldRecurse = await onDir({ dir, entry, fullPath });
      if (shouldRecurse) {
        await walkDirectory(fullPath, { onFile, onDir });
      }
    } else if (entry.isFile()) {
      await onFile({ dir, entry, fullPath });
    }
  }
}

/**
 * Log and return the manifest of files for the given game asset directory.
 * The assets used to build the mapper are a filtered set of relevant files
 * (map related assets) from the `Tribes2/GameData/base` folder. The manifest
 * consists of the set of unique paths (case sensitive!) represented by the file
 * tree AND the vl2 files as if they had been unzipped. Thus, each file in the
 * manifest can have one or more "sources". If the file appears outside of a vl2,
 * it will have a blank source (the empty string) first. Each vl2 containing the
 * file will then be listed in order. To resolve an asset, the engine uses a
 * layering approach where paths inside lexicographically-higher vl2 files win
 * over the same path outside of a vl2 or in a lexicographically-lower vl2 file.
 * So, to choose the same final asset as the engine, choose the last source in
 * the list for any given path.
 *
 * Example:
 *
 * ```
 * {
 *   "textures/terrainTiles/green.png": ["textures.vl2"],
 *   "textures/lava/ds_iwal01a.png": [
 *     "lava.vl2",
 *     "yHDTextures2.0.vl2",
 *     "zAddOnsVL2s/zDiscord-Map-Pack-4.7.1.vl2"
 *   ]
 * }
 * ```
 */
async function buildManifest() {
  const fileSources = new Map<string, string[]>();

  const looseFiles: string[] = [];

  await walkDirectory(baseDir, {
    onFile: ({ fullPath }) => {
      looseFiles.push(normalizePath(fullPath));
    },
    onDir: ({ dir, entry, fullPath }) => {
      return entry.name !== "@vl2";
    },
  });

  for (const filePath of looseFiles) {
    const relativePath = normalizePath(path.relative(baseDir, filePath));
    fileSources.set(relativePath, [""]);
  }

  let archiveDirs: string[] = [];
  await walkDirectory(`${baseDir}/@vl2`, {
    onFile: () => {},
    onDir: ({ dir, entry, fullPath }) => {
      if (entry.name.endsWith(".vl2")) {
        archiveDirs.push(fullPath);
      }
      return true;
    },
  });

  archiveDirs = orderBy(
    archiveDirs,
    [(fullPath) => path.basename(fullPath).toLowerCase()],
    ["asc"],
  );

  for (const archivePath of archiveDirs) {
    const relativeArchivePath = normalizePath(
      path.relative(`${baseDir}/@vl2`, archivePath),
    );
    await walkDirectory(archivePath, {
      onFile: ({ dir, entry, fullPath }) => {
        const filePath = normalizePath(path.relative(archivePath, fullPath));
        const sources = fileSources.get(filePath) ?? [];
        sources.push(relativeArchivePath);
        fileSources.set(filePath, sources);
      },
    });
  }

  const resources: Record<string, string[]> = {};

  const missions: Record<
    string,
    { resourcePath: string; displayName: string | null; missionTypes: string[] }
  > = {};

  const orderedFiles = Array.from(fileSources.keys()).sort();
  for (const filePath of orderedFiles) {
    const sources = fileSources.get(filePath);
    resources[filePath] = sources;
    const lastSource = sources[sources.length - 1];

    console.log(
      `${filePath}${sources[0] ? ` 📦 ${sources[0]}` : ""}${
        sources.length > 1
          ? sources
              .slice(1)
              .map((source) => ` ❗️ ${source}`)
              .join("")
          : ""
      }`,
    );

    const resolvedPath = lastSource
      ? path.join(baseDir, "@vl2", lastSource, filePath)
      : path.join(baseDir, filePath);

    if (filePath.endsWith(".mis")) {
      const missionScript = await fs.readFile(resolvedPath, "utf8");
      const mission = parseMissionScript(missionScript);
      const baseName = path.basename(filePath, ".mis");
      missions[baseName] = {
        resourcePath: filePath,
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
