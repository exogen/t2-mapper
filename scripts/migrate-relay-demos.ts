/**
 * Upgrade the relay recordings in the demo bucket to the files today's
 * relay writes (scripts/lib/upgradeRelayDemo.ts), in two steps:
 *
 * - `prepare` converts every demo into the work directory and checks each
 *   result (validateRelayDemoUpgrade.ts); a demo already current must play
 *   in Tribes2.exe as it is. It writes nothing to the bucket. Originals
 *   come from a backup mirror (backup-demo-bucket.ts) when it holds the
 *   version the bucket has, else from the bucket (and are kept in
 *   originals/).
 * - `apply` uploads each prepared demo that changed and passed its checks,
 *   only over the version it was made from, updates its sidecar and index
 *   entry to match, and purges both from the Cloudflare edge cache. By
 *   default it holds back demos whose cast or commentary sidecars would
 *   drift: the cut and the dropped ticks move the demo's clock.
 * - With `--reapply`, `prepare` also converts each applied demo's original
 *   again (from the mirror or originals/, never the bucket's copy, which
 *   is its upgrade) into reupgraded/, and `apply` replaces an applied
 *   upgrade with a re-upgrade that differs, passed its checks and keeps
 *   the demo's clock exactly; the replaced upgrade moves to superseded/.
 *
 * Both resume where they stopped; a result made by other converter code is
 * prepared again, and an applied demo is only prepared again with
 * `--reapply`. Seek checkpoints of replaced demos are regenerated
 * afterwards by demos:backfill-checkpoints.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type HeadObjectCommandOutput,
} from "@aws-sdk/client-s3";
import type { DemoMetadata } from "../relay/demoRecorder.js";
import { updateDemoIndex } from "../relay/demoIndexStorage.js";
import { DEMO_TICK_MS } from "../relay/demoWriter.js";
import { fileEtags, unquoteEtag } from "../relay/objectEtag.js";
import { PURGE_BATCH_SIZE, purgeBatch } from "./lib/cloudflarePurge.js";
import {
  timingChanges,
  upgradeChanges,
} from "./lib/compareRelayDemoUpgrades.js";
import { listAllObjects, r2Client } from "./lib/r2.js";
import { playLikeTribes2 } from "./lib/tribes2Playback.js";
import {
  formatDemoTime,
  upgradeRelayDemo,
  upgradedTimeMs,
  type RelayDemoUpgrade,
} from "./lib/upgradeRelayDemo.js";
import {
  playbackProblems,
  validateRelayDemoUpgrade,
} from "./lib/validateRelayDemoUpgrade.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    work: { type: "string" },
    mirror: { type: "string" },
    jobs: { type: "string", default: "1" },
    shard: { type: "string" },
    filter: { type: "string" },
    skip: { type: "string" },
    force: { type: "boolean", default: false },
    reapply: { type: "boolean", default: false },
    timed: { type: "string", default: "hold" },
    "no-purge": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});
const command = positionals[0];
if (
  values.help ||
  !values.work ||
  (command !== "prepare" && command !== "apply") ||
  (values.timed !== "hold" && values.timed !== "all")
) {
  console.log(
    [
      "Usage: npm run demos:migrate -- prepare --work=DIR [--mirror=DIR] [--jobs=N] [--filter=TEXT] [--skip=A,B] [--force] [--reapply]",
      "       npm run demos:migrate -- apply --work=DIR [--filter=TEXT] [--skip=A,B] [--timed=hold|all] [--no-purge] [--reapply]",
      "",
      "  --work=DIR      Upgraded demos and per-demo results (results/<name>.json)",
      "  --mirror=DIR    prepare: a demos:backup mirror to read originals from",
      "  --jobs=N        prepare: parallel worker processes (default: 1)",
      "  --filter=TEXT   Only demos whose key contains TEXT",
      "  --skip=A,B      Leave out demos whose key contains any of these",
      "  --force         prepare: redo demos already prepared (applied ones only",
      "                  with --reapply)",
      "  --reapply       prepare: convert applied demos' originals again, into",
      "                  reupgraded/; apply: replace each applied upgrade whose",
      "                  re-upgrade differs, passed and keeps its timing",
      "  --timed=MODE    apply: hold (default) skips demos whose cast/commentary",
      "                  would drift by over 250 ms; all applies them too",
      "  --no-purge      apply: skip the Cloudflare purge (needs CLOUDFLARE_ZONE_ID",
      "                  and CLOUDFLARE_API_TOKEN otherwise)",
    ].join("\n"),
  );
  process.exit(values.help ? 0 : 1);
}
const workDir = path.resolve(values.work);
const upgradedDir = path.join(workDir, "upgraded");
const resultsDir = path.join(workDir, "results");
const originalsDir = path.join(workDir, "originals");
const reupgradedDir = path.join(workDir, "reupgraded");
const supersededDir = path.join(workDir, "superseded");

/**
 * Public base URL of the bucket's demo prefix, for the edge purge.
 */
const DEMOS_BASE_URL = (
  process.env.DEMOS_BASE_URL || "https://demos.tribes2.online/demos"
).replace(/\/+$/, "");

/**
 * An upgraded file's size and hashes; uploaded whole, its ETag is the MD5.
 */
interface UpgradedFile {
  bytes: number;
  md5: string;
  sha256: string;
}

const sha256Hex = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

const exists = (file: string) =>
  fs.access(file).then(
    () => true,
    () => false,
  );

function describeFile(bytes: Uint8Array): UpgradedFile {
  return {
    bytes: bytes.length,
    md5: createHash("md5").update(bytes).digest("hex"),
    sha256: sha256Hex(bytes),
  };
}

/**
 * One demo's progress through the migration.
 */
interface MigrationResult {
  key: string;
  filename: string;
  /**
   * The bucket version it was prepared from.
   */
  etag: string;
  bytes: number;
  /**
   * The converter code that prepared it (converterVersion).
   */
  converter: string;
  status: "unchanged" | "ready" | "failed";
  /**
   * Cast or commentary sidecars, which are timed on the demo's clock.
   */
  timed: { cast: boolean; commentary: boolean };
  report?: RelayDemoUpgrade;
  problems?: string[];
  error?: string;
  upgraded?: UpgradedFile;
  applied?: { etag: string; at: string; sidecar: boolean; purged: boolean };
  /**
   * An applied demo's original converted again by other converter code
   * (prepare --reapply) into a file that differs from the applied upgrade,
   * kept in reupgraded/ for apply --reapply.
   */
  reapply?: {
    converter: string;
    status: "ready" | "failed";
    report?: RelayDemoUpgrade;
    upgraded?: UpgradedFile;
    problems?: string[];
    error?: string;
  };
  /**
   * The converter code that converted an applied demo's original again
   * into the applied upgrade's exact bytes.
   */
  rechecked?: { converter: string; at: string };
  /**
   * Upgrades a re-apply replaced, oldest first, as `applied`, `converter`,
   * `upgraded` and `report` described them; each file is kept in
   * superseded/<name>.<etag>.
   */
  superseded?: {
    etag: string;
    at: string;
    converter: string;
    upgraded: UpgradedFile;
    report: RelayDemoUpgrade;
  }[];
}

/**
 * A demos:backup manifest's record of one mirrored object.
 */
interface MirrorEntry {
  etag: string;
  size: number;
  sha256?: string;
}

/**
 * Where the code an upgraded file and its verdict come from: these modules
 * and every module they import, followed through relative imports, plus
 * the demo parser. A result made by any other version of them is prepared
 * again.
 */
const CONVERTER_ENTRIES = [
  "scripts/lib/analyzeDemo.ts",
  "scripts/lib/tribes2Playback.ts",
  "scripts/lib/upgradeRelayDemo.ts",
  "scripts/lib/validateRelayDemoUpgrade.ts",
];

async function converterVersion(): Promise<string> {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const isFile = (file: string) =>
    fs.stat(path.join(root, file)).then(
      (stat) => stat.isFile(),
      () => false,
    );
  const files = new Set<string>();
  const visit = async (file: string): Promise<void> => {
    if (files.has(file)) return;
    files.add(file);
    const source = await fs.readFile(path.join(root, file), "utf8");
    for (const [, spec] of source.matchAll(
      /(?:from|import\s*\()\s*["'](\.{1,2}\/[^"']+)["']/g,
    )) {
      const base = path.join(path.dirname(file), spec);
      const stem = base.replace(/\.js$/, "");
      for (const candidate of [
        base,
        `${stem}.ts`,
        `${stem}.tsx`,
        path.join(stem, "index.ts"),
      ]) {
        if (path.extname(candidate) && (await isFile(candidate))) {
          await visit(candidate);
          break;
        }
      }
    }
  };
  for (const entry of CONVERTER_ENTRIES) await visit(entry);
  const parserDist = "node_modules/t2-demo-parser/dist";
  for (const file of await fs.readdir(path.join(root, parserDist), {
    recursive: true,
  }))
    if (file.endsWith(".js")) files.add(path.join(parserDist, file));
  files.add("node_modules/t2-demo-parser/package.json");
  const hash = createHash("sha256");
  for (const file of [...files].sort()) {
    hash.update(file);
    hash.update(await fs.readFile(path.join(root, file)));
  }
  return hash.digest("hex").slice(0, 16);
}

const resultPath = (filename: string) =>
  path.join(resultsDir, `${filename}.json`);

async function readResult(filename: string): Promise<MigrationResult | null> {
  try {
    return JSON.parse(await fs.readFile(resultPath(filename), "utf8"));
  } catch {
    return null;
  }
}

async function writeResult(result: MigrationResult): Promise<void> {
  const file = resultPath(result.filename);
  await fs.writeFile(`${file}.tmp`, JSON.stringify(result, null, 1));
  await fs.rename(`${file}.tmp`, file);
}

/**
 * A stable shard for a key, whatever else the listing holds.
 */
function shardOf(key: string, shards: number): number {
  return (
    parseInt(createHash("md5").update(key).digest("hex").slice(0, 8), 16) %
    shards
  );
}

/**
 * How far a cast or commentary may fall behind its demo (the cut and the
 * dropped ticks move the demo's clock) before apply holds the demo back.
 */
const TIMED_DRIFT_TOLERANCE_MS = 250;

/**
 * Whether apply holds a demo back: its cast or commentary would drift.
 */
const drifts = (result: MigrationResult) =>
  (result.timed.cast || result.timed.commentary) &&
  !!result.report &&
  result.report.cutMs + result.report.droppedTicks * DEMO_TICK_MS >
    TIMED_DRIFT_TOLERANCE_MS;

const { client, config } = r2Client("npm run demos:migrate");
const listing = await listAllObjects(client, config);
const skip = (values.skip ?? "").split(",").filter(Boolean);
const demos = listing.filter(
  ({ key }) =>
    key.endsWith(".rec") &&
    !key.slice(config.prefix.length).includes("/") &&
    (!values.filter || key.includes(values.filter)) &&
    !skip.some((text) => key.includes(text)),
);
const timedKeys = new Map<string, { cast: boolean; commentary: boolean }>();
for (const { key } of listing) {
  const match = key.match(/^(.*\.rec)\.(cast\.json|(?:.+\.)?commentary\.\w+)$/);
  if (!match) continue;
  const timed = timedKeys.get(match[1]) ?? { cast: false, commentary: false };
  if (match[2] === "cast.json") timed.cast = true;
  else timed.commentary = true;
  timedKeys.set(match[1], timed);
}
await fs.mkdir(upgradedDir, { recursive: true });
await fs.mkdir(resultsDir, { recursive: true });

if (command === "prepare") await prepare();
else await apply();

async function prepare(): Promise<void> {
  const jobs = Number(values.jobs);
  if (!Number.isSafeInteger(jobs) || jobs < 1) {
    console.error("--jobs must be a positive integer");
    process.exit(1);
  }
  if (jobs > 1 && !values.shard) {
    // One worker process per shard: the conversion is CPU-bound.
    const args = [
      process.argv[1],
      "prepare",
      `--work=${workDir}`,
      ...(values.mirror ? [`--mirror=${path.resolve(values.mirror)}`] : []),
      ...(values.filter ? [`--filter=${values.filter}`] : []),
      ...(values.skip ? [`--skip=${values.skip}`] : []),
      ...(values.force ? ["--force"] : []),
      ...(values.reapply ? ["--reapply"] : []),
    ];
    const exits = await Promise.all(
      Array.from(
        { length: jobs },
        (_, shard) =>
          new Promise<number | null>((resolve) =>
            spawn(
              process.execPath,
              [...process.execArgv, ...args, `--shard=${shard}/${jobs}`],
              { stdio: "inherit" },
            ).on("exit", resolve),
          ),
      ),
    );
    await summarize();
    if (exits.some((code) => code !== 0)) process.exitCode = 1;
    return;
  }

  const converter = await converterVersion();
  const [shard, shards] = (values.shard ?? "0/1").split("/").map(Number);
  const mirror = new Map<string, MirrorEntry>();
  if (values.mirror) {
    const manifest = JSON.parse(
      await fs.readFile(path.join(values.mirror, "manifest.json"), "utf8"),
    ) as { objects: (MirrorEntry & { key: string })[] };
    for (const object of manifest.objects) mirror.set(object.key, object);
  }

  for (const { key, etag: listedEtag, size } of demos) {
    if (shardOf(key, shards) !== shard) continue;
    const filename = path.basename(key);
    const etag = unquoteEtag(listedEtag);
    const previous = await readResult(filename);
    // An applied demo's record is the migration's: apply checks it.
    if (previous?.applied) {
      if (values.reapply) await reupgrade(previous, etag, converter, mirror);
      continue;
    }
    if (
      previous &&
      previous.etag === etag &&
      previous.converter === converter &&
      !values.force
    )
      continue;
    const result: MigrationResult = {
      key,
      filename,
      etag,
      bytes: size,
      converter,
      status: "failed",
      timed: timedKeys.get(key) ?? { cast: false, commentary: false },
    };
    try {
      const backedUp = mirror.get(key);
      let original: Uint8Array;
      if (values.mirror && backedUp?.etag === etag && backedUp.size === size) {
        original = new Uint8Array(
          await fs.readFile(path.join(values.mirror, key)),
        );
      } else {
        // Newer than the backup: keep the original beside its upgrade.
        original = await download(key, etag);
        await fs.mkdir(originalsDir, { recursive: true });
        await fs
          .writeFile(path.join(originalsDir, filename), original, {
            flag: "wx",
          })
          .catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "EEXIST") throw error;
          });
      }
      const output = path.join(upgradedDir, filename);
      await fs.rm(output, { force: true });
      const report = await upgradeRelayDemo(original, output);
      result.report = report;
      if (report.generation === "current" && report.gameOversRewritten === 0) {
        result.problems = playbackProblems(await playLikeTribes2(original));
        result.status = result.problems.length === 0 ? "unchanged" : "failed";
      } else {
        const upgraded = new Uint8Array(await fs.readFile(output));
        result.upgraded = describeFile(upgraded);
        const { problems } = await validateRelayDemoUpgrade(
          original,
          upgraded,
          report,
          filename,
        );
        result.problems = problems;
        result.status = problems.length === 0 ? "ready" : "failed";
      }
    } catch (error) {
      result.error = String(error);
    }
    await writeResult(result);
    console.log(
      `${filename}: ${result.status}` +
        (result.report ? ` (${result.report.generation})` : "") +
        (result.error ? ` — ${result.error}` : "") +
        (result.problems?.length ? ` — ${result.problems.join("; ")}` : ""),
    );
  }
  if (!values.shard) await summarize();
}

async function download(key: string, etag: string): Promise<Uint8Array> {
  const response = await client.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
      IfMatch: `"${etag}"`,
    }),
  );
  return response.Body!.transformToByteArray();
}

/**
 * prepare --reapply for an applied demo: convert its original again, and
 * keep a file that differs from the applied upgrade in reupgraded/, ready
 * for apply --reapply if it passes its checks and keeps the applied
 * upgrade's timing exactly. Writes nothing unless the bucket holds the
 * applied upgrade.
 */
async function reupgrade(
  previous: MigrationResult,
  listedEtag: string,
  converter: string,
  mirror: Map<string, MirrorEntry>,
): Promise<void> {
  const { key, filename, applied, upgraded, report } = previous;
  if (!applied || !upgraded || !report) return;
  const checkedBy =
    previous.reapply?.converter ??
    previous.rechecked?.converter ??
    previous.converter;
  if (checkedBy === converter && !values.force) return;
  if (listedEtag !== applied.etag) {
    // Apply uploads the upgrade again over a restored original, and
    // records a re-apply that stopped after its upload.
    const holds =
      listedEtag === previous.etag
        ? "the original again"
        : previous.reapply?.status === "ready" &&
            listedEtag === previous.reapply.upgraded?.md5
          ? "its re-upgrade (apply --reapply records it)"
          : undefined;
    console.log(
      `${filename}: not re-upgraded, the bucket holds ${holds ?? "neither the original nor the upgrade"}`,
    );
    if (!holds) process.exitCode = 1;
    return;
  }
  let original: Uint8Array;
  try {
    original = await readOriginal(previous, mirror);
  } catch (error) {
    console.log(`${filename}: not re-upgraded — ${String(error)}`);
    process.exitCode = 1;
    return;
  }

  const reapply: NonNullable<MigrationResult["reapply"]> = {
    converter,
    status: "failed",
  };
  const candidate = path.join(reupgradedDir, filename);
  let unchanged = false;
  try {
    await fs.mkdir(reupgradedDir, { recursive: true });
    await fs.rm(candidate, { force: true });
    const next = await upgradeRelayDemo(original, candidate);
    reapply.report = next;
    // Nothing to rewrite leaves no file, whatever the report counts.
    if (!(await exists(candidate))) {
      reapply.problems = ["the converter now leaves the original as it is"];
    } else {
      const bytes = new Uint8Array(await fs.readFile(candidate));
      reapply.upgraded = describeFile(bytes);
      unchanged = reapply.upgraded.sha256 === upgraded.sha256;
      if (!unchanged) {
        const moved = timingChanges(report, next);
        const { problems } = await validateRelayDemoUpgrade(
          original,
          bytes,
          next,
          filename,
        );
        reapply.problems = [
          ...(moved.length > 0
            ? [`timing differs from the applied upgrade: ${moved.join(", ")}`]
            : []),
          ...problems,
        ];
        reapply.status = reapply.problems.length === 0 ? "ready" : "failed";
      }
    }
  } catch (error) {
    reapply.error = String(error);
  }

  const result: MigrationResult = {
    ...previous,
    timed: timedKeys.get(key) ?? { cast: false, commentary: false },
  };
  if (unchanged) {
    result.reapply = undefined;
    result.rechecked = { converter, at: new Date().toISOString() };
  } else {
    result.reapply = reapply;
    result.rechecked = undefined;
  }
  await writeResult(result);
  if (unchanged) await fs.rm(candidate, { force: true });
  console.log(
    `${filename}: re-upgrade ${unchanged ? "unchanged" : reapply.status}` +
      (reapply.report ? ` (${reapply.report.generation})` : "") +
      (reapply.error ? ` — ${reapply.error}` : "") +
      (reapply.problems?.length ? ` — ${reapply.problems.join("; ")}` : ""),
  );
}

/**
 * An applied demo's original, from the mirror or originals/, checked to be
 * the version it was prepared from: the bucket now holds its upgrade.
 */
async function readOriginal(
  result: MigrationResult,
  mirror: Map<string, MirrorEntry>,
): Promise<Uint8Array> {
  const backedUp = mirror.get(result.key);
  if (
    values.mirror &&
    backedUp?.etag === result.etag &&
    backedUp.size === result.bytes
  ) {
    const bytes = new Uint8Array(
      await fs.readFile(path.join(values.mirror, result.key)),
    );
    if (
      bytes.length !== result.bytes ||
      (backedUp.sha256 !== undefined && sha256Hex(bytes) !== backedUp.sha256)
    )
      throw new Error(
        "the mirror's copy of the original differs from its manifest",
      );
    return bytes;
  }
  const kept = path.join(originalsDir, result.filename);
  const hashes = await fileEtags(kept).catch(() => undefined);
  if (
    hashes &&
    (result.etag.includes("-") ? hashes.multipartEtag : hashes.md5) ===
      result.etag
  ) {
    const bytes = new Uint8Array(await fs.readFile(kept));
    if (bytes.length === result.bytes && sha256Hex(bytes) === hashes.sha256)
      return bytes;
  }
  throw new Error(
    `no copy of the original (ETag ${result.etag}) in ${values.mirror ? "the mirror or " : ""}originals/`,
  );
}

async function summarize(): Promise<void> {
  const converter = await converterVersion();
  const results = (
    await Promise.all(demos.map(({ key }) => readResult(path.basename(key))))
  ).filter((result): result is MigrationResult => result !== null);
  const count = (status: MigrationResult["status"]) =>
    results.filter((result) => result.status === status).length;
  const generations = new Map<string, number>();
  for (const { report } of results)
    if (report)
      generations.set(
        report.generation,
        (generations.get(report.generation) ?? 0) + 1,
      );
  const stale = results.filter(
    (result) => !result.applied && result.converter !== converter,
  ).length;
  console.log(
    `\n${results.length}/${demos.length} prepared: ${count("ready")} ready, ` +
      `${count("unchanged")} unchanged, ${count("failed")} failed` +
      (stale ? `; ${stale} by other converter code` : "") +
      `; ${results.filter((result) => result.applied).length} applied`,
  );
  console.log(
    `  generations: ${JSON.stringify(Object.fromEntries(generations))}`,
  );
  const reupgrades = (status: "ready" | "failed") =>
    results.filter((result) => result.reapply?.status === status).length;
  const rechecked = results.filter((result) => result.rechecked).length;
  const reapplied = results.filter(
    (result) => result.superseded?.length,
  ).length;
  if (
    values.reapply ||
    reupgrades("ready") ||
    reupgrades("failed") ||
    rechecked ||
    reapplied
  ) {
    const unchecked = results.filter(
      (result) =>
        result.applied &&
        (result.reapply?.converter ??
          result.rechecked?.converter ??
          result.converter) !== converter,
    ).length;
    console.log(
      `  applied demos re-upgraded: ${reupgrades("ready")} ready, ` +
        `${reupgrades("failed")} failed, ${rechecked} unchanged` +
        (unchecked ? `; ${unchecked} by other converter code` : "") +
        `; ${reapplied} re-applied`,
    );
  }
  const timedNote = (result: MigrationResult) =>
    result.timed.commentary
      ? ", has commentary"
      : result.timed.cast
        ? ", has cast"
        : "";
  for (const result of results) {
    const { report } = result;
    if (result.status !== "failed" && !drifts(result)) continue;
    console.log(
      `  ${result.filename}: ${result.status}` +
        (report
          ? `, ${formatDemoTime(report.oldLengthMs)} → ${formatDemoTime(report.newLengthMs)}, cut ${report.cutMs} ms` +
            (report.droppedTicks
              ? `, ${formatDemoTime(report.droppedTicks * DEMO_TICK_MS)} dropped`
              : "")
          : "") +
        timedNote(result) +
        (result.error ? `, ERROR: ${result.error}` : "") +
        (result.problems?.length
          ? `, PROBLEMS: ${result.problems.join("; ")}`
          : ""),
    );
  }
  for (const result of results) {
    const { reapply, report, upgraded } = result;
    if (!reapply) continue;
    console.log(
      `  ${result.filename}: re-upgrade ${reapply.status}` +
        (upgraded && reapply.upgraded
          ? `, ${upgraded.bytes} → ${reapply.upgraded.bytes} bytes`
          : "") +
        (report && reapply.report && reapply.status === "ready"
          ? upgradeChanges(report, reapply.report)
              .map((change) => `, ${change}`)
              .join("")
          : "") +
        timedNote(result) +
        (reapply.converter !== converter ? ", by other converter code" : "") +
        (reapply.error ? `, ERROR: ${reapply.error}` : "") +
        (reapply.problems?.length
          ? `, PROBLEMS: ${reapply.problems.join("; ")}`
          : ""),
    );
  }
}

async function apply(): Promise<void> {
  const purge = !values["no-purge"];
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (purge && (!zoneId || !apiToken)) {
    console.error(
      "CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN must be set to purge replaced demos (or pass --no-purge).",
    );
    process.exit(1);
  }
  const converter = await converterVersion();

  const failures: string[] = [];
  const held: string[] = [];
  let pendingIndex: MigrationResult[] = [];
  let pendingPurge: MigrationResult[] = [];
  let applied = 0;
  let reapplied = 0;

  // A failed flush is reported as its own: every applied demo's record is
  // patched again, and an unpurged one purged, the next time apply runs.
  const flushIndex = async () => {
    if (pendingIndex.length === 0) return;
    const byName = new Map(pendingIndex.map((r) => [r.filename, r]));
    pendingIndex = [];
    try {
      await updateDemoIndex(
        client,
        config.bucket,
        `${config.prefix}index.json`,
        (entries) => {
          if (!entries) return undefined;
          let changed = false;
          const merged = entries.map((entry) => {
            const result = byName.get(entry.filename);
            const patched = result ? patchRecord(entry, result) : entry;
            if (patched !== entry) changed = true;
            return patched;
          });
          return changed ? merged : undefined;
        },
        (_key, body) =>
          fs.writeFile(
            path.join(workDir, `index-before-${Date.now()}.json`),
            body,
          ),
      );
    } catch (error) {
      failures.push(`index update for ${byName.size} demos: ${String(error)}`);
    }
  };
  const flushPurge = async () => {
    if (pendingPurge.length === 0) return;
    const batch = pendingPurge;
    pendingPurge = [];
    try {
      if (purge)
        await purgeBatch(
          zoneId!,
          apiToken!,
          batch.flatMap(({ filename }) => {
            const url = `${DEMOS_BASE_URL}/${encodeURIComponent(filename)}`;
            return [url, `${url}.json`];
          }),
        );
      for (const result of batch) {
        result.applied!.purged = purge;
        await writeResult(result);
      }
    } catch (error) {
      failures.push(`purge of ${batch.length} demos: ${String(error)}`);
    }
  };

  try {
    for (const { key } of demos) {
      const filename = path.basename(key);
      const result = await readResult(filename);
      if (!result || !result.upgraded || !result.report) continue;
      if (result.status !== "ready" && !result.applied) continue;
      try {
        if (!result.applied && result.converter !== converter) {
          failures.push(
            `${filename}: prepared by other converter code; prepare again`,
          );
          continue;
        }
        if (!result.applied && values.timed === "hold" && drifts(result)) {
          held.push(filename);
          continue;
        }
        const head = await client.send(
          new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
        );
        const current = unquoteEtag(head.ETag);
        if (result.applied && current !== result.applied.etag) {
          if (
            result.reapply?.status === "ready" &&
            current === result.reapply.upgraded?.md5
          ) {
            // A re-apply that stopped between its upload and its result.
            if (!values.reapply) {
              failures.push(
                `${filename}: the bucket holds its re-upgrade; apply --reapply records it`,
              );
              continue;
            }
            if (head.ContentLength !== result.reapply.upgraded.bytes)
              throw new Error(
                "the bucket's copy does not match the re-upgrade",
              );
            await promoteReapply(result);
            reapplied++;
            console.log(`${filename}: re-applied in an earlier run; recorded`);
          } else if (current !== result.etag) {
            failures.push(
              `${filename}: the bucket holds neither the original nor the upgrade`,
            );
            continue;
          } else {
            // Something put the original back: upload the upgrade again.
            console.log(`${filename}: reverted since apply; applying again`);
            result.applied = undefined;
          }
        }
        if (!result.applied) {
          if (current !== result.etag && current !== result.upgraded.md5) {
            failures.push(
              `${filename}: the bucket's copy changed since prepare`,
            );
            continue;
          }
          const body = new Uint8Array(
            await fs.readFile(path.join(upgradedDir, filename)),
          );
          if (
            createHash("sha256").update(body).digest("hex") !==
            result.upgraded.sha256
          )
            throw new Error("the upgraded file differs from the one prepared");
          if (current === result.etag) {
            await client.send(
              new PutObjectCommand({
                Bucket: config.bucket,
                Key: key,
                Body: body,
                ContentType: head.ContentType,
                CacheControl: head.CacheControl,
                Metadata: head.Metadata,
                IfMatch: head.ETag,
              }),
            );
          }
          const uploaded = await client.send(
            new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
          );
          if (
            uploaded.ContentLength !== result.upgraded.bytes ||
            unquoteEtag(uploaded.ETag) !== result.upgraded.md5
          )
            throw new Error("the bucket's copy does not match after upload");
          result.applied = {
            etag: result.upgraded.md5,
            at: new Date().toISOString(),
            sidecar: false,
            purged: false,
          };
          await writeResult(result);
          applied++;
          console.log(
            `${filename}: applied, ${result.bytes} → ${result.upgraded.bytes} bytes`,
          );
        }
        if (values.reapply && result.reapply?.status === "ready") {
          // A refused re-apply leaves the applied upgrade, whose records
          // still need what follows.
          if (result.reapply.converter !== converter) {
            failures.push(
              `${filename}: re-upgraded by other converter code; prepare --reapply again`,
            );
          } else {
            const before = result.upgraded.bytes;
            await reapplyUpgrade(key, result, head);
            reapplied++;
            console.log(
              `${filename}: re-applied, ${before} → ${result.upgraded.bytes} bytes`,
            );
          }
        }
        if (!result.applied.sidecar) {
          result.applied.sidecar = await patchSidecar(`${key}.json`, result);
          await writeResult(result);
        }
        pendingIndex.push(result);
        if (!result.applied.purged) pendingPurge.push(result);
        if (pendingPurge.length * 2 >= PURGE_BATCH_SIZE) await flushPurge();
        if (pendingIndex.length >= 25) await flushIndex();
      } catch (error) {
        failures.push(`${filename}: ${String(error)}`);
      }
    }
  } finally {
    await flushIndex();
    await flushPurge();
  }

  console.log(`\nApplied ${applied} demos in this run`);
  if (values.reapply) console.log(`Re-applied ${reapplied} demos in this run`);
  if (held.length > 0)
    console.log(
      `Held back ${held.length} demos whose cast/commentary would drift (--timed=all applies them):\n  ${held.join("\n  ")}`,
    );
  if (failures.length > 0) {
    console.log(`FAILED ${failures.length}:\n  ${failures.join("\n  ")}`);
    process.exitCode = 1;
  }
}

/**
 * Replace an applied upgrade with its re-upgrade, only over the applied
 * version and keeping its headers, then record it.
 */
async function reapplyUpgrade(
  key: string,
  result: MigrationResult,
  head: HeadObjectCommandOutput,
): Promise<void> {
  const { filename, applied, reapply, upgraded, report } = result;
  if (!applied || !reapply?.upgraded || !reapply.report || !upgraded || !report)
    throw new Error("no re-upgrade to apply");
  const moved = timingChanges(report, reapply.report);
  if (moved.length > 0)
    throw new Error(`the re-upgrade changes its timing: ${moved.join(", ")}`);
  const body = new Uint8Array(
    await fs.readFile(path.join(reupgradedDir, filename)),
  );
  if (sha256Hex(body) !== reapply.upgraded.sha256)
    throw new Error("the re-upgraded file differs from the one prepared");
  // superseded/ keeps this file as the copy of what the bucket holds now.
  if (
    sha256Hex(await fs.readFile(path.join(upgradedDir, filename))) !==
    upgraded.sha256
  )
    throw new Error("the upgraded file differs from the one applied");
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: head.ContentType,
      CacheControl: head.CacheControl,
      Metadata: head.Metadata,
      IfMatch: `"${applied.etag}"`,
    }),
  );
  const uploaded = await client.send(
    new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
  );
  if (
    uploaded.ContentLength !== reapply.upgraded.bytes ||
    unquoteEtag(uploaded.ETag) !== reapply.upgraded.md5
  )
    throw new Error("the bucket's copy does not match after upload");
  await promoteReapply(result);
}

/**
 * Record the re-upgrade the bucket now holds as the demo's upgrade: it
 * moves into upgraded/, and the upgrade it replaced into superseded/ and
 * `superseded`. Finishes one that stopped part way.
 */
async function promoteReapply(result: MigrationResult): Promise<void> {
  const { filename, applied, reapply, upgraded, report } = result;
  if (!applied || !reapply?.upgraded || !reapply.report || !upgraded || !report)
    throw new Error("no re-upgrade to record");
  const upgradedFile = path.join(upgradedDir, filename);
  const candidate = path.join(reupgradedDir, filename);
  const moving = await exists(candidate);
  if (
    sha256Hex(await fs.readFile(moving ? candidate : upgradedFile)) !==
    reapply.upgraded.sha256
  )
    throw new Error("the re-upgraded file differs from the one prepared");
  if (moving) {
    const kept = path.join(supersededDir, `${filename}.${applied.etag}`);
    await fs.mkdir(supersededDir, { recursive: true });
    if (!(await exists(kept))) await fs.rename(upgradedFile, kept);
    await fs.rename(candidate, upgradedFile);
  }
  result.superseded = [
    ...(result.superseded ?? []),
    {
      etag: applied.etag,
      at: applied.at,
      converter: result.converter,
      upgraded,
      report,
    },
  ];
  result.converter = reapply.converter;
  result.upgraded = reapply.upgraded;
  result.report = reapply.report;
  result.problems = reapply.problems;
  result.applied = {
    etag: reapply.upgraded.md5,
    at: new Date().toISOString(),
    sidecar: false,
    purged: false,
  };
  result.reapply = undefined;
  result.rechecked = undefined;
  await writeResult(result);
}

/**
 * A demo's record with the upgraded file's size and length, and its games'
 * starts on the upgraded clock; the record itself once it has them. A
 * re-applied upgrade keeps the clock of the one it replaced, so a record
 * already on that clock only takes its size.
 */
function patchRecord(
  record: DemoMetadata,
  result: MigrationResult,
): DemoMetadata {
  const { upgraded, report } = result;
  if (
    !upgraded ||
    !report ||
    (record.bytes === upgraded.bytes &&
      record.durationMs === report.newLengthMs)
  )
    return record;
  if (result.superseded?.length && record.durationMs === report.newLengthMs)
    return { ...record, bytes: upgraded.bytes };
  return {
    ...record,
    bytes: upgraded.bytes,
    durationMs: report.newLengthMs,
    games: record.games.map((game) => ({
      ...game,
      startMs: upgradedTimeMs(report, game.startMs),
    })),
  };
}

/**
 * Update a demo's sidecar like its index entry, keeping its headers;
 * false when the demo has none.
 */
async function patchSidecar(
  key: string,
  result: MigrationResult,
): Promise<boolean> {
  let response;
  try {
    response = await client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    );
  } catch (error) {
    if (error instanceof Error && error.name === "NoSuchKey") return false;
    throw error;
  }
  const body = await response.Body!.transformToString();
  const record = JSON.parse(body) as DemoMetadata;
  const patched = patchRecord(record, result);
  if (patched === record) return true;
  await fs.mkdir(path.join(workDir, "sidecars-before"), { recursive: true });
  await fs
    .writeFile(
      path.join(workDir, "sidecars-before", path.basename(key)),
      body,
      { flag: "wx" },
    )
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: JSON.stringify(patched, null, 2),
      ContentType: response.ContentType,
      CacheControl: response.CacheControl,
      Metadata: response.Metadata,
      IfMatch: response.ETag,
    }),
  );
  return true;
}
