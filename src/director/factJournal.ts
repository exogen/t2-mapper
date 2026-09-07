/**
 * Optional observation of the director's facts, independent of cameras and
 * commentary. Producers only append detached records; consumers pull them at
 * their own pace. No callback, promise, I/O, or commentary policy runs here.
 *
 * The same journal works beside live packet trackers, browser demo playback,
 * and batch scanning. It records availability, not just event timestamps, so
 * replay cannot give an early drop its later pass classification.
 */
import type {
  DirectorDeath,
  DirectorEvent,
  SkillShot,
  StructureTransition,
} from "./types";

export const DIRECTOR_FACT_TRACE_VERSION = 1;

export interface DirectorFactValues {
  event: DirectorEvent;
  death: DirectorDeath;
  skillShot: SkillShot;
  structure: StructureTransition;
}

export type DirectorFactKind = keyof DirectorFactValues;

/** One immutable revision of a fact, in the order it became available. */
export type DirectorFactRecord = {
  [K in DirectorFactKind]: {
    /** Caller-owned match/connection epoch. Start a new journal on reset. */
    streamId: string;
    /** Monotonically increasing across all kinds, starting at 1. */
    sequence: number;
    /** Stable within this stream; identity survives later enrichment. */
    id: string;
    /** Starts at 1; each later record replaces this fact's entire value. */
    revision: number;
    /** When the underlying event happened, in game/demo seconds. */
    timeSec: number;
    /** When this revision became available, in the same clock domain. */
    availableAtSec: number;
    kind: K;
    /**
     * Raw director evidence, not a commentary cue. Missing attribution is
     * unknown. Existing inference fields keep their DirectorDataset meaning:
     * e.g. dropKind=pass can be inferred from proximity, and airborne alone
     * does not prove a mid-air skill shot. No camera visibility is implied.
     */
    value: DirectorFactValues[K];
  };
}[DirectorFactKind];

/** The serializable baseline; no camera or audio sidecar is required. */
export interface DirectorFactTrace {
  format: "t2-director-facts";
  version: typeof DIRECTOR_FACT_TRACE_VERSION;
  streamId: string;
  /** End of the actually ingested prefix; not the eventual match end. */
  throughSec: number;
  records: DirectorFactRecord[];
}

function freezeTree(value: unknown): void {
  if (value == null || typeof value !== "object") return;
  for (const child of Object.values(value)) freezeTree(child);
  Object.freeze(value);
}

export class DirectorFactJournal {
  private readonly streamId: string;
  private readonly entries = new WeakMap<
    object,
    { id: string; revision: number; json: string }
  >();
  private readonly counts: Record<DirectorFactKind, number> = {
    event: 0,
    death: 0,
    skillShot: 0,
    structure: 0,
  };
  private sequence = 0;
  private lastAvailableSec = -Infinity;
  private pending: DirectorFactRecord[] = [];

  constructor(streamId: string) {
    if (!streamId.trim()) throw new Error("A fact journal needs a stream id");
    this.streamId = streamId;
  }

  record<K extends DirectorFactKind>(
    kind: K,
    value: DirectorFactValues[K],
    availableAtSec: number,
  ): void {
    // Archive finalization drains resolver cursors with Infinity. That does
    // not establish when those conclusions could have been known live.
    if (!Number.isFinite(availableAtSec)) return;
    const json = JSON.stringify(value);
    const previous = this.entries.get(value);
    if (previous?.json === json) return;
    if (
      !Number.isFinite(value.timeSec) ||
      availableAtSec < value.timeSec ||
      availableAtSec < this.lastAvailableSec
    ) {
      throw new Error("Director fact availability must advance in event order");
    }
    const id = previous?.id ?? `${kind}:${++this.counts[kind]}`;
    const revision = (previous?.revision ?? 0) + 1;
    const record = {
      streamId: this.streamId,
      sequence: ++this.sequence,
      id,
      revision,
      timeSec: value.timeSec,
      availableAtSec,
      kind,
      value: JSON.parse(json),
    } as DirectorFactRecord;
    // Neither tracker enrichment nor a consumer can rewrite an earlier
    // observation (including nested positions). JSON also drops undefined
    // fields, making in-memory and serialized replays identical.
    freezeTree(record);
    this.entries.set(value, { id, revision, json });
    this.lastAvailableSec = availableAtSec;
    this.pending.push(record);
  }

  /** Transfer new records to the caller without retaining a whole match. */
  drain(): DirectorFactRecord[] {
    const records = this.pending;
    this.pending = [];
    return records;
  }
}

/**
 * Incremental, availability-ordered replay. Once drained, a revision is
 * never delivered again; later revisions keep the same fact id. The clock
 * is the input's game/demo clock, never accelerated harness wall time.
 */
export class DirectorFactReplay {
  private readonly records: readonly DirectorFactRecord[];
  private cursor = 0;
  private now = -Infinity;

  constructor(records: readonly DirectorFactRecord[]) {
    // Own the data: a caller may keep editing its parsed trace object.
    this.records = JSON.parse(JSON.stringify(records));
    freezeTree(this.records);
    let previous: DirectorFactRecord | undefined;
    const revisions = new Map<string, number>();
    for (const record of this.records) {
      if (
        !Number.isFinite(record.availableAtSec) ||
        !Number.isFinite(record.timeSec) ||
        record.availableAtSec < record.timeSec ||
        record.value.timeSec !== record.timeSec ||
        record.sequence !== (previous?.sequence ?? 0) + 1 ||
        record.revision !== (revisions.get(record.id) ?? 0) + 1 ||
        (previous != null &&
          (record.streamId !== previous.streamId ||
            record.availableAtSec < previous.availableAtSec))
      ) {
        throw new Error(
          `Invalid director fact trace at sequence ${record.sequence}`,
        );
      }
      revisions.set(record.id, record.revision);
      previous = record;
    }
  }

  advanceTo(availableAtSec: number): DirectorFactRecord[] {
    if (!Number.isFinite(availableAtSec) || availableAtSec < this.now) {
      throw new Error("Fact replay requires a finite, non-decreasing clock");
    }
    this.now = availableAtSec;
    const start = this.cursor;
    while (
      this.cursor < this.records.length &&
      this.records[this.cursor].availableAtSec <= availableAtSec
    ) {
      this.cursor++;
    }
    return this.records.slice(start, this.cursor);
  }
}
