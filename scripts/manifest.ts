import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import unzipper from "unzipper";
import { normalizePath } from "@/src/stringUtils";

const archiveFilePattern = /\.vl2$/i;

const baseDir = "rawGameData/base";

function isArchive(name: string) {
  return archiveFilePattern.test(name);
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
  const archiveFiles: string[] = [];
  for await (const entry of fs.glob(`${baseDir}/**/*`, {
    withFileTypes: true,
  })) {
    if (entry.isFile()) {
      const fullPath = normalizePath(`${entry.parentPath}/${entry.name}`);
      if (isArchive(entry.name)) {
        archiveFiles.push(fullPath);
      } else {
        looseFiles.push(fullPath);
      }
    }
  }

  for (const filePath of looseFiles) {
    const relativePath = normalizePath(path.relative(baseDir, filePath));
    fileSources.set(relativePath, [""]);
  }

  archiveFiles.sort();
  for (const archivePath of archiveFiles) {
    const relativePath = normalizePath(path.relative(baseDir, archivePath));
    const archive = await unzipper.Open.file(archivePath);
    for (const archiveEntry of archive.files) {
      if (archiveEntry.type === "File") {
        const filePath = normalizePath(archiveEntry.path);
        const sources = fileSources.get(filePath) ?? [];
        sources.push(relativePath);
        fileSources.set(filePath, sources);
      }
    }
  }

  const manifest: Record<string, string[]> = {};

  const orderedFiles = Array.from(fileSources.keys()).sort();
  for (const filePath of orderedFiles) {
    const sources = fileSources.get(filePath);
    manifest[filePath] = sources;
    console.log(
      `${filePath}${sources[0] ? ` 📦 ${sources[0]}` : ""}${
        sources.length > 1
          ? sources
              .slice(1)
              .map((source) => ` ❗️ ${source}`)
              .join("")
          : ""
      }`
    );
  }

  return manifest;
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
