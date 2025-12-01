import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";

const BLENDER_PATH =
  process.env.BLENDER_PATH ||
  `/Applications/Blender.app/Contents/MacOS/Blender`;

/**
 * Find all .dts files in `docs/base` and convert them to glTF.
 * All files are passed to Blender in a single invocation for speed.
 */
async function run({ onlyNew }: { onlyNew: boolean }) {
  const inputFiles: string[] = [];
  for await (const inFile of fs.glob("docs/base/**/*.dts")) {
    const glbFile = inFile.replace(/\.dts$/, ".glb");
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
    console.log("No .dts files found.");
    return;
  }

  console.log(`Found ${inputFiles.length} .dts file(s) to convert.`);

  execFileSync(
    BLENDER_PATH,
    [
      "--background",
      "--python",
      "scripts/blender/dts2gltf.py",
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
