import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";

const blender = `/Applications/Blender.app/Contents/MacOS/Blender`;

async function run() {
  for await (const inFile of fs.glob("public/**/*.dif")) {
    const outFile = inFile.replace(/\.dif$/i, ".glb");
    execFileSync(
      blender,
      ["-b", "-P", "scripts/dif2gltf.py", "--", inFile, outFile],
      { stdio: "inherit" }
    );
  }
}

run();
