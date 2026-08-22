/**
 * Process-level demo recording glue: the env gate, disk-space guard,
 * recorder construction, and finalize tracking (so shutdown can drain
 * in-flight finalizes before the process exits).
 */
import fs from "node:fs";
import path from "node:path";
import { demoLog as log } from "./logger.js";
import { DemoRecorder, type DemoRecorderOptions } from "./demoRecorder.js";

export interface DemoCoordinatorOptions {
  enabled: boolean;
  dir: string;
  /** Skip new recordings when the volume has less free space than this. */
  minFreeBytes: number;
  maxBytes: number;
  minLengthMs: number;
  minPlayers: number;
  recorderName: string;
  /** Receives each kept demo's final path (feeds the upload queue). */
  onFinalized?: (filePath: string) => void;
}

export type SessionRecorderOptions = Pick<
  DemoRecorderOptions,
  | "address"
  | "getConnectSequence"
  | "getServerInfo"
  | "getServerIdentity"
  | "getActivePlayerCount"
  | "getPlayerNames"
  | "getMatchStarted"
  | "getRecordContext"
  | "onStateChange"
>;

export interface DemoRecordingStats {
  enabled: boolean;
  /** Live recorders by state (finalizing = in-flight finalize count). */
  buffering: number;
  recording: number;
  finalizing: number;
  /** Lifetime counters since relay start. */
  started: number;
  kept: number;
  /** Finalized empty/too-short — normal churn, not errors. */
  dropped: number;
  /** Recordings lost to write/stream/finalize failures. */
  failed: number;
}

export class DemoCoordinator {
  private opts: DemoCoordinatorOptions;
  private shuttingDown = false;
  private inFlight = new Set<Promise<unknown>>();
  private dirReady = false;
  /** Recorders not yet in a terminal state. */
  private recorders = new Set<DemoRecorder>();
  private startedCount = 0;
  private keptCount = 0;
  private droppedCount = 0;
  private failedCount = 0;

  constructor(opts: DemoCoordinatorOptions) {
    this.opts = opts;
  }

  get enabled(): boolean {
    return this.opts.enabled;
  }

  /** Whether `filePath` is the spool of a recorder still in progress —
   *  the sweep must never mistake one for crash debris. */
  isLivePath(filePath: string): boolean {
    const resolved = path.resolve(filePath);
    for (const recorder of this.recorders) {
      const partial = recorder.partialPath;
      if (partial && path.resolve(partial) === resolved) return true;
    }
    return false;
  }

  getStats(): DemoRecordingStats {
    let buffering = 0;
    let recording = 0;
    for (const recorder of this.recorders) {
      if (recorder.state === "buffering") buffering++;
      else if (recorder.state === "recording") recording++;
    }
    return {
      enabled: this.opts.enabled,
      buffering,
      recording,
      finalizing: this.inFlight.size,
      started: this.startedCount,
      kept: this.keptCount,
      dropped: this.droppedCount,
      failed: this.failedCount,
    };
  }

  createRecorder(opts: SessionRecorderOptions): DemoRecorder | null {
    if (!this.opts.enabled || this.shuttingDown) return null;
    try {
      if (!this.dirReady) {
        fs.mkdirSync(this.opts.dir, { recursive: true });
        this.dirReady = true;
      }
      const stats = fs.statfsSync(this.opts.dir);
      const freeBytes = stats.bavail * stats.bsize;
      if (freeBytes < this.opts.minFreeBytes) {
        log.warn(
          { address: opts.address, freeBytes, min: this.opts.minFreeBytes },
          "Low disk space — skipping demo recording",
        );
        return null;
      }
    } catch (err) {
      log.error({ err, dir: this.opts.dir }, "Demo dir unavailable");
      return null;
    }
    const recorder: DemoRecorder = new DemoRecorder({
      ...opts,
      dir: this.opts.dir,
      recorderName: this.opts.recorderName,
      maxBytes: this.opts.maxBytes,
      minLengthMs: this.opts.minLengthMs,
      minPlayers: this.opts.minPlayers,
      onStateChange: (state) => {
        if (state === "done" || state === "aborted") {
          this.recorders.delete(recorder);
        }
        opts.onStateChange?.(state);
      },
    });
    this.recorders.add(recorder);
    this.startedCount++;
    log.debug({ address: opts.address }, "Demo recorder armed");
    return recorder;
  }

  /** Finalize a detached recorder; kept files flow to onFinalized. */
  finalize(recorder: DemoRecorder, reason: string): void {
    const promise = recorder
      .finalize(reason)
      .then((result) => {
        if (result) {
          this.keptCount++;
          this.opts.onFinalized?.(result.path);
        } else if (recorder.failure) {
          this.failedCount++;
        } else {
          this.droppedCount++;
        }
      })
      .catch((err: unknown) => {
        this.failedCount++;
        log.error({ err }, "Demo finalize failed");
      });
    this.inFlight.add(promise);
    void promise.finally(() => this.inFlight.delete(promise));
  }

  /**
   * Stop new recordings and wait (bounded) for in-flight finalizes —
   * they're fast local stream/rename work, never uploads.
   */
  async shutdown(timeoutMs: number): Promise<void> {
    this.shuttingDown = true;
    if (this.inFlight.size === 0) return;
    await Promise.race([
      Promise.allSettled([...this.inFlight]),
      new Promise((resolve) => setTimeout(resolve, timeoutMs).unref()),
    ]);
  }
}
