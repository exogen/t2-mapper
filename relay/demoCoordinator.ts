/**
 * Process-level demo recording glue: the env gate, disk-space guard,
 * recorder construction, and finalize tracking (so shutdown can drain
 * in-flight finalizes before the process exits).
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { demoLog as log } from "./logger.js";
import { DemoRecorder, type DemoRecorderOptions } from "./demoRecorder.js";
import { salvagePartialDemo } from "./demoSalvage.js";
import type { MissionControlState } from "./missionControls.js";
import { parseMissionSequence } from "./shared.js";

export type RecordingDecisionReason =
  "match-end" | "mission-change" | "inactivity-timeout" | "restored-decision";

interface PendingRecordingState {
  address: string;
  mission: MissionControlState["mission"];
  keep: boolean;
  complete: boolean;
  /** Wall-clock time this segment stopped recording; survives relay restarts. */
  inactiveSince?: number;
  decisionReason?: RecordingDecisionReason;
}

interface PendingRecording {
  dir: string;
  state: PendingRecordingState;
  recorder?: DemoRecorder;
  releasing?: Promise<void>;
  restored?: boolean;
  released?: boolean;
  retired?: boolean;
  policyDirty?: boolean;
}

function sameMission(
  a: PendingRecordingState["mission"],
  b: PendingRecordingState["mission"],
): boolean {
  return a?.[0] === b?.[0] && a?.[1] === b?.[1];
}

export interface DemoCoordinatorOptions {
  enabled: boolean;
  dir: string;
  /** Skip new recordings when the volume has less free space than this. */
  minFreeBytes: number;
  maxBytes: number;
  minLengthMs: number;
  minPlayers: number;
  recorderName: string;
  /** Settle inactive missions using their saved policy after this long (default 1h). */
  pendingTimeoutMs?: number;
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
  | "getPlayerRoster"
  | "getRecorderClientId"
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
  private pending = new Map<string, PendingRecording>();
  private recorderEntries = new WeakMap<DemoRecorder, PendingRecording>();
  private releaseChain = Promise.resolve();
  private pendingTimeoutMs: number;

  private policyLogFields(entry: PendingRecording) {
    return {
      address: entry.state.address,
      mission: entry.state.mission,
      recordingId: path.basename(entry.dir),
      keep: entry.state.keep,
      complete: entry.state.complete,
      decisionReason: entry.state.decisionReason ?? null,
      inactiveSince: entry.state.inactiveSince ?? null,
    };
  }

  constructor(opts: DemoCoordinatorOptions) {
    this.opts = opts;
    this.pendingTimeoutMs = opts.pendingTimeoutMs ?? 60 * 60_000;
    if (
      !Number.isSafeInteger(this.pendingTimeoutMs) ||
      this.pendingTimeoutMs <= 0
    )
      throw new Error(
        "Demo pending timeout must be a positive integer in milliseconds",
      );
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
    let entry: PendingRecording;
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
      entry = {
        dir: path.join(this.opts.dir, "pending", randomUUID()),
        state: {
          address: opts.address,
          mission: null,
          keep: true,
          complete: false,
        },
      };
      fs.mkdirSync(entry.dir, { recursive: true });
      this.persist(entry);
    } catch (err) {
      log.error({ err, dir: this.opts.dir }, "Demo dir unavailable");
      return null;
    }
    const recorder: DemoRecorder = new DemoRecorder({
      ...opts,
      dir: entry.dir,
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
    entry.recorder = recorder;
    this.pending.set(entry.dir, entry);
    this.recorderEntries.set(recorder, entry);
    this.startedCount++;
    log.debug({ address: opts.address }, "Demo recorder armed");
    return recorder;
  }

  /** Close a connection's file locally. Publication waits for the match decision. */
  finalize(recorder: DemoRecorder, reason: string): void {
    const entry = this.recorderEntries.get(recorder);
    if (!entry || entry.recorder !== recorder) return;
    this.recorderEntries.delete(recorder);
    const inactiveSince = Date.now();
    entry.state.inactiveSince = inactiveSince;
    const promise = (async () => {
      let empty = false;
      if (entry.state.complete && !entry.state.keep) {
        await recorder.abort({ discardStranded: true });
      } else {
        const result = await recorder.finalize(reason);
        empty = !result && !recorder.failure;
        if (recorder.failure) this.failedCount++;
      }
      // Even an empty reconnect extends its mission's inactivity window.
      for (const sibling of this.pending.values()) {
        if (
          sibling === entry ||
          sibling.recorder ||
          sibling.state.complete ||
          !entry.state.mission ||
          sibling.state.address !== entry.state.address ||
          !sameMission(sibling.state.mission, entry.state.mission)
        )
          continue;
        sibling.state.inactiveSince = Math.max(
          sibling.state.inactiveSince ?? 0,
          inactiveSince,
        );
        this.savePolicy(sibling);
      }
      this.savePolicy(entry);
      if (empty) {
        this.droppedCount++;
        this.pending.delete(entry.dir);
        await fsp.rm(entry.dir, { recursive: true, force: true });
        log.info(
          { ...this.policyLogFields(entry), closeReason: reason },
          "Empty or ineligible recording discarded",
        );
        return;
      }
      entry.recorder = undefined;
      if (!entry.state.complete)
        log.info(
          {
            ...this.policyLogFields(entry),
            closeReason: reason,
            timeoutMs: this.pendingTimeoutMs,
          },
          "Recording held pending mission decision",
        );
      await this.release(entry);
    })().catch((err: unknown) => {
      this.failedCount++;
      log.error(
        { err, ...this.policyLogFields(entry), closeReason: reason },
        "Demo finalize failed",
      );
      entry.recorder = undefined;
    });
    this.inFlight.add(promise);
    void promise.finally(() => this.inFlight.delete(promise));
  }

  /** Bind this connection to its mission and settle older missions after reconnect. */
  observeMission(
    recorder: DemoRecorder | null,
    address: string,
    controls: MissionControlState,
  ): void {
    const current = recorder && this.recorderEntries.get(recorder);
    if (current && !current.state.mission)
      current.state.mission = controls.mission;
    const inheritedReason = [...this.pending.values()].find(
      (entry) =>
        entry.state.address === address &&
        entry.state.complete &&
        entry.state.decisionReason &&
        sameMission(entry.state.mission, controls.mission),
    )?.state.decisionReason;
    for (const entry of this.pending.values()) {
      if (entry.state.address !== address) continue;
      const previousKeep = entry.state.keep;
      const previousComplete = entry.state.complete;
      if (sameMission(entry.state.mission, controls.mission)) {
        if (entry.state.complete) continue;
        entry.state.keep = controls.recordingDecision ?? controls.recording;
        entry.state.complete = controls.recordingDecision !== undefined;
        if (entry.state.complete)
          entry.state.decisionReason ??= inheritedReason ?? "restored-decision";
      } else if (entry.state.mission && controls.mission) {
        entry.retired = true;
        if (!entry.state.complete)
          entry.state.decisionReason = "mission-change";
        entry.state.complete = true;
      } else {
        continue;
      }
      this.savePolicy(entry);
      if (
        previousKeep !== entry.state.keep ||
        previousComplete !== entry.state.complete
      )
        log.info(
          { ...this.policyLogFields(entry), previousKeep, previousComplete },
          "Recording retention policy updated",
        );
      void this.release(entry);
    }
  }

  updateMission(
    address: string,
    controls: MissionControlState,
    decisionReason: RecordingDecisionReason = "match-end",
  ): void {
    for (const entry of this.pending.values()) {
      if (
        entry.state.address !== address ||
        entry.state.complete ||
        !sameMission(entry.state.mission, controls.mission)
      )
        continue;
      const previousKeep = entry.state.keep;
      const previousComplete = entry.state.complete;
      entry.state.keep = controls.recordingDecision ?? controls.recording;
      entry.state.complete = controls.recordingDecision !== undefined;
      if (entry.state.complete) entry.state.decisionReason = decisionReason;
      this.savePolicy(entry);
      if (
        previousKeep !== entry.state.keep ||
        previousComplete !== entry.state.complete
      )
        log.info(
          { ...this.policyLogFields(entry), previousKeep, previousComplete },
          "Recording retention policy updated",
        );
      void this.release(entry);
    }
  }

  /** The demo journal is written before async watch-state persistence. */
  takeRestoredPolicy(
    address: string,
    mission: MissionControlState["mission"],
  ): Pick<MissionControlState, "recording" | "recordingDecision"> | undefined {
    const entries = [...this.pending.values()].filter(
      (entry) =>
        entry.restored &&
        entry.state.address === address &&
        sameMission(entry.state.mission, mission),
    );
    if (!entries.length) return;
    for (const entry of entries) entry.restored = false;
    // If a crash interrupted a multi-segment update, retain the more private
    // choice. An admin can still change it before the match ends.
    const recording = entries.every((entry) => entry.state.keep);
    log.info(
      {
        address,
        mission,
        recording,
        complete: entries.some((entry) => entry.state.complete),
        recordingIds: entries.map((entry) => path.basename(entry.dir)),
        decisionReasons: [
          ...new Set(
            entries.map((entry) => entry.state.decisionReason ?? null),
          ),
        ],
      },
      "Recording policy recovered from journals",
    );
    return {
      recording,
      ...(entries.some((entry) => entry.state.complete) && {
        recordingDecision: recording,
      }),
    };
  }

  // Rare control/mission changes are journaled before any file can be published.
  // Recorders already open files synchronously at connection setup.
  private persist(entry: PendingRecording): void {
    const file = path.join(entry.dir, "policy.json");
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(entry.state));
    fs.renameSync(`${file}.tmp`, file);
  }

  /** A disk failure must not interrupt packet processing or publish a partial decision. */
  private savePolicy(entry: PendingRecording): void {
    entry.policyDirty = true;
    try {
      this.persist(entry);
      entry.policyDirty = false;
    } catch (err) {
      log.error(
        { err, ...this.policyLogFields(entry) },
        "Recording policy could not be saved; kept private for retry",
      );
    }
  }

  /** Restore held files before sessions reconnect or the upload sweep starts. */
  async restorePending(): Promise<void> {
    const root = path.join(this.opts.dir, "pending");
    const missions = new Map<string, PendingRecording[]>();
    const entries = await fsp
      .readdir(root, { withFileTypes: true })
      .catch((err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT") return [];
        throw err;
      });
    for (const item of entries) {
      if (!item.isDirectory()) continue;
      const dir = path.join(root, item.name);
      if (this.pending.has(dir)) continue;
      try {
        const state = JSON.parse(
          await fsp.readFile(path.join(dir, "policy.json"), "utf8"),
        ) as PendingRecordingState;
        if (
          typeof state.address !== "string" ||
          typeof state.keep !== "boolean" ||
          typeof state.complete !== "boolean" ||
          (state.inactiveSince !== undefined &&
            (typeof state.inactiveSince !== "number" ||
              !Number.isFinite(state.inactiveSince) ||
              state.inactiveSince < 0)) ||
          (state.mission !== null &&
            (!Array.isArray(state.mission) ||
              state.mission.length !== 2 ||
              !state.mission.every((part) => typeof part === "string")))
        ) {
          throw new Error("Invalid pending demo policy");
        }
        const files = await fsp.readdir(dir);
        // A crash before the handshake can leave only an unused journal.
        // Keep unknown footage private, and retain known mission decisions.
        if (
          state.mission === null &&
          files.every(
            (name) => name === "policy.json" || name === "policy.json.tmp",
          )
        ) {
          await fsp.rm(dir, { recursive: true, force: true });
          log.info(
            { dir },
            "Empty pre-handshake recording journal removed during recovery",
          );
          continue;
        }
        if (!state.complete && state.inactiveSince === undefined) {
          // A crash leaves no detach timestamp. Use the last on-disk activity,
          // including the spool, rather than restarting the clock on every boot.
          const stats = await Promise.all(
            files
              .filter((name) => name !== "policy.json.tmp")
              .map((name) => fsp.stat(path.join(dir, name))),
          );
          state.inactiveSince = Math.max(...stats.map((stat) => stat.mtimeMs));
          this.persist({ dir, state });
        }
        const entry = { dir, state, restored: true };
        this.pending.set(dir, entry);
        if (state.mission) {
          const key = JSON.stringify([state.address, state.mission]);
          const segments = missions.get(key) ?? [];
          segments.push(entry);
          missions.set(key, segments);
        } else
          log.info(
            this.policyLogFields(entry),
            "Pending recording restored without a mission identity",
          );
      } catch (err) {
        log.error(
          { err, dir },
          "Pending demo stays private: policy could not be read",
        );
      }
    }
    // A crash can interrupt a multi-segment policy write. Reconcile before
    // any sweep or new-map settlement, choosing discard when journals differ.
    for (const segments of missions.values()) {
      const keep = segments.every((entry) => entry.state.keep);
      const complete = segments.some((entry) => entry.state.complete);
      const conflict = segments.some(
        (entry) =>
          entry.state.keep !== keep || entry.state.complete !== complete,
      );
      const decisionReason =
        segments.find(
          (entry) => entry.state.complete && entry.state.decisionReason,
        )?.state.decisionReason ?? "restored-decision";
      for (const entry of segments) {
        entry.state.keep = keep;
        entry.state.complete = complete;
        if (complete) entry.state.decisionReason ??= decisionReason;
        this.persist(entry);
      }
      log.info(
        {
          address: segments[0].state.address,
          mission: segments[0].state.mission,
          recordingIds: segments.map((entry) => path.basename(entry.dir)),
          keep,
          complete,
          decisionReason: complete ? decisionReason : null,
          conflictingJournals: conflict,
          action: complete ? (keep ? "release" : "discard") : "hold",
          inactiveSince: Math.max(
            ...segments.map((entry) => entry.state.inactiveSince ?? 0),
          ),
          timeoutMs: this.pendingTimeoutMs,
        },
        "Pending mission recording policy restored",
      );
    }
    await this.sweepPending();
  }

  async sweepPending(): Promise<void> {
    for (const entry of this.pending.values()) {
      if (entry.policyDirty) this.savePolicy(entry);
    }
    this.expireInactiveMissions();
    // Salvage can inflate a large spool; keep recoveries sequential.
    for (const entry of this.pending.values()) await this.release(entry);
  }

  private expireInactiveMissions(): void {
    const groups = new Map<string, PendingRecording[]>();
    const connecting = new Set<string>();
    for (const entry of this.pending.values()) {
      if (entry.recorder && !entry.state.mission)
        connecting.add(entry.state.address);
      const key = JSON.stringify([
        entry.state.address,
        entry.state.mission ?? entry.dir,
      ]);
      const group = groups.get(key) ?? [];
      group.push(entry);
      groups.set(key, group);
    }
    const now = Date.now();
    for (const group of groups.values()) {
      const pending = group.filter((entry) => !entry.state.complete);
      if (
        !pending.length ||
        group.some((entry) => entry.recorder || entry.policyDirty)
      )
        continue;
      // A reconnect still in its handshake may belong to this mission.
      if (connecting.has(group[0].state.address)) continue;
      const inactiveSince = Math.max(
        ...pending.map((entry) => entry.state.inactiveSince ?? Infinity),
      );
      if (now - inactiveSince < this.pendingTimeoutMs) continue;
      const keep = group.every((entry) => entry.state.keep);
      try {
        // Commit every segment's decision before making any eligible for release.
        for (const entry of pending)
          this.persist({
            ...entry,
            state: {
              ...entry.state,
              keep,
              complete: true,
              decisionReason: "inactivity-timeout",
            },
          });
        for (const entry of pending) {
          entry.state.keep = keep;
          entry.state.complete = true;
          entry.state.decisionReason = "inactivity-timeout";
          entry.restored = true;
        }
        log.info(
          {
            address: group[0].state.address,
            mission: group[0].state.mission,
            keep,
            decisionReason: "inactivity-timeout",
            recordingIds: pending.map((entry) => path.basename(entry.dir)),
            inactiveSince,
            timeoutMs: this.pendingTimeoutMs,
          },
          "Inactive mission recording decision settled",
        );
      } catch (err) {
        log.error(
          {
            err,
            address: group[0].state.address,
            mission: group[0].state.mission,
          },
          "Inactive mission decision could not be saved; will retry",
        );
      }
    }
  }

  private release(entry: PendingRecording): Promise<void> | undefined {
    if (
      entry.recorder ||
      !entry.state.complete ||
      (entry.released && !entry.retired)
    )
      return;
    if (entry.releasing) return entry.releasing;
    const promise = this.releaseChain
      .then(() => {
        // Check when the queued release runs: another segment's write may
        // have failed later in the same synchronous multi-segment update.
        for (const sibling of this.pending.values()) {
          if (
            sibling.policyDirty &&
            sibling.state.address === entry.state.address &&
            sameMission(sibling.state.mission, entry.state.mission)
          )
            return;
        }
        return this.releaseFiles(entry);
      })
      .catch((err: unknown) => {
        log.error(
          { err, ...this.policyLogFields(entry), dir: entry.dir },
          "Pending demo release failed; will retry",
        );
      });
    this.releaseChain = promise;
    entry.releasing = promise;
    this.inFlight.add(promise);
    void promise.finally(() => {
      entry.releasing = undefined;
      this.inFlight.delete(promise);
    });
    return promise;
  }

  private async releaseFiles(entry: PendingRecording): Promise<void> {
    const files: string[] = [];
    if (entry.state.keep && !entry.released) {
      for (const name of await fsp.readdir(entry.dir)) {
        if (name.endsWith(".partial"))
          await salvagePartialDemo(path.join(entry.dir, name), {
            minLengthMs: this.opts.minLengthMs,
            missionSequence: parseMissionSequence(entry.state.mission?.[0]),
          });
      }
      for (const name of await fsp.readdir(entry.dir)) {
        if (!name.endsWith(".rec") && !name.endsWith(".partial.failed"))
          continue;
        const source = path.join(entry.dir, name);
        const destination = path.join(this.opts.dir, name);
        // The .rec becomes visible to the root upload sweep last.
        await fsp
          .rename(`${source}.json`, `${destination}.json`)
          .catch((err: NodeJS.ErrnoException) => {
            if (err.code !== "ENOENT") throw err;
          });
        await fsp.rename(source, destination);
        files.push(name);
        this.keptCount++;
        log.info(
          { ...this.policyLogFields(entry), file: name },
          "Recording released from pending storage",
        );
        this.opts.onFinalized?.(destination);
      }
    } else if (!entry.released) {
      for (const name of await fsp.readdir(entry.dir)) {
        if (name !== "policy.json") {
          await fsp.rm(path.join(entry.dir, name), {
            recursive: true,
            force: true,
          });
          files.push(name);
        }
      }
      this.droppedCount++;
    }
    if (entry.released && !entry.retired) return;
    entry.released = true;
    log.info(
      {
        ...this.policyLogFields(entry),
        action: entry.state.keep ? "keep" : "discard",
        files,
      },
      "Match recording decision applied",
    );
    // Keep the small decision journal until a different mission is observed.
    // The async watch-state write may not have survived the same crash, and
    // another relay restart must not lose the policy after sweeping its files.
    if (entry.retired) {
      await fsp.rm(entry.dir, { recursive: true, force: true });
      this.pending.delete(entry.dir);
    }
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
