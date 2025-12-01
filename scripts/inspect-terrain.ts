import fs from "node:fs";
import { inspect, parseArgs } from "node:util";
import { parseTerrainBuffer } from "@/src/terrain";
import { getLocalFilePath, getResourceList } from "@/src/manifest";
import path from "node:path";

async function run() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      name: {
        type: "string",
        short: "n",
      },
      list: {
        type: "boolean",
        short: "l",
      },
    },
  });

  if (values.list) {
    if (values.name || positionals[0]) {
      console.error("Cannot specify --list (-l) with other options.");
      return 1;
    }
    console.log(
      getResourceList()
        .map((f) => f.match(/^terrains\/(.+)\.ter$/))
        .filter(Boolean)
        .map((match) => path.basename(getLocalFilePath(match[0]), ".ter"))
        .join("\n"),
    );
    return;
  } else if (
    (values.name && positionals[0]) ||
    (!values.name && !positionals[0])
  ) {
    console.error(
      "Must specify exactly one of --name (-n) or a positional filename.",
    );
    return 1;
  }

  let terrainFile = positionals[0];
  if (values.name) {
    const resourcePath = `terrains/${values.name}.ter`;
    terrainFile = getLocalFilePath(resourcePath);
  }
  const terrainBuffer = fs.readFileSync(terrainFile);
  const terrainArrayBuffer = terrainBuffer.buffer.slice(
    terrainBuffer.byteOffset,
    terrainBuffer.byteOffset + terrainBuffer.byteLength,
  );

  console.log(
    inspect(parseTerrainBuffer(terrainArrayBuffer), {
      colors: true,
      depth: Infinity,
    }),
  );
}

const code = await run();
process.exit(code ?? 0);
