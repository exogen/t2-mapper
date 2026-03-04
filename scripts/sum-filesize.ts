import fs from "node:fs/promises";
import { parseArgs } from "node:util";

function formatSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(2)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(2)} KB`;
  return `${bytes} B`;
}

const { positionals } = parseArgs({ allowPositionals: true });

if (positionals.length === 0) {
  console.error("Usage: tsx scripts/sum-filesize.ts <glob> [glob...]");
  process.exit(1);
}

let total = 0;
let count = 0;

for (const pattern of positionals) {
  for await (const file of fs.glob(pattern)) {
    const stat = await fs.stat(file);
    if (stat.isFile()) {
      total += stat.size;
      count++;
    }
  }
}

console.log(`${count} files, ${formatSize(total)}`);
