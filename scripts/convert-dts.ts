import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";

const blender = `/Applications/Blender.app/Contents/MacOS/Blender`;

/**
 * Find all .dts files in `public/base` and convert them to glTF.
 */
async function run() {
  for await (const inFile of fs.glob("public/base/**/*.dts")) {
    const outFile = inFile.replace(/\.dts$/i, ".gltf");
    execFileSync(
      blender,
      [
        "--background",
        "--python",
        "scripts/blender/dts2gltf.py",
        "--", // args after here go to the script
        inFile,
        outFile,
        "--format",
        "gltf",
        // "--scale",
        // "1.0",
        // "--no-anims",
        // "--only-visible",
      ],
      { stdio: "inherit" }
    );
  }
}

run();
