import fs from "node:fs/promises";
import { transpile } from "@/src/torqueScript";

async function run(scriptPath: string) {
  const script = await fs.readFile(scriptPath, "utf8");
  const { code } = transpile(script);
  console.log(code);
}

const scriptPath = process.argv[2];
await run(scriptPath);
