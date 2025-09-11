import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import unzipper from "unzipper";
import { normalize } from "@/src/stringUtils";

const archiveFilePattern = /\.vl2$/i;

const baseDir = "rawGameData/base";

function isArchive(name: string) {
  return archiveFilePattern.test(name);
}

async function buildManifest() {
  const fileSources = new Map<string, string[]>();

  const looseFiles: string[] = [];
  const archiveFiles: string[] = [];
  for await (const entry of fs.glob(`${baseDir}/**/*`, {
    withFileTypes: true,
  })) {
    if (entry.isFile()) {
      const fullPath = normalize(`${entry.parentPath}/${entry.name}`);
      if (isArchive(entry.name)) {
        archiveFiles.push(fullPath);
      } else {
        looseFiles.push(fullPath);
      }
    }
  }

  for (const filePath of looseFiles) {
    const relativePath = normalize(path.relative(baseDir, filePath));
    fileSources.set(relativePath, [""]);
  }

  archiveFiles.sort();
  for (const archivePath of archiveFiles) {
    const relativePath = normalize(path.relative(baseDir, archivePath));
    const archive = await unzipper.Open.file(archivePath);
    for (const archiveEntry of archive.files) {
      if (archiveEntry.type === "File") {
        const filePath = normalize(archiveEntry.path);
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
