/**
 * The one definition of how a cast plan is produced.
 *
 * Scan the demo, plan the shots, solve the camera placements. The
 * browser store and the headless script both call this, because they
 * used to each spell the sequence out and nothing kept them in step —
 * exactly the kind of drift that made the headless build disagree with
 * the browser about where every static shape was.
 *
 * ORDER IS LOAD-BEARING. Both the scan and the staging pass raycast the
 * collision world:
 *
 *   - the scan classifies mid-air kills
 *     (`directorTrackers.ts` — `airborne = castWorldRay(...) == null`),
 *   - staging solves fixed-camera angles and line of sight.
 *
 * With no world every ray returns null, so every death reads as
 * airborne — measured at 702/702 against 166/702 with the world loaded.
 * `ensureWorld` therefore runs BEFORE the scan, not between the plan
 * and the staging pass, which is where the wait used to sit.
 */
import {
  createDirectorScanStream,
  scanDemoDirector,
} from "../stream/demoDirectorScanner";
import {
  assembleCastPlan,
  createSwitcherStream,
  planShotsCausal,
  type SwitcherStream,
} from "./switcher";
import { detectMode } from "./planner";
import {
  addReports,
  auditAhead,
  emptyReport,
  stagePlan,
  stageShots,
  type StageReport,
} from "./stage";
import { CausalView } from "./causalView";
import { describeScenes } from "./scene";
import { DIRECTOR_LOOKAHEAD_SEC } from "./tunables";
import type { DirectorDataset, Shot, ShotPlan } from "./types";
import { CAST_CONTRACT_VERSION } from "./castContract";
import { describeVenue } from "./venue";

export interface CastPipelineOptions {
  /** Scan progress, 0..1. */
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
  /**
   * Make the collision world available. The browser waits for React to
   * finish mounting the scene; Node builds it outright. Called once,
   * before anything raycasts.
   */
  ensureWorld?: () => Promise<void>;
}

export interface CastPipelineResult {
  dataset: DirectorDataset;
  plan: ShotPlan;
  staged: StageReport;
}

export async function runCastPipeline(
  demoBuffer: ArrayBuffer,
  options: CastPipelineOptions = {},
): Promise<CastPipelineResult> {
  // Batch is the STREAM run to the end — not a second implementation.
  // While these were spelled out separately they drifted: the two
  // produced casts that differed in two shots, purely because the
  // audit passes saw the plan at different lengths.
  let stream: CastStream;
  try {
    stream = await createCastStream(demoBuffer, {
      ensureWorld: options.ensureWorld,
      signal: options.signal,
    });
  } catch (err) {
    if (!(err instanceof NotStreamable)) throw err;
    // Not a CTF match: plan it the old way, whole-recording.
    const dataset = await scanDemoDirector(
      demoBuffer,
      options.onProgress,
      options.signal,
    );
    const plan = planShotsCausal(dataset);
    return { dataset, plan, staged: stagePlan(plan, dataset) };
  }
  const plan = await stream.finish();
  options.onProgress?.(1);
  return {
    dataset: stream.dataset as DirectorDataset,
    plan,
    staged: stream.staged,
  };
}

/** One-line summary of a staging result, for logs. */
export function describeStaging(staged: StageReport): string {
  return (
    `${staged.fixedShots} fixed (${staged.presolved} pre-solved, ${staged.clean} clean, ` +
    `${staged.adjusted} adjusted, ` +
    `${staged.tight} tight, ${staged.doorway}→doorway, ${staged.follow}→follow, ` +
    `${staged.unsolved} unsolved, ${staged.unwatchable} dropped, ${staged.merged} merged) ` +
    `and ${staged.followShots} follows ` +
    `(${staged.followClean} clean, ${staged.followPulledIn} pulled in, ` +
    `${staged.followConverted}→impact, ${staged.followUnsolved} unsolved)`
  );
}

/**
 * A cast that is planned as it plays.
 *
 * `runCastPipeline` scans the whole recording before deciding anything,
 * and on a 25-minute demo that is five seconds of black screen — 64% of
 * the wait, against 6% for the free-space grid. None of it is needed to
 * choose the FIRST shot: the director is causal, so it never looks
 * further than `now + lookahead` anyway.
 *
 * So: build the collision world, scan a few seconds, plan those, start
 * playing. Everything after that is planned a slice ahead of the
 * playhead. The shots are identical either way — same switcher, same
 * horizon — the only difference is when the work happens.
 */
export interface CastStreamOptions {
  ensureWorld?: () => Promise<void>;
  signal?: AbortSignal;
}

export interface CastStream {
  /** Shots decided so far; the last one is still open. */
  readonly shots: Shot[];
  /** Staging tallies, accumulated across every slice. */
  readonly staged: StageReport;
  /**
   * The plan as it stands — well-formed at every step, so a consumer
   * can start playing it and keep reading the same object as it grows.
   * `coverage` fills in at the end; it is a whole-plan audit.
   */
  readonly plan: ShotPlan;
  /** The dataset as far as it has been scanned. Grows with the plan. */
  readonly dataset: DirectorDataset | null;
  readonly plannedToSec: number;
  readonly durationSec: number;
  /** False until `finish` has run. A consumer must NOT treat running
   *  off the end of the shots as the end of the broadcast. */
  readonly complete: boolean;
  /** Plan far enough to cover `sec` of playback. */
  advanceTo(sec: number): Promise<void>;
  /** Everything remaining, for a caller that wants the whole thing. */
  finish(): Promise<ShotPlan>;
}

/**
 * How far past the playhead the plan is kept.
 *
 * Just enough that the shot being watched already exists — the director
 * decides a shot when its time arrives, exactly as it would live.
 * Planning further ahead is not merely unnecessary, it is the thing
 * that stalled playback: a slice-based version did the work in bursts
 * and froze the picture for up to 3.3 seconds at a time.
 */
export const CAST_MARGIN_SEC = 2;
/** Chunk the batch path walks in, so its scan keeps yielding. */
const FINISH_CHUNK_SEC = 60;

/** Thrown when a recording's game mode has no online switcher. */
class NotStreamable extends Error {}

export async function createCastStream(
  demoBuffer: ArrayBuffer,
  options: CastStreamOptions = {},
): Promise<CastStream> {
  // Before anything raycasts — the scan classifies mid-air kills and
  // staging solves sight lines. Same ordering rule as the batch path.
  await options.ensureWorld?.();

  const scan = await createDirectorScanStream(demoBuffer);
  let switcher: SwitcherStream | null = null;
  let view: CausalView | null = null;
  let planned = 0;
  /** Shots the per-shot staging passes have solved. */
  const staged = new WeakSet<Shot>();
  /** Indices of closed shots (every one but the open tail) not yet
   *  staged, in order. */
  const unstagedClosed = (shots: Shot[]): number[] => {
    const out: number[] = [];
    for (let i = 0; i < shots.length - 1; i++) {
      if (!staged.has(shots[i])) out.push(i);
    }
    return out;
  };
  let complete = false;
  let latestDataset: DirectorDataset | null = null;
  // Everything from here on is still rewritable; everything before it
  // has been handed to the playhead.
  let playheadSec = 0;
  const report = emptyReport();
  let current: ShotPlan = {
    contractVersion: CAST_CONTRACT_VERSION,
    gameMode: "ctf",
    shots: [],
    coverage: [],
  };

  const grow = async (toSec: number): Promise<void> => {
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    // Scan a lookahead beyond what we plan, so the causal view has the
    // information it is entitled to.
    await scan.advanceTo(toSec + DIRECTOR_LOOKAHEAD_SEC + 1);
    const dataset = scan.datasetTo(toSec + DIRECTOR_LOOKAHEAD_SEC);
    latestDataset = dataset;
    if (!switcher || !view) {
      // Only CTF has an online switcher; the other modes still go
      // through the oracle planner, which needs the whole recording.
      // Streaming one of those would silently cast it as CTF.
      if (detectMode(dataset) !== "ctf") {
        throw new NotStreamable();
      }
      view = new CausalView(dataset);
      switcher = createSwitcherStream(view);
      // The plan holds the switcher's OWN array, so a shot is in the
      // plan the moment it is opened. Rebuilding `current` only when a
      // shot CLOSED left the plan empty for the first fifteen seconds —
      // and the store reads an empty plan as "no cast for this
      // recording" and gives up.
      current = {
        contractVersion: CAST_CONTRACT_VERSION,
        gameMode: "ctf",
        shots: switcher.shots,
        coverage: [],
        matchFacts: dataset.matchFacts,
      };
    }
    switcher.advanceTo(toSec, dataset);
    planned = toSec;
    // Stage the shots that have closed since last time. Staging reads
    // the dataset for subject paths, so it runs on the same snapshot.
    // "Since last time" is by IDENTITY, not by index: the audit below
    // drops and merges shots in this same array, so a count of staged
    // shots drifted past newly closed ones and they went to air
    // unsolved and undescribed.
    const pending = unstagedClosed(switcher.shots);
    if (pending.length > 0) {
      addReports(report, stageShots(switcher.shots, pending, dataset));
      for (const i of pending) staged.add(switcher.shots[i]);
    }
    // The plan-level passes below are O(plan) and only have anything to
    // do when a shot has CLOSED. Running them every tick is what turned
    // live direction into a series of stalls. The plan itself is always
    // current: it shares the switcher's array.
    current.matchFacts = dataset.matchFacts;
    // The venue is known once the world has arrived, and it does not
    // change — described once, before the booth's first word.
    if (!current.venue && dataset.matchFacts?.worldCompleteSec != null) {
      current.venue = describeVenue(dataset) ?? undefined;
    }
    if (pending.length === 0) return;
    // Only the shots that do not have a scene yet.
    describeScenes(current, dataset);
    // Audit the part of the plan the viewer has not reached. The
    // verdicts need no lookahead — geometry does not move — so there is
    // no reason to let a shot inside a wall reach air just because the
    // plan is still being written.
    addReports(report, auditAhead(current, dataset, playheadSec, true));
  };

  // Enough to open on, and no more.
  await grow(Math.min(CAST_MARGIN_SEC, scan.durationSec));

  return {
    get shots() {
      return switcher?.shots ?? [];
    },
    get staged() {
      return report;
    },
    get plan() {
      return current;
    },
    get dataset() {
      return latestDataset;
    },
    get plannedToSec() {
      return planned;
    },
    get complete() {
      return complete;
    },
    durationSec: scan.durationSec,
    async advanceTo(sec: number): Promise<void> {
      playheadSec = Math.max(playheadSec, sec);
      // Up to the PLAYHEAD, and no further. There is no planning ahead
      // in a live cast — the future does not exist — and pretending
      // otherwise is what produced multi-second stalls: work that
      // belongs spread across playback got done in bursts.
      //
      // The director never queries past `now + lookahead` anyway, so
      // this is not a compromise; it is the thing the causal design was
      // for. A demo is simply a live game whose packets arrive early.
      await grow(Math.min(sec + CAST_MARGIN_SEC, scan.durationSec));
    },
    async finish(): Promise<ShotPlan> {
      // The batch caller wants the whole thing; nothing is playing, so
      // there is no frame loop to protect. Walk it in chunks anyway so
      // the scan keeps yielding.
      while (planned < scan.durationSec) {
        await grow(Math.min(planned + FINISH_CHUNK_SEC, scan.durationSec));
      }
      if (complete) return current;
      switcher?.finish(scan.durationSec);
      const dataset = scan.datasetTo(scan.durationSec);
      latestDataset = dataset;
      const shots = switcher?.shots ?? [];
      const pending = shots
        .map((shot, i) => (staged.has(shot) ? -1 : i))
        .filter((i) => i >= 0);
      addReports(report, stageShots(shots, pending, dataset));
      for (const i of pending) staged.add(shots[i]);
      // Assembled by the SAME function the batch planner uses, so the
      // streamed plan cannot quietly omit a field — it was missing
      // `skipToSec`, which the commentary track reads.
      const plan = assembleCastPlan(shots, dataset);
      // Only now: these rewrite neighbours, so they wait until nothing
      // more is coming.
      // The tail was audited slice by slice; this catches the last one
      // and anything the final staging pass changed. No floor: nothing
      // is playing any more.
      addReports(report, auditAhead(plan, dataset, -Infinity));
      current = plan;
      complete = true;
      return plan;
    },
  };
}
