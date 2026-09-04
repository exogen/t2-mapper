/**
 * Per-connection demo recording lifecycle. Packets are buffered in
 * memory until MissionStartPhase1 supplies the mission name (needed
 * up-front in the initial block), then stream through DemoFileWriter.
 * Move blocks are synthesized at the 32 ms demo tick — they are the
 * playback clock — driven purely by packet/send event timestamps.
 */
import crypto from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { demoLog as log } from "./logger.js";
import {
  DEMO_TICK_MS,
  DemoFileWriter,
  MAX_BLOCK_SIZE,
  buildDemoValues,
  buildInitialBlock,
} from "./demoWriter.js";
import type { ServerInfo } from "./types.js";

export type RecorderState =
  "buffering" | "recording" | "finalizing" | "done" | "aborted";

/** Give up waiting for MissionStartPhase1 past these buffering caps. */
const BUFFER_MAX_MS = 30_000;
const BUFFER_MAX_BYTES = 2 * 1024 * 1024;
/** Bound move synthesis across pathological event gaps. */
const MOVE_BURST_CAP = 300;
/** Deflate/fs backlog beyond this means the disk stalled — strand. */
const MAX_STREAM_BACKLOG = 16 * 1024 * 1024;

/**
 * Who we're connected to, as told by the server itself: name and
 * mission type from MsgMissionDropInfo/MsgLoadInfo, sticky across
 * mission-cycle reconnects. The server-list query only ever seeds
 * fields the stream hasn't spoken for yet (`mod` has no stream source).
 */
export interface ServerIdentity {
  name?: string;
  gameType?: string;
  mod?: string;
  /** Tournament mode for the mission being finalized, as told by the
   *  server (the "Server is Running in Tournament Mode" banner / vote
   *  menu). Mission-scoped like gameType. */
  tournament?: boolean;
}

export interface DemoRecorderOptions {
  dir: string;
  /** Session key, e.g. "45.76.24.91:28000". */
  address: string;
  getConnectSequence: () => number;
  /**
   * Used only for the buffering-cap fallback mission name — never for
   * demo metadata (that comes from getServerIdentity).
   */
  getServerInfo: () => ServerInfo | undefined;
  /**
   * Sampled at flush for the in-file $DemoValues and again at finalize
   * for the sidecar (by then the stream has named the server).
   */
  getServerIdentity: () => ServerIdentity;
  /** Current non-observer player count (sampled; the peak decides keep). */
  getActivePlayerCount: () => number;
  /**
   * Current roster names, observers included (sampled; the union across
   * the whole recording lands in the sidecar metadata).
   */
  getPlayerNames: () => string[];
  /** Whether the match is underway (sampled; sticky — a demo that never
   *  saw the match start is dropped as pre-match warmup). */
  getMatchStarted: () => boolean;
  /**
   * Why the session is recording, for the sidecar's `reason`. Sampled
   * during the recording so it reflects the trigger even if watchers
   * leave before finalize.
   */
  getRecordContext?: () => { pinned: boolean; watchers: number };
  recorderName: string;
  /** Compressed size cap; the recording stops growing beyond it. */
  maxBytes: number;
  /** Demos shorter than this are dropped at finalize. */
  minLengthMs: number;
  /** Demos whose peak player count never reached this are dropped. */
  minPlayers: number;
  onStateChange?: (state: RecorderState) => void;
  /** Clock override for tests. */
  now?: () => number;
}

interface QueuedEntry {
  kind: "packet" | "sent";
  data?: Uint8Array;
  time: number;
}

/**
 * One match within a demo. Only missions whose match actually started
 * are listed — warmup-only tails (e.g. a recording ending moments into
 * the next rotation) are excluded.
 */
export interface DemoGame {
  mission: string;
  gameType: string;
  /**
   * Offset into the demo on the move-tick clock.
   */
  startMs: number;
  /** This mission ran in tournament mode. A demo can mix tournament and
   *  non-tournament missions, so it's per-game, not per-demo. */
  tournament: boolean;
}

/**
 * Sidecar record written next to each kept `.rec` — also the exact
 * per-demo record shape in the R2 `index.json` aggregation.
 */
export interface DemoMetadata {
  filename: string;
  bytes: number;
  recordedAt: string;
  server: string;
  address: string;
  /**
   * In demo order. A demo is one connection, so `server`/`address` are
   * constant, but multi-mission demos (imports; future in-place cycle
   * recording) list each started match here.
   */
  games: DemoGame[];
  mod: string;
  recorder: string;
  durationMs: number;
  /**
   * Unique names observed at any point, observers included.
   */
  players: string[];
  /**
   * Why this recording was kept — the trigger (patrol pin / watchers)
   * plus the keep-gate facts (peak players, match started). For debugging
   * why a demo exists at all.
   */
  reason?: string;
  /**
   * A `.commentary.mp3` sidecar exists for this demo. Maintained by
   * the CastGenius repo's upload script and reconciled by
   * backfill-demo-index from the bucket listing; drives the demo
   * browser's indicator.
   */
  hasCommentary?: boolean;
}

/**
 * Drop C0/C1 control chars and DEL — tagged-string prefixes and color
 * codes that would garble JSON consumers. Latin-1 and above survive.
 */
export function sanitizePlayerName(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code >= 0x20 && (code < 0x7f || code > 0x9f)) out += raw[i];
  }
  return out.trim();
}

/** Lowercase slug: special chars stripped, word runs joined with dashes. */
function slugify(part: string): string {
  return part
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * `<server-slug>_<sortable UTC datetime>_<mission-slug>_<random id>.rec`
 * — the random component guarantees uniqueness (same-named servers
 * cycling in the same minute would otherwise collide and corrupt each
 * other's spools).
 */
export function buildDemoFilename(
  date: Date,
  serverName: string,
  missionName: string,
): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}`;
  const serverSlug = slugify(serverName).slice(0, 60) || "server";
  const missionSlug = slugify(missionName).slice(0, 40) || "mission";
  const id = crypto.randomBytes(3).toString("hex");
  return `${serverSlug}_${stamp}_${missionSlug}_${id}.rec`;
}

export class DemoRecorder {
  private opts: DemoRecorderOptions;
  private _state: RecorderState = "buffering";
  private queue: QueuedEntry[] = [];
  private queuedBytes = 0;
  private writer: DemoFileWriter | null = null;
  /** Wall time anchoring the move clock (first observed event). */
  private t0: number | null = null;
  private moveCount = 0;
  private peakPlayers = 0;
  /** Trigger context, accumulated across the recording. */
  private wasPinned = false;
  private peakWatchers = 0;
  private matchStarted = false;
  private playerNames = new Set<string>();
  /** Size cap reached: the spool is complete as it stands. */
  private capped = false;
  /**
   * Fields fixed at flush time; completed into DemoMetadata at finalize.
   */
  private meta: {
    recordedAt: string;
    server: string;
    address: string;
    mission: string;
    mod: string;
    recorder: string;
  } | null = null;
  private _failure: string | null = null;

  constructor(opts: DemoRecorderOptions) {
    this.opts = opts;
  }

  get state(): RecorderState {
    return this._state;
  }

  /** Why the recording stopped on an error (vs the normal empty/too-short
   *  drops). The spool stays on disk for the boot salvage. */
  get failure(): string | null {
    return this._failure;
  }

  /** On-disk spool while recording (null before Phase1 / after close). */
  get partialPath(): string | null {
    return this.writer?.partialPath ?? null;
  }

  private setState(state: RecorderState): void {
    if (this._state === state) return;
    this._state = state;
    this.opts.onStateChange?.(state);
  }

  onPacket(data: Uint8Array): void {
    if (this._state !== "buffering" && this._state !== "recording") return;
    this.sample();
    const now = this.opts.now?.() ?? Date.now();
    // Always copy: the input is a view over the dgram pool buffer, and
    // both the queue and the deflate stream hold bytes past this call.
    const copy = data.slice();
    if (this._state === "buffering") {
      this.t0 ??= now;
      this.queue.push({ kind: "packet", data: copy, time: now });
      this.queuedBytes += copy.length;
      if (
        now - this.t0 > BUFFER_MAX_MS ||
        this.queuedBytes > BUFFER_MAX_BYTES
      ) {
        const fallback = this.opts.getServerInfo()?.mapName ?? "unknown";
        log.warn(
          { address: this.opts.address, fallback },
          "No MissionStartPhase1 within buffering caps; recording with fallback mission name",
        );
        this.flush(fallback);
      }
    } else if (this._state === "recording") {
      this.writeEntry({ kind: "packet", data: copy, time: now });
    }
  }

  /**
   * Fold the current roster into peak count, match flag, and names.
   */
  private sample(): void {
    const players = this.opts.getActivePlayerCount();
    if (players > this.peakPlayers) this.peakPlayers = players;
    if (!this.matchStarted && this.opts.getMatchStarted()) {
      this.matchStarted = true;
    }
    for (const raw of this.opts.getPlayerNames()) {
      const name = sanitizePlayerName(raw);
      if (name && name !== this.opts.recorderName) this.playerNames.add(name);
    }
    const ctx = this.opts.getRecordContext?.();
    if (ctx) {
      if (ctx.pinned) this.wasPinned = true;
      if (ctx.watchers > this.peakWatchers) this.peakWatchers = ctx.watchers;
    }
  }

  /** Human-readable "why this was kept" for the sidecar. */
  private describeKeepReason(): string {
    const parts: string[] = [];
    if (this.wasPinned) parts.push("patrol pin");
    if (this.peakWatchers > 0) {
      parts.push(
        `${this.peakWatchers} watcher${this.peakWatchers === 1 ? "" : "s"}`,
      );
    }
    if (parts.length === 0) parts.push("session recording");
    parts.push(
      `peak ${this.peakPlayers} player${this.peakPlayers === 1 ? "" : "s"}`,
    );
    if (this.matchStarted) parts.push("match started");
    return parts.join(", ");
  }

  onSent(): void {
    const now = this.opts.now?.() ?? Date.now();
    if (this._state === "buffering") {
      this.t0 ??= now;
      this.queue.push({ kind: "sent", time: now });
    } else if (this._state === "recording") {
      this.writeEntry({ kind: "sent", time: now });
    }
  }

  /** Phase1 arrived: open the file and drain the buffered stream. */
  setMissionName(missionName: string): void {
    if (this._state !== "buffering") return;
    // Samples taken while buffering belong to the previous mission
    // (e.g. connecting into an intermission debrief) — the keep gates
    // and sidecar must describe the mission this file actually records.
    // Current players re-latch immediately from the live roster. (The
    // buffering-cap fallback keeps them: with no Phase1, the buffered
    // packets are the same mission the file records.)
    this.matchStarted = false;
    this.peakPlayers = 0;
    this.playerNames.clear();
    this.flush(missionName);
  }

  private flush(missionName: string): void {
    const identity = this.opts.getServerIdentity();
    const date = new Date();
    const serverName = identity.name ?? this.opts.address;
    const demoValues = buildDemoValues({
      recorderName: this.opts.recorderName,
      serverName,
      serverAddress: this.opts.address,
      date,
      missionDisplayName: missionName,
      mod: identity.mod ?? "",
      gameType: identity.gameType ?? "",
    });
    const initialBlock = buildInitialBlock({
      connectSequence: this.opts.getConnectSequence(),
      missionName,
      demoValues,
    });
    this.meta = {
      recordedAt: date.toISOString(),
      server: serverName,
      address: this.opts.address,
      mission: missionName,
      mod: identity.mod ?? "",
      recorder: this.opts.recorderName,
    };
    const filename = buildDemoFilename(date, serverName, missionName);
    this.writer = new DemoFileWriter(path.join(this.opts.dir, filename));
    this.writer.begin(initialBlock);
    this.setState("recording");
    log.info(
      { address: this.opts.address, file: filename, missionName },
      "Demo recording started",
    );

    const queue = this.queue;
    this.queue = [];
    this.queuedBytes = 0;
    log.debug(
      { address: this.opts.address, entries: queue.length },
      "Draining buffered packets into demo",
    );
    for (const entry of queue) {
      if (this._state !== "recording") break;
      this.writeEntry(entry);
    }
  }

  private writeEntry(entry: QueuedEntry): void {
    const writer = this.writer;
    if (!writer || this.capped) return;
    try {
      this.syncClock(entry.time);
      if (entry.kind === "packet") {
        const data = entry.data!;
        if (data.length > MAX_BLOCK_SIZE) {
          log.warn(
            { address: this.opts.address, size: data.length },
            "Skipping oversized packet block",
          );
        } else {
          writer.writePacket(data);
          writer.writeInfo();
        }
      } else {
        writer.writeSendMarker();
      }
    } catch (err) {
      log.error({ err, address: this.opts.address }, "Demo write failed");
      this.strand("write-failed");
      return;
    }
    if (writer.failed) {
      log.error(
        { err: writer.failed, address: this.opts.address },
        "Demo stream failed",
      );
      this.strand("stream-error");
    } else if (writer.bufferedBytes > MAX_STREAM_BACKLOG) {
      log.error(
        { address: this.opts.address, buffered: writer.bufferedBytes },
        "Demo stream backlog exceeded; stranding recording",
      );
      this.strand("backlog");
    } else if (writer.bytesWritten > this.opts.maxBytes) {
      // The recording ends here but is kept: nothing more is written,
      // and the usual finalize (mission end, disconnect, shutdown)
      // turns what's on disk into a complete demo.
      log.warn(
        { address: this.opts.address, bytes: writer.bytesWritten },
        "Demo size cap reached; recording stops growing",
      );
      this.capped = true;
    }
  }

  /**
   * The disk let us down mid-recording. Stop writing and leave the
   * spool where it is: whatever reached the file is salvaged into a
   * `.rec` by the next boot's sweep, which beats deleting a match.
   */
  private strand(failure: string): void {
    if (this._state !== "recording") return;
    this._failure = failure;
    this.setState("aborted");
    void this.writer?.strand();
  }

  /** Bring the synthesized move clock up to `now` (32 ms per move). */
  private syncClock(now: number): void {
    this.t0 ??= now;
    const target = Math.floor((now - this.t0) / DEMO_TICK_MS);
    let pending = target - this.moveCount;
    if (pending <= 0) return;
    if (pending > MOVE_BURST_CAP) {
      // A huge event gap: skip the dead time instead of flooding the
      // file with silence (shift the anchor so the clock stays sane).
      this.t0 += (pending - MOVE_BURST_CAP) * DEMO_TICK_MS;
      pending = MOVE_BURST_CAP;
    }
    for (let i = 0; i < pending; i++) {
      this.writer!.writeMove();
      this.moveCount++;
    }
  }

  /**
   * End the recording. Returns file info, or null when nothing worth
   * keeping was written (still buffering, too short, or failed).
   */
  async finalize(
    reason: string,
  ): Promise<{ path: string; durationMs: number } | null> {
    if (this._state !== "buffering" && this._state !== "recording") {
      return null;
    }
    // Snapshot the identity now, synchronously: the session may start
    // its next epoch (clearing the mission-scoped gameType) or receive
    // the next mission's LoadInfo while the awaits below are in flight.
    const identity = this.opts.getServerIdentity();
    // Final sample — the keep gates below run on up-to-date state even
    // if no packet arrived since the last change.
    this.sample();
    const writer = this.writer;
    if (this._state === "buffering" || !writer) {
      log.debug(
        { address: this.opts.address, reason },
        "Discarding recording that never started (no Phase1)",
      );
      this.setState("aborted");
      return null;
    }
    this.setState("finalizing");
    const durationMs = this.moveCount * DEMO_TICK_MS;
    if (durationMs < this.opts.minLengthMs) {
      log.info(
        { address: this.opts.address, durationMs, reason },
        "Dropping too-short demo",
      );
      await writer.abort();
      this.setState("aborted");
      return null;
    }
    if (this.peakPlayers < this.opts.minPlayers) {
      log.info(
        {
          address: this.opts.address,
          peakPlayers: this.peakPlayers,
          minPlayers: this.opts.minPlayers,
          reason,
        },
        "Dropping demo with too few players",
      );
      await writer.abort();
      this.setState("aborted");
      return null;
    }
    if (!this.matchStarted) {
      log.info(
        { address: this.opts.address, durationMs, reason },
        "Dropping pre-match demo (match never started)",
      );
      await writer.abort();
      this.setState("aborted");
      return null;
    }
    try {
      await writer.finalize(durationMs);
    } catch (err) {
      // Keep the spool: the boot salvage can still recover everything
      // that reached the disk before the failure.
      log.error({ err, address: this.opts.address }, "Demo finalize failed");
      this._failure = "finalize-failed";
      await writer.strand();
      this.setState("aborted");
      return null;
    }
    await this.writeSidecar(writer.finalPath, durationMs, identity);
    this.setState("done");
    log.info(
      {
        address: this.opts.address,
        file: writer.finalPath,
        durationMs,
        bytes: writer.bytesWritten,
        peakPlayers: this.peakPlayers,
        players: this.playerNames.size,
        reason,
      },
      "Demo recording finalized",
    );
    return { path: writer.finalPath, durationMs };
  }

  /**
   * Best-effort: a failed sidecar never fails the demo itself — the
   * upload proceeds and only the index entry is lost (rebuildable).
   */
  private async writeSidecar(
    finalPath: string,
    durationMs: number,
    // Sampled at finalize entry: MsgMissionDropInfo arrives after
    // recording starts, so finalize-time identity is stream-authoritative
    // where flush-time values may still be seeds or fallbacks.
    identity: ServerIdentity,
  ): Promise<void> {
    const meta = this.meta;
    if (!meta) return;
    try {
      const { size } = await fsp.stat(finalPath);
      const record: DemoMetadata = {
        filename: path.basename(finalPath),
        bytes: size,
        recordedAt: meta.recordedAt,
        server: identity.name ?? meta.server,
        address: meta.address,
        // One mission per recording today (the session reconnects each
        // cycle), and the keep gates guarantee its match started.
        games: [
          {
            mission: meta.mission,
            gameType: identity.gameType ?? "",
            startMs: 0,
            tournament: identity.tournament ?? false,
          },
        ],
        mod: meta.mod,
        recorder: meta.recorder,
        durationMs,
        reason: this.describeKeepReason(),
        players: [...this.playerNames].sort((a, b) =>
          a.localeCompare(b, "en", { sensitivity: "base" }),
        ),
      };
      await fsp.writeFile(`${finalPath}.json`, JSON.stringify(record, null, 2));
    } catch (err) {
      log.warn(
        { err, address: this.opts.address, file: finalPath },
        "Demo sidecar write failed",
      );
    }
  }

  async abort(): Promise<void> {
    if (this._state === "done" || this._state === "aborted") return;
    this.setState("aborted");
    this.queue = [];
    this.queuedBytes = 0;
    await this.writer?.abort();
  }
}
