import { emitDiagnosticEvent } from "../diagnostics/events";
import { createLogger } from "../logger";
import {
  retainedSessionCheckpointTicks,
  type CheckpointMemoryPolicy,
} from "./checkpointMemoryPolicy";
import type { DemoCheckpointIndex } from "./demoCheckpoints";
import type { DemoSeekCheckpoint } from "./demoStreaming";

const log = createLogger("demoStreaming");

export interface ImportedCheckpoint {
  checkpoint: DemoSeekCheckpoint;
  onRestoreError?: (error: unknown) => void;
}

/** Owns decoded graph retention and one lazy decode. Simulation validation and
 * restoration remain with the adapter; decoding never publishes a world. */
export class DemoCheckpointRepository {
  private readonly checkpoints = new Map<number, DemoSeekCheckpoint>();
  private readonly imported = new Map<number, ImportedCheckpoint>();
  private readonly policy: CheckpointMemoryPolicy;
  private readonly acceptDecoded: (checkpoint: DemoSeekCheckpoint) => void;
  private index?: DemoCheckpointIndex;
  private pending?: { controller: AbortController; wait: Promise<void> };
  private evictions = 0;

  constructor(
    acceptDecoded: (checkpoint: DemoSeekCheckpoint) => void,
    policy: CheckpointMemoryPolicy = {
      sessionEntries: Infinity,
      importedEntries: Infinity,
    },
  ) {
    if (!(policy.sessionEntries >= 0) || !(policy.importedEntries >= 1))
      throw new Error("Invalid checkpoint memory policy");
    this.policy = policy;
    this.acceptDecoded = acceptDecoded;
  }

  get wait(): Promise<void> | undefined {
    return this.pending?.wait;
  }

  get sessionCaptureEnabled(): boolean {
    return this.policy.sessionEntries > 0;
  }

  ticks(): IterableIterator<number> {
    return this.checkpoints.keys();
  }

  has(tick: number): boolean {
    return this.checkpoints.has(tick);
  }

  get(tick: number): DemoSeekCheckpoint | undefined {
    return this.checkpoints.get(tick);
  }

  getImported(tick: number): ImportedCheckpoint | undefined {
    return this.imported.get(tick);
  }

  importedValues(): IterableIterator<ImportedCheckpoint> {
    return this.imported.values();
  }

  nearestTick(target: number): number | undefined {
    let nearest: number | undefined;
    for (const tick of this.checkpoints.keys())
      if (tick <= target && (nearest === undefined || tick > nearest))
        nearest = tick;
    return nearest;
  }

  addSession(tick: number, checkpoint: DemoSeekCheckpoint): void {
    this.checkpoints.set(tick, checkpoint);
    this.prune();
  }

  import(
    checkpoints: ReadonlyMap<number, DemoSeekCheckpoint>,
    predictionEnabled: boolean,
    onRestoreError?: (error: unknown) => void,
  ): void {
    for (const [tick, checkpoint] of checkpoints) {
      this.imported.delete(tick);
      this.imported.set(tick, { checkpoint, onRestoreError });
      if (predictionEnabled) this.checkpoints.set(tick, checkpoint);
    }
    this.prune();
  }

  touchImported(tick: number): void {
    const entry = this.imported.get(tick);
    if (!entry) return;
    this.imported.delete(tick);
    this.imported.set(tick, entry);
  }

  /** LRU eviction keeps the encoded anchor available for a later lazy seek. */
  evictDecoded(tick: number): void {
    const retained = this.checkpoints.has(tick) || this.imported.has(tick);
    this.checkpoints.delete(tick);
    this.imported.delete(tick);
    if (retained) this.evictions++;
  }

  /** An unusable graph must not be decoded and retried on every seek slice. */
  rejectAnchor(tick: number): void {
    this.checkpoints.delete(tick);
    this.imported.delete(tick);
    this.index?.discard(tick);
  }

  clearSession(predictionEnabled: boolean): void {
    this.checkpoints.clear();
    if (predictionEnabled)
      for (const [tick, { checkpoint }] of this.imported)
        this.checkpoints.set(tick, checkpoint);
  }

  installIndex(index: DemoCheckpointIndex): void {
    this.pending?.controller.abort();
    this.pending = undefined;
    this.index = index;
  }

  /** Called only when an unload/replacement is committed. */
  dispose(): void {
    this.pending?.controller.abort();
    this.pending = undefined;
    this.index = undefined;
    this.imported.clear();
    this.checkpoints.clear();
  }

  prepareIndexed(
    targetTick: number,
    currentTick: number,
    allowForward: boolean,
    predictionEnabled: boolean,
  ): boolean {
    if (this.pending) return true;
    const source = this.index;
    if (!source || !predictionEnabled) return false;
    let tick: number | undefined;
    for (const candidate of source.ticks) {
      if (candidate > targetTick) break;
      tick = candidate;
    }
    if (tick === undefined || this.checkpoints.has(tick)) return false;
    if (targetTick >= currentTick && (!allowForward || tick <= currentTick))
      return false;
    const nearest = this.nearestTick(targetTick);
    if (nearest !== undefined && nearest > tick) return false;
    const requestedTick = tick;
    const controller = new AbortController();
    const pending = { controller, wait: Promise.resolve() };
    pending.wait = Promise.resolve()
      .then(() => {
        controller.signal.throwIfAborted();
        emitDiagnosticEvent("checkpoint-decode-start", { tick: requestedTick });
        return source.load(requestedTick, controller.signal);
      })
      .then((checkpoint) => {
        if (controller.signal.aborted || this.index !== source) return;
        this.acceptDecoded(checkpoint);
        emitDiagnosticEvent("checkpoint-decode-end", { tick: requestedTick });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || this.index !== source) return;
        source.discard(requestedTick);
        log.warn(
          { err: error, tick: requestedTick },
          "Skipping unusable demo checkpoint",
        );
        emitDiagnosticEvent("checkpoint-decode-error", { tick: requestedTick });
      })
      .finally(() => {
        if (this.pending === pending) this.pending = undefined;
      });
    this.pending = pending;
    return true;
  }

  getMetrics(): Record<string, number | null> {
    let sessionEntries = 0;
    for (const tick of this.checkpoints.keys())
      if (!this.imported.has(tick)) sessionEntries++;
    // Both maps can reference a graph; entry counts are not additive bytes.
    return {
      sessionCheckpointEntries: sessionEntries,
      persistedCheckpointEntries: this.imported.size,
      uniqueCheckpointEntries: sessionEntries + this.imported.size,
      encodedCheckpointEntries: this.index?.ticks.length ?? 0,
      encodedCheckpointCharacters: this.index?.encodedCharacters ?? 0,
      checkpointDecodePending: this.pending ? 1 : 0,
      checkpointEvictions: this.evictions,
      sessionCheckpointLimit: Number.isFinite(this.policy.sessionEntries)
        ? this.policy.sessionEntries
        : null,
      importedCheckpointLimit: Number.isFinite(this.policy.importedEntries)
        ? this.policy.importedEntries
        : null,
    };
  }

  private prune(): void {
    while (this.imported.size > this.policy.importedEntries)
      this.evictDecoded(this.imported.keys().next().value!);
    const sessionTicks = [...this.checkpoints.keys()].filter(
      (tick) => !this.imported.has(tick),
    );
    if (sessionTicks.length <= this.policy.sessionEntries) return;
    const keep = retainedSessionCheckpointTicks(
      sessionTicks,
      this.policy.sessionEntries,
    );
    for (const tick of sessionTicks)
      if (!keep.has(tick)) this.evictDecoded(tick);
  }
}
