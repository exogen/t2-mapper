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
} from "./demoDirectorScanner";
import {
  assembleCastPlan,
  createSwitcherStream,
  planShotsCausal,
  type SwitcherStream,
} from "./switcher";
import { detectMode } from "./planner";
import {
  addReports,
  emptyReport,
  stagePlan,
  stageShots,
  type StageReport,
} from "./stage";
import { CausalView } from "./causalView";
import { describeScenes } from "./scene";
import { DIRECTOR_LOOKAHEAD_SEC, DIRECTOR_TICK_SEC } from "./tunables";
import type { DirectorDataset, Shot, ShotPlan } from "./types";
import { CAST_CONTRACT_VERSION } from "./castContract";
import { describeVenue } from "./venue";
import type { DirectorFactRecord } from "./factJournal";
import type { DirectorStateFrame } from "./observationContract";
import { withCollisionQueryBatch } from "../collision/worldCollision";

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
    `${staged.adjusted} adjusted, ${staged.gridFixed} grid, ` +
    `${staged.tight} tight, ${staged.doorway}→doorway, ${staged.follow}→follow, ` +
    `${staged.unsolved} unsolved, ${staged.unwatchable} dropped, ${staged.merged} merged) ` +
    `and ${staged.followShots} follows ` +
    `(${staged.followClean} clean, ${staged.followPulledIn} pulled in, ${staged.gridFollow} grid, ` +
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
  /** Optional evidence recording, independent of camera planning. */
  factStreamId?: string;
  /** Optional fresh state recording. Use the same epoch as factStreamId. */
  stateStreamId?: string;
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
  /** Plan far enough to cover `sec` of playback. A false continuation check
   * pauses between ticks; a later call resumes without changing decisions. */
  advanceTo(sec: number, shouldContinue?: () => boolean): Promise<void>;
  /** Everything remaining, for a caller that wants the whole thing. */
  finish(): Promise<ShotPlan>;
  /** Pull newly available evidence without running a commentary consumer. */
  drainFacts(): DirectorFactRecord[];
  /** State at sampling time, never archive midpoint scene descriptions. */
  drainStates(): DirectorStateFrame[];
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
/** Let cancellation and browser frames run during a long seek or batch build. */
const WORK_SLICE_MS = 16;

/** Thrown when a recording's game mode has no online switcher. */
class NotStreamable extends Error {}

export async function createCastStream(
  demoBuffer: ArrayBuffer,
  options: CastStreamOptions = {},
): Promise<CastStream> {
  // Before anything raycasts — the scan classifies mid-air kills and
  // staging solves sight lines. Same ordering rule as the batch path.
  await options.ensureWorld?.();

  const scan = await createDirectorScanStream(demoBuffer, {
    factStreamId: options.factStreamId,
    stateStreamId: options.stateStreamId,
  });
  let switcher: SwitcherStream | null = null;
  let view: CausalView | null = null;
  let planned = 0;
  // The switcher owns decisions; the renderer owns their staged copies.
  // A placement repair can replace a camera mechanism without changing
  // the switcher's remembered subject, directive, or style comparisons.
  const cameras = new WeakMap<Shot, Shot>();
  const described = new WeakSet<Shot>();
  let complete = false;
  let latestDataset: DirectorDataset | null = null;
  const report = emptyReport();
  const current: ShotPlan = {
    contractVersion: CAST_CONTRACT_VERSION,
    gameMode: "ctf",
    shots: [],
    coverage: [],
  };

  const publish = (dataset: DirectorDataset): void => {
    const decisions = switcher?.shots ?? [];
    const shots = decisions.map((decision) => {
      let camera = cameras.get(decision);
      if (!camera) {
        // Solve BEFORE publication using only the available path. Future
        // movement belongs to the live camera's visibility rail, not an
        // archive repair after the shot has already aired.
        const candidate = structuredClone(decision);
        candidate.endSec = Math.min(candidate.endSec, dataset.durationSec);
        const pending = [candidate];
        addReports(
          report,
          stageShots(pending, [0], dataset, switcher?.freeSpace),
        );
        camera = pending[0];
        cameras.set(decision, camera);
      }
      // Cuts may shorten an open shot or discard a provisional fragment.
      // Its placement and object identity stay fixed once published.
      camera.startSec = decision.startSec;
      camera.endSec = decision.endSec;
      camera.quickCut = decision.quickCut;
      return camera;
    });
    current.shots.length = 0;
    current.shots.push(...shots);
  };

  const step = async (toSec: number): Promise<void> => {
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    // Scan a lookahead beyond what we plan, so the causal view has the
    // information it is entitled to.
    await scan.advanceTo(toSec + DIRECTOR_LOOKAHEAD_SEC);
    const dataset = scan.datasetTo(toSec + DIRECTOR_LOOKAHEAD_SEC);
    latestDataset = dataset;
    planned = toSec;
    if (!switcher || !view) {
      // Only CTF has an online switcher; the other modes still go
      // through the oracle planner, which needs the whole recording.
      // Streaming one of those would silently cast it as CTF.
      if (detectMode(dataset) !== "ctf") {
        // From-connect demos announce the mode after their first packets.
        // An empty initial snapshot is not evidence for the offline
        // landmark planner. Wait for metadata within the growing prefix.
        if (dataset.gameClassName == null && toSec < scan.durationSec) return;
        throw new NotStreamable();
      }
      view = new CausalView(dataset);
      switcher = createSwitcherStream(view);
    }
    withCollisionQueryBatch(() => {
      switcher!.advanceTo(toSec, dataset);
      publish(dataset);
    });
    current.matchFacts = dataset.matchFacts;
    // The venue is known once the world has arrived, and it does not
    // change — described once, before the booth's first word.
    if (!current.venue && dataset.matchFacts?.worldCompleteSec != null) {
      current.venue = describeVenue(dataset) ?? undefined;
    }
    // Archive descriptions can wait for closure; camera placements cannot.
    const closed = current.shots.slice(0, -1);
    if (closed.some((shot) => !described.has(shot))) {
      const archive = { ...current, shots: closed };
      describeScenes(archive, dataset);
      current.flagTimeline = archive.flagTimeline;
      for (const shot of closed) described.add(shot);
    }
  };

  const finalize = (): ShotPlan => {
    if (complete) return current;
    switcher?.finish(scan.durationSec);
    const dataset = scan.datasetTo(scan.durationSec);
    latestDataset = dataset;
    publish(dataset);
    // Assemble metadata without restaging or rewriting camera history.
    // In particular, the offline cross-shot audit cannot remove footage
    // or change placements that a dynamic viewer has already seen.
    Object.assign(current, assembleCastPlan(current.shots, dataset));
    complete = true;
    return current;
  };

  const grow = async (
    toSec: number,
    shouldContinue?: () => boolean,
  ): Promise<void> => {
    // Tracker records gain positions and classifications after their
    // events arrive. Scanning a batch chunk before planning its earlier
    // ticks exposed those revisions too soon, even through CausalView's
    // event-time filter. Replay the same scan/decision steps regardless
    // of caller cadence, including seeks and irregular browser frames.
    const target = Math.min(
      Math.ceil(toSec / DIRECTOR_TICK_SEC) * DIRECTOR_TICK_SEC,
      scan.durationSec,
    );
    let yieldedAt = performance.now();
    while (planned < target) {
      if (shouldContinue && !shouldContinue()) return;
      await step(Math.min(planned + DIRECTOR_TICK_SEC, target));
      if (performance.now() - yieldedAt >= WORK_SLICE_MS) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        yieldedAt = performance.now();
      }
    }
  };

  // Enough to open on, and no more.
  await grow(Math.min(CAST_MARGIN_SEC, scan.durationSec));
  while (!switcher && planned < scan.durationSec) {
    await grow(Math.min(planned + DIRECTOR_TICK_SEC, scan.durationSec));
  }

  return {
    get shots() {
      return current.shots;
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
    drainFacts: () => scan.drainFacts(),
    drainStates: () => scan.drainStates(),
    async advanceTo(
      sec: number,
      shouldContinue?: () => boolean,
    ): Promise<void> {
      if (complete) return;
      // Keep a small margin ahead of playback, using the same bounded
      // input steps as batch generation even when the viewer seeks.
      await grow(
        Math.min(sec + CAST_MARGIN_SEC, scan.durationSec),
        shouldContinue,
      );
      if (planned >= scan.durationSec) finalize();
    },
    async finish(): Promise<ShotPlan> {
      if (complete) return current;
      await grow(scan.durationSec);
      return finalize();
    },
  };
}
