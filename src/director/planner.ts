import type { DirectorDataset, Shot, ShotPlan } from "./types";
import { CAST_CONTRACT_VERSION } from "./castContract";
import { describeVenue } from "./venue";
import {
  DIRECTOR_LINEUP_LEAD_SEC,
  DIRECTOR_SKIP_DEAD_AIR_SEC,
} from "./tunables";
import { planDeathmatch, planLandmarks, planRabbit } from "./modes";
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
 * Plan a whole recording's shot list for the modes without an online
 * switcher. Pure and deterministic — same dataset, same plan — so a
 * plan can be replayed and diffed offline. Never fails: modes degrade
 * Rabbit (chase the flag) → deathmatch (kill clusters) → landmark
 * orbits.
 *
 * CTF is not planned here: `planShotsCausal` (switcher.ts) casts it
 * live, and only sends the other modes this way. A CTF dataset handed
 * straight to this function gets the landmark tour.
 *
 * modes.ts emits the shots; assemble.ts makes the timeline contiguous,
 * strips aim subjects a frame can't actually contain, merges cuts that
 * change nothing, enforces the minimum hold, and reports coverage from
 * the FINAL shot list. The runtime (DirectorController + cameraRig)
 * then drives the camera on the demo clock, verifying every framing
 * against real geometry.
 */
export function planShots(dataset: DirectorDataset): ShotPlan {
  const gameMode = detectMode(dataset);
  let shots: Shot[];
  switch (gameMode) {
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
    contractVersion: CAST_CONTRACT_VERSION,
    gameMode,
    shots,
    coverage: reportCoverage(shots, dataset),
    skipToSec: openingSkip(dataset),
    matchFacts: dataset.matchFacts,
    venue: describeVenue(dataset) ?? undefined,
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
export function openingSkip(dataset: DirectorDataset): number | undefined {
  const matchStart = dataset.events.find(
    (e) => e.type === "match-start",
  )?.timeSec;
  if (matchStart == null || matchStart < DIRECTOR_SKIP_DEAD_AIR_SEC) {
    return undefined;
  }
  return Math.max(0, matchStart - DIRECTOR_LINEUP_LEAD_SEC);
}

export function detectMode(dataset: DirectorDataset): ShotPlan["gameMode"] {
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
