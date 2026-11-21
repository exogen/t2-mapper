import { createStore } from "zustand/vanilla";
import {
  LIVE_CAST_ANCHOR_TICKS,
  type LiveCastIdentity,
  type LiveCastPlanBatch,
  type LiveCastShotStart,
} from "../../relay/liveCastTypes";
import { DIRECTOR_ORBIT_TARGET_DAMPING } from "../director/cameraRig";
import type { Shot } from "../director/types";
import { STREAM_TICK_SEC } from "../stream/streamHelpers";
import { cameraTourStore } from "./cameraTourStore";
import { commandCircuitStore } from "./commandCircuitStore";
import { streamPlaybackStore } from "./streamPlaybackStore";
import { exitToFreeFly } from "./watchFollow";

interface LiveDirectorState {
  status: "idle" | "loading" | "playing" | "error";
  identity: LiveCastIdentity | null;
  shots: readonly Shot[];
  ended: boolean;
  error: string | null;
}

const EMPTY_DIRECTOR: LiveDirectorState = {
  status: "idle",
  identity: null,
  shots: [],
  ended: false,
  error: null,
};

export const liveDirectorStore = createStore<LiveDirectorState>(
  () => EMPTY_DIRECTOR,
);

let sendPreference: (enabled: boolean) => void = () => {};
let anchorTick = -1;
let anchorTimeSec = 0;
let releasedTick = -1;

/** The live connection owns subscription and world identity. */
export function setLiveDirectorTransport(
  send: (enabled: boolean) => void,
): void {
  sendPreference = send;
}

export function startLiveDirector(): void {
  const { status } = liveDirectorStore.getState();
  if (status === "loading" || status === "playing") return;
  prepareLiveDirector();
  sendPreference(true);
}

/** Wait for shots from a freshly hydrated picture on an existing subscription. */
export function prepareLiveDirector(): void {
  if (liveDirectorStore.getState().status === "playing") {
    releaseLiveDirectorCamera();
  }
  resetLiveDirectorClock();
  liveDirectorStore.setState({ ...EMPTY_DIRECTOR, status: "loading" });
}

/** The relay releases ticks in order with the spectator's game packets. */
export function applyLiveDirectorTick(tick: number, playbackSec: number): void {
  if (!Number.isSafeInteger(tick) || tick <= releasedTick) return;
  const sourceSec = tick * STREAM_TICK_SEC;
  // Keep a stable offset between anchors. A suspended render loop, a burst
  // of queued packets, or sustained drift may require re-anchoring.
  if (
    anchorTick < 0 ||
    Math.abs(sourceSec - projectedLiveDirectorTimeAt(playbackSec)) >
      2 * STREAM_TICK_SEC
  ) {
    anchorTick = tick;
    anchorTimeSec = playbackSec;
  }
  releasedTick = tick;
}

export function liveDirectorReleasedTick(): number {
  return releasedTick;
}

/** Use the local render clock for motion between ordered source anchors. */
export function liveDirectorTimeAt(playbackSec: number): number {
  return Math.min(
    projectedLiveDirectorTimeAt(playbackSec),
    (releasedTick + LIVE_CAST_ANCHOR_TICKS) * STREAM_TICK_SEC,
  );
}

function projectedLiveDirectorTimeAt(playbackSec: number): number {
  return (
    anchorTick * STREAM_TICK_SEC + Math.max(0, playbackSec - anchorTimeSec)
  );
}

function releaseLiveDirectorCamera(): void {
  streamPlaybackStore.setState({ orbitTargetDamping: null });
  exitToFreeFly();
}

function resetLiveDirectorClock(): void {
  anchorTick = releasedTick = -1;
  anchorTimeSec = 0;
}

/** Forget a disconnected source without sending a request on its successor. */
export function resetLiveDirector(): void {
  if (liveDirectorStore.getState().status === "playing") {
    releaseLiveDirectorCamera();
  }
  resetLiveDirectorClock();
  liveDirectorStore.setState(EMPTY_DIRECTOR);
}

export function exitLiveDirector(): void {
  if (liveDirectorStore.getState().status === "idle") return;
  resetLiveDirector();
  sendPreference(false);
}

export function failLiveDirector(message: string): void {
  const { status } = liveDirectorStore.getState();
  if (status === "idle") return;
  if (status === "playing") releaseLiveDirectorCamera();
  liveDirectorStore.setState({
    ...EMPTY_DIRECTOR,
    status: "error",
    error: message,
  });
  sendPreference(false);
}

export function sameLiveCast(
  a: LiveCastIdentity,
  b: LiveCastIdentity,
): boolean {
  return a.gameId === b.gameId && a.epoch === b.epoch;
}

function renderableShot({ startTick, shot }: LiveCastShotStart): Shot {
  const startSec = startTick * STREAM_TICK_SEC;
  return {
    ...shot,
    startSec,
    endSec: startSec + Math.max(STREAM_TICK_SEC, shot.endSec - shot.startSec),
    reason: "Live CastGenius",
  };
}

/** Apply committed camera instructions for the attached world timeline. */
export function applyLiveDirectorPlan(batch: LiveCastPlanBatch): void {
  const state = liveDirectorStore.getState();
  if (state.status !== "loading" && state.status !== "playing") return;
  if (state.identity && !sameLiveCast(state.identity, batch)) return;
  if (!batch.shots.length && !batch.ended) return;
  liveDirectorStore.setState({
    identity: state.identity ?? { gameId: batch.gameId, epoch: batch.epoch },
    shots: batch.shots.length
      ? mergeShotStarts(state.shots, batch.shots)
      : state.shots,
    ended: state.ended || batch.ended === true,
  });
}

function mergeShotStarts(
  shots: readonly Shot[],
  starts: readonly LiveCastShotStart[],
): readonly Shot[] {
  const shotsByTick = new Map(
    shots.map((shot) => [Math.round(shot.startSec / STREAM_TICK_SEC), shot]),
  );
  for (const start of starts) {
    if (shotsByTick.has(start.startTick)) continue;
    shotsByTick.set(start.startTick, renderableShot(start));
  }
  return shotsByTick.size === shots.length
    ? shots
    : [...shotsByTick.values()].sort((a, b) => a.startSec - b.startSec);
}

/** A committed shot can go on air as soon as its picture reaches the start tick. */
export function activateLiveDirector(): boolean {
  const { status, shots } = liveDirectorStore.getState();
  if (status === "playing") return true;
  if (
    status !== "loading" ||
    releasedTick < 0 ||
    findLiveDirectorShotIndex(shots, releasedTick * STREAM_TICK_SEC) < 0
  )
    return false;
  cameraTourStore.getState().cancel();
  commandCircuitStore.getState().deactivate();
  exitToFreeFly();
  streamPlaybackStore.setState({
    orbitTargetDamping: DIRECTOR_ORBIT_TARGET_DAMPING,
  });
  liveDirectorStore.setState({ status: "playing" });
  return true;
}

/** A live shot holds until the next committed start, even during an underrun. */
export function findLiveDirectorShotIndex(
  shots: readonly Shot[],
  timeSec: number,
): number {
  let min = 0;
  let max = shots.length;
  while (min < max) {
    const middle = (min + max) >>> 1;
    if (shots[middle].startSec <= timeSec) min = middle + 1;
    else max = middle;
  }
  return min - 1;
}
