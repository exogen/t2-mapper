/**
 * Add one VL2 to the game assets, or update one already added, and bring
 * every consumer along: extract it under docs/base/@vl2, convert its
 * .dif/.dts/.wav files, rebuild the manifest, verify, then optionally
 * commit/push (which deploys the assets to R2 and the site) and redeploy
 * the relay (which pulls its shapes from git). The extracted tree in git is
 * the record; the archive itself isn't kept.
 *
 * Each step shows what it will do and asks first. --dry-run reports every
 * step and writes nothing; --yes takes every default without asking.
 *
 *   npm run add-vl2 -- path/to/Foo.vl2 [--dest z_mappacks/CTF] [--dry-run] [--yes]
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  EXTRACTED_BASE_DIR,
  applyExtract,
  derivedPath,
  compareShadowed,
  listArchiveEntries,
  planExtract,
  precedenceReport,
  type ArchiveEntry,
  type ExtractPlan,
  type PrecedenceRow,
} from "./lib/assets";
import {
  BLENDER_PATH,
  FFMPEG_PATH,
  convertWav,
  convertWithBlender,
  toolAvailable,
} from "./lib/convert";
import {
  buildManifest,
  serializeManifest,
  winningSource,
  type Manifest,
} from "./lib/manifest";
import { createPrompter } from "./lib/prompt";

const MANIFEST_PATH = "src/manifest.json";
const VL2_ROOT = path.join(EXTRACTED_BASE_DIR, "@vl2");

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "dry-run": { type: "boolean", default: false },
    yes: { type: "boolean", default: false, short: "y" },
    dest: { type: "string" },
    help: { type: "boolean", default: false, short: "h" },
  },
});

const [archiveArg] = positionals;
if (values.help || !archiveArg) {
  console.error(
    "Usage: npm run add-vl2 -- <file.vl2> [--dest <folder under @vl2>] [--dry-run] [--yes]",
  );
  process.exit(1);
}

const dryRun = values["dry-run"];
const tag = dryRun ? "[dry-run] " : "";
const prompt = createPrompter({ yes: values.yes });

function heading(text: string): void {
  console.log(`\n== ${text}`);
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

function listSome(items: string[], indent = "    ", max = 15): void {
  for (const item of items.slice(0, max)) console.log(`${indent}${item}`);
  if (items.length > max) console.log(`${indent}… ${items.length - max} more`);
}

/** Dimmed on a terminal; tagged when piped. */
function dim(text: string): string {
  return process.stdout.isTTY ? `\x1b[2m${text}\x1b[0m` : `${text}  (same)`;
}

/** Game file types that are plain text, worth diffing line by line. */
const TEXT_EXTENSIONS = new Set([".cs", ".mis", ".dml", ".ifl", ".spn"]);
const DIFF_MAX_LINES = 60;

function looksText(filePath: string, sample: Buffer): boolean {
  return (
    TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase()) &&
    !sample.subarray(0, 8192).includes(0)
  );
}

/** Line endings and trailing whitespace removed — what the game's parsers see. */
function normalizeText(bytes: Buffer): string {
  return bytes
    .toString("latin1")
    .split(/\r\n|\r|\n/)
    .map((l) => l.trimEnd())
    .join("\n")
    .trimEnd();
}

/**
 * A unified diff between the losing copy (left) and the winning copy
 * (right) of one overlapping text file, via `git diff --no-index` so it
 * is coloured on a terminal. Returns null for binary files.
 */
async function overlapDiff(
  row: PrecedenceRow,
  entry: ArchiveEntry,
  archiveWins: boolean,
  archiveLabel: string,
): Promise<string | null> {
  const ours = await entry.read();
  const theirs = await fs.readFile(row.otherFile).catch(() => null);
  if (!theirs || !looksText(row.path, ours) || !looksText(row.path, theirs)) {
    return null;
  }
  if (normalizeText(ours) === normalizeText(theirs)) {
    return "(differs only in line endings or trailing whitespace)";
  }
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "add-vl2-diff-"));
  try {
    await fs.writeFile(path.join(tmp, "a"), archiveWins ? theirs : ours);
    await fs.writeFile(path.join(tmp, "b"), archiveWins ? ours : theirs);
    const [loser, winner] = archiveWins
      ? [row.source, archiveLabel]
      : [archiveLabel, row.source];
    let out = "";
    try {
      execFileSync(
        "git",
        [
          "diff",
          "--no-index",
          `--color=${process.stdout.isTTY ? "always" : "never"}`,
          "--ignore-space-at-eol",
          "--",
          "a",
          "b",
        ],
        { encoding: "utf8", cwd: tmp },
      );
    } catch (err) {
      // Exit 1 is "files differ" — the output we want.
      const stdout = (err as { stdout?: string }).stdout;
      if (typeof stdout !== "string") throw err;
      out = stdout;
    }
    // git's header names the temp files; replace it with the two sources.
    const hunks = out
      .trimEnd()
      .split("\n")
      .filter(
        (l) => !/^(\x1b\[[0-9;]*m)?(diff --git|index |--- |\+\+\+ )/.test(l),
      );
    return [`--- ${loser}`, `+++ ${winner}`, ...hunks].join("\n");
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

/**
 * Overlap rows grouped by the other source, the ones that actually
 * differ first (so a long identical tail can't hide them), identical
 * ones dimmed, and a diff for each differing text file.
 */
async function printOverlap(
  rows: PrecedenceRow[],
  preposition: string,
  entries: ArchiveEntry[],
  archiveWins: boolean,
  archiveLabel: string,
): Promise<void> {
  const byPath = new Map(entries.map((e) => [e.path, e]));
  const groups = new Map<string, PrecedenceRow[]>();
  for (const r of rows)
    groups.set(r.source, [...(groups.get(r.source) ?? []), r]);
  for (const [source, group] of groups) {
    const differing = group.filter((r) => r.identical === false);
    console.log(
      `  ${preposition} ${source} (${group.length}, ${differing.length} differ):`,
    );
    const ordered = [
      ...differing,
      ...group.filter((r) => r.identical !== false),
    ];
    listSome(
      ordered.map((r) => (r.identical ? dim(r.path) : r.path)),
      "    ",
      Math.max(15, differing.length),
    );
    for (const row of differing) {
      const entry = byPath.get(row.path);
      if (!entry) continue;
      const diff = await overlapDiff(row, entry, archiveWins, archiveLabel);
      if (diff == null) continue;
      const lines = diff.split("\n");
      console.log(`\n    ${row.path}:`);
      for (const l of lines.slice(0, DIFF_MAX_LINES)) console.log(`      ${l}`);
      if (lines.length > DIFF_MAX_LINES) {
        console.log(`      … ${lines.length - DIFF_MAX_LINES} more lines`);
      }
    }
  }
}

async function exists(p: string): Promise<boolean> {
  return fs.access(p).then(
    () => true,
    () => false,
  );
}

/** Folders under @vl2 that hold archives (not archives themselves). */
async function archiveFolders(): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string, rel: string) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || /\.vl2$/i.test(entry.name)) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      out.push(childRel);
      await walk(path.join(dir, entry.name), childRel);
    }
  };
  await walk(VL2_ROOT, "");
  return out.sort();
}

/**
 * Where an archive of this name is already extracted, if anywhere, with
 * its on-disk casing (so a Linux checkout doesn't end up with two folders
 * differing only in case).
 */
async function findExisting(
  archiveName: string,
): Promise<{ folder: string; name: string } | null> {
  const lower = archiveName.toLowerCase();
  for (const folder of ["", ...(await archiveFolders())]) {
    const dir = folder ? path.join(VL2_ROOT, folder) : VL2_ROOT;
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.toLowerCase() === lower) {
        return { folder, name: entry.name };
      }
    }
  }
  return null;
}

async function readManifest(): Promise<Manifest | null> {
  try {
    return JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8")) as Manifest;
  } catch {
    return null;
  }
}

function run(cmd: string, args: string[]): void {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { stdio: "inherit" });
}

function capture(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: "utf8" });
}

// ---- 1. Inspect the archive ------------------------------------------------

const archivePath = path.resolve(archiveArg);
if (!/\.vl2$/i.test(archivePath)) {
  console.error(`${path.basename(archivePath)} is not a .vl2 file`);
  process.exit(1);
}

heading(`Inspecting ${path.basename(archivePath)}`);
const entries = await listArchiveEntries(archivePath);
if (entries.length === 0) {
  console.error(
    "Nothing useful after filtering (skins, voice, and UI-only packs are ignored).",
  );
  process.exit(1);
}
{
  const byExt = new Map<string, { count: number; bytes: number }>();
  for (const e of entries) {
    const ext = path.extname(e.path).toLowerCase() || "(none)";
    const agg = byExt.get(ext) ?? { count: 0, bytes: 0 };
    agg.count++;
    agg.bytes += e.size;
    byExt.set(ext, agg);
  }
  const total = entries.reduce((n, e) => n + e.size, 0);
  console.log(`${entries.length} files, ${fmtBytes(total)} uncompressed`);
  for (const [ext, { count, bytes }] of [...byExt].sort(
    (a, b) => b[1].count - a[1].count,
  )) {
    console.log(
      `  ${String(count).padStart(5)}  ${ext.padEnd(6)} ${fmtBytes(bytes)}`,
    );
  }
  const missions = entries
    .filter((e) => /\.mis$/i.test(e.path))
    .map((e) => path.basename(e.path, path.extname(e.path)));
  if (missions.length > 0) {
    console.log(`Missions (${missions.length}):`);
    listSome(missions, "    ", 30);
  }
}

// ---- 2. Destination --------------------------------------------------------

heading("Destination");
const existing = await findExisting(path.basename(archivePath));
const archiveName = existing?.name ?? path.basename(archivePath);
if (existing && existing.name !== path.basename(archivePath)) {
  console.log(`Keeping the existing folder name ${existing.name}.`);
}
const existingFolder = existing?.folder ?? null;
let destFolder: string;
if (values.dest != null) {
  destFolder = values.dest.replace(/^\/+|\/+$/g, "");
  if (
    path.isAbsolute(destFolder) ||
    destFolder.split("/").some((seg) => seg === ".." || /\.vl2$/i.test(seg))
  ) {
    console.error(
      `--dest must be a folder path under @vl2, not ${values.dest}`,
    );
    process.exit(1);
  }
} else {
  const folders = ["", ...(await archiveFolders())];
  const options = folders.map((f) => ({
    label: f ? `@vl2/${f}/` : "@vl2/ (top level)",
    value: f,
  }));
  const defaultIndex =
    existingFolder == null ? 0 : folders.indexOf(existingFolder);
  console.log(
    "VL2 precedence depends only on the file name, so the folder is just for organization.",
  );
  destFolder = await prompt.choose("Where under @vl2?", options, defaultIndex);
}
const destRel = destFolder ? `${destFolder}/${archiveName}` : archiveName;
const outDir = path.join(VL2_ROOT, destRel);
const updating = await exists(outDir);
if (existingFolder != null && existingFolder !== destFolder) {
  console.warn(
    `WARNING: ${archiveName} is already extracted under @vl2/${existingFolder || "(top level)"}; ` +
      `adding it again elsewhere makes the precedence order ambiguous.`,
  );
}
console.log(
  `${updating ? "Updating" : "Adding"} ${path.join("@vl2", destRel)}`,
);

// ---- 3. Precedence ---------------------------------------------------------

heading("Precedence");
const oldManifest = await readManifest();
if (!oldManifest) {
  console.log(`No ${MANIFEST_PATH} yet — skipping the precedence check.`);
} else {
  const report = precedenceReport(
    oldManifest.resources,
    destRel,
    entries.map((e) => e.path),
  );
  await compareShadowed(report, entries);
  const differing = (rows: PrecedenceRow[]) =>
    rows.filter((r) => r.identical === false).length;
  if (report.shadows.length === 0 && report.shadowedBy.length === 0) {
    console.log("No overlap with existing resources.");
  }
  if (report.shadows.length > 0) {
    console.log(
      `Overrides ${report.shadows.length} existing resource(s), ` +
        `${differing(report.shadows)} with different contents — the app will use this archive's copy:`,
    );
    await printOverlap(report.shadows, "from", entries, true, destRel);
  }
  if (report.shadowedBy.length > 0) {
    console.log(
      `${report.shadowedBy.length} of its file(s) stay overridden by higher-sorting archives, ` +
        `${differing(report.shadowedBy)} with different contents:`,
    );
    await printOverlap(report.shadowedBy, "by", entries, false, destRel);
  }
  if (report.sameName.length > 0) {
    console.warn(
      `WARNING: same-named archive(s) elsewhere share files with this one; ` +
        `their order is undefined: ${report.sameName.join(", ")}`,
    );
  }
}

// ---- 4. Extract ------------------------------------------------------------

heading("Extract");
const plan: ExtractPlan = await planExtract(entries, outDir);
{
  const added = plan.write
    .filter((w) => w.reason === "new")
    .map((w) => w.entry.path);
  const changed = plan.write
    .filter((w) => w.reason === "changed")
    .map((w) => w.entry.path);
  console.log(
    `${added.length} new, ${changed.length} changed, ${plan.unchanged.length} unchanged, ` +
      `${plan.remove.length} to remove`,
  );
  if (changed.length > 0) {
    console.log("  changed:");
    listSome(changed);
  }
  if (plan.remove.length > 0) {
    console.log(
      "  remove (no longer in the archive, or derived from a changed source):",
    );
    listSome(plan.remove);
  }
}
const extractNeeded = plan.write.length > 0 || plan.remove.length > 0;
if (!extractNeeded) {
  console.log("Already up to date.");
} else if (dryRun) {
  console.log(`${tag}Would extract into ${outDir}`);
} else if (await prompt.confirm(`Extract into ${outDir}?`)) {
  await applyExtract(plan);
  console.log("Extracted.");
} else {
  console.log("Stopping: nothing else makes sense without the files.");
  prompt.close();
  process.exit(0);
}

// ---- 5. Convert ------------------------------------------------------------

heading("Convert");
/** Sources needing conversion: written by this run, or missing their derived file. */
const toConvert: Record<"dif" | "dts" | "wav", string[]> = {
  dif: [],
  dts: [],
  wav: [],
};
{
  const written = new Set(plan.write.map((w) => w.entry.path));
  for (const entry of entries) {
    const derived = derivedPath(entry.path);
    if (!derived) continue;
    const kind = path
      .extname(entry.path)
      .slice(1)
      .toLowerCase() as keyof typeof toConvert;
    if (
      written.has(entry.path) ||
      !(await exists(path.join(outDir, derived)))
    ) {
      toConvert[kind].push(path.join(outDir, entry.path));
    }
  }
}
const skippedConversions: string[] = [];
async function conversionStep(
  kind: keyof typeof toConvert,
  tool: string,
  versionFlag: string,
  convert: (files: string[]) => Promise<void>,
): Promise<void> {
  const files = toConvert[kind];
  if (files.length === 0) return;
  const label = `${files.length} .${kind} file(s)`;
  if (!toolAvailable(tool, versionFlag)) {
    console.warn(`${tool} not available — skipping ${label}`);
    skippedConversions.push(kind);
    return;
  }
  if (dryRun) {
    console.log(`${tag}Would convert ${label}:`);
    listSome(files);
    return;
  }
  if (
    !(await prompt.confirm(`Convert ${label} with ${path.basename(tool)}?`))
  ) {
    skippedConversions.push(kind);
    return;
  }
  try {
    await convert(files);
  } catch (err) {
    console.error(`${path.basename(tool)} failed: ${String(err)}`);
    skippedConversions.push(kind);
  }
}
await conversionStep("dif", BLENDER_PATH, "--version", async (files) =>
  convertWithBlender("dif", files),
);
await conversionStep("dts", BLENDER_PATH, "--version", async (files) =>
  convertWithBlender("dts", files),
);
await conversionStep("wav", FFMPEG_PATH, "-version", async (files) => {
  const { completed, failed } = await convertWav(files, {
    onProgress: (done, total) => process.stdout.write(`\r  ${done}/${total}`),
  });
  process.stdout.write("\n");
  console.log(`${completed} converted, ${failed.length} failed.`);
  if (failed.length > 0) throw new Error(`${failed.length} file(s) failed`);
});
if (Object.values(toConvert).every((f) => f.length === 0)) {
  console.log("Nothing to convert.");
}

// ---- 6. Manifest -----------------------------------------------------------

heading("Manifest");
if (dryRun) {
  const known = oldManifest?.resources ?? {};
  const newKeys = entries.filter((e) => !known[e.path.toLowerCase()]).length;
  const newMissions = entries.filter(
    (e) => /\.mis$/i.test(e.path) && !known[e.path.toLowerCase()],
  ).length;
  console.log(
    `${tag}Would rebuild ${MANIFEST_PATH}: about ${newKeys} new resource(s), ` +
      `${newMissions} new mission(s) (overrides listed under Precedence).`,
  );
} else {
  console.log("Rebuilding (this takes a moment)…");
  const { manifest, missingGlbs } = await buildManifest();
  if (missingGlbs.length > 0) {
    console.warn(
      `WARNING: ${missingGlbs.length} model(s) have no .glb and will not render:`,
    );
    listSome(missingGlbs);
    const ours = new Set(entries.map((e) => e.path.toLowerCase()));
    if (missingGlbs.some((k) => ours.has(k))) {
      skippedConversions.push("unconverted models from this archive");
    }
  }
  if (oldManifest) {
    const oldKeys = new Set(Object.keys(oldManifest.resources));
    const newKeys = new Set(Object.keys(manifest.resources));
    const added = [...newKeys].filter((k) => !oldKeys.has(k));
    const removed = [...oldKeys].filter((k) => !newKeys.has(k));
    const rewon = [...newKeys].filter(
      (k) =>
        oldKeys.has(k) &&
        winningSource(oldManifest.resources[k]).source !==
          winningSource(manifest.resources[k]).source,
    );
    const oldMissions = new Set(Object.keys(oldManifest.missions));
    const addedMissions = Object.keys(manifest.missions).filter(
      (m) => !oldMissions.has(m),
    );
    const removedMissions = [...oldMissions].filter(
      (m) => !manifest.missions[m],
    );
    const oldMounts = oldManifest.mounts ?? {};
    const mountChanges = Object.keys(manifest.mounts).filter(
      (s) =>
        JSON.stringify(oldMounts[s]) !== JSON.stringify(manifest.mounts[s]),
    );
    console.log(
      `Resources: +${added.length} −${removed.length}, ${rewon.length} changed winner; ` +
        `missions: +${addedMissions.length} −${removedMissions.length}; ` +
        `mounts changed: ${mountChanges.length}`,
    );
    if (addedMissions.length > 0) {
      for (const m of addedMissions) {
        const info = manifest.missions[m];
        console.log(
          `    ${m}: ${info.displayName ?? "(no name)"} [${info.missionTypes.join(", ") || "?"}]`,
        );
      }
    }
    if (removed.length > 0) {
      console.log("  removed resources:");
      listSome(removed);
    }
    if (mountChanges.length > 0)
      console.log(`  mounts: ${mountChanges.join(", ")}`);
  }
  if (await prompt.confirm(`Write ${MANIFEST_PATH}?`)) {
    await fs.writeFile(MANIFEST_PATH, serializeManifest(manifest), "utf8");
    console.log("Written.");
  }
}

// ---- 7. Verify -------------------------------------------------------------

heading("Verify");
let verifyFailed = false;
if (dryRun) {
  console.log(`${tag}Would run npm run typecheck (and offer npm test).`);
} else {
  if (await prompt.confirm("Run typecheck?")) {
    try {
      run("npm", ["run", "typecheck"]);
    } catch {
      console.error("Typecheck failed.");
      verifyFailed = true;
    }
  }
  if (await prompt.confirm("Run the test suite?", false)) {
    try {
      run("npm", ["test"]);
    } catch {
      console.error("Tests failed.");
      verifyFailed = true;
    }
  }
}

// ---- 8. Git ----------------------------------------------------------------

heading("Git");
const gitPaths = [outDir, MANIFEST_PATH];
let pushed = false;
{
  const status = capture("git", [
    "status",
    "--short",
    "--untracked-files=all",
    "--",
    ...gitPaths,
  ])
    .split("\n")
    .filter(Boolean);
  const counts = { added: 0, modified: 0, deleted: 0 };
  for (const line of status) {
    const code = line.slice(0, 2);
    if (code.includes("?") || code.includes("A")) counts.added++;
    else if (code.includes("D")) counts.deleted++;
    else counts.modified++;
  }
  console.log(
    `${status.length} path(s) changed: ${counts.added} added, ${counts.modified} modified, ${counts.deleted} deleted`,
  );
  const verb = updating ? "update" : "add";
  const branch = capture("git", ["branch", "--show-current"]).trim();
  if (status.length === 0) {
    console.log("Working tree already matches.");
  } else if (dryRun) {
    console.log(
      `${tag}Would offer: git commit -m "${verb} ${archiveName}", then git push (${branch}).`,
    );
  } else if (verifyFailed || skippedConversions.length > 0) {
    console.log(
      "Left uncommitted: verification failed or conversions were skipped.",
    );
  } else if (
    await prompt.confirm(`Commit as "${verb} ${archiveName}"?`, false)
  ) {
    // --only: just these paths, whatever else happens to be staged.
    run("git", ["add", "-A", "--", ...gitPaths]);
    run("git", [
      "commit",
      "--only",
      "-m",
      `${verb} ${archiveName}`,
      "--",
      ...gitPaths,
    ]);
    console.log(
      branch === "main"
        ? "Pushing main deploys: the workflow syncs docs/base to R2, purges changed URLs, and publishes the site."
        : `On ${branch}: pushing only deploys once it reaches main.`,
    );
    if (await prompt.confirm(`Push ${branch} now?`, false)) {
      run("git", ["push"]);
      pushed = true;
    }
  } else {
    console.log("Left uncommitted for review.");
  }
}

// ---- 9. Relay -------------------------------------------------------------

heading("Relay");
{
  const flyToml = await fs.readFile("fly.toml", "utf8").catch(() => "");
  const app = /^app\s*=\s*['"]([^'"]+)['"]/m.exec(flyToml)?.[1];
  const touchesShapes = [...entries.map((e) => e.path), ...plan.remove].some(
    (f) => /\.dts$/i.test(f),
  );
  if (!app) {
    console.log("No fly.toml app — nothing to deploy.");
  } else if (!touchesShapes) {
    console.log("No shapes in this archive — the relay doesn't need it.");
  } else {
    console.log(
      `The relay (${app}) pulls shapes from git on boot and bakes the manifest into its image, ` +
        `so a deploy after the push brings it up to date.`,
    );
    if (dryRun) {
      console.log(`${tag}Would offer fly deploy once pushed.`);
    } else if (!pushed) {
      console.log("Not pushed — deploy after the push reaches origin.");
    } else if (await prompt.confirm(`Run fly deploy for ${app}?`, false)) {
      run("fly", ["deploy", "-a", app]);
    }
  }
}

if (skippedConversions.length > 0) {
  console.warn(
    `\nSkipped conversions: ${skippedConversions.join(", ")}. Run the convert-* scripts with --new, then npm run build:manifest.`,
  );
}
prompt.close();
