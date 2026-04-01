import { createReadStream, createWriteStream } from "node:fs";
import * as readline from "node:readline";
import { parseArgs } from "node:util";

process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") process.exit(0);
  throw err;
});

const { values, positionals } = parseArgs({
  options: {
    output: { type: "boolean", short: "o", default: false },
  },
  allowPositionals: true,
});

const inputFile = positionals[0];

const input = inputFile
  ? createReadStream(inputFile)
  : createReadStream("/dev/stdin");
const output =
  values.output && inputFile
    ? createWriteStream(inputFile.replace(/\.log$/, ".filtered.log"))
    : process.stdout;

const rl = readline.createInterface({ input });

for await (const line of rl) {
  const sub = line
    .replace(/^(installHook\.js:1 )/, "")
    .replace(/^eval @ unknown$/, "")
    .replace(/^([\w.[\]()-]+ @ [\w.@?=…-]+:\d+)$/, "")
    .replace(/^( ?THREE\.WebGLRenderer: Texture marked for update .*)$/, "")
    .replace(/^(requestAnimationFrame)$/, "");
  if (sub) {
    output.write(sub + "\n");
  }
}
