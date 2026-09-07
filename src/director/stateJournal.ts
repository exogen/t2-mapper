/** State sampled beside the director, with no consumer callbacks or I/O. */
import type { StreamSnapshot } from "../stream/types";
import type { DirectorFlagSample, DirectorPlayerSample } from "./types";
import type { DirectorStateFrame } from "./observationContract";

/** Detach before publishing: the stream parser and trackers retain mutable
 * objects. Freezing a borrowed object would change camera-only behavior. */
export function detached<T>(value: T): T {
  const copy = structuredClone(value);
  const freeze = (node: unknown): void => {
    if (node == null || typeof node !== "object") return;
    for (const child of Object.values(node)) freeze(child);
    Object.freeze(node);
  };
  freeze(copy);
  return copy;
}

export class DirectorStateJournal {
  private readonly streamId: string;
  private sequence = 0;
  private lastTimeSec = -Infinity;
  private pending: DirectorStateFrame[] = [];

  constructor(streamId: string) {
    if (!streamId.trim()) throw new Error("A state journal needs a stream id");
    this.streamId = streamId;
  }

  /** Samples must come from this tick, not a final dataset or nearest-future
   * lookup. Called at the existing player sampling cadence (currently 1 Hz). */
  record(
    snapshot: StreamSnapshot,
    timeSec: number,
    players: DirectorPlayerSample[],
    flags: DirectorFlagSample[],
  ): void {
    if (
      !Number.isFinite(timeSec) ||
      !Number.isFinite(snapshot.timeSec) ||
      snapshot.timeSec > timeSec ||
      timeSec < this.lastTimeSec ||
      players.some((p) => p.timeSec !== timeSec) ||
      flags.some((f) => f.timeSec !== timeSec)
    ) {
      throw new Error("Director state must contain current, ordered samples");
    }
    const roster = new Map(snapshot.playerRoster.map((p) => [p.targetId, p]));
    const entities = new Map(
      snapshot.entities
        .filter((e) => e.type === "Player" && (e.damageState ?? 0) === 0)
        .map((e) => [e.targetId, e]),
    );
    const teams = new Map(snapshot.teamScores.map((t) => [t.teamId, t]));
    const frame: DirectorStateFrame = {
      streamId: this.streamId,
      sequence: ++this.sequence,
      timeSec,
      availableAtSec: timeSec,
      players: players.map((p) => {
        const entity = entities.get(p.targetId);
        const entry = roster.get(p.targetId);
        return {
          ...p,
          targetGeneration: entity?.targetGeneration ?? null,
          clientId: entry?.clientId ?? null,
          name: entity?.playerName ?? entry?.name ?? null,
        };
      }),
      flags: flags.map((f) => ({
        slot: f.slot,
        teamId: teams.has(f.slot) ? f.slot : null,
        pos: f.pos,
        carrierTargetId: f.carrierTargetId,
        status:
          teams.get(f.slot)?.flagStatus ??
          (f.carrierTargetId != null ? "held" : "unknown"),
      })),
      teams: snapshot.teamScores.map(({ teamId, name, score }) => ({
        teamId,
        name,
        score,
      })),
      match: {
        clockMs: snapshot.matchClockMs,
        started: snapshot.matchStarted,
        ended: snapshot.matchEnded,
      },
    };
    this.pending.push(detached(frame));
    this.lastTimeSec = timeSec;
  }

  drain(): DirectorStateFrame[] {
    const frames = this.pending;
    this.pending = [];
    return frames;
  }
}
