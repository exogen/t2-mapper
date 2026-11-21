import {
  LIVE_CAST_LOOKAHEAD_MS,
  supportsLiveCastMode,
  type LiveCastShot,
  type LiveCastShotStart,
} from "../../relay/liveCastTypes";
import { cloneData } from "../cloneData";
import { withCollisionQueryBatch } from "../collision/worldCollision";
import { streamTimeToTick, TICK_DURATION_MS } from "../stream/streamHelpers";
import type { DirectorSnapshot } from "../stream/types";
import { framesTheSame } from "./assemble";
import { CausalView } from "./causalView";
import {
  DirectorTrackers,
  FLAG_STEP_SEC,
  type TrackerSnapshotMeta,
} from "./directorTrackers";
import { detectMode } from "./planner";
import { stageShots } from "./stage";
import { ROOM_SUBJECT_MARGIN, sweepEasing } from "./cameraRig";
import { shotPoseAt, subjectVisible } from "./shotPath";
import { createSwitcherStream, type SwitcherStream } from "./switcher";
import { DIRECTOR_TICK_SEC } from "./tunables";
import type { DirectorVec3, Shot, ShotAim, ShotSubject } from "./types";

const OBSERVATION_STEP_MS = FLAG_STEP_SEC * 1000;
const DECISION_STEP_MS = DIRECTOR_TICK_SEC * 1000;
const LIVE_CAST_MIN_SHOT_SEC = 3;
const LIVE_CAST_MIN_SHOT_TICKS = Math.ceil(
  (LIVE_CAST_MIN_SHOT_SEC * 1000) / TICK_DURATION_MS,
);

export interface LiveCastPlannerFrame {
  readonly tick: number;
  /** Uses the authoritative source clock. May be lazy, including for gap
   * fallback to the preceding frame and the final tail at shutdown. */
  readonly snapshot: DirectorSnapshot;
  /** Available without constructing a world snapshot on every tick. */
  readonly matchPhase?: DirectorSnapshot["matchPhase"];
}

export interface LiveCastPlannerOptions {
  readonly startTick: number;
  readonly lookaheadSec?: number;
  readonly metadata: Omit<TrackerSnapshotMeta, "durationSec">;
  /** Run sampling and staging with the source snapshot's scene loaded. */
  readonly withWorld?: <T>(
    snapshot: DirectorSnapshot,
    operation: () => T,
  ) => T | Promise<T>;
}

export interface LiveCastPlannerShot extends LiveCastShotStart {
  /** The most recent source tick this decision could use. Not sent to viewers. */
  readonly availableThroughTick: number;
}

function shotSubject(subject?: ShotSubject): ShotSubject | undefined {
  return subject?.type === "flag"
    ? { type: "flag", slot: subject.slot }
    : subject && { type: "player", targetId: subject.targetId };
}

function copyPoint(point?: DirectorVec3): DirectorVec3 | undefined {
  return point && [...point];
}

function shotAim(aim?: ShotAim): ShotAim | undefined {
  switch (aim?.mode) {
    case "hold":
      return { mode: "hold", yaw: aim.yaw };
    case "toward":
      return { mode: "toward", target: [...aim.target] };
    case "forward":
    case "backward":
      return { mode: aim.mode };
    default:
      return undefined;
  }
}

function freezeData<T>(data: T): T {
  if (data !== null && typeof data === "object") {
    for (const value of Object.values(data)) freezeData(value);
    Object.freeze(data);
  }
  return data;
}

/** Copy the wire contract, so planner bookkeeping and future facts stay local. */
export function liveCameraShot(shot: Shot, startTick: number): LiveCastShot {
  const startSec = (startTick * TICK_DURATION_MS) / 1000;
  const base = {
    startSec,
    endSec: Math.max(startSec + LIVE_CAST_MIN_SHOT_SEC, shot.endSec),
    transitionIn: shot.transitionIn,
    subject: shotSubject(shot.subject),
    quickCut: shot.quickCut,
  };
  switch (shot.kind) {
    case "followFlag":
    case "followPlayer": {
      const orbit = {
        ...base,
        distance: shot.distance,
        minDistance: shot.minDistance,
        pitch: shot.pitch,
        aim: shotAim(shot.aim),
      };
      return freezeData(
        shot.kind === "followFlag"
          ? { ...orbit, kind: shot.kind, slot: shot.slot }
          : {
              ...orbit,
              kind: shot.kind,
              targetId: shot.targetId,
              firstPerson: shot.firstPerson,
            },
      );
    }
    case "fixedOrbit": {
      const staged = shot.staged;
      return freezeData({
        ...base,
        kind: shot.kind,
        center: [...shot.center],
        radius: shot.radius,
        startAngle: shot.startAngle,
        angularSpeed: shot.angularSpeed,
        heightFactor: shot.heightFactor,
        lookLift: shot.lookLift,
        trackSubject: shot.trackSubject,
        lookSubject: shotSubject(shot.lookSubject),
        doorwayOf: copyPoint(shot.doorwayOf),
        staged: staged && {
          angle: staged.angle,
          radius: staged.radius,
          liftFactor: staged.liftFactor,
          anchor: copyPoint(staged.anchor),
          visibility: staged.visibility,
        },
      });
    }
    case "sweep":
      return freezeData({
        ...base,
        kind: shot.kind,
        from: [...shot.from],
        to: [...shot.to],
        target: [...shot.target],
        moveSec: shot.moveSec,
        moveOffsetSec: shot.moveOffsetSec,
        pathSolved: shot.pathSolved,
        targetTo: copyPoint(shot.targetTo),
        via: shot.via?.map((point) => [...point]),
        maxPitch: shot.maxPitch,
        easing: sweepEasing(shot),
        aimIsHeading: shot.aimIsHeading,
      });
    case "dolly":
      return freezeData({
        ...base,
        kind: shot.kind,
        subject: shotSubject(shot.subject)!,
        distance: shot.distance,
        height: shot.height,
        side: shot.side,
        sideAngle: shot.sideAngle,
        awayFrom: copyPoint(shot.awayFrom),
      });
  }
}

/** One authoritative planner for a mission. Await each input in order. */
export function createLiveCastPlanner(options: LiveCastPlannerOptions) {
  const { startTick, metadata } = options;
  const lookaheadSec = options.lookaheadSec ?? LIVE_CAST_LOOKAHEAD_MS / 1000;
  if (!Number.isSafeInteger(startTick) || startTick < 0)
    throw new Error("Invalid live cast start tick");
  const lookaheadMs = lookaheadSec * 1000;
  if (!Number.isFinite(lookaheadMs) || lookaheadMs < 0)
    throw new Error("Invalid live cast lookahead");

  const trackers = new DirectorTrackers();
  const committed = new WeakSet<Shot>();
  const withWorld =
    options.withWorld ?? ((_snapshot, operation) => operation());
  let switcher: SwitcherStream | undefined;
  let view: CausalView | undefined;
  let previous: LiveCastPlannerFrame | undefined;
  let nextSampleMs = startTick * TICK_DURATION_MS;
  let nextDecisionMs = nextSampleMs;
  let plannedThroughTick = startTick - 1;
  let sawRunning = false;
  let kickoffDecisionMs: number | undefined;
  let terrainReadySec: number | undefined;
  let lastPublished:
    | {
        source: Shot;
        startTick: number;
        room?: { eye: DirectorVec3; subject: ShotSubject };
      }
    | undefined;
  let finished = false;

  // The packet sealed by a source tick is applied at the preceding tick. Both
  // message buffers can otherwise retain events from a prior mission.
  const firstEventSec = ((startTick - 1) * TICK_DURATION_MS) / 1000;
  const sinceStart = (event: { timeSec: number }): boolean =>
    event.timeSec >= firstEventSec;
  const inMatch = (snapshot: DirectorSnapshot): DirectorSnapshot => ({
    ...snapshot,
    serverEvents: snapshot.serverEvents.filter(sinceStart),
    chatMessages: snapshot.chatMessages.filter(sinceStart),
    ordnanceImpacts: snapshot.ordnanceImpacts?.filter(sinceStart),
  });

  function observePhase(frame: LiveCastPlannerFrame): void {
    const phase = frame.matchPhase;
    const atMs = frame.tick * TICK_DURATION_MS;
    trackers.observeMatchPhase(phase, atMs / 1000);
    if (phase?.kind === "warmup" || phase?.kind === "countdown")
      sawRunning = false;
    if (sawRunning || phase?.kind !== "running") return;
    sawRunning = true;
    // Switch on the first released tick with evidence of play. The game
    // clock separately determines whether opening coverage still applies.
    kickoffDecisionMs = atMs;
  }

  const nextDecision = () =>
    Math.min(nextDecisionMs, kickoffDecisionMs ?? Infinity);

  const decide = (
    atMs: number,
    horizonMs: number,
    output: LiveCastPlannerShot[],
  ): void => {
    const atSec = atMs / 1000;
    const horizonSec = horizonMs / 1000;
    const dataset = trackers.snapshot(
      { ...metadata, durationSec: horizonSec },
      horizonSec,
    );
    const horizonTick = streamTimeToTick(horizonSec);
    if (!switcher) {
      const ctf =
        supportsLiveCastMode(metadata.gameClassName, metadata.gameType) ??
        detectMode(dataset) === "ctf";
      if (!ctf) return;
      const sceneReadySec = Math.min(
        terrainReadySec ?? Infinity,
        dataset.matchFacts?.worldCompleteSec ?? Infinity,
        dataset.flagSamples[0]?.timeSec ?? Infinity,
        dataset.playerSamples[0]?.timeSec ?? Infinity,
      );
      if (sceneReadySec > atSec) return;
      view = new CausalView(dataset, lookaheadSec, true);
      switcher = createSwitcherStream(view, {
        startSec: atSec,
        isCommitted: (shot) => committed.has(shot),
      });
    }
    switcher.advanceTo(
      atSec + 1e-9,
      dataset,
      atMs === kickoffDecisionMs ? atSec : undefined,
    );
    const decisionTick = streamTimeToTick(atSec);
    const nextUnplannedTick = plannedThroughTick + 1;
    plannedThroughTick = decisionTick;

    const holdUntilTick =
      (lastPublished?.startTick ?? -Infinity) + LIVE_CAST_MIN_SHOT_TICKS;
    if (decisionTick < Math.max(holdUntilTick, nextUnplannedTick)) return;

    // Let the switcher keep observing during the hold. Once we can cut,
    // consider only the picture it would be showing now.
    const source = switcher.shots.findLast(
      (shot) => streamTimeToTick(shot.startSec) <= decisionTick,
    );
    if (!source) return;
    const sameFraming =
      lastPublished && framesTheSame(lastPublished.source, source);
    const room = lastPublished?.room;
    let leftRoom = false;
    if (room && (source === lastPublished?.source || sameFraming)) {
      const subject =
        room.subject.type === "flag"
          ? view?.flagAt(room.subject.slot, atSec)
          : view?.playerAt(room.subject.targetId, atSec);
      if (subject) {
        const aim: DirectorVec3 = [
          subject.pos[0],
          subject.pos[1],
          subject.pos[2] + 1,
        ];
        leftRoom = !subjectVisible(room.eye, aim, ROOM_SUBJECT_MARGIN);
      }
    }
    if (!leftRoom && (committed.has(source) || sameFraming)) return;

    const sourceStartTick = streamTimeToTick(source.startSec);
    const delayed = leftRoom || sourceStartTick < holdUntilTick;
    const startTick = delayed
      ? decisionTick
      : Math.max(nextUnplannedTick, sourceStartTick);
    const startSec = (startTick * TICK_DURATION_MS) / 1000;
    if (startSec > (switcher.latestStart(source) ?? Infinity)) return;
    const candidate = cloneData(source);
    if (candidate.kind === "sweep" && startSec > candidate.startSec) {
      candidate.moveOffsetSec =
        (candidate.moveOffsetSec ?? 0) + startSec - candidate.startSec;
    }
    candidate.startSec = startSec;
    if (delayed) candidate.transitionIn = "cut";
    candidate.endSec = Math.min(
      Math.max(candidate.endSec, candidate.startSec + LIVE_CAST_MIN_SHOT_SEC),
      horizonSec,
    );
    const staged = [candidate];
    stageShots(staged, [0], dataset, switcher.freeSpace);
    const shot = liveCameraShot(staged[0], startTick);
    committed.add(source);
    switcher.markAired(source, shot.startSec);
    const fixed = staged[0];
    const roomPose =
      fixed.kind === "fixedOrbit" &&
      fixed.trackSubject &&
      fixed.staged &&
      fixed.lookSubject
        ? shotPoseAt(fixed, 0)
        : null;
    lastPublished = {
      source,
      startTick,
      room:
        roomPose && fixed.kind === "fixedOrbit" && fixed.lookSubject
          ? { eye: roomPose.eye, subject: fixed.lookSubject }
          : undefined,
    };
    output.push(
      Object.freeze({ startTick, availableThroughTick: horizonTick, shot }),
    );
  };

  function planNext(
    atMs: number,
    horizonMs: number,
    output: LiveCastPlannerShot[],
  ): void {
    decide(atMs, horizonMs, output);
    if (atMs === kickoffDecisionMs) kickoffDecisionMs = undefined;
    nextDecisionMs = atMs + DECISION_STEP_MS;
  }

  return {
    get plannedThroughTick() {
      return plannedThroughTick;
    },

    async pushFrame(
      frame: LiveCastPlannerFrame,
    ): Promise<LiveCastPlannerShot[]> {
      if (finished) return [];
      if (
        !Number.isSafeInteger(frame.tick) ||
        frame.tick < 0 ||
        (previous && frame.tick < previous.tick)
      )
        throw new Error("Live cast input ticks must be non-decreasing");
      if (frame.tick === previous?.tick) return [];
      const output: LiveCastPlannerShot[] = [];
      if (frame.tick >= startTick) {
        const firstFrame = !previous || previous.tick < startTick;
        if (firstFrame && frame.tick > startTick) {
          // Begin from the first available world if the seed was skipped.
          nextSampleMs = nextDecisionMs = frame.tick * TICK_DURATION_MS;
        }
        observePhase(frame);
        for (;;) {
          const decisionMs = nextDecision();
          const horizonMs = decisionMs + lookaheadMs;
          const sample = nextSampleMs <= horizonMs;
          const neededTick = streamTimeToTick(
            (sample ? nextSampleMs : horizonMs) / 1000,
          );
          if (neededTick > frame.tick) break;
          const snapshot =
            neededTick === frame.tick || !previous
              ? frame.snapshot
              : previous.snapshot;
          await withWorld(snapshot, () =>
            withCollisionQueryBatch(() => {
              if (sample) {
                if (
                  terrainReadySec == null &&
                  snapshot.entities.some(
                    (entity) => entity.sceneData?.className === "TerrainBlock",
                  )
                )
                  terrainReadySec = nextSampleMs / 1000;
                trackers.step(inMatch(snapshot), nextSampleMs / 1000);
                nextSampleMs += OBSERVATION_STEP_MS;
              } else {
                planNext(decisionMs, horizonMs, output);
              }
            }),
          );
        }
      }
      previous = frame;
      return output;
    },

    async finish(): Promise<LiveCastPlannerShot[]> {
      if (finished) return [];
      finished = true;
      const output: LiveCastPlannerShot[] = [];
      if (!previous || previous.tick < startTick) return output;
      const { snapshot, tick } = previous;
      const endMs = tick * TICK_DURATION_MS;
      await withWorld(snapshot, () =>
        withCollisionQueryBatch(() => {
          // Include the last packet's events even if it fell between samples.
          trackers.ingestServerEvents(inMatch(snapshot), endMs / 1000);
          for (
            let decisionMs = nextDecision();
            decisionMs < endMs;
            decisionMs = nextDecision()
          )
            planNext(decisionMs, endMs, output);
          switcher?.finish(endMs / 1000);
          if (switcher) plannedThroughTick = tick;
        }),
      );
      return output;
    },
  };
}

export type LiveCastPlanner = ReturnType<typeof createLiveCastPlanner>;
