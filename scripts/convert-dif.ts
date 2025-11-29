import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";

const BLENDER_PATH =
  process.env.BLENDER_PATH ||
  `/Applications/Blender.app/Contents/MacOS/Blender`;

/**
 * Find all .dif files in `docs/base` and convert them to glTF.
 * All files are passed to Blender in a single invocation for speed.
 */
async function run({ onlyNew }: { onlyNew: boolean }) {
  const inputFiles: string[] = [];
  for await (const inFile of fs.glob("docs/base/**/*.dif")) {
    const glbFile = inFile.replace(/\.dif$/, ".glb");
    if (onlyNew) {
      try {
        await fs.stat(glbFile);
      } catch (err) {
        if (err.code === "ENOENT") {
          inputFiles.push(inFile);
        }
      }
    } else {
      inputFiles.push(inFile);
    }
  }

  if (inputFiles.length === 0) {
    console.log("No .dif files found.");
    return;
  }

  console.log(`Found ${inputFiles.length} .dif file(s) to convert.`);

  execFileSync(
    BLENDER_PATH,
    [
      "--background",
      "--python",
      "scripts/blender/dif2gltf.py",
      "--", // args after here go to the script
      ...inputFiles,
    ],
    { stdio: "inherit" },
  );
}

const { values } = parseArgs({
  options: {
    new: {
      type: "boolean",
      default: false,
    },
  },
});

run({ onlyNew: values.new });
