import fs from "node:fs/promises";
import unzipper from "unzipper";
import { normalize } from "@/src/stringUtils";
import manifest from "@/public/manifest.json";
import path from "node:path";

const inputBaseDir = "rawGameData/base";
const outputBaseDir = "public/base";

const archives = new Map<string, unzipper.CentralDirectory>();

async function buildExtractedGameDataFolder() {
  await fs.mkdir(outputBaseDir, { recursive: true });
  const filePaths = Object.keys(manifest).sort();
  for (const filePath of filePaths) {
    const sources = manifest[filePath];
    for (const source of sources) {
      if (source) {
        let archive = archives.get(source);
        if (!archive) {
          const archivePath = `${inputBaseDir}/${source}`;
          archive = await unzipper.Open.file(archivePath);
          archives.set(source, archive);
        }
        const entry = archive.files.find(
          (entry) => normalize(entry.path) === filePath
        );
        const inFile = `${inputBaseDir}/${source}:${filePath}`;
        if (!entry) {
          throw new Error(`File not found in archive: ${inFile}`);
        }
        const outFile = `${outputBaseDir}/@vl2/${source}/${filePath}`;
        const outDir = path.dirname(outFile);
        console.log(`${inFile} -> ${outFile}`);
        await fs.mkdir(outDir, { recursive: true });
        await fs.writeFile(outFile, entry.stream());
      } else {
        const inFile = `${inputBaseDir}/${filePath}`;
        const outFile = `${outputBaseDir}/${filePath}`;
        console.log(`${inFile} -> ${outFile}`);
        await fs.cp(inFile, outFile);
      }
    }
  }
}

buildExtractedGameDataFolder();
