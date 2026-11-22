import { streamTimeToTick, TICK_DURATION_MS } from "../stream/streamHelpers";
import { framesTheSame } from "./assemble";
import { ROOM_SUBJECT_MARGIN } from "./cameraRig";
import { CausalView } from "./causalView";
import { flagAreaSubject } from "./flagCoverage";
import { shotPoseAt, subjectVisible } from "./shotPath";
import { stageShot, type StageReport } from "./stage";
import { visibleOpeningPlayers } from "./suitUp";
import { createSwitcherStream, type SwitcherStream } from "./switcher";
import {
  DIRECTOR_EVENT_LEAD_SEC,
  DIRECTOR_MIN_SHOT_SEC,
  DIRECTOR_ON_AIR_MIN_SHOT_SEC,
  DIRECTOR_TICK_SEC,
} from "./tunables";
import type { DirectorDataset, DirectorVec3, Shot, ShotSubject } from "./types";

const MIN_HOLD_TICKS = Math.ceil(
  (DIRECTOR_ON_AIR_MIN_SHOT_SEC * 1000) / TICK_DURATION_MS,
);
const NORMAL_HOLD_TICKS = Math.floor(
  (DIRECTOR_MIN_SHOT_SEC * 1000) / TICK_DURATION_MS,
);
const tickSec = (tick: number) => (tick * TICK_DURATION_MS) / 1000;

interface CameraCut {
  startTick: number;
  shot: Shot;
  report: StageReport;
}

/** Plan and admit CTF camera cuts from a bounded observation prefix. Both
 * the relay and demo playback feed this planner in stream time. */
export function createCtfCameraPlanner(
  startTick: number,
  lookaheadSec: number,
) {
  let view: CausalView | undefined;
  let switcher: SwitcherStream | undefined;
  let plannedThroughTick = startTick - 1;
  let last:
    | {
        source: Shot;
        startTick: number;
        shot: Shot;
        priority: ReturnType<SwitcherStream["cutFor"]>["priority"];
        room?: { eye: DirectorVec3; subject: ShotSubject };
      }
    | undefined;

  return {
    get started() {
      return switcher != null;
    },
    get plannedThroughTick() {
      return plannedThroughTick;
    },
    decide(
      atSec: number,
      dataset: DirectorDataset,
      { kickoff, endSec }: { kickoff?: boolean; endSec?: number } = {},
    ): CameraCut | undefined {
      if (!switcher || !view) {
        view = new CausalView(dataset, lookaheadSec, true);
        switcher = createSwitcherStream(view, {
          startSec: atSec,
          trackAired: true,
        });
      }
      switcher.advanceTo(atSec + 1e-9, dataset, kickoff ? atSec : undefined);
      const decisionTick = streamTimeToTick(atSec);
      const nextUnplannedTick = plannedThroughTick + 1;
      if (decisionTick < nextUnplannedTick) return;
      plannedThroughTick = decisionTick;

      const holdUntil = (last?.startTick ?? -Infinity) + MIN_HOLD_TICKS;
      const source = switcher.shots.findLast(
        (shot) => streamTimeToTick(shot.startSec) <= decisionTick,
      );
      if (!source) return;
      const cut = switcher.cutFor(source);
      const { priority, latestStartSec } = cut;
      // A known score may open on the first tick the minimum hold allows.
      const scheduleCapture =
        priority === "capture" &&
        holdUntil <= streamTimeToTick(dataset.durationSec) &&
        holdUntil < streamTimeToTick(atSec + DIRECTOR_TICK_SEC);
      if (decisionTick < holdUntil && !scheduleCapture) return;

      const sameFraming = last && framesTheSame(last.source, source);
      const room = last?.room;
      let leftRoom = false;
      if (room && (source === last?.source || sameFraming)) {
        const subject =
          room.subject.type === "flag"
            ? view.flagAt(room.subject.slot, atSec)
            : view.playerAt(room.subject.targetId, atSec);
        if (subject) {
          const [x, y, z] = subject.pos;
          leftRoom = !subjectVisible(
            room.eye,
            [x, y, z + 1],
            ROOM_SUBJECT_MARGIN,
          );
        }
      }
      if (!leftRoom && (switcher.hasAired(source) || sameFraming)) return;

      const startingSetup =
        source.topic === "suit-up" && last?.source.topic !== "suit-up";
      const leavingEmptySetup =
        last?.source.topic === "suit-up" &&
        !visibleOpeningPlayers(last.source, view.playersAt(atSec));
      const handoff =
        priority === "flagHandoff" &&
        flagAreaSubject(last?.shot)?.slot === cut.flagSlot;
      const importantCut =
        priority === "capture" ||
        ((priority === "flagPlay" || priority === "flagHandoff") &&
          last?.priority === "ordinary");
      const cutAfter =
        handoff ||
        leftRoom ||
        startingSetup ||
        leavingEmptySetup ||
        importantCut
          ? holdUntil
          : (last?.startTick ?? -Infinity) + NORMAL_HOLD_TICKS;
      if (decisionTick < cutAfter && !scheduleCapture) return;
      const sourceTick = streamTimeToTick(source.startSec);
      const delayed = leftRoom || sourceTick < cutAfter;
      const startTick = delayed
        ? Math.max(decisionTick, cutAfter)
        : Math.max(nextUnplannedTick, sourceTick);
      const startSec = tickSec(startTick);
      // A known end is distinct from the moving lookahead horizon.
      if (
        endSec != null &&
        (startSec >= endSec ||
          (last && startSec + DIRECTOR_ON_AIR_MIN_SHOT_SEC > endSec))
      )
        return;
      if (!leftRoom && startSec > (latestStartSec ?? Infinity)) return;
      if (
        source.topic === "suit-up" &&
        !visibleOpeningPlayers(source, view.playersAt(startSec))
      )
        return;
      const pendingCapture = switcher.pendingCaptureSec;
      if (
        pendingCapture != null &&
        startSec + DIRECTOR_ON_AIR_MIN_SHOT_SEC >
          pendingCapture - DIRECTOR_EVENT_LEAD_SEC
      )
        return;

      const { shot, report } = stageShot(source, dataset, switcher.freeSpace, {
        startSec,
        endSec: Math.max(
          source.endSec,
          startSec + DIRECTOR_ON_AIR_MIN_SHOT_SEC,
        ),
        transitionIn: delayed ? "cut" : source.transitionIn,
      });
      plannedThroughTick = Math.max(plannedThroughTick, startTick);
      switcher.markAired(source, startSec, shot);
      const roomPose =
        shot.kind === "fixedOrbit" && shot.trackSubject && shot.staged
          ? shotPoseAt(shot, 0)
          : null;
      last = {
        source,
        startTick,
        shot,
        priority,
        room:
          roomPose && shot.kind === "fixedOrbit" && shot.lookSubject
            ? { eye: roomPose.eye, subject: shot.lookSubject }
            : undefined,
      };
      return { startTick, shot, report };
    },
    finish(endSec: number): void {
      switcher?.finish(endSec);
      if (switcher) plannedThroughTick = streamTimeToTick(endSec);
    },
  };
}
