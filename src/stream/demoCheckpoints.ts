import type { TimelineEvent } from "../state/demoTimelineStore";
import type { DemoSeekCheckpoint } from "./demoStreaming";
import { decodeCompressedCheckpoint } from "./checkpointCodec";
import { TICK_DURATION_MS } from "./streamHelpers";

// New writes use this version. Raise the minimum for incompatible state
// changes, or when older sidecars would restore wrong state (v12 holds sensor
// group 0 until the recorder spawns; 13 seeds it from the start block; 14
// keeps connection state in one ConnectionState; 15 keeps each player's
// action slot as its setActionThread calls, with the jump chain and ski hold;
// 16 records ambient emitter references and their MatrixF positions so static
// emitters survive a seek without requiring another ghost update; 17 retains
// precipitation transitions, lightning storm configuration and strike history;
// 18 corrects the wire types of precipitation radius and lightning rate;
// 19 retains dynamic Sky state and fixes how precipitation fades are built;
// 20 retains the displayed mission's identity through debrief and map loading).
export const DEMO_CHECKPOINT_VERSION = 20;
const MIN_SUPPORTED_CHECKPOINT_VERSION = 20;
export const DEMO_CHECKPOINT_SUFFIX = ".checkpoints.json";
/**
 * The generator's default spacing, and the spacing of sidecars written
 * before they recorded theirs.
 */
export const DEFAULT_CHECKPOINT_INTERVAL_TICKS =
  (12 * 60 * 1000) / TICK_DURATION_MS;

export function isSupportedDemoCheckpointVersion(version: number): boolean {
  return (
    Number.isInteger(version) &&
    version >= MIN_SUPPORTED_CHECKPOINT_VERSION &&
    version <= DEMO_CHECKPOINT_VERSION
  );
}

export interface DemoCheckpointTarget {
  tick: number;
  /**
   * The first match start, which anchors the schedule. Absent when the
   * recording has none, such as one that began mid-match.
   */
  matchStartSec?: number;
  description: string;
}

export interface DemoCheckpointSidecar {
  format: "t2-mapper-seek-checkpoints";
  version: number;
  demoBytes: number;
  demoSha256: string;
  /**
   * The generator's DemoCheckpointPlan maxCount, so it can tell whether a
   * sidecar is current. Playback takes whatever checkpoints a sidecar holds.
   */
  requestedCount: number;
  /**
   * The plan's intervalTicks. Sidecars written before it was recorded used
   * DEFAULT_CHECKPOINT_INTERVAL_TICKS.
   */
  intervalTicks?: number;
  checkpoints: (DemoCheckpointTarget & { data: string })[];
}

/**
 * Where the generator puts a demo's seek checkpoints: from a minute before
 * its first match start (or one interval in, without one), every
 * `intervalTicks`, at most `maxCount` of them.
 */
export interface DemoCheckpointPlan {
  intervalTicks: number;
  maxCount: number;
}

function firstCheckpointTick(matchStartSec: number): number {
  return Math.max(
    0,
    Math.floor(((matchStartSec - 60) * 1000) / TICK_DURATION_MS + 1e-7),
  );
}

export function demoCheckpointTargets(
  events: readonly TimelineEvent[],
  plan: DemoCheckpointPlan,
  lastTick: number,
): DemoCheckpointTarget[] {
  let firstStart: TimelineEvent | undefined;
  for (const event of events) {
    if (
      event.type !== "match-start" ||
      !Number.isFinite(event.timeSec) ||
      event.timeSec < 0
    )
      continue;
    if (!firstStart || event.timeSec < firstStart.timeSec) firstStart = event;
  }
  // A recording without a kickoff, often one that began mid-match, still
  // seeks faster from checkpoints.
  const firstTick = firstStart
    ? firstCheckpointTick(firstStart.timeSec)
    : plan.intervalTicks;
  const targets: DemoCheckpointTarget[] = [];
  // A checkpoint at tick 0 would save no replay. Only the first can land there.
  for (let i = 0; i <= plan.maxCount && targets.length < plan.maxCount; i++) {
    const tick = firstTick + i * plan.intervalTicks;
    if (tick >= lastTick) break;
    if (tick > 0)
      targets.push({
        tick,
        matchStartSec: firstStart?.timeSec,
        description: firstStart?.description ?? "Recording start",
      });
  }
  return targets;
}

export async function demoSha256(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export async function readDemoCheckpoints(
  text: string,
  buffer: ArrayBuffer,
  signal?: AbortSignal,
): Promise<DemoSeekCheckpoint[]> {
  const checkpoints: DemoSeekCheckpoint[] = [];
  await visitDemoCheckpoints(text, buffer, signal, (checkpoint) =>
    checkpoints.push(checkpoint),
  );
  return checkpoints;
}

/** Check persisted states one at a time without retaining them during a retry. */
export async function validateDemoCheckpoints(
  text: string,
  buffer: ArrayBuffer,
  signal?: AbortSignal,
): Promise<void> {
  await visitDemoCheckpoints(text, buffer, signal);
}

async function visitDemoCheckpoints(
  text: string,
  buffer: ArrayBuffer,
  signal?: AbortSignal,
  visit?: (checkpoint: DemoSeekCheckpoint) => void,
): Promise<void> {
  const sidecar = JSON.parse(text) as DemoCheckpointSidecar;
  signal?.throwIfAborted();
  // Any checkpoint of this exact demo speeds seeking, wherever it falls:
  // the generator's plan (count, spacing) is its own business.
  if (
    sidecar.format !== "t2-mapper-seek-checkpoints" ||
    !isSupportedDemoCheckpointVersion(sidecar.version) ||
    sidecar.demoBytes !== buffer.byteLength ||
    !Array.isArray(sidecar.checkpoints) ||
    sidecar.demoSha256 !== (await demoSha256(buffer))
  )
    throw new Error(
      "Seek checkpoints do not match this demo or engine version",
    );
  for (const entry of sidecar.checkpoints) {
    signal?.throwIfAborted();
    if (
      !Number.isSafeInteger(entry.tick) ||
      entry.tick < 0 ||
      typeof entry.data !== "string"
    )
      throw new Error("Invalid seek checkpoint");
    const checkpoint = (await decodeCompressedCheckpoint(
      entry.data,
    )) as DemoSeekCheckpoint;
    if (
      checkpoint.cursor?.moveTicks !== entry.tick ||
      !(checkpoint.simulation?.state?.entities instanceof Map) ||
      !(checkpoint.simulation.shared instanceof Map) ||
      !(checkpoint.parser?.ghosts instanceof Map)
    )
      throw new Error("Invalid seek checkpoint state");
    visit?.(checkpoint);
  }
  signal?.throwIfAborted();
}
