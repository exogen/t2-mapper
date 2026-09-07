/**
 * Convert the plain-text game files under a directory to UTF-8, so nothing
 * downstream has to guess an encoding. Files that are already ASCII or
 * well-formed UTF-8 are left byte-for-byte; the rest are read as
 * Windows-1252 and re-encoded, which every conversion verifies by encoding
 * back and comparing to the original bytes.
 *
 * add-vl2 normalizes each archive as it extracts it, so this is for the
 * files already on disk (or a spot check with --dry-run).
 *
 *   npm run normalize-encoding -- [dir] [--dry-run]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { EXTRACTED_BASE_DIR } from "./lib/assets";
import { isTextAsset, toUtf8 } from "./lib/encoding";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", default: false, short: "h" },
  },
});

if (values.help) {
  console.error("Usage: npm run normalize-encoding -- [dir] [--dry-run]");
  process.exit(1);
}

const root = positionals[0] ?? EXTRACTED_BASE_DIR;
const dryRun = values["dry-run"];

async function* textFiles(dir: string): AsyncGenerator<string> {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* textFiles(file);
    else if (isTextAsset(file)) yield file;
  }
}

/** The lines holding non-ASCII, so a conversion can be eyeballed. */
function affectedLines(text: string, max = 4): string[] {
  const lines = text.split(/\r?\n/).filter((line) => /[^\x00-\x7f]/.test(line));
  const shown = lines.slice(0, max).map((line) => line.trim().slice(0, 120));
  if (lines.length > max) shown.push(`… ${lines.length - max} more line(s)`);
  return shown;
}

let scanned = 0;
let converted = 0;
const problems: string[] = [];
const warnings: string[] = [];

for await (const file of textFiles(root)) {
  scanned++;
  const bytes = await fs.readFile(file);
  const result = toUtf8(bytes);
  const label = path.relative(root, file);
  if (result.problem) {
    problems.push(`${label}: ${result.problem}`);
    continue;
  }
  if (result.warning) {
    warnings.push(`${label}: ${result.warning}`);
  }
  if (result.bytes === bytes) continue;

  converted++;
  console.log(
    `${result.from} -> utf-8  ${label}  (${bytes.length} -> ${result.bytes.length} bytes)`,
  );
  for (const line of affectedLines(result.bytes.toString("utf8"))) {
    console.log(`    ${line}`);
  }
  if (!dryRun) await fs.writeFile(file, result.bytes);
}

console.log(
  `\n${scanned} text file(s) under ${root}: ` +
    `${converted} ${dryRun ? "would be converted" : "converted"}, ` +
    `${scanned - converted - problems.length} already ASCII or UTF-8`,
);

if (warnings.length > 0) {
  console.warn(`\n${warnings.length} warning(s):`);
  for (const warning of warnings) console.warn(`  ${warning}`);
}

if (problems.length > 0) {
  console.error(`\n${problems.length} file(s) left alone:`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
