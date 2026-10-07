import type { TimelineEvent } from "../state/demoTimelineStore";
import type { DemoSeekCheckpoint } from "./demoStreaming";
import { decodeCompressedCheckpoint } from "./checkpointCodec";
import { TICK_DURATION_MS } from "./streamHelpers";

// Bump when the sidecar format, decoder, or simulation invalidates persisted state.
export const DEMO_CHECKPOINT_VERSION = 11;
export const DEMO_CHECKPOINT_SUFFIX = ".checkpoints.json";
const CHECKPOINT_INTERVAL_TICKS = (12 * 60 * 1000) / TICK_DURATION_MS;

export interface DemoCheckpointTarget {
  tick: number;
  matchStartSec: number;
  description: string;
}

export interface DemoCheckpointSidecar {
  format: "t2-mapper-seek-checkpoints";
  version: number;
  demoBytes: number;
  demoSha256: string;
  requestedCount: number;
  checkpoints: (DemoCheckpointTarget & { data: string })[];
}

function firstCheckpointTick(matchStartSec: number): number {
  return Math.max(
    0,
    Math.floor(((matchStartSec - 60) * 1000) / TICK_DURATION_MS + 1e-7),
  );
}

export function demoCheckpointTargets(
  events: readonly TimelineEvent[],
  count: number,
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
  if (!firstStart) return [];
  const targets: DemoCheckpointTarget[] = [];
  const firstTick = firstCheckpointTick(firstStart.timeSec);
  for (let i = 0; i < count; i++) {
    const tick = firstTick + i * CHECKPOINT_INTERVAL_TICKS;
    if (tick >= lastTick) break;
    targets.push({
      tick,
      matchStartSec: firstStart.timeSec,
      description: firstStart.description,
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
  if (
    sidecar.format !== "t2-mapper-seek-checkpoints" ||
    sidecar.version !== DEMO_CHECKPOINT_VERSION ||
    sidecar.demoBytes !== buffer.byteLength ||
    !Array.isArray(sidecar.checkpoints) ||
    !Number.isSafeInteger(sidecar.requestedCount) ||
    sidecar.requestedCount < 0 ||
    sidecar.checkpoints.length > sidecar.requestedCount ||
    sidecar.demoSha256 !== (await demoSha256(buffer))
  )
    throw new Error(
      "Seek checkpoints do not match this demo or engine version",
    );
  for (const [index, entry] of sidecar.checkpoints.entries()) {
    signal?.throwIfAborted();
    if (
      !Number.isSafeInteger(entry.tick) ||
      entry.tick < 0 ||
      !Number.isFinite(entry.matchStartSec) ||
      entry.matchStartSec < 0 ||
      entry.matchStartSec !== sidecar.checkpoints[0].matchStartSec ||
      entry.tick !==
        firstCheckpointTick(entry.matchStartSec) +
          index * CHECKPOINT_INTERVAL_TICKS ||
      typeof entry.data !== "string"
    )
      throw new Error("Invalid seek checkpoint timing");
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
