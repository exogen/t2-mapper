import type { Shot } from "../src/director/types";
import type { WatchCatchupPayload } from "./types";

export const LIVE_CAST_LOOKAHEAD_MS = 6_000;
export const LIVE_CAST_ANCHOR_TICKS = 8;
export const LIVE_CAST_METRICS_INTERVAL_MS = 5_000;

/** Undefined means we have yet to receive the mission metadata. */
export function supportsLiveCastMode(
  gameClassName: string | null | undefined,
  missionType: string | null | undefined,
): boolean | undefined {
  if (
    gameClassName &&
    /rabbit|tr2|deathmatch|siege|hunters|bounty/i.test(gameClassName)
  )
    return false;
  if (gameClassName && /ctf/i.test(gameClassName)) return true;
  if (missionType) return /^(?:capture the flag|[ls]?ctf)\b/i.test(missionType);
}

type ShotMetadata = "reason" | "scene" | "role" | "topic" | "coverageCutIn";
type CameraOnly<T> = T extends Shot ? Omit<T, ShotMetadata> : never;
export type LiveCastShot = CameraOnly<Shot>;

export interface LiveCastIdentity {
  gameId: string;
  epoch: number;
}

export interface LiveCastWorkerMetrics extends LiveCastIdentity {
  /** Percent of one CPU core since the previous sample or process start. */
  cpuPercent: number | null;
  rssBytes: number | null;
  sampledAtMs: number | null;
  sourceTick: number;
  processedThroughTick: number | null;
  plannedThroughTick: number | null;
  /** Queued ticks plus the tick awaiting its acknowledgment. */
  pendingTicks: number;
}

export interface LiveCastMetrics {
  activeWorkers: number;
  workers: readonly LiveCastWorkerMetrics[];
}

export interface LiveCastMetricsMessage extends LiveCastMetrics {
  type: "liveCastMetrics";
}

/** Starts are immutable. A new start ends the previous shot. */
export interface LiveCastShotStart {
  startTick: number;
  shot: LiveCastShot;
}

export interface LiveCastPlanBatch extends LiveCastIdentity {
  plannedThroughTick: number;
  shots: readonly LiveCastShotStart[];
  ended?: boolean;
}

export type LiveCastServerMessage =
  | ({ type: "liveCastTick"; tick: number } & LiveCastIdentity)
  | ({
      type: "liveCastShots";
      /** The shot already playing at attachment carries no arrival timing. */
      initial?: true;
      /** Configured planner horizon, sent with the first batch for a picture. */
      lookaheadMs?: number;
    } & LiveCastPlanBatch);

/** Ordered raw packets for one relay source tick. */
export interface LiveCastWorldTick extends LiveCastIdentity {
  tick: number;
  packets: readonly Uint8Array[];
}

export type CreateLiveCastFeed = (
  publish: (batch: LiveCastPlanBatch) => void,
  onFailure: (error: Error) => void,
) => LiveCastPlannerFeed | undefined;

export interface LiveCastPlannerFeed {
  hydrate(
    payload: WatchCatchupPayload,
    sourceTick: number,
    gameId: string,
  ): void;
  tick(world: LiveCastWorldTick): void;
  close(): Promise<void> | void;
}
