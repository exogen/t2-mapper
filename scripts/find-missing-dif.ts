import fs from "node:fs/promises";

async function run() {
  for await (const inFile of fs.glob("docs/base/**/*.dif")) {
    const glbFile = inFile.replace(/\.dif$/, ".glb");
    try {
      await fs.stat(glbFile);
    } catch (err) {
      if (err.code === "ENOENT") {
        console.log(inFile);
      } else {
        throw err;
      }
    }
  }
}

run();
