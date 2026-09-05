/**
 * Backfill demo metadata sidecars and rebuild the index from the .rec
 * files already in R2. For each demo without a `.rec.json` sidecar, the
 * demo is downloaded and analyzed — header fields come from the initial
 * block's $DemoValue rows, and the player list is accumulated by
 * replaying every packet through the same parser + WatchStateAccumulator
 * the live relay uses, so backfilled sidecars match live-written ones.
 * Finally `index.json` is rebuilt from all sidecar records, which makes
 * this script double as the index disaster-recovery tool.
 *
 * R2 credentials come from the same DEMO_R2_* env vars as the relay
 * (loaded from .env.development.local via the `backfill-demos` npm
 * script). Idempotent: existing sidecars are reused, not re-analyzed,
 * unless --force is given.
 */
import path from "node:path";
import { parseArgs } from "node:util";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  BlockTypeMove,
  BlockTypePacket,
  DemoParser,
  createLiveParser,
  type RemoteCommandEventData,
} from "t2-demo-parser";
import { listAllObjects, r2Client } from "./lib/r2";
import {
  sanitizePlayerName,
  type DemoGame,
  type DemoMetadata,
} from "../relay/demoRecorder.js";
import { WatchStateAccumulator } from "../relay/watchState.js";
import { extractMissionInfo } from "../src/stream/demoStreaming";

const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    concurrency: { type: "string", default: "4" },
    help: { type: "boolean", default: false, short: "h" },
  },
});

if (values.help) {
  console.error("Usage: npm run backfill-demos [-- options]");
  console.error();
  console.error("Options:");
  console.error("  --dry-run          Analyze only; write nothing to R2");
  console.error(
    "  --force            Re-analyze demos that already have sidecars",
  );
  console.error("  --concurrency <n>  Parallel demo downloads (default: 4)");
  process.exit(1);
}

const dryRun = values["dry-run"];
const force = values.force;
const concurrency = Math.max(1, parseInt(values.concurrency!, 10) || 4);

const { client, config } = r2Client("npm run backfill-demos");

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/**
 * Retail demo date ("May-16-2025 5:04AM", always UTC) → ISO string.
 */
function parseDemoDate(value: string): string | null {
  const m = /^([A-Z][a-z]{2})-(\d{1,2})-(\d{4}) (\d{1,2}):(\d{2})(AM|PM)$/.exec(
    value.trim(),
  );
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]);
  if (month < 0) return null;
  let hours = parseInt(m[4], 10) % 12;
  if (m[6] === "PM") hours += 12;
  const date = new Date(
    Date.UTC(
      parseInt(m[3], 10),
      month,
      parseInt(m[2], 10),
      hours,
      parseInt(m[5], 10),
    ),
  );
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Fallback for demos with unparseable $DemoValue dates: the filename's
 * `_YYYYMMDDTHHMM_` stamp (also UTC, also minute precision).
 */
function parseFilenameDate(filename: string): string | null {
  const m = /_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})_/.exec(filename);
  if (!m) return null;
  const date = new Date(
    Date.UTC(
      parseInt(m[1], 10),
      parseInt(m[2], 10) - 1,
      parseInt(m[3], 10),
      parseInt(m[4], 10),
      parseInt(m[5], 10),
    ),
  );
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * The PJ tail rows of the $DemoValue array, via the app's own extractor
 * (one reader for the layout the relay writes); the date is converted
 * to ISO here.
 */
function parseDemoValues(demoValues: string[]) {
  const info = extractMissionInfo(demoValues);
  return {
    recorder: info.recorderName ?? "",
    server: info.serverDisplayName ?? "",
    address: info.serverAddress ?? "",
    recordedAt: info.recordingDate ? parseDemoDate(info.recordingDate) : null,
    mission: info.missionDisplayName ?? "",
    mod: info.mod ?? "",
    gameType: info.missionType ?? "",
  };
}

/**
 * Reproduce what the live recorder's sidecar would have contained, by
 * replaying the demo's packets through the relay's own accumulator and
 * sampling the roster after each packet (union = every name observed,
 * observers included, recorder excluded — same rules as live).
 */
async function analyzeDemo(
  bytes: Uint8Array,
  filename: string,
): Promise<DemoMetadata> {
  const parser = new DemoParser(bytes);
  const { header, initialBlock } = await parser.load();
  const info = parseDemoValues(initialBlock.demoValues);

  // Passive-observer parser seeded from the initial block, mirroring
  // the relay session and the watch catch-up equivalence spec.
  const kit = createLiveParser({
    dataBlocks: [...initialBlock.dataBlocks.entries()].map(
      ([id, db]) => [id, db.data] as [number, Record<string, unknown>],
    ),
    ghosts: initialBlock.initialGhosts
      .filter((g) => g.type === "create" && g.classId != null)
      .map((g) => ({ index: g.index, classId: g.classId! })),
    connectionProtocolState: {
      ...initialBlock.connectionState,
      lastSendSeq: 0x1fffffff,
    },
    nextRecvEventSeq: initialBlock.nextRecvEventSeq,
  });
  const watchState = new WatchStateAccumulator();
  for (const [id, value] of initialBlock.taggedStrings) {
    watchState.netStrings.set(id, value);
  }

  const players = new Set<string>();
  const games: DemoGame[] = [];
  // The mission in progress but not yet confirmed started; promoted to
  // `games` the moment the match starts (MsgMissionStart or a running
  // clock), so warmup-only missions never produce an entry.
  // || (not ??): the parser initializes missionName to "" and only
  // fills it when the initial block's phase-2 parse succeeds.
  const firstMission = initialBlock.missionName || info.mission;
  let pending: { mission: string; startMs: number } | null = firstMission
    ? { mission: firstMission, startMs: 0 }
    : null;
  // The most recent promoted game, patchable while its mission is still
  // current (its MsgLoadInfo type may arrive after the match starts).
  let lastGame: DemoGame | null = null;
  let currentMission = pending?.mission ?? null;
  // A from-connect recording (relay: empty initial datablock table, the
  // stream carries them) replays MissionStartPhase1 for the mission the
  // initial block already seeded — ignore that one repeat only, so a
  // later back-to-back rematch on the same map still opens a new game.
  // A retail mid-match demo's first Phase1 is always a new match.
  let awaitingSeedPhase1 =
    pending !== null && initialBlock.dataBlocks.size === 0;
  let moveTicks = 0;
  const MOVE_TICK_MS = 32;

  for (let block = parser.nextBlock(); block; block = parser.nextBlock()) {
    if (block.type === BlockTypeMove) {
      moveTicks++;
      continue;
    }
    if (block.type !== BlockTypePacket) continue;
    let parsed;
    try {
      parsed = kit.packetParser.parsePacket(block.data);
    } catch (err) {
      // Same stance as the live session: state past a parse failure is
      // unreliable. Keep what was accumulated up to this point, but flag
      // the demo so the summary (and exit code) say its metadata is
      // partial rather than passing it off as complete.
      partialDemos.push(filename);
      console.warn(
        `  ${filename}: packet parse failed mid-demo, ` +
          `keeping ${players.size} players seen so far (${String(err)})`,
      );
      break;
    }
    if (!parsed) continue;
    watchState.applyPacket(parsed);

    // Mission boundary (mirrors the live session's Phase1 handling):
    // reset mission-scoped state and open a new pending game.
    for (const evt of parsed.events) {
      if (evt.parsedData?.type !== "RemoteCommandEvent") continue;
      const cmd = evt.parsedData as RemoteCommandEventData;
      if (
        watchState.resolveNetString(cmd.funcName ?? "") !== "MissionStartPhase1"
      ) {
        continue;
      }
      const mission = watchState.resolveNetString(cmd.args?.[1] ?? "");
      if (!mission) continue;
      if (awaitingSeedPhase1 && mission === currentMission) {
        awaitingSeedPhase1 = false;
        continue;
      }
      awaitingSeedPhase1 = false;
      watchState.beginMissionChange();
      currentMission = mission;
      pending = { mission, startMs: moveTicks * MOVE_TICK_MS };
      lastGame = null;
    }

    if (pending && watchState.matchStarted) {
      lastGame = {
        mission: pending.mission,
        gameType: watchState.missionType ?? "",
        startMs: pending.startMs,
        tournament: watchState.tournamentMode ?? false,
      };
      games.push(lastGame);
      pending = null;
    }
    if (lastGame && !lastGame.gameType && watchState.missionType) {
      lastGame.gameType = watchState.missionType;
    }
    if (lastGame && !lastGame.tournament && watchState.tournamentMode) {
      lastGame.tournament = true;
    }

    for (const raw of watchState.getRosterNames()) {
      const name = sanitizePlayerName(raw);
      if (name && name !== info.recorder) players.add(name);
    }
  }

  return {
    filename,
    bytes: bytes.length,
    recordedAt:
      info.recordedAt ??
      parseFilenameDate(filename) ??
      new Date(0).toISOString(),
    // The stream is authoritative: the server names itself via
    // MsgMissionDropInfo/MsgLoadInfo during the recording, overriding
    // whatever the recorder baked into $DemoValues at flush time.
    server: watchState.serverName ?? info.server,
    address: info.address,
    games,
    mod: info.mod,
    recorder: info.recorder,
    durationMs: header.demoLengthMs,
    // The recorder's original keep-trigger (patrol/watchers) isn't in the
    // .rec; describe what the replay reconstructed instead.
    reason: `backfilled: ${players.size} players, ${games.length} game${games.length === 1 ? "" : "s"}`,
    players: [...players].sort((a, b) =>
      a.localeCompare(b, "en", { sensitivity: "base" }),
    ),
  };
}

async function listBucket(): Promise<Map<string, number>> {
  const objects = await listAllObjects(client, config);
  return new Map(objects.map((o) => [o.key, o.size]));
}

async function getObjectBytes(key: string): Promise<Uint8Array> {
  const res = await client.send(
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
  );
  return res.Body!.transformToByteArray();
}

async function putJson(
  key: string,
  body: string,
  cacheControl: string,
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: "application/json; charset=utf-8",
      CacheControl: cacheControl,
    }),
  );
}

async function runPool(
  items: string[],
  worker: (item: string) => Promise<void>,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        await worker(items[next++]);
      }
    }),
  );
}

console.log(`Listing s3://${config.bucket}/${config.prefix}...`);
const objects = await listBucket();
const recKeys = [...objects.keys()].filter((k) => k.endsWith(".rec")).sort();
const sidecarKeys = new Set(
  [...objects.keys()].filter((k) => k.endsWith(".rec.json")),
);
console.log(
  `${recKeys.length} demos, ${sidecarKeys.size} existing sidecars` +
    `${dryRun ? " (dry run — nothing will be written)" : ""}`,
);

const records: DemoMetadata[] = [];
/** Demos whose replay stopped at a parse failure (metadata incomplete). */
const partialDemos: string[] = [];
let analyzed = 0;
let reused = 0;
let failed = 0;

/**
 * Does the bucket hold commentary audio for a demo — the unlabelled
 * `<key>.commentary.m4a` or any labelled `<key>.<label>.commentary.m4a`
 * (or the mp3 either was before the Opus switch)?
 * (The track LIST lives in the cast sidecar, appended to by the
 * generators; the record only carries the flag the demo browser shows.)
 */
function commentaryInBucket(key: string): boolean {
  const re = new RegExp(
    `^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.(?:[A-Za-z0-9_-]+\\.)?commentary\\.(?:m4a|mp3)$`,
  );
  for (const k of objects.keys()) if (re.test(k)) return true;
  return false;
}

/** Reconcile the record's commentary flag against the bucket. Returns
 *  whether it changed. */
function reconcileCommentary(record: DemoMetadata, key: string): boolean {
  const hasCommentary = commentaryInBucket(key);
  if ((record.hasCommentary === true) === hasCommentary) return false;
  record.hasCommentary = hasCommentary;
  return true;
}

/** The flag changes after the demo is written, so records are cached
 *  with revalidation, not as immutable. */
const RECORD_CACHE_CONTROL = "no-cache";

await runPool(recKeys, async (key) => {
  const filename = path.basename(key);
  const sidecarKey = `${key}.json`;
  try {
    if (!force && sidecarKeys.has(sidecarKey)) {
      const raw = JSON.parse(
        Buffer.from(await getObjectBytes(sidecarKey)).toString("utf-8"),
      ) as DemoMetadata;
      if (Array.isArray(raw.games)) {
        // Reconcile the commentary fields against the bucket listing —
        // the sidecar fields that change after the demo is written.
        if (reconcileCommentary(raw, key)) {
          if (!dryRun) {
            await putJson(
              sidecarKey,
              JSON.stringify(raw, null, 2),
              RECORD_CACHE_CONTROL,
            );
          }
          console.log(
            `${dryRun ? "[dry-run] " : ""}${filename}: ` +
              `hasCommentary → ${raw.hasCommentary}`,
          );
        }
        records.push(raw);
        reused++;
        return;
      }
      // A sidecar from an older relay version (pre-`games` shape):
      // fall through to a full re-analysis instead of reshaping it —
      // the replay also recovers stream-authoritative server/gameType
      // and per-game data the old writer didn't record.
      console.log(`${filename}: old-format sidecar — re-analyzing`);
    }
    const bytes = await getObjectBytes(key);
    const record = await analyzeDemo(bytes, filename);
    reconcileCommentary(record, key);
    records.push(record);
    analyzed++;
    const gameSummary =
      record.games.map((g) => `${g.mission} (${g.gameType})`).join(", ") ||
      "no started games";
    console.log(
      `${dryRun ? "[dry-run] " : ""}${filename}: ` +
        `${gameSummary} on ${record.server}, ` +
        `${Math.round(record.durationMs / 1000)}s, ` +
        `${record.players.length} players`,
    );
    if (!dryRun) {
      await putJson(
        sidecarKey,
        JSON.stringify(record, null, 2),
        RECORD_CACHE_CONTROL,
      );
    }
  } catch (err) {
    failed++;
    console.error(`FAILED ${filename}: ${String(err)}`);
  }
});

records.sort(
  (a, b) =>
    a.recordedAt.localeCompare(b.recordedAt) ||
    a.filename.localeCompare(b.filename),
);
const indexKey = `${config.prefix}index.json`;
if (failed > 0) {
  // A partial rebuild would silently drop the failed demos from the
  // index (their sidecars survive, but nothing re-adds them until a
  // run where every fetch succeeds). Keep the existing index instead.
  console.error(
    `NOT writing ${indexKey}: ${failed} demo(s) failed — fix and re-run`,
  );
} else if (recKeys.length === 0) {
  // An empty listing is more likely a wrong DEMO_R2_PREFIX than a
  // genuinely empty bucket — never clobber a good index with [].
  console.error(`NOT writing ${indexKey}: no demos found under prefix`);
} else if (dryRun) {
  console.log(
    `[dry-run] Would write ${indexKey} with ${records.length} entries`,
  );
} else {
  await putJson(indexKey, JSON.stringify(records), "no-cache");
  console.log(`Wrote ${indexKey} with ${records.length} entries`);
}
console.log(
  `Done: ${analyzed} analyzed, ${reused} sidecars reused, ${failed} failed`,
);
if (partialDemos.length > 0) {
  console.error(
    `WARNING: ${partialDemos.length} demo(s) hit a mid-demo parse failure; ` +
      `their sidecars are partial (truncated players/games):\n  ` +
      partialDemos.join("\n  "),
  );
}
if (failed > 0 || partialDemos.length > 0) process.exitCode = 1;
