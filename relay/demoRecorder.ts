/**
 * Per-connection demo recording lifecycle. Packets are buffered in
 * memory until MissionStartPhase1 supplies the mission name and the
 * server names itself (MsgMissionDropInfo, seconds later), both needed
 * up-front in the initial block and the filename, then stream through
 * DemoFileWriter, starting after the T2CSRI handshake (demoStart.ts), with
 * a welcome page that would strand Tribes2.exe playback rewritten
 * (joinGameOver.ts).
 * Move blocks are the connection's own moves, one per 32 ms client tick,
 * in order with its packets and send markers — they are the playback
 * clock.
 */
import crypto from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { demoLog as log } from "./logger.js";
import {
  DEMO_TICK_MS,
  DemoFileWriter,
  buildDemoValues,
  buildInitialBlock,
} from "./demoWriter.js";
import {
  planDemoStart,
  type DemoStartPlan,
  type DemoStreamEntry,
} from "./demoStart.js";
import type { ServerInfo } from "./types.js";
import { DemoPlayers, type DemoPlayerRoster } from "./demoPlayers.js";
import { JoinGameOverFilter } from "./joinGameOver.js";

/**
 * "buffering" holds the stream in memory until MissionStartPhase1, and
 * "naming" holds it from there until the server names itself.
 */
export type RecorderState =
  "buffering" | "naming" | "recording" | "finalizing" | "done" | "aborted";

/** Give up waiting for MissionStartPhase1 past these buffering caps. */
const BUFFER_MAX_MS = 30_000;
const BUFFER_MAX_BYTES = 2 * 1024 * 1024;
/**
 * Give up waiting for the server to name itself this long after Phase1, or
 * past BUFFER_MAX_BYTES. MsgMissionDropInfo comes at the drop, after the
 * datablocks: 1:15 after Phase1 at the slowest in the corpus.
 */
const NAME_WAIT_MAX_MS = 3 * 60_000;
/** Deflate/fs backlog beyond this means the disk stalled — strand. */
const MAX_STREAM_BACKLOG = 16 * 1024 * 1024;

/**
 * Who we're connected to, as told by the server itself: name and
 * mission type from MsgMissionDropInfo/MsgLoadInfo. The server-list query
 * only ever seeds the mission type until the stream speaks for it, and
 * `mod`, which has no stream source; the name is the stream's alone.
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
   * Used only for fallbacks past the buffering caps: the mission name
   * when Phase1 never comes, and the server name when the stream never
   * names the server. Demo metadata comes from getServerIdentity.
   */
  getServerInfo: () => ServerInfo | undefined;
  /**
   * Sampled to open the file once the stream has named the server, for
   * the in-file $DemoValues, and again at finalize for the sidecar.
   */
  getServerIdentity: () => ServerIdentity;
  /** Current non-observer player count (sampled; the peak decides keep). */
  getActivePlayerCount: () => number;
  /**
   * Current roster keyed by stable client ID, observers included.
   */
  getPlayerRoster: () => DemoPlayerRoster;
  getRecorderClientId: () => number | null;
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

/**
 * One match within a demo. Only missions whose match actually started
 * are listed — warmup-only tails (e.g. a recording ending moments into
 * the next rotation) are excluded.
 */
export interface DemoGame {
  mission: string;
  /** Server mission counter; group with address + mission, not globally unique.
   *  Absent when the recording never observed the mission handshake. */
  missionSequence?: number;
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
   * Unique names observed at any point, observers included. A player can
   * have several aliases; this is the search list, not the player count.
   */
  players: string[];
  /** Unique tag-less names seen, excluding the recorder. Missing on legacy
   *  or salvaged records whose roster has not been analyzed yet. */
  playerCount?: number;
  /**
   * Why this recording was kept — the trigger (patrol pin / watchers)
   * plus the keep-gate facts (peak players, match started). For debugging
   * why a demo exists at all.
   */
  reason?: string;
  /**
   * A `.commentary.m4a` (or legacy `.mp3`) sidecar exists for this demo. Maintained by
   * the CastGenius repo's upload script and reconciled by
   * backfill-demo-index from the bucket listing; drives the demo
   * browser's indicator.
   */
  hasCommentary?: boolean;
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
  private queue: DemoStreamEntry[] = [];
  private queuedBytes = 0;
  private writer: DemoFileWriter | null = null;
  private joinGameOver: JoinGameOverFilter | null = null;
  /**
   * When buffering began (first observed event), for the buffering caps.
   */
  private t0: number | null = null;
  private moveCount = 0;
  private peakPlayers = 0;
  /** Trigger context, accumulated across the recording. */
  private wasPinned = false;
  private peakWatchers = 0;
  private matchStarted = false;
  private players: DemoPlayers;
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
    missionSequence?: number;
    mod: string;
    recorder: string;
  } | null = null;
  /**
   * Phase1's mission while "naming", for the file the stream's server
   * name opens.
   */
  private pending: {
    mission: string;
    missionSequence?: number;
    /**
     * When Phase1 arrived: the recording's date.
     */
    date: Date;
    /**
     * Phase1 on the buffering clock, for NAME_WAIT_MAX_MS.
     */
    at: number;
  } | null = null;
  private _failure: string | null = null;
  private strandedClose: Promise<void> | undefined;

  constructor(opts: DemoRecorderOptions) {
    this.opts = opts;
    this.players = new DemoPlayers(opts.recorderName);
  }

  get state(): RecorderState {
    return this._state;
  }

  /**
   * The stream goes to the queue, not yet to a file.
   */
  private get holding(): boolean {
    return this._state === "buffering" || this._state === "naming";
  }

  private get qualificationFailure():
    "too-short" | "too-few-players" | "match-not-started" | null {
    if (this.moveCount * DEMO_TICK_MS < this.opts.minLengthMs)
      return "too-short";
    if (this.peakPlayers < this.opts.minPlayers) return "too-few-players";
    if (!this.matchStarted) return "match-not-started";
    return null;
  }

  /** Why the recording stopped on an error (vs the normal empty/too-short
   *  drops). The spool stays on disk for the boot salvage. */
  get failure(): string | null {
    return this._failure;
  }

  /**
   * On-disk spool while recording (null before the file opens / after
   * close).
   */
  get partialPath(): string | null {
    return this.writer?.partialPath ?? null;
  }

  private setState(state: RecorderState): void {
    if (this._state === state) return;
    this._state = state;
    this.opts.onStateChange?.(state);
  }

  /**
   * Record a received data packet; returns whether it was accepted into
   * the recording. A `dispatched` packet (the connection applies its data)
   * is followed by an Info block, as Tribes2.exe writes one only from
   * GameConnection::readPacket; pings, acks, duplicates and rejected
   * packets get the Packet block alone.
   */
  onPacket(data: Uint8Array, dispatched: boolean): boolean {
    if (this.capped || (!this.holding && this._state !== "recording"))
      return false;
    this.sample();
    // Always copy: the input is a view over the dgram pool buffer, and
    // both the queue and the deflate stream hold bytes past this call.
    const copy = data.slice();
    if (this.holding) {
      const now = this.opts.now?.() ?? Date.now();
      this.t0 ??= now;
      this.queue.push({ kind: "packet", data: copy, dispatched });
      this.queuedBytes += copy.length;
      if (this.pending) {
        if (
          now - this.pending.at > NAME_WAIT_MAX_MS ||
          this.queuedBytes > BUFFER_MAX_BYTES
        ) {
          log.warn(
            { address: this.opts.address, mission: this.pending.mission },
            "Server never named itself within buffering caps; recording under its listed name or address",
          );
          this.startPending();
        }
      } else if (
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
      this.writeEntry({ kind: "packet", data: copy, dispatched });
    }
    return true;
  }

  /**
   * Sample during/after applying a packet accepted by onPacket, including
   * the last packet that trips the size cap. Never sample later packets.
   * Opens the file once the packet has named the server.
   */
  sampleRecordedState(): void {
    if (!this.holding && this._state !== "recording") return;
    this.sample();
    if (this.pending && this.opts.getServerIdentity().name) this.startPending();
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
    this.players.sample(
      this.opts.getPlayerRoster(),
      this.opts.getRecorderClientId(),
    );
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

  /**
   * The connection sent a data packet (SendPacket marker).
   */
  onSent(): void {
    this.onConnectionEntry("sent");
  }

  /**
   * The connection queued a move (Move block, one 32 ms client tick).
   */
  onMove(): void {
    this.onConnectionEntry("move");
  }

  private onConnectionEntry(kind: "sent" | "move"): void {
    if (this.capped) return;
    if (this.holding) {
      this.t0 ??= this.opts.now?.() ?? Date.now();
      this.queue.push({ kind });
    } else if (this._state === "recording") {
      this.writeEntry({ kind });
    }
  }

  /**
   * Phase1 arrived: the recording's mission. The file opens once the
   * stream has named the server too (sampleRecordedState).
   */
  setMissionName(missionName: string, missionSequence?: number): void {
    // Phase1 can come again for the recording's mission: after the
    // buffering-cap fallback already opened a file, or while naming.
    const claimed =
      this._state === "recording"
        ? this.meta
        : this._state === "naming"
          ? this.pending
          : null;
    if (claimed?.mission === missionName)
      claimed.missionSequence ??= missionSequence;
    if (this._state !== "buffering") return;
    // Samples taken while buffering belong to the previous mission
    // (e.g. connecting into an intermission debrief) — the keep gates
    // must describe the mission this file actually records. Keep names:
    // buffered packets after the handshake are also written, and the
    // server sends its roster after the handshake, so those aliases are
    // in the demo (all but a name changed during the handshake, which
    // the start's roster holds only in its new form).
    // Current players re-latch immediately from the live roster. (The
    // buffering-cap fallback keeps them: with no Phase1, the buffered
    // packets are the same mission the file records.)
    this.matchStarted = false;
    this.peakPlayers = 0;
    this.pending = {
      mission: missionName,
      missionSequence,
      date: new Date(),
      at: this.opts.now?.() ?? Date.now(),
    };
    if (this.opts.getServerIdentity().name) this.startPending();
    else this.setState("naming");
  }

  private startPending(): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    this.flush(pending.mission, pending.missionSequence, pending.date);
  }

  private flush(
    missionName: string,
    missionSequence?: number,
    date = new Date(),
  ): void {
    const connectSequence = this.opts.getConnectSequence();
    const bufferedMs =
      this.t0 === null ? 0 : (this.opts.now?.() ?? Date.now()) - this.t0;
    let plan: DemoStartPlan;
    let startLogLevel: "info" | "warn" | "error" = "info";
    let reconstructionError: unknown;
    try {
      plan = planDemoStart(this.queue, connectSequence);
      if (plan.fallback) startLogLevel = "warn";
    } catch (err) {
      // Preserve the recording even if reconstructing its start fails.
      plan = {
        skip: 0,
        fallback: "Unexpected error reconstructing demo start",
      };
      startLogLevel = "error";
      reconstructionError = err;
    }
    const identity = this.opts.getServerIdentity();
    const serverName =
      identity.name ?? this.opts.getServerInfo()?.name ?? this.opts.address;
    const demoValues = buildDemoValues({
      recorderName: this.opts.recorderName,
      clientId: this.opts.getRecorderClientId() ?? undefined,
      serverName,
      serverAddress: this.opts.address,
      date,
      missionDisplayName: missionName,
      mod: identity.mod ?? "",
      gameType: identity.gameType ?? "",
      gravity: plan.gravity,
      script: plan.script,
    });
    const initialBlock = buildInitialBlock({
      connectSequence,
      missionName,
      demoValues,
      start: plan.start,
    });
    this.meta = {
      recordedAt: date.toISOString(),
      server: serverName,
      address: this.opts.address,
      mission: missionName,
      missionSequence,
      mod: identity.mod ?? "",
      recorder: this.opts.recorderName,
    };
    const filename = buildDemoFilename(date, serverName, missionName);
    this.writer = new DemoFileWriter(path.join(this.opts.dir, filename));
    this.writer.begin(initialBlock);
    this.joinGameOver = JoinGameOverFilter.forRecording(
      plan.start,
      connectSequence,
    );
    this.setState("recording");
    log[startLogLevel](
      {
        event: "demo_recording_started",
        startMode: plan.fallback
          ? "fallback"
          : plan.start
            ? "after_handshake"
            : "from_connect",
        address: this.opts.address,
        serverName,
        file: filename,
        missionName,
        missionSequence,
        connectSequence,
        bufferedEntries: this.queue.length,
        bufferedBytes: this.queuedBytes,
        bufferedMs,
        skippedEntries: plan.skip,
        fallbackReason: plan.fallback,
        err: reconstructionError,
      },
      plan.fallback
        ? "Demo start reconstruction failed; recording from connect (authentication may remain in demo)"
        : "Demo recording started",
    );

    const queue = this.queue;
    this.queue = [];
    this.queuedBytes = 0;
    log.debug(
      { address: this.opts.address, entries: queue.length, skipped: plan.skip },
      "Draining buffered packets into demo",
    );
    for (let i = plan.skip; i < queue.length; i++) {
      if (this._state !== "recording") break;
      this.writeEntry(queue[i]);
    }
  }

  private writeEntry(entry: DemoStreamEntry): void {
    const writer = this.writer;
    if (!writer || this.capped) return;
    const outcome = this.joinGameOver?.apply(entry);
    if (outcome) {
      const context = {
        address: this.opts.address,
        atMs: this.moveCount * DEMO_TICK_MS,
      };
      if (outcome === "rewritten") {
        log.info(
          context,
          "Rewrote a welcome page that would leave Tribes2.exe on the debrief screen",
        );
      } else if (outcome === "left") {
        log.warn(
          context,
          "Left a welcome page in place: Tribes2.exe playback will stay on the debrief screen",
        );
      } else {
        log.warn(
          context,
          "Stopped checking for welcome pages: the stream didn't parse",
        );
      }
    }
    try {
      writer.writeEntry(entry);
      if (entry.kind === "move") this.moveCount++;
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
    this.strandedClose = this.writer?.strand();
  }

  /**
   * End the recording. Returns file info, or null when nothing worth
   * keeping was written (no Phase1, too short, or failed).
   */
  async finalize(
    reason: string,
  ): Promise<{ path: string; durationMs: number } | null> {
    if (!this.holding && this._state !== "recording") {
      await this.strandedClose;
      return null;
    }
    // Snapshot the identity now, synchronously: the session may start
    // its next epoch (clearing the mission-scoped gameType) or receive
    // the next mission's LoadInfo while the awaits below are in flight.
    const identity = this.opts.getServerIdentity();
    // Final sample — the keep gates below run on up-to-date state even
    // if no packet arrived since the last change. Capped files must retain
    // the roster/keep gates at their recorded cutoff, not the later live state.
    if (!this.capped) this.sample();
    if (this.pending) {
      if (!identity.name) {
        log.info(
          { address: this.opts.address, mission: this.pending.mission, reason },
          "Recording ended before the server named itself; recording under its listed name or address",
        );
      }
      this.startPending();
      if (this._state !== "recording") {
        await this.strandedClose;
        return null;
      }
    }
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
    const qualificationFailure = this.qualificationFailure;
    if (qualificationFailure) {
      log.info(
        {
          address: this.opts.address,
          durationMs,
          peakPlayers: this.peakPlayers,
          minPlayers: this.opts.minPlayers,
          reason,
        },
        {
          "too-short": "Dropping too-short demo",
          "too-few-players": "Dropping demo with too few players",
          "match-not-started": "Dropping pre-match demo (match never started)",
        }[qualificationFailure],
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
        players: this.players.count,
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
    // Sampled at finalize entry: stream-authoritative where flush-time
    // values may be fallbacks (no MsgMissionDropInfo within the buffering
    // caps) or seeds.
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
            missionSequence: meta.missionSequence,
            gameType: identity.gameType ?? "",
            startMs: 0,
            tournament: identity.tournament ?? false,
          },
        ],
        mod: meta.mod,
        recorder: meta.recorder,
        durationMs,
        reason: this.describeKeepReason(),
        ...this.players.metadata(),
      };
      await fsp.writeFile(`${finalPath}.json`, JSON.stringify(record, null, 2));
    } catch (err) {
      log.warn(
        { err, address: this.opts.address, file: finalPath },
        "Demo sidecar write failed",
      );
    }
  }

  async abort(options?: { discardStranded?: boolean }): Promise<void> {
    if (
      this._state === "done" ||
      (this._state === "aborted" && !options?.discardStranded)
    )
      return;
    this.setState("aborted");
    this.pending = null;
    this.queue = [];
    this.queuedBytes = 0;
    await this.writer?.abort();
  }
}
