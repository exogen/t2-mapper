/**
 * Recovery for recordings the relay never got to finalize — a crash, an
 * OOM kill, a disk that failed mid-match. A `.rec.partial` spool is a
 * complete header and initial block followed by a raw deflate stream
 * that DemoFileWriter sync-flushes every few seconds, so everything up
 * to the last flush is intact. Salvage inflates that much, drops the
 * torn tail block, re-compresses, and writes a proper `.rec` plus a
 * sidecar rebuilt from the demo values the relay itself wrote into the
 * initial block. Player names are not recoverable without a full parse,
 * which a 1 GB shared VM shouldn't attempt at boot; the sidecar says so.
 */
import fsp from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import zlib from "node:zlib";
import { BlockTypeMove, DemoParser } from "t2-demo-parser";
import { demoLog as log } from "./logger.js";
import {
  DEMO_IDENT_STRING,
  DEMO_LENGTH_MS_OFFSET,
  DEMO_PROTOCOL_VERSION,
  DEMO_TICK_MS,
  buildHeader,
} from "./demoWriter.js";
import type { DemoMetadata } from "./demoRecorder.js";

const inflateRaw = promisify(zlib.inflateRaw);
const deflateRaw = promisify(zlib.deflateRaw);

export const PARTIAL_SUFFIX = ".partial";
/** A spool salvage gave up on: never retried, parked in the bucket's
 *  `failed/` prefix by the uploader for inspection. */
export const FAILED_SUFFIX = ".partial.failed";
/** In-progress salvage output; replaced wholesale on the next attempt. */
const SALVAGING_SUFFIX = ".salvaging";
/** Refuse block streams larger than this once inflated (memory guard). */
const MAX_INFLATED_BYTES = 512 * 1024 * 1024;

export interface SalvageOptions {
  /** Spools shorter than this are discarded like any too-short demo. */
  minLengthMs: number;
  /** Clock override for tests. */
  now?: () => number;
}

export type SalvageOutcome =
  /** A demo was written (+ sidecar) and the spool removed. */
  | { kind: "kept"; path: string; durationMs: number }
  /** Nothing worth keeping; the spool is gone. */
  | { kind: "dropped" }
  /** The spool couldn't be read; it now sits at `path` (`.partial.failed`). */
  | { kind: "failed"; path: string };

/**
 * Turn `<name>.rec.partial` into `<name>.rec` (+ sidecar). On any
 * failure the spool is renamed to `.partial.failed` and left for the
 * uploader to park in the bucket.
 */
export async function salvagePartialDemo(
  partialPath: string,
  opts: SalvageOptions,
): Promise<SalvageOutcome> {
  if (!partialPath.endsWith(PARTIAL_SUFFIX)) {
    throw new Error(`not a spool: ${partialPath}`);
  }
  const finalPath = partialPath.slice(0, -PARTIAL_SUFFIX.length);
  const name = path.basename(finalPath);
  if (await exists(finalPath)) {
    // A previous salvage got as far as the rename and died before the
    // unlink — the demo is already whole.
    log.info({ file: name }, "Salvaged demo already present; dropping spool");
    await fsp.unlink(partialPath);
    return { kind: "dropped" };
  }
  try {
    return await salvage(partialPath, finalPath, opts);
  } catch (err) {
    const failedPath = finalPath + FAILED_SUFFIX;
    log.error({ err, file: name }, "Demo salvage failed; keeping spool");
    await fsp.rename(partialPath, failedPath);
    return { kind: "failed", path: failedPath };
  }
}

async function salvage(
  partialPath: string,
  finalPath: string,
  opts: SalvageOptions,
): Promise<SalvageOutcome> {
  const name = path.basename(finalPath);
  const spool = new Uint8Array(await fsp.readFile(partialPath));
  const { header, byteLength } = DemoParser.peekHeader(spool);
  if (
    header.identString !== DEMO_IDENT_STRING ||
    header.protocolVersion !== DEMO_PROTOCOL_VERSION
  ) {
    throw new Error("not a Tribes 2 recording spool");
  }
  const prefixEnd = byteLength + header.initialBlockSize;
  if (prefixEnd > spool.length) {
    throw new Error("spool ends inside the initial block");
  }
  const initialBlock = spool.subarray(byteLength, prefixEnd);

  // Everything up to the last sync flush inflates cleanly; the stream
  // has no end marker, which Z_SYNC_FLUSH tolerates.
  const compressed = spool.subarray(prefixEnd);
  const inflated =
    compressed.length > 0
      ? await inflateRaw(compressed, {
          finishFlush: zlib.constants.Z_SYNC_FLUSH,
          maxOutputLength: MAX_INFLATED_BYTES,
        })
      : new Uint8Array(0);
  const { end, moves } = scanBlocks(inflated);
  const durationMs = moves * DEMO_TICK_MS;

  if (durationMs < opts.minLengthMs) {
    log.info(
      { file: name, durationMs, minLengthMs: opts.minLengthMs },
      "Dropping too-short crashed recording",
    );
    await fsp.unlink(partialPath);
    return { kind: "dropped" };
  }

  const values = await readRelayDemoValues(spool.subarray(0, prefixEnd));
  const deflated = await deflateRaw(inflated.subarray(0, end));
  const headerBytes = buildHeader(initialBlock.length);
  new DataView(headerBytes.buffer).setUint32(
    DEMO_LENGTH_MS_OFFSET,
    durationMs >>> 0,
    true,
  );

  const salvagingPath = finalPath + SALVAGING_SUFFIX;
  const handle = await fsp.open(salvagingPath, "w");
  try {
    await handle.write(headerBytes);
    await handle.write(initialBlock);
    await handle.write(deflated);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fsp.rename(salvagingPath, finalPath);

  const stat = await fsp.stat(partialPath);
  const recordedAt = new Date(
    stat.birthtimeMs > 0
      ? stat.birthtimeMs
      : (opts.now?.() ?? Date.now()) - durationMs,
  );
  const record: DemoMetadata = {
    filename: name,
    bytes: (await fsp.stat(finalPath)).size,
    recordedAt: recordedAt.toISOString(),
    server: values.server,
    address: values.address,
    games: [
      {
        mission: values.mission,
        gameType: values.gameType,
        startMs: 0,
        tournament: false,
      },
    ],
    mod: values.mod,
    recorder: values.recorder,
    durationMs,
    players: [],
    reason: "salvaged from a crashed recording (players unknown)",
  };
  try {
    await fsp.writeFile(`${finalPath}.json`, JSON.stringify(record, null, 2));
  } catch (err) {
    // Like the recorder: a lost sidecar costs the index entry, not the demo.
    log.warn({ err, file: name }, "Salvaged demo sidecar write failed");
  }
  await fsp.unlink(partialPath);
  log.info(
    { file: name, durationMs, droppedTailBytes: inflated.length - end },
    "Salvaged crashed recording",
  );
  return { kind: "kept", path: finalPath, durationMs };
}

/**
 * Walk the block framing (U16 LE: type << 12 | size) to the last block
 * that is complete, counting Move blocks for the demo clock.
 */
function scanBlocks(stream: Uint8Array): { end: number; moves: number } {
  const view = new DataView(
    stream.buffer,
    stream.byteOffset,
    stream.byteLength,
  );
  let off = 0;
  let moves = 0;
  while (off + 2 <= stream.length) {
    const typeSize = view.getUint16(off, true);
    const size = typeSize & 0xfff;
    if (off + 2 + size > stream.length) break;
    if (typeSize >> 12 === BlockTypeMove) moves++;
    off += 2 + size;
  }
  return { end: off, moves };
}

interface RelayDemoValues {
  recorder: string;
  server: string;
  address: string;
  mission: string;
  mod: string;
  gameType: string;
}

/**
 * Read back the `readplayerinfo` rows buildDemoValues wrote (see
 * demoWriter.ts): row 1 names the recorder, row 2 the server/address/
 * date/mission, row 3 the mod and game type.
 */
async function readRelayDemoValues(
  headerAndInitialBlock: Uint8Array,
): Promise<RelayDemoValues> {
  const parser = new DemoParser(headerAndInitialBlock, { incremental: true });
  const { initialBlock } = await parser.load();
  const rows = initialBlock.demoValues;
  const tail = rows.indexOf("NewDemoData");
  const row = (n: string): string[] =>
    rows
      .slice(tail < 0 ? 0 : tail)
      .find((r) => r.startsWith(`${n}\t`))
      ?.split("\t") ?? [];
  const [, , recorder = ""] = row("1");
  const [, server = "", address = "", , mission = ""] = row("2");
  const [, mod = "", gameType = ""] = row("3");
  return { recorder, server, address, mission, mod, gameType };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}
