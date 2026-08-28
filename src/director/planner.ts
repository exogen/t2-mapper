import type { DirectorDataset, Shot, ShotPlan } from "./types";
import {
  DIRECTOR_LINEUP_LEAD_SEC,
  DIRECTOR_SKIP_DEAD_AIR_SEC,
} from "./tunables";
import { planCtf, planDeathmatch, planLandmarks, planRabbit } from "./modes";
import { describeScenes } from "./scene";
import {
  enforceMinDuration,
  fillGaps,
  mergeRedundantCuts,
  sanitizeLookSubjects,
  reportCoverage,
  spliceMissingCoverage,
} from "./assemble";

/**
 * Plan the auto-director's shot list from a scanned dataset. Pure and
 * deterministic — same dataset, same plan — so a plan can be replayed
 * and diffed offline. Never fails: game modes degrade CTF → Rabbit
 * (chase the flag) → deathmatch (kill clusters) → landmark orbits.
 *
 * The CTF pipeline, in order:
 *  1. interest.ts — score every subject (flags, bases, bombardments)
 *     per tick with full future knowledge, then segment the timeline
 *     with hysteresis. A capture preempts every other rule.
 *  2. modes.ts — carve the pre-match line-up sweeps and the kickoff
 *     wide out of the segments, then hand each segment to its emitter.
 *  3. flagRuns.ts — per-run emitters: scrambles collapse to one
 *     overhead, drops ride through as passes, turtles rotate inside /
 *     inbound / doorway, chases rotate camera styles and widen into
 *     the capture ceremony; caps and returns end in aftermath holds.
 *  4. assemble.ts — make the timeline contiguous, strip aim subjects a
 *     frame can't actually contain, merge cuts that change nothing,
 *     splice cover for missed tier-1 events (rate-limited, except
 *     captures — never those), enforce the minimum hold, and report
 *     coverage from the FINAL shot list.
 * The runtime (DirectorController + cameraRig) then drives the camera
 * on the demo clock, verifying every framing against real geometry.
 */
export function planShots(dataset: DirectorDataset): ShotPlan {
  const gameMode = detectMode(dataset);
  let shots: Shot[];
  switch (gameMode) {
    case "ctf":
      shots = planCtf(dataset);
      break;
    case "rabbit":
      shots = planRabbit(dataset);
      break;
    case "deathmatch":
      shots = planDeathmatch(dataset);
      break;
    default:
      shots = planLandmarks(dataset);
  }
  // Assemble: make it contiguous, drop cuts that change nothing, splice
  // cover for anything important still missed, then hold every shot long
  // enough to read. The report comes last so it describes what actually
  // survived rather than an intermediate timeline.
  shots = fillGaps(shots, dataset);
  sanitizeLookSubjects(shots, dataset);
  shots = mergeRedundantCuts(shots);
  spliceMissingCoverage(shots, dataset);
  shots = enforceMinDuration(shots, dataset);
  const plan: ShotPlan = {
    gameMode,
    shots,
    coverage: reportCoverage(shots, dataset),
    skipToSec: openingSkip(dataset),
  };
  // The commentary layer last, over the FINAL shot list.
  describeScenes(plan, dataset);
  return plan;
}

/**
 * Dead air at the head of the recording: a long team-picking period
 * before the whistle, where players trickle onto an empty server.
 * Returns where coverage effectively begins so the director can jump
 * there instead of filming an empty map.
 */
function openingSkip(dataset: DirectorDataset): number | undefined {
  const matchStart = dataset.events.find(
    (e) => e.type === "match-start",
  )?.timeSec;
  if (matchStart == null || matchStart < DIRECTOR_SKIP_DEAD_AIR_SEC) {
    return undefined;
  }
  return Math.max(0, matchStart - DIRECTOR_LINEUP_LEAD_SEC);
}

function detectMode(dataset: DirectorDataset): ShotPlan["gameMode"] {
  const cls = (dataset.gameClassName ?? "").toLowerCase();
  const teamedStands = dataset.flagStands.filter(
    (s) => s.teamId != null,
  ).length;
  if (cls.includes("ctf")) return "ctf";
  if (cls.includes("rabbit") || cls.includes("tr2")) return "rabbit";
  if (teamedStands >= 2) return "ctf";
  if (dataset.flagStands.length >= 1) return "rabbit";
  // Entity-state deaths OR timeline kill events: observer recordings
  // (relay captures) carry no kill events at all, and on deaths alone
  // would otherwise plan a deathmatch as a landmark tour.
  if (
    dataset.deaths.length > 0 ||
    dataset.events.some((e) => e.type === "kill" && e.pos)
  ) {
    return "deathmatch";
  }
  return "landmarks";
}
