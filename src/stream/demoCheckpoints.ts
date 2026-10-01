import type { TimelineEvent } from "../state/demoTimelineStore";
import type { DemoSeekCheckpoint } from "./demoStreaming";
import { decodeCompressedCheckpoint } from "./checkpointCodec";
import { TICK_DURATION_MS } from "./streamHelpers";

// Bump when decoder or simulation changes invalidate persisted state.
export const DEMO_CHECKPOINT_VERSION = 3;
export const DEMO_CHECKPOINT_SUFFIX = ".checkpoints.json";

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
  checkpoints: (DemoCheckpointTarget & { data: string })[];
}

export function matchStartCheckpointTargets(
  events: readonly TimelineEvent[],
): DemoCheckpointTarget[] {
  const targets = new Map<number, DemoCheckpointTarget>();
  for (const event of events) {
    if (
      event.type !== "match-start" ||
      !Number.isFinite(event.timeSec) ||
      event.timeSec < 0
    )
      continue;
    const tick = Math.max(
      0,
      Math.floor(((event.timeSec - 60) * 1000) / TICK_DURATION_MS + 1e-7),
    );
    if (!targets.has(tick))
      targets.set(tick, {
        tick,
        matchStartSec: event.timeSec,
        description: event.description,
      });
  }
  return [...targets.values()].sort((a, b) => a.tick - b.tick);
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
  const sidecar = JSON.parse(text) as DemoCheckpointSidecar;
  signal?.throwIfAborted();
  if (
    sidecar.format !== "t2-mapper-seek-checkpoints" ||
    sidecar.version !== DEMO_CHECKPOINT_VERSION ||
    sidecar.demoBytes !== buffer.byteLength ||
    !Array.isArray(sidecar.checkpoints) ||
    sidecar.demoSha256 !== (await demoSha256(buffer))
  )
    throw new Error(
      "Seek checkpoints do not match this demo or engine version",
    );
  const result: DemoSeekCheckpoint[] = [];
  for (const entry of sidecar.checkpoints) {
    signal?.throwIfAborted();
    if (
      !Number.isSafeInteger(entry.tick) ||
      entry.tick < 0 ||
      !Number.isFinite(entry.matchStartSec) ||
      entry.matchStartSec < 0 ||
      entry.tick !==
        Math.max(
          0,
          Math.floor(
            ((entry.matchStartSec - 60) * 1000) / TICK_DURATION_MS + 1e-7,
          ),
        ) ||
      typeof entry.data !== "string"
    )
      throw new Error("Invalid match-start checkpoint");
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
    result.push(checkpoint);
  }
  signal?.throwIfAborted();
  return result;
}
