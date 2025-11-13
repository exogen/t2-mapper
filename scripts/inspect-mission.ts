import fs from "node:fs";
import { inspect, parseArgs } from "node:util";
import { parseMissionScript } from "@/src/mission";
import { getFilePath } from "@/src/manifest";

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
    const manifest = (await import("../public/manifest.json")).default;
    const fileNames = Object.keys(manifest);
    console.log(
      fileNames
        .map((f) => f.match(/^missions\/(.+)\.mis$/))
        .filter(Boolean)
        .map((match) => match[1])
        .join("\n")
    );
    return;
  } else if (
    (values.name && positionals[0]) ||
    (!values.name && !positionals[0])
  ) {
    console.error(
      "Must specify exactly one of --name (-n) or a positional filename."
    );
    return 1;
  }

  let missionFile = positionals[0];
  if (values.name) {
    const resourcePath = `missions/${values.name}.mis`;
    missionFile = getFilePath(resourcePath);
  }
  const missionScript = fs.readFileSync(missionFile, "utf8");
  console.log(
    inspect(parseMissionScript(missionScript), {
      colors: false,
      depth: Infinity,
    })
  );
}

const code = await run();
process.exit(code ?? 0);
