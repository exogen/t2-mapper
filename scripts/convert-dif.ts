import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";

const BLENDER_PATH =
  process.env.BLENDER_PATH ||
  `/Applications/Blender.app/Contents/MacOS/Blender`;

/**
 * Find all .dif files in `public/base` and convert them to glTF.
 */
async function run() {
  for await (const inFile of fs.glob("public/base/**/*.dif")) {
    const outFile = inFile.replace(/\.dif$/i, ".gltf");
    execFileSync(
      BLENDER_PATH,
      [
        "--background",
        "--python",
        "scripts/blender/dif2gltf.py",
        "--", // args after here go to the script
        inFile,
        outFile,
      ],
      { stdio: "inherit" }
    );
  }
}

run();
