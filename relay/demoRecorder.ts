/**
 * Per-connection demo recording lifecycle. Packets are buffered in
 * memory until MissionStartPhase1 supplies the mission name (needed
 * up-front in the initial block), then stream through DemoFileWriter.
 * Move blocks are synthesized at the 32 ms demo tick — they are the
 * playback clock — driven purely by packet/send event timestamps.
 */
import crypto from "node:crypto";
import path from "node:path";
import { demoLog as log } from "./logger.js";
import {
  DemoFileWriter,
  MAX_BLOCK_SIZE,
  buildDemoValues,
  buildInitialBlock,
} from "./demoWriter.js";
import type { ServerInfo } from "./types.js";

export type RecorderState =
  "buffering" | "recording" | "finalizing" | "done" | "aborted";

const MOVE_TICK_MS = 32;
/** Give up waiting for MissionStartPhase1 past these buffering caps. */
const BUFFER_MAX_MS = 30_000;
const BUFFER_MAX_BYTES = 2 * 1024 * 1024;
/** Bound move synthesis across pathological event gaps. */
const MOVE_BURST_CAP = 300;
/** Deflate/fs backlog beyond this means the disk stalled — abort. */
const MAX_STREAM_BACKLOG = 16 * 1024 * 1024;

export interface DemoRecorderOptions {
  dir: string;
  /** Session key, e.g. "45.76.24.91:28000". */
  address: string;
  getConnectSequence: () => number;
  getServerInfo: () => ServerInfo | undefined;
  /** Current non-observer player count (sampled; the peak decides keep). */
  getActivePlayerCount: () => number;
  recorderName: string;
  /** Compressed size cap; recorder self-aborts beyond it. */
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
  private _failure: string | null = null;

  constructor(opts: DemoRecorderOptions) {
    this.opts = opts;
  }

  get state(): RecorderState {
    return this._state;
  }

  /** Why the recording was lost, when it aborted on an error (vs the
   *  normal empty/too-short drops). */
  get failure(): string | null {
    return this._failure;
  }

  private setState(state: RecorderState): void {
    if (this._state === state) return;
    this._state = state;
    this.opts.onStateChange?.(state);
  }

  onPacket(data: Uint8Array): void {
    if (this._state !== "buffering" && this._state !== "recording") return;
    const players = this.opts.getActivePlayerCount();
    if (players > this.peakPlayers) this.peakPlayers = players;
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
    this.flush(missionName);
  }

  private flush(missionName: string): void {
    const info = this.opts.getServerInfo();
    const date = new Date();
    const serverName = info?.name ?? this.opts.address;
    const demoValues = buildDemoValues({
      recorderName: this.opts.recorderName,
      serverName,
      serverAddress: this.opts.address,
      date,
      missionDisplayName: missionName,
      mod: info?.mod ?? "",
      gameType: info?.gameType ?? "",
    });
    const initialBlock = buildInitialBlock({
      connectSequence: this.opts.getConnectSequence(),
      missionName,
      demoValues,
    });
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
    if (!writer) return;
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
      this._failure = "write-failed";
      void this.abort();
      return;
    }
    if (writer.failed) {
      log.error(
        { err: writer.failed, address: this.opts.address },
        "Demo stream failed",
      );
      this._failure = "stream-error";
      void this.abort();
    } else if (writer.bufferedBytes > MAX_STREAM_BACKLOG) {
      log.error(
        { address: this.opts.address, buffered: writer.bufferedBytes },
        "Demo stream backlog exceeded; aborting recording",
      );
      this._failure = "backlog";
      void this.abort();
    } else if (writer.bytesWritten > this.opts.maxBytes) {
      log.warn(
        { address: this.opts.address, bytes: writer.bytesWritten },
        "Demo size cap reached; aborting recording",
      );
      this._failure = "size-cap";
      void this.abort();
    }
  }

  /** Bring the synthesized move clock up to `now` (32 ms per move). */
  private syncClock(now: number): void {
    this.t0 ??= now;
    const target = Math.floor((now - this.t0) / MOVE_TICK_MS);
    let pending = target - this.moveCount;
    if (pending <= 0) return;
    if (pending > MOVE_BURST_CAP) {
      // A huge event gap: skip the dead time instead of flooding the
      // file with silence (shift the anchor so the clock stays sane).
      this.t0 += (pending - MOVE_BURST_CAP) * MOVE_TICK_MS;
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
    const durationMs = this.moveCount * MOVE_TICK_MS;
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
    try {
      await writer.finalize(durationMs);
    } catch (err) {
      log.error({ err, address: this.opts.address }, "Demo finalize failed");
      this._failure = "finalize-failed";
      await writer.abort();
      this.setState("aborted");
      return null;
    }
    this.setState("done");
    log.info(
      {
        address: this.opts.address,
        file: writer.finalPath,
        durationMs,
        bytes: writer.bytesWritten,
        peakPlayers: this.peakPlayers,
        reason,
      },
      "Demo recording finalized",
    );
    return { path: writer.finalPath, durationMs };
  }

  async abort(): Promise<void> {
    if (this._state === "done" || this._state === "aborted") return;
    this.setState("aborted");
    this.queue = [];
    this.queuedBytes = 0;
    await this.writer?.abort();
  }
}
