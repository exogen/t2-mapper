import fs from "node:fs/promises";
import { inspect } from "node:util";
import { parse } from "@/src/torqueScript";

async function run(scriptPath: string) {
  const script = await fs.readFile(scriptPath, "utf8");
  const ast = parse(script);

  console.log(inspect(ast, { colors: true, depth: Infinity }));
}

const scriptPath = process.argv[2];
await run(scriptPath);
