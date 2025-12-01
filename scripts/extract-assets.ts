import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import ignore from "ignore";
import unzipper from "unzipper";
import { normalizePath } from "@/src/stringUtils";
import { walkDirectory } from "@/src/fileUtils";

const inputBaseDir = process.env.BASE_DIR || "GameData/base";
const outputBaseDir = "docs/base";

// NOTE! Yes, the files below will be ignored. But this also expects `inputBaseDir`
// to largely have already been pruned of files that are indistinguishable from
// useful files - like player skins, voice binds, and anything else that will
// not be used by the map tool. So, remove `voice.vl2` before running this, for
// example. Random scripts are typically fine, since they're small (and other
// scripts may expect them to be available).
const ignoreList = ignore().add(`
fonts/
lighting/
prefs/
.DS_Store
*.dso
*.gui
*.ico
*.ml
*.nav
*.txt
`);

async function extractAssets({ clean }: { clean: boolean }) {
  const vl2Files: string[] = [];
  const looseFiles: string[] = [];

  // Discover all files
  await walkDirectory(inputBaseDir, {
    onFile: ({ entry }) => {
      const filePath = path.join(entry.parentPath, entry.name);
      const resourcePath = normalizePath(path.relative(inputBaseDir, filePath));
      if (!ignoreList.ignores(resourcePath)) {
        if (/\.vl2$/i.test(entry.name)) {
          vl2Files.push(filePath);
        } else {
          looseFiles.push(filePath);
        }
      }
    },
    onDir: ({ entry }) => {
      const dirPath = path.join(entry.parentPath, entry.name);
      const resourcePath =
        normalizePath(path.relative(inputBaseDir, dirPath)) + "/";
      const shouldRecurse = !ignoreList.ignores(resourcePath);
      return shouldRecurse;
    },
  });

  if (clean) {
    console.log(`Cleaning ${outputBaseDir}…`);
    await fs.rm(outputBaseDir, { recursive: true, force: true });
  }

  await fs.mkdir(outputBaseDir, { recursive: true });

  for (const filePath of looseFiles) {
    const relativePath = path.relative(inputBaseDir, filePath);
    const outFile = path.join(outputBaseDir, relativePath);
    const outDir = path.dirname(outFile);

    console.log(outFile);
    await fs.mkdir(outDir, { recursive: true });
    await fs.copyFile(filePath, outFile);
  }

  // Extract .vl2 files
  for (const archivePath of vl2Files) {
    const relativePath = path.relative(inputBaseDir, archivePath);
    const archive = await unzipper.Open.file(archivePath);
    const outputArchiveDir = path.join(outputBaseDir, "@vl2", relativePath);

    for (const entry of archive.files) {
      if (entry.type === "Directory") continue;

      const resourcePath = normalizePath(entry.path);
      if (ignoreList.ignores(resourcePath)) continue;

      const outFile = path.join(outputArchiveDir, resourcePath);
      const outDir = path.dirname(outFile);

      console.log(outFile);
      await fs.mkdir(outDir, { recursive: true });
      const content = await entry.buffer();
      await fs.writeFile(outFile, content);
    }
  }

  console.log("Done.");
}

const { values } = parseArgs({
  options: {
    clean: {
      type: "boolean",
      default: false,
    },
  },
});

extractAssets({ clean: values.clean });
