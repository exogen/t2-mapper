/**
 * The online switcher: causal shot selection under the lookahead rule.
 *
 * Where the oracle planner segmented the whole timeline with full
 * future knowledge and then patched coverage retroactively, this is a
 * control room running forward through the match: every tick it scores
 * the same subjects the oracle scored — but from a CausalView, with
 * anticipation predictors standing in for the future terms — and a
 * commitment state machine decides when to cut. The peek window (see
 * DIRECTOR_LOOKAHEAD_SEC) is spent on cut hygiene: never cut away from
 * a subject whose story resolves within it, and cut TO an event
 * elsewhere early enough to land as it happens.
 *
 * Shots open without knowing when they will close; a cut closes the
 * running shot and stamps its end. Style rotation inside a segment
 * (chase ↔ dolly, chunked stand framings) replaces the emitters'
 * whole-run carving. Coverage is what anticipation and the peek
 * deliver — there is no retroactive splicing (and, by design decision,
 * no replays); reportCoverage still says plainly what was missed.
 */
import type { DirectorDataset, DirectorVec3, Shot, ShotPlan } from "./types";
import { CAST_CONTRACT_VERSION } from "./castContract";
import { describeVenue } from "./venue";
import {
  DIRECTOR_ABANDON_SCORE,
  DIRECTOR_AFTERMATH_HOLD_SEC,
  DIRECTOR_LINEUP_SWEEP_SEC,
  DIRECTOR_STATION_CAM_HEIGHT,
  DIRECTOR_STATION_CAM_RADIUS,
  DIRECTOR_STATION_RANGE,
  DIRECTOR_SUITUP_KICKOFF_SEC,
  DIRECTOR_AFTERMATH_RADIUS,
  DIRECTOR_CLUSTER_CAM_HEIGHT,
  DIRECTOR_CLUSTER_CAM_RADIUS,
  DIRECTOR_BOMBARDMENT_CAM_HEIGHT,
  DIRECTOR_BOMBARDMENT_CAM_RADIUS,
  DIRECTOR_BOMBARDMENT_CLOSE_HEIGHT,
  DIRECTOR_BOMBARDMENT_CLOSE_RADIUS,
  DIRECTOR_BOMBARDMENT_MIN_SHELLS,
  DIRECTOR_BOMBARDMENT_RANGE,
  DIRECTOR_BOMBARDMENT_WINDOW_SEC,
  DIRECTOR_CHASE_SEGMENT_SEC,
  DIRECTOR_CROWD_ORBIT_HEIGHT,
  DIRECTOR_CROWD_ORBIT_RADIUS,
  DIRECTOR_DIST_STAND_WIDE,
  DIRECTOR_GRAB_ALONGSIDE_DIST,
  DIRECTOR_GRAB_ALONGSIDE_HEIGHT,
  DIRECTOR_GRAB_CHASE_DIST,
  DIRECTOR_GRAB_MIN_DIST,
  DIRECTOR_CAPPER_MIN_LIKELIHOOD,
  DIRECTOR_CAP_APPROACH_MAX_DIST,
  DIRECTOR_CAP_APPROACH_MIN_DIST,
  DIRECTOR_CAP_APPROACH_RANGE,
  DIRECTOR_DOORWAY_HEIGHT,
  DIRECTOR_DOORWAY_RADIUS,
  DIRECTOR_DROPPED_FAR,
  DIRECTOR_DROPPED_NEAR_HOME,
  DIRECTOR_FIELD_CHECKIN_SCORE,
  DIRECTOR_FIELD_CHECKIN_SEC,
  DIRECTOR_FIELD_CHECKIN_WINDOW,
  DIRECTOR_FIELD_DECAY_SEC,
  DIRECTOR_FIELD_FLOOR_SCORE,
  DIRECTOR_FIELD_FRESH_SEC,
  DIRECTOR_FIELD_QUIET_RANGE,
  DIRECTOR_DROPPED_ORBIT_HEIGHT,
  DIRECTOR_DROPPED_ORBIT_RADIUS,
  DIRECTOR_FAIR_SHARE_SEC,
  DIRECTOR_FIXED_CHUNK_SEC,
  DIRECTOR_FIXED_MAX_SPEED,
  DIRECTOR_GRAB_IMMINENT_SEC,
  DIRECTOR_GRAB_LOOKAHEAD_SEC,
  DIRECTOR_HARD_FLOOR_SEC,
  DIRECTOR_KILL_NEAR_FLAG,
  DIRECTOR_MAX_CHASE_SEC,
  DIRECTOR_MAX_STATIC_SEC,
  DIRECTOR_GRAB_REACT_SEC,
  DIRECTOR_MIN_SHOT_SEC,
  DIRECTOR_PITCH_CHASE,
  DIRECTOR_PITCH_STAND,
  DIRECTOR_PREEMPT_SCORE,
  DIRECTOR_SWITCH_PENALTY,
  DIRECTOR_THREAT_RANGE,
  DIRECTOR_TICK_SEC,
  DIRECTOR_TURTLE_INSIDE_HEIGHT,
  DIRECTOR_TURTLE_INSIDE_RADIUS,
  SCORE_BASE,
  SCORE_BASE_ATTACK,
  SCORE_BOMBARDMENT,
  SCORE_CAP_CHAIN_BONUS,
  SCORE_CARRIED,
  SCORE_DROPPED,
  SCORE_GRAB_IMMINENT,
  SCORE_GRAB_SOON,
  SCORE_IDLE,
  SCORE_KILLS_NEAR_FLAG,
  SCORE_QUIET,
  SCORE_RETURN_IMMINENT,
  SCORE_RETURN_SOON,
  SCORE_THREAT,
} from "./tunables";
import { CausalView } from "./causalView";
import {
  approachEta,
  capLikelihood,
  inboundAttacker,
  returnConverging,
} from "./predictors";
import { buildSubjects, type Subject } from "./interest";
import { busiestCluster } from "./analysis";
import { boundingSpread, centroid, dist } from "./geometry";
import {
  distanceForSpeed,
  onBroadcastSide,
  newShotVariety,
  orbitShot,
  radiusForSpread,
  type ShotVariety,
} from "./framing";
import { flagLabel, playerName } from "./dataset";
import { rosterCloseUp, rosterWide, type RosterFraming } from "./lineup";
import {
  flyThroughShot,
  landmarksFor,
  dollyInShotAt,
  holdShotAt,
  lateralPanAt,
  PAN_MAX_OFFSET,
  playerCloseUpSpots,
  preMatchPace,
  SIGNING_HOLD_SEC,
  standoffFor,
  tourShotAt,
  type Landmark,
} from "./preMatch";
import {
  createFreeSpaceBuild,
  aimOf,
  cameraSpotsFor,
  eyesRoomy,
  filmable,
  gridBuildSec,
  type FreeSpaceBuild,
  type FreeSpaceGrid,
} from "./freeSpace";
import { publishFreeSpace } from "./freeSpaceRegistry";
import { inspectShot, shotCameraPath } from "./shotPath";
import { PLAYER_AIM_LIFT, PLAYER_STANDOFF } from "./humanScale";
import { assetBoxCenter } from "../collision/worldCollision";

/**
 * A move paired with the camera positions it may be built from.
 *
 * `spots` is lazy: a chain usually stops at its first entry, and the
 * grid search behind a later one costs raycasts nobody needs.
 */
export interface ShotCandidate {
  build: (spot: DirectorVec3) => Shot;
  spots: () => DirectorVec3[];
}

/**
 * The first candidate whose REALIZED camera path holds up.
 *
 * This is the whole contract of the pre-match director in one place: a
 * shot is proposed, its entire flight is walked against real geometry,
 * and it ships only if it never enters the world and actually shows its
 * subject. Nothing here is trusted because it looked right on paper.
 */
export function firstWatchable(candidates: ShotCandidate[]): Shot | null {
  for (const candidate of candidates) {
    for (const spot of candidate.spots()) {
      const shot = candidate.build(spot);
      if (inspectShot(shot)?.ok) return shot;
    }
  }
  return null;
}

/** Start the rotation at `by`, wrapping — plain round-robin. */
function rotate<T>(items: T[], by: number): T[] {
  const n = items.length;
  const at = ((by % n) + n) % n;
  return items.map((_, i) => items[(at + i) % n]);
}

/**
 * Rotate, but keep the LAST entry last.
 *
 * The tour's last move is the orbit, and the orbit survives validation
 * almost anywhere — so sitting mid-chain as a fallback it quietly won
 * most of the rotation it was meant to be one quarter of.
 */
function orbitLast<T>(items: T[], by: number): T[] {
  const orbit = items[items.length - 1];
  return [...rotate(items.slice(0, -1), by), orbit];
}

/**
 * Framings tried for a roster pass, in order: the intended one, then
 * closer, then from behind the rank, then higher.
 */
const ROSTER_FRAMINGS: RosterFraming[] = [
  {},
  { standoffScale: 0.7 },
  { mirror: true },
  { standoffScale: 1.4 },
  { lift: 3 },
  { mirror: true, standoffScale: 0.7 },
];

/** At most one establishing stand-to-stand run per this long. */
const FLYBY_EVERY_SEC = 300;

/**
 * The players whose pick-up is ready to film.
 *
 * A team flag flipping is not a filmable moment: the player is still
 * standing in the observer spot and is about to be moved to a spawn
 * point, so cutting to them right then is what made this jumpy. The
 * moment is QUEUED here and released once they have settled — and the
 * caller films them where they are by then, not where they were.
 *
 * Mutates the two maps it is given: they are the caller's memory of who
 * is on which side and who is still settling.
 */
export function settledSignings<
  T extends { targetId: number; teamId?: number | null },
>(
  players: readonly T[],
  knownTeam: Map<number, number>,
  signedAt: Map<number, number>,
  nowSec: number,
  /** The first pick-up seen on each side, by team id. Filled here; those
   *  never go stale — they are the reason the broadcast comes on air,
   *  and it opens with the establishing run before it can get to them. */
  firstSigned: Map<number, number> = new Map(),
): T[] {
  const ready: T[] = [];
  const onTeam = new Map<number, number>();
  for (const p of players) {
    const team = p.teamId ?? 0;
    const was = knownTeam.get(p.targetId);
    knownTeam.set(p.targetId, team);
    if (team <= 0) {
      signedAt.delete(p.targetId);
      continue;
    }
    onTeam.set(p.targetId, team);
    if (was == null || was <= 0) {
      signedAt.set(p.targetId, nowSec);
      if (!firstSigned.has(team)) firstSigned.set(team, p.targetId);
    }
    const since = signedAt.get(p.targetId);
    if (since == null) continue;
    // A pick-up is news for a moment, not for the whole picking period.
    // Held back — by the other side still being empty, or by a run of
    // joiners ahead in the queue — it goes stale and is dropped rather
    // than aired minutes late; the roster intro covers them anyway.
    const pinned = firstSigned.get(team) === p.targetId;
    // Stale is counted from when they became filmable, not from the
    // pick: the settle wait is the same for everyone.
    if (!pinned && nowSec - since > SIGNING_SETTLE_SEC + SIGNING_STALE_SEC) {
      signedAt.delete(p.targetId);
      continue;
    }
    if (nowSec - since >= SIGNING_SETTLE_SEC) ready.push(p);
  }
  // A first pick-up who has since left the side (or the server) hands
  // the slot to the oldest still queued on it — one demo's first Storm
  // pick-up disconnected before the run, and the real one went stale.
  for (const [team, id] of firstSigned) {
    if (onTeam.get(id) === team) continue;
    const next = players
      .filter(
        (p) => onTeam.get(p.targetId) === team && signedAt.has(p.targetId),
      )
      .sort((a, b) => signedAt.get(a.targetId)! - signedAt.get(b.targetId)!)[0];
    if (next) firstSigned.set(team, next.targetId);
    else firstSigned.delete(team);
  }
  // Oldest first: the queue is a queue.
  return ready.sort(
    (a, b) => signedAt.get(a.targetId)! - signedAt.get(b.targetId)!,
  );
}

/**
 * Are both sides ready to be shown?
 *
 * A side that has only just gained its first player is not a side yet:
 * pick-ups and roster shots both wait until each team has held at
 * least one player for `TEAM_SETTLE_SEC`. Before that a "pick-up" is a
 * lone figure with nobody to be picked against, and a line-up is one
 * person.
 *
 * Mutates the map it is given: the caller's memory of when each side
 * was first filled. A side that empties again forgets.
 */
export function sidesSettled<T extends { teamId?: number | null }>(
  players: readonly T[],
  teamOccupiedSince: Map<number, number>,
  nowSec: number,
): boolean {
  const occupied = new Set<number>();
  for (const p of players) if ((p.teamId ?? 0) > 0) occupied.add(p.teamId!);
  for (const teamId of occupied) {
    if (!teamOccupiedSince.has(teamId)) teamOccupiedSince.set(teamId, nowSec);
  }
  for (const teamId of [...teamOccupiedSince.keys()]) {
    if (!occupied.has(teamId)) teamOccupiedSince.delete(teamId);
  }
  return (
    occupied.size >= 2 &&
    [...teamOccupiedSince.values()].every(
      (since) => nowSec - since >= TEAM_SETTLE_SEC,
    )
  );
}

/** A lateral pan across a player gets longer than a static pick-up. */
const SIGNING_PAN_SEC = 10;
/** How long a new signing is left alone before the camera finds them —
 *  long enough to be moved to a spawn point and stop. */
const SIGNING_SETTLE_SEC = 7;
/** How long a signing stays worth airing once it is filmable. Past
 *  this it is dropped: a pick-up read half a minute after the pick is
 *  a name out of nowhere. */
const SIGNING_STALE_SEC = 8;
/** A side's first pick-up never goes stale, so it is retried this many
 *  times before it is given up as unfilmable. */
const SIGNING_MAX_ATTEMPTS = 8;
/** How far from a pick-up who cannot be framed a landmark of their
 *  side may be and still stand in for them on camera. */
const SIGNING_FALLBACK_RANGE = 60;
/** How long each side must have held at least one player before a
 *  pick-up or the roster block may air. Introducing a side that is
 *  still one person is worse than waiting. */
const TEAM_SETTLE_SEC = 7;

import { pickVarietyShot, type VarietyMemory } from "./variety";
import { framesTheSame, reportCoverage } from "./assemble";
import { describeScenes } from "./scene";
import { detectMode, openingSkip, planShots } from "./planner";

/** Tier-1 event types whose peek presence pins the current subject. */
const HOLD_EVENT_TYPES = [
  "flag-cap",
  "flag-grab",
  "flag-return",
  "flag-drop",
] as const;
/** Roster-intro entry: both teams at least this full, and the teamed
 *  count stable this long (picking has settled), starts the line-ups
 *  well before any countdown — the full progression needs more time
 *  than the 30-second whistle warning can hold. */
const LINEUP_MIN_PER_SIDE = 5;
const LINEUP_STABLE_SEC = 25;
/** A finished intro re-arms only when the roster outgrows the one it
 *  filmed by half again, and never within the cooldown — a long
 *  picking period must not become wall-to-wall roster sweeps. */
const LINEUP_REARM_GROWTH = 1.5;
const LINEUP_REARM_COOLDOWN_SEC = 120;
/** Faces to introduce per side (scaled by roster, clamped), and how
 *  many faces one close pan covers on average — together they size the
 *  1–3 close-ups per team. */
const LINEUP_FACES_MIN = 5;
const LINEUP_FACES_MAX = 20;
const LINEUP_FACES_PER_PASS = 6;
const LINEUP_MAX_CLOSEUPS = 3;

/** Trailing stillness that reads as a turtle (with the flag held). */
const TURTLE_HELD_SEC = 10;
const TURTLE_DRIFT_MAX = 15;
/** Players near the stand right now that read as a battle. */
const STAND_BATTLE_MIN_PLAYERS = 4;

/**
 * Plan a broadcast under the causal rule. CTF runs the online
 * switcher; the other modes still delegate to the oracle planner until
 * their emitters are ported (they are rare and landmark-ish anyway).
 */
export function planShotsCausal(dataset: DirectorDataset): ShotPlan {
  const gameMode = detectMode(dataset);
  if (gameMode !== "ctf") return planShots(dataset);
  // The switcher's output IS the plan. No post-hoc rewriting: merging,
  // minimum holds and contiguity are the switcher's own invariants —
  // every assembler pass behind it was a system fighting its decisions
  // (absorbing pre-grab beats, stretching portraits into stares).
  return assembleCastPlan(runSwitcher(new CausalView(dataset)), dataset);
}

/**
 * Wrap a switcher's shots into a finished plan.
 *
 * Shared by the batch planner and the streaming one, which each used to
 * assemble this themselves — and the streaming copy quietly omitted
 * `skipToSec`, which the commentary track reads.
 */
export function assembleCastPlan(
  out: Shot[],
  dataset: DirectorDataset,
): ShotPlan {
  // Demo-viewer transport only: the skip must land BEFORE the final
  // pre-match roster block, or the seek jumps the broadcast's opening.
  let skipToSec = openingSkip(dataset);
  const matchStart = dataset.events.find(
    (e) => e.type === "match-start",
  )?.timeSec;
  if (matchStart != null) {
    // Contiguous runs of pre-match roster sweeps, oldest first.
    const sweeps = out.filter(
      (s) =>
        s.kind === "sweep" &&
        (s.role === "rosterWide" || s.role === "rosterCloseUp") &&
        s.startSec < matchStart,
    );
    const runs: (typeof sweeps)[] = [];
    for (const sweep of sweeps) {
      const last = runs[runs.length - 1];
      if (last && sweep.startSec - last[last.length - 1].endSec < 30) {
        last.push(sweep);
      } else {
        runs.push([sweep]);
      }
    }
    // Land on the last FULL progression (both wides plus close-ups) so
    // the viewer gets the whole roster intro, not just a refresher —
    // fall back to the last run of any shape.
    const full = runs.filter(
      (run) =>
        run.filter((s) => s.role === "rosterWide").length >= 2 &&
        run.filter((s) => s.role === "rosterCloseUp").length >= 2 &&
        run[run.length - 1].endSec - run[0].startSec >= 50,
    );
    const target = full[full.length - 1] ?? runs[runs.length - 1];
    if (target) {
      skipToSec = Math.min(
        skipToSec ?? Infinity,
        Math.max(0, target[0].startSec - 1),
      );
    }
  }
  const plan: ShotPlan = {
    contractVersion: CAST_CONTRACT_VERSION,
    gameMode: "ctf",
    shots: out,
    coverage: reportCoverage(out, dataset),
    skipToSec,
    matchFacts: dataset.matchFacts,
    venue: describeVenue(dataset) ?? undefined,
  };
  describeScenes(plan, dataset);
  return plan;
}

interface SwitcherState {
  view: CausalView;
  subjects: Subject[];
  variety: ShotVariety;
  shots: Shot[];
  current: number;
  segStartSec: number;
  /** A fairness cut holds until this time, whatever the scores say. */
  protectedUntil: number;
  /** Next style-rotation boundary inside the running segment. */
  rotateAt: number;
  /** A scheduled set piece. Ceremonies (aftermath holds) own the
   *  screen; filler (variety cut-ins) yields to breaking flag drama. */
  directive: {
    atSec: number;
    untilSec: number;
    shot: Shot;
    kind: "ceremony" | "filler";
  } | null;
  /** Cap times already reacted to (the peek sees each for ~2s). */
  handledCaps: Set<number>;
  /** Grabs already acted on, per PHASE: a grab may pull the camera
   *  once while it is still coming ("pre", anticipation) and once
   *  after it lands ("post", reaction) — so a shot that drifted away
   *  between the two can still be recovered, without ping-ponging. */
  handledGrabs: Map<number, Set<"pre" | "post">>;
  handledKickoff: boolean;
  chaseStyle: number;
  turtleViews: number;
  /** True for the first shot after a SUBJECT change — a cold cut,
   *  which must establish rather than open on an intimate framing. */
  freshSubject: boolean;
  /** The flag status the current shot was styled FOR — a transition
   *  (home→held, held→field…) forces an immediate restyle, since quiet
   *  framings deliberately never rotate on their own. */
  currentStyleStatus: string | null;
  /** When each variety family last aired (freshness rotation). */
  readonly varietyMem: VarietyMemory;
  /** Roster line-up mode: runs until this time once the pre-kickoff
   *  countdown is announced. Keyed by the countdown's IMPLIED START so
   *  a cancelled-and-restarted countdown re-triggers a fresh block at
   *  the real kickoff (admin re-forces are common), while the repeat
   *  ticks of one countdown (30/15/10/5…) don't. */
  lineupUntil: number;
  lineupStartAt: number;
  lineupPass: number;
  /** Sides in the rotation, so a re-armed block resumes on the NEXT
   *  one rather than repeating the side it just showed. */
  lineupTeams: number;
  readonly lineupFeatured: Map<number, Set<number>>;
  /** Close-ups owed/aired per team for the current block. */
  readonly lineupCloseTarget: Map<number, number>;
  readonly lineupCloseDone: Map<number, number>;
  /** The side whose portrait montage is running, so its three quick
   *  cuts land back to back rather than one between two sweeps of the
   *  other side. */
  lineupPortraitTeam: number | null;
  /** The stability-triggered intro runs once per ROSTER: it re-arms
   *  when the teamed count meaningfully outgrows the one it filmed (a
   *  picking lull can look "settled" at half strength). */
  rosterIntroDone: boolean;
  rosterIntroCount: number;
  /** Rotation through the map tour, so consecutive fillers differ. */
  preMatchPass: number;
  /** Advances only when a LANDMARK shot airs, so the orbit/dolly/flyover
   *  split is actually even — sharing `preMatchPass` with signings and
   *  squad shots skewed it heavily toward orbits. */
  preMatchStyle: number;
  /** Landmarks for this map, resolved once. */
  landmarks: Landmark[] | null;
  /** Where a camera can stand: null until the build finishes. */
  freeSpace: FreeSpaceGrid | null;
  /** That build, while it is still running. */
  freeSpaceBuild: FreeSpaceBuild | null;
  /** When the last establishing fly-by ran, and how many there were. */
  lastFlyBySec: number | null;
  flyByCount: number;
  /** Move rotation for signings, kept apart from the tour's own so the
   *  two do not shuffle each other's cadence. */
  signingStyle: number;
  /** When each player picked a side, until their shot is taken. */
  signedAt: Map<number, number>;
  /** Framing attempts per queued pick-up that found no watchable shot. */
  signingAttempts: Map<number, number>;
  /** When each side last went from empty to occupied. */
  teamOccupiedSince: Map<number, number>;
  /** Whether each landmark can be filmed at all, by landmark key. The
   *  answer never changes for a given landmark, so it is asked once. */
  filmable: Map<string, boolean>;
  /** Where each landmark's middle sits above its anchor. Same story:
   *  invariant per landmark, and it walks every collider to find out. */
  aimLift: Map<string, number>;
  /** Team each player was last seen on, for spotting assignments. */
  readonly knownTeam: Map<number, number>;
  /** Observed this tick: both sides have held a player long enough. */
  sidesReady: boolean;
  /** The first pick-up seen on each side, by team id (never stale). */
  firstSigned: Map<number, number>;
  /** Observed this tick: signings settled and waiting to be filmed,
   *  oldest first. */
  readySignings: PreMatchPlayer[];
  /** Whether the flag-to-flag establishing pass has aired. */
  openingFlyDone: boolean;
  /** What the last pre-match shot was OF, so the next one is of
   *  something else. */
  preMatchSubject: string | null;
  /** Post-whistle suit-up phase: the first seconds of a match belong
   *  to the players gearing up at the inventory stations, never to an
   *  empty mid-map wide or a motionless flag stand. */
  suitUpUntil: number;
  suitUpLastPos: DirectorVec3 | null;
  teamedCountPrev: number;
  teamedStableSince: number;
  /** Last tick a non-flag subject held the screen (variety fatigue). */
  lastNonFlagSec: number;
}

/** Exported for tests: run the tick loop over a caller-owned view, so
 *  the view's maxQueriedAhead can prove the run stayed causal. */
/** Fresh switcher state for a view. Shared by the batch and streaming
 *  entry points so the two cannot drift. */
function newSwitcherState(view: CausalView): SwitcherState {
  const dataset = view.dataset;
  const subjects = buildSubjects(dataset, view.flagSlots());
  const state: SwitcherState = {
    view,
    subjects,
    variety: newShotVariety(),
    shots: [],
    current: subjects.length - 1, // idle until something scores
    segStartSec: 0,
    protectedUntil: 0,
    rotateAt: 0,
    directive: null,
    handledCaps: new Set(),
    handledGrabs: new Map(),
    handledKickoff: false,
    chaseStyle: 0,
    turtleViews: 0,
    freshSubject: false,
    currentStyleStatus: null,
    varietyMem: new Map(),
    lastNonFlagSec: 0,
    lineupUntil: Number.NEGATIVE_INFINITY,
    lineupStartAt: Number.NEGATIVE_INFINITY,
    lineupPass: 0,
    lineupTeams: 2,
    lineupFeatured: new Map(),
    lineupCloseTarget: new Map(),
    lineupCloseDone: new Map(),
    lineupPortraitTeam: null,
    preMatchPass: 0,
    preMatchStyle: 0,
    landmarks: null,
    freeSpace: null,
    freeSpaceBuild: null,
    filmable: new Map(),
    aimLift: new Map(),
    lastFlyBySec: null,
    flyByCount: 0,
    signingStyle: 0,
    signedAt: new Map(),
    signingAttempts: new Map(),
    teamOccupiedSince: new Map(),
    knownTeam: new Map(),
    sidesReady: false,
    firstSigned: new Map(),
    readySignings: [],
    openingFlyDone: false,
    preMatchSubject: null,
    rosterIntroDone: false,
    rosterIntroCount: 0,
    suitUpUntil: Number.NEGATIVE_INFINITY,
    suitUpLastPos: null,
    teamedCountPrev: -1,
    teamedStableSince: 0,
  };
  return state;
}

/**
 * Rebuild the subject list when the grown dataset knows more of the
 * map than the one the switcher was created on.
 *
 * A stream's first slice is planned before the world has loaded, and a
 * dataset with no flags yet yields no flag subjects — so, built once,
 * the list held only the idle filler and the whole match was covered
 * as one long lull, every grab reaction looking for a flag subject that
 * was never there. The current subject keeps its identity across the
 * rebuild; a subject that vanished (none does, in practice) hands the
 * screen to idle.
 */
function refreshSubjects(state: SwitcherState): void {
  const { view } = state;
  const slots = view.flagSlots();
  const stands = view.stands;
  const same =
    state.subjects.filter((s) => s.kind === "flag").length === slots.length &&
    state.subjects.filter((s) => s.kind === "base").length === stands.length &&
    slots.every((slot) =>
      state.subjects.some((s) => s.kind === "flag" && s.slot === slot),
    );
  if (same) return;
  const current = state.subjects[state.current];
  const subjects = buildSubjects(view.dataset, slots);
  const index = subjects.findIndex((s) =>
    s.kind === "idle"
      ? current.kind === "idle"
      : s.kind === current.kind && s.slot === current.slot,
  );
  state.subjects = subjects;
  state.current = index >= 0 ? index : subjects.length - 1;
}

export function runSwitcher(view: CausalView): Shot[] {
  // The STREAM driven to the end — not a second copy of the tick loop.
  // Every "the two paths disagree" bug in this system came from one
  // fact written out twice; this was the last remaining duplicate, and
  // the parity spec (decides-the-same-shots) proves the collapse costs
  // nothing.
  const stream = createSwitcherStream(view);
  stream.advanceTo(view.dataset.durationSec, view.dataset);
  stream.finish(view.dataset.durationSec);
  return stream.shots;
}

/**
 * The same switcher, driven a slice at a time.
 *
 * `runSwitcher` walks a whole dataset in one call, which is only
 * possible because the demo is already on disk. The decisions inside
 * are identical either way — the switcher never queries past
 * `now + lookahead` — so the loop above and this are the same director;
 * one is handed the whole timeline at once, the other is fed it.
 *
 * Shots close as the switcher moves on from them, so everything before
 * the last entry is final; the last one is still being framed.
 */
export interface SwitcherStream {
  /** Shots decided so far. The tail is still open. */
  readonly shots: Shot[];
  /** How far the switcher has been driven. */
  readonly plannedToSec: number;
  /** Run ticks up to `sec`, against a dataset covering at least that. */
  advanceTo(sec: number, dataset: DirectorDataset): void;
  /** Close the final shot; no more ticks after this. */
  finish(atSec: number): void;
}

export function createSwitcherStream(view: CausalView): SwitcherStream {
  const state = newSwitcherState(view);
  openShot(state, 0);
  let cursor = 0;
  return {
    get shots() {
      return state.shots;
    },
    get plannedToSec() {
      return cursor;
    },
    advanceTo(sec: number, dataset: DirectorDataset): void {
      // The view reads through to the dataset it was built with, so a
      // growing dataset has to be swapped in as it grows.
      view.useDataset(dataset);
      refreshSubjects(state);
      for (
        let t = cursor + DIRECTOR_TICK_SEC;
        t <= sec;
        t += DIRECTOR_TICK_SEC
      ) {
        view.advanceTo(t);
        tick(state, t);
        cursor = t;
      }
      // The shot still rolling has to keep covering the playhead.
      // `openShot` ends it at the dataset's duration, which while
      // streaming is only the horizon it was opened under — so once the
      // viewer passed that, nothing in the plan contained the current
      // time and the screen had no shot to render. `closeShot` writes
      // the real end when the cut comes.
      // Through the END of the tick it has been driven to, not up to
      // it: a playhead sitting exactly on the boundary has to land
      // inside a shot, not between two.
      const open = state.shots[state.shots.length - 1];
      const covered = cursor + DIRECTOR_TICK_SEC;
      if (open && open.endSec < covered) open.endSec = covered;
    },
    finish(atSec: number): void {
      closeShot(state, atSec);
    },
  };
}

function tick(state: SwitcherState, t: number): void {
  const { view, subjects } = state;
  // Before the whistle: watch every tick, shot or no shot. Decisions
  // come later in this function and read what was observed here.
  if (!state.handledKickoff) observePreMatch(state, view, t);
  // A CAPTURE preempts everything — fairness, phases, and any running
  // variety set piece. This check must come before the directive
  // branch, or a cap landing during a 9s cut-in goes uncovered.
  for (const capEvent of view.peekFlagEvents(null, ["flag-cap"])) {
    if (state.handledCaps.has(capEvent.timeSec)) continue;
    state.handledCaps.add(capEvent.timeSec);
    const slot = view.eventSlot(capEvent);
    state.directive = null;
    if (slot != null) scheduleAftermath(state, slot, capEvent.timeSec);
    const onIt =
      subjects[state.current].kind === "flag" &&
      (subjects[state.current] as { slot: number }).slot === slot;
    if (!onIt && slot != null) {
      switchTo(
        state,
        subjects.findIndex((s) => s.kind === "flag" && s.slot === slot),
        t,
      );
    }
    return;
  }
  // A GRAB is the story, and the camera goes there whether the peek
  // warned us (anticipation) or it simply happened (pure reaction) —
  // the window spans both, so this works identically at ANY lookahead,
  // including zero (true live). Predictor ties, switch penalties and
  // filler cut-ins never hold the camera elsewhere while a grab lands;
  // ceremonies do, and so does our own subject's SOONER story.
  {
    const phaseOf = (e: { timeSec: number }) =>
      e.timeSec > t ? "pre" : ("post" as const);
    const grab = view
      .eventsIn(t - DIRECTOR_GRAB_REACT_SEC, view.horizon)
      .find(
        (e) =>
          e.type === "flag-grab" &&
          !state.handledGrabs.get(e.timeSec)?.has(phaseOf(e)),
      );
    const slot = grab ? view.eventSlot(grab) : null;
    if (grab && slot != null) {
      const current = subjects[state.current];
      const alreadyOnIt = current.kind === "flag" && current.slot === slot;
      const ownStory =
        current.kind === "flag"
          ? view.peekFlagEvents(current.slot, HOLD_EVENT_TYPES)[0]?.timeSec
          : undefined;
      const markHandled = () => {
        let phases = state.handledGrabs.get(grab.timeSec);
        if (!phases) state.handledGrabs.set(grab.timeSec, (phases = new Set()));
        phases.add(phaseOf(grab));
      };
      if (alreadyOnIt) {
        markHandled();
      } else if (
        state.directive?.kind !== "ceremony" &&
        (ownStory == null || ownStory > grab.timeSec)
      ) {
        markHandled();
        state.directive = null;
        state.suitUpUntil = Math.min(state.suitUpUntil, t);
        switchTo(
          state,
          subjects.findIndex((s) => s.kind === "flag" && s.slot === slot),
          t,
        );
        // Anticipated grabs open a deliberately short pre-grab beat at
        // the stand; protect it from the fragment rule.
        const opened = state.shots[state.shots.length - 1];
        if (opened && grab.timeSec > t) opened.quickCut = true;
        return;
      }
    }
  }
  // A running set piece owns the screen until it ends.
  if (state.directive) {
    state.lastNonFlagSec = t;
    if (t >= state.directive.atSec && state.shots.length > 0) {
      const open = state.shots[state.shots.length - 1];
      if (open !== state.directive.shot) {
        closeShot(state, state.directive.atSec);
        state.shots.push(state.directive.shot);
        state.segStartSec = state.directive.atSec;
        state.rotateAt = state.directive.untilSec;
      }
    }
    if (t < state.directive.untilSec) return;
    // Reopen exactly where the set piece ended, not at the next tick —
    // a fraction-of-a-second seam here is a hole in the broadcast.
    const at = state.directive.untilSec;
    state.directive = null;
    closeShot(state, at);
    state.current = bestSubject(state, t);
    state.segStartSec = at;
    openShot(state, at);
    return;
  }
  if (!state.handledKickoff) {
    const start = view
      .eventsIn(t - DIRECTOR_TICK_SEC, view.horizon)
      .find((e) => e.type === "match-start");
    if (start) {
      state.handledKickoff = true;
      // The whistle ends the line-ups; what follows is NOT a wide of
      // an empty mid-map — everyone is at the inventory stations
      // gearing up, and that is the shot (user direction).
      state.lineupUntil = Math.min(state.lineupUntil, start.timeSec);
      state.suitUpUntil = start.timeSec + DIRECTOR_SUITUP_KICKOFF_SEC;
      return;
    }
  }
  // The countdown announcement is the broadcast's cue for the roster
  // line-ups: teams stand assembled and nothing moves, so sweep the
  // ranks until just before the whistle. Detection is causal — the
  // message is in the chat log, and each pass frames the players where
  // they stand RIGHT NOW (they are standing still; that is the shot).
  if (!state.handledKickoff) {
    const countdown = view
      .eventsIn(t - DIRECTOR_TICK_SEC, view.horizon)
      .find(
        (e) =>
          e.type === "match-countdown" &&
          (e.secondsUntil ?? 0) >= DIRECTOR_LINEUP_SWEEP_SEC + 4,
      );
    if (countdown) {
      const impliedStart = countdown.timeSec + (countdown.secondsUntil ?? 0);
      // A genuinely NEW schedule (not a repeat tick of the running
      // one): line-ups run to the new whistle — the kickoff directive
      // trims the final pass, seam-free. An already-running intro
      // block just has its deadline moved; a finished one restarts as
      // the refresher.
      if (Math.abs(impliedStart - state.lineupStartAt) > 3) {
        state.lineupStartAt = impliedStart;
        if (t >= state.lineupUntil) {
          startLineupBlock(state, t, impliedStart);
          emitLineupPass(state, t);
          return;
        }
        // A block already running only has its deadline moved: the
        // pass on air finishes. Re-emitting here cut a sweep off two
        // seconds in, on the tick the countdown came into view.
        state.lineupUntil = impliedStart;
      }
    }
    // The intro: once team-picking has settled (both sides filled, the
    // teamed count stable), there is time for the FULL progression —
    // two wides plus the scaled close-ups — which no 30-second
    // countdown can hold. Runs once; countdowns handle the finale.
    if (t >= state.lineupUntil) {
      const teamed = view.playersAt(t).filter((p) => (p.teamId ?? 0) > 0);
      const perTeam = new Map<number, number>();
      for (const p of teamed) {
        perTeam.set(p.teamId!, (perTeam.get(p.teamId!) ?? 0) + 1);
      }
      if (teamed.length !== state.teamedCountPrev) {
        state.teamedCountPrev = teamed.length;
        state.teamedStableSince = t;
      }
      if (
        state.rosterIntroDone &&
        teamed.length >= state.rosterIntroCount * LINEUP_REARM_GROWTH &&
        t - state.lineupUntil >= LINEUP_REARM_COOLDOWN_SEC
      ) {
        state.rosterIntroDone = false;
      }
      // Per-side occupancy, tracked independently of the total: a side
      // that has only just gained its first player is not ready to be
      // introduced, however stable the overall count looks.
      const sides = [...perTeam.values()];
      // Not into a shot that has only just opened: the intro has no
      // deadline, and cutting in three seconds into a tour sweep left
      // a fragment of a line-up in front of the block's own line-ups.
      if (
        !state.rosterIntroDone &&
        state.sidesReady &&
        Math.min(...sides) >= LINEUP_MIN_PER_SIDE &&
        t - state.teamedStableSince >= LINEUP_STABLE_SEC &&
        t - state.segStartSec >= DIRECTOR_MIN_SHOT_SEC
      ) {
        state.rosterIntroDone = true;
        state.rosterIntroCount = teamed.length;
        startLineupBlock(state, t, null);
        emitLineupPass(state, t);
        return;
      }
    }
  }
  if (!state.handledKickoff && t < state.lineupUntil) {
    state.lastNonFlagSec = t;
    if (t >= state.rotateAt) emitLineupPass(state, t);
    return;
  }
  // Team-picking, with no line-up block running. Without this the
  // switcher falls through to ordinary flag coverage and stares at a
  // stand where nothing is happening — one demo spent 11 pre-match
  // minutes on 31 "flag home — quiet, wide on the base" shots. Fill it
  // the way a broadcast does: tour the venue, look at whoever has
  // already picked a side, and tighten up as the observer list drains.
  // Causal: "has the whistle happened yet", not "does this dataset know
  // of a whistle". A recorded demo always carries matchStartSec, so
  // testing for its absence never fired.
  const whistleSec = view.dataset.matchFacts?.matchStartSec;
  if (!state.handledKickoff && (whistleSec == null || t < whistleSec)) {
    // rotateAt starts at Infinity ("hold until something decides"), so
    // a plain `t >= rotateAt` never fires and the opening shot stretched
    // across the entire picking period — 460 seconds on one static wide.
    // Before the whistle the filler IS what decides.
    if (!Number.isFinite(state.rotateAt) || t >= state.rotateAt) {
      emitPreMatchFiller(state, view, t);
    }
    state.lastNonFlagSec = t;
    return;
  }
  if (t < state.suitUpUntil) {
    // The ceremony yields to real drama BEFORE it lands — the whole
    // point of the lookahead is seeing the first grab, not its
    // aftermath: a grab inside the peek, or an attacker seconds out
    // from a stand, ends the suit-up coverage and puts the camera on
    // that flag in time to watch it happen. "Flag already out" is the
    // reactive backstop for grabs the peek and predictor both missed.
    const imminentSlot = view
      .flagSlots()
      .find(
        (slot) =>
          view.peekFlagEvents(slot, ["flag-grab"]).length > 0 ||
          (approachEta(view, slot) ?? Infinity) <= DIRECTOR_GRAB_IMMINENT_SEC,
      );
    const flagOut = view
      .flagSlots()
      .some((slot) => view.flagAt(slot)?.status !== "home");
    if (imminentSlot != null || flagOut) {
      state.suitUpUntil = t;
      if (imminentSlot != null) {
        const idx = subjects.findIndex(
          (s) => s.kind === "flag" && s.slot === imminentSlot,
        );
        if (idx >= 0) {
          switchTo(state, idx, t);
          return;
        }
      }
      // Fall through to normal scoring for the flag-out case.
    } else {
      state.lastNonFlagSec = t;
      if (t >= state.rotateAt) emitSuitUpPass(state, t);
      return;
    }
  }

  // The situation changed under the running shot (a grab while the
  // camera already watches that stand): restyle NOW — quiet framings
  // never rotate on their own, so this is their only path to a chase.
  {
    const cur = subjects[state.current];
    const status =
      cur.kind === "flag" ? (view.flagAt(cur.slot)?.status ?? null) : null;
    if (status !== state.currentStyleStatus) {
      // A fresh grab plays out IN the stand framing for a beat — the
      // viewer should see the flag leave the stand, not a cut landing
      // exactly on the moment. Everything else restyles immediately.
      const holdForGrab =
        status === "held" &&
        cur.kind === "flag" &&
        view.trailingHeldSec(cur.slot) < 1.2;
      if (!holdForGrab) {
        openShot(state, t);
        return;
      }
    }
  }
  // Peek hold: the current subject's story resolves within the window
  // — never cut away from a grab/return/drop about to happen on it.
  const current = subjects[state.current];
  if (
    current.kind === "flag" &&
    view.peekFlagEvents(current.slot, HOLD_EVENT_TYPES).length > 0
  ) {
    maybeRotate(state, t);
    return;
  }
  if (t < state.protectedUntil) {
    maybeRotate(state, t);
    return;
  }
  // Standard commitment rules, ported causal from segmentByInterest.
  if (subjects[state.current].kind !== "flag") state.lastNonFlagSec = t;
  const scores = subjects.map((s) => scoreSubject(state, s, t));
  // Variety pressure: after a long flag-only stretch the other stories
  // get through more easily — a broadcast is not a flag surveillance
  // feed, and in a busy pub the flag threat bonuses never dip.
  const fatigue = Math.min(25, Math.max(0, t - state.lastNonFlagSec - 45));
  if (fatigue > 0) {
    for (let i = 0; i < subjects.length; i++) {
      if (subjects[i].kind !== "flag") scores[i] += fatigue;
    }
  }
  // THE VARIETY SCHEDULER: when no flag story is hot, rotate through
  // the other kinds of picture — kills, clusters, destruction/repair,
  // capper wind-ups, vehicle rides, suit-up queues, fly-throughs —
  // balanced by DIRECTOR_VARIETY_WEIGHTS and per-family freshness.
  // Pre-match belongs to the roster machinery; the mixer runs once
  // the match is live. Per-family interrupt ceilings decide what may
  // cut in over how hot a story (a kill beats quiet stand-watching; a
  // fly-through waits for a real lull; a live carry beats everything).
  const currentMax = Math.max(...scores);
  // A flag on the ground is usually live play — a pass mid-flight, a
  // scramble forming — and filler never takes the screen from that.
  // A PARKED one is the exception: left uncontested it is scenery,
  // and holding the mixer back for it wastes the whole match.
  const anyFieldFlag = view.flagSlots().some((slot) => {
    const flag = view.flagAt(slot);
    if (flag?.status !== "field") return false;
    return fieldStaleness(view, slot, flag.pos, t) < 0.5;
  });
  if (state.handledKickoff && !anyFieldFlag && currentMax < SCORE_CARRIED) {
    const pick = pickVarietyShot(
      view,
      t,
      state.varietyMem,
      state.variety,
      9,
      currentMax,
    );
    if (pick) {
      state.directive = {
        atSec: t,
        untilSec: pick.shot.endSec,
        shot: pick.shot,
        kind: "filler",
      };
      return;
    }
  }
  let best = state.current === 0 ? 1 : 0;
  for (let i = 0; i < subjects.length; i++) {
    if (i === state.current) continue;
    if (scores[i] > scores[best]) best = i;
  }
  const elapsed = t - state.segStartSec;
  const chasing = isChasing(view, subjects[state.current]);
  let switchIndex = -1;
  if (scores[best] > scores[state.current] + DIRECTOR_SWITCH_PENALTY) {
    if (elapsed >= DIRECTOR_MIN_SHOT_SEC) switchIndex = best;
    else if (
      elapsed >= DIRECTOR_HARD_FLOOR_SEC &&
      scores[best] >= DIRECTOR_PREEMPT_SCORE
    ) {
      switchIndex = best;
    }
  } else if (
    scores[state.current] <= DIRECTOR_ABANDON_SCORE &&
    scores[best] > scores[state.current] &&
    elapsed >= DIRECTOR_MIN_SHOT_SEC
  ) {
    // The current story has gone dead — hand the screen over without
    // making the challenger clear the full switch penalty.
    switchIndex = pickDifferentScene(state, scores);
  } else if (
    !chasing &&
    !isLiveFlag(view, subjects[state.current]) &&
    elapsed >= DIRECTOR_MAX_STATIC_SEC &&
    scores[best] + DIRECTOR_SWITCH_PENALTY >= scores[state.current]
  ) {
    // Rotate a stale static shot even without a decisive challenger —
    // but never away from a flag that is OUT, and never to the SAME
    // SCENE under a different name (the Storm flag and the Storm base
    // share a stand; consecutive near-identical stand orbits are
    // churn). A same-scene repeat only qualifies with real action.
    switchIndex = pickDifferentScene(state, scores);
  } else if (chasing && elapsed >= DIRECTOR_MAX_CHASE_SEC) {
    // Both flags out: alternate the drives so neither owns the camera.
    let bestChase = -1;
    for (let i = 0; i < subjects.length; i++) {
      if (i === state.current || !isChasing(view, subjects[i])) continue;
      if (bestChase < 0 || scores[i] > scores[bestChase]) bestChase = i;
    }
    if (bestChase >= 0) {
      switchIndex = bestChase;
      state.protectedUntil = t + DIRECTOR_FAIR_SHARE_SEC;
    }
  }
  if (switchIndex >= 0) switchTo(state, switchIndex, t);
  else maybeRotate(state, t);
}

/** The stand a subject is anchored on, for same-scene detection. */
function subjectAnchor(
  state: SwitcherState,
  subject: Subject,
): DirectorVec3 | null {
  if (subject.kind === "idle") return null;
  return state.view.standFor(subject.slot)?.pos ?? null;
}

/**
 * Best-scoring subject whose SCENE differs from the current one — a
 * same-anchor candidate (flag ↔ base of one stand) only qualifies when
 * something is actually happening there. -1 keeps the current shot.
 */
function pickDifferentScene(state: SwitcherState, scores: number[]): number {
  const { subjects } = state;
  const currentAnchor = subjectAnchor(state, subjects[state.current]);
  const order = subjects
    .map((_, i) => i)
    .filter((i) => i !== state.current)
    .sort((a, b) => scores[b] - scores[a]);
  for (const i of order) {
    const anchor = subjectAnchor(state, subjects[i]);
    const sameScene =
      currentAnchor != null &&
      anchor != null &&
      dist(anchor, currentAnchor) <= 60;
    if (sameScene && scores[i] < SCORE_THREAT) continue;
    return i;
  }
  return -1;
}

function bestSubject(state: SwitcherState, t: number): number {
  const scores = state.subjects.map((s) => scoreSubject(state, s, t));
  let best = 0;
  for (let i = 1; i < scores.length; i++)
    if (scores[i] > scores[best]) best = i;
  return best;
}

function switchTo(state: SwitcherState, index: number, t: number): void {
  if (index < 0 || index === state.current) return;
  closeShot(state, t);
  state.current = index;
  state.segStartSec = t;
  state.freshSubject = true;
  openShot(state, t);
}

function maybeRotate(state: SwitcherState, t: number): void {
  if (t >= state.rotateAt) openShot(state, t);
}

/** Seal the running shot at exactly `t` — trimming OR extending, so a
 *  rotation that skipped a beat (an empty line-up turn) never leaves a
 *  seam between shots. */
function closeShot(state: SwitcherState, t: number): void {
  const open = state.shots[state.shots.length - 1];
  if (!open) return;
  open.endSec = Math.max(open.startSec + 0.05, t);
  // A quick cut stretched past its rhythm by the seal is a hold now.
  if (open.quickCut && open.endSec - open.startSec > 4) {
    open.quickCut = undefined;
  }
  // A non-deliberate fragment (a preemption landing moments after a
  // cut) is dropped HERE, at decision time — never left for a post
  // pass to absorb along with beats that were deliberate.
  if (
    !open.quickCut &&
    open.endSec - open.startSec < 2 &&
    state.shots.length > 1
  ) {
    state.shots.pop();
    const previous = state.shots[state.shots.length - 1];
    previous.endSec = open.endSec;
    if (previous.quickCut && previous.endSec - previous.startSec > 4) {
      previous.quickCut = undefined;
    }
  }
}

/** Seal the running shot and append a fixed-window one — the shared
 *  tail of every phase emitter (line-ups, suit-ups). */
function pushShot(
  state: SwitcherState,
  shot: Shot,
  t: number,
  end: number,
): void {
  closeShot(state, t);
  shot.startSec = t;
  shot.endSec = end;
  state.shots.push(shot);
  state.segStartSec = t;
  state.rotateAt = end;
}

/** Cut times are decided by the switcher; every shot opens with a far
 *  end that the NEXT cut (or the finale) trims back. */
function openShot(state: SwitcherState, t: number): void {
  const shot = styleFor(state, t);
  shot.startSec = t;
  shot.endSec = state.view.dataset.durationSec;
  const open = state.shots[state.shots.length - 1];
  if (open && framesTheSame(open, shot)) {
    // The new decision frames the same picture: keep rolling instead
    // of cutting — merging is a DECISION, not a cleanup pass.
    open.endSec = shot.endSec;
    syncStyleStatus(state);
    state.rotateAt = rotationFor(state, open, t);
    return;
  }
  closeShot(state, t);
  state.shots.push(shot);
  syncStyleStatus(state);
  state.freshSubject = false;
  state.rotateAt = rotationFor(state, shot, t);
}

/** Record the flag status the current shot was styled for. */
function syncStyleStatus(state: SwitcherState): void {
  const cur = state.subjects[state.current];
  state.currentStyleStatus =
    cur.kind === "flag" ? (state.view.flagAt(cur.slot)?.status ?? null) : null;
}

/** A QUIET framing never rotates in place — re-cutting the same stand
 *  at a slightly different angle is churn; the subject rotation moves
 *  the story along. Everything else keeps its cadence. */
function rotationFor(state: SwitcherState, shot: Shot, t: number): number {
  const quietHold = shot.kind === "fixedOrbit" && shot.role === "quiet";
  return quietHold
    ? Number.POSITIVE_INFINITY
    : t +
        (shot.kind === "followFlag" || shot.kind === "dolly"
          ? DIRECTOR_CHASE_SEGMENT_SEC
          : DIRECTOR_FIXED_CHUNK_SEC * 1.5);
}

/**
 * Open a line-up block: size the close-up budget from who is teamed
 * RIGHT NOW (introduce 5–20 faces per side, ~6 per pass, 1–3 passes),
 * and set the deadline — the announced whistle when a countdown drives
 * the block, else the block's own natural length.
 */
function startLineupBlock(
  state: SwitcherState,
  t: number,
  untilSec: number | null,
): void {
  const view = state.view;
  // NOT reset to zero. A block that re-arms right after the last one
  // ended would replay pass 0 — the same team's wide, from the same
  // spot, immediately after itself. Carrying the counter forward keeps
  // the team rotation moving across blocks.
  state.lineupPass = state.lineupPass % Math.max(1, state.lineupTeams);
  state.lineupCloseTarget.clear();
  state.lineupCloseDone.clear();
  const perTeam = new Map<number, number>();
  for (const p of view.playersAt(t)) {
    if ((p.teamId ?? 0) > 0) {
      perTeam.set(p.teamId!, (perTeam.get(p.teamId!) ?? 0) + 1);
    }
  }
  let budget = 0;
  for (const [teamId, count] of perTeam) {
    const faces = Math.max(LINEUP_FACES_MIN, Math.min(LINEUP_FACES_MAX, count));
    const closeups = Math.max(
      1,
      Math.min(LINEUP_MAX_CLOSEUPS, Math.ceil(faces / LINEUP_FACES_PER_PASS)),
    );
    state.lineupCloseTarget.set(teamId, closeups);
    budget += (1 + closeups) * DIRECTOR_LINEUP_SWEEP_SEC;
  }
  state.lineupUntil = untilSec ?? t + budget;
}

/**
 * One roster pass, built from where the players stand at this moment:
 * teams alternate, one wide establishing pass each, then close-ups
 * working across knots of not-yet-featured faces until each side's
 * budget is spent.
 */
/**
 * Point a landmark's shots at the MIDDLE of the thing.
 *
 * An asset's position is its origin, which sits at its foot — so a
 * push-in on a pulse sensor closed on the patch of ground under it
 * while the sensor climbed out of frame. Resolved once, with the rest
 * of the per-landmark work, because it walks the collider set.
 */
function centredOn(mark: Landmark, cache: Map<string, number>): Landmark {
  // Keeps the per-kind fallback when the asset has no static collider
  // of its own — flag stands and base turrets are part of the
  // building's interior geometry, and resolving those would hand back
  // the whole base.
  // Cached: the answer walks every static collider on the map and can
  // never change for a given landmark, but this runs on every tick.
  const key = landmarkKey(mark);
  let lift = cache.get(key);
  if (lift === undefined) {
    const centre = assetBoxCenter(mark.pos);
    lift = centre ? centre[2] - mark.pos[2] : Number.NaN;
    cache.set(key, lift);
  }
  if (Number.isNaN(lift)) return mark;
  return { ...mark, aimLift: lift };
}

/**
 * Build the free-space grid once, if the map has enough standing to
 * make one. Called during start-up so it is not a stall mid-playback,
 * and lazily as a fallback for callers that never warmed it.
 */
function ensureFreeSpace(
  state: SwitcherState,
  dataset: DirectorDataset,
  nowSec: number,
): void {
  if (state.freeSpace) return;
  if (!state.freeSpaceBuild) {
    // WAIT FOR THE PROTOCOL TO SAY THE WORLD IS HERE.
    //
    // The grid describes where a camera fits around the map, so it is
    // worth nothing until the map has finished arriving — on Damnation
    // that is two flag stands at three seconds and all two dozen assets
    // half a second later, when the server sends GhostAlwaysDone. Plus
    // a settle, since the trackers see those assets a sample after the
    // signal (see gridBuildSec): built on the signal alone, Raindance's
    // grid had the two flag stands for anchors and nothing else.
    //
    // Not a fixed time (a live stream cannot skip ahead to find out)
    // and not "once some base hardware shows up" either: a map whose
    // only landmarks are its flags would satisfy that never.
    const ready = gridBuildSec(dataset);
    if (ready == null || nowSec < ready) return;
    if (landmarksFor(dataset, nowSec).length < 2) return;
    state.freeSpaceBuild = createFreeSpaceBuild(dataset, nowSec);
    if (!state.freeSpaceBuild) return;
  }
  // A fixed slice of WORK per tick. Half a second in one go is a
  // frozen frame; until it finishes there simply are no landmark
  // shots, and the director covers with what it has.
  if (!state.freeSpaceBuild.step(FREE_SPACE_BUILD_CHUNKS)) return;
  state.freeSpace = state.freeSpaceBuild.grid;
  if (state.freeSpace) publishFreeSpace(state.freeSpace);
}

/**
 * A roster wide, or null. The pass must fly clean AND through roomy
 * space wherever the grid has looked. A squad that has gathered inside
 * its base has no wide: the sweep over them is in the roof, and the
 * orbit staging used to fall back to sat in a room with the ceiling
 * 2.6 units over the lens (Raindance, 4:58) — legal by the two-unit
 * path clearance, refused by the grid's three. The close-ups, framed
 * from the players' own facings, carry an indoor roster.
 */
export function watchableWide(
  shot: Shot,
  grid: FreeSpaceGrid | null,
): Shot | null {
  if (inspectShot(shot)?.ok === false) return null;
  if (grid) {
    const path = shotCameraPath(shot);
    if (
      path &&
      !eyesRoomy(
        grid,
        path.map((pose) => pose.eye),
      )
    )
      return null;
  }
  return shot;
}

/** Chunks of the grid built per tick. Work, not time: a wall-clock
 *  budget makes the finished cast depend on the machine that planned
 *  it. */
const FREE_SPACE_BUILD_CHUNKS = 24;
/** Landmarks whose filmability is settled per tick — each costs a grid
 *  search with raycasts, and answering two dozen at once was 800ms. */
const FILMABLE_PER_TICK = 2;

/** Identity of what a landmark shot is OF, for the no-repeat rule. */
function landmarkKey(mark: Landmark): string {
  return `${mark.kind}|${mark.pos.map((n) => Math.round(n / 4)).join(",")}`;
}

type PreMatchPlayer = ReturnType<CausalView["playersAt"]>[number];

/**
 * WATCH the pre-match, every tick. Deciding what to show is a separate
 * act (emitPreMatchFiller) that happens at cut points; everything the
 * decision READS is kept current here regardless of whether a shot is
 * on air. Doing both in the decider meant a twenty-second fly-by
 * stopped the world for twenty seconds: the grid did not build, and a
 * player who picked a side mid-shot was first noticed — and stamped as
 * "just joined" — when the shot ended.
 */
function observePreMatch(
  state: SwitcherState,
  view: CausalView,
  t: number,
): void {
  prepareLandmarks(state, view, t);
  const players = view.playersAt(t);
  const teamed = players.filter((p) => (p.teamId ?? 0) > 0);
  state.sidesReady = sidesSettled(teamed, state.teamOccupiedSince, t);
  state.readySignings = settledSignings(
    players,
    state.knownTeam,
    state.signedAt,
    t,
    state.firstSigned,
  );
}

/**
 * Keep the tour's inventory current: the free-space grid, and which
 * landmarks can be filmed from it. Both are built a slice at a time.
 */
function prepareLandmarks(
  state: SwitcherState,
  view: CausalView,
  t: number,
): void {
  // Recomputed, not cached: deployables appear as players place them,
  // so the tour grows during the match. Cheap — the inventory is tens
  // of entries — and caching it once was how the future leaked in.
  let marksAll = landmarksFor(view.dataset, t);
  // The free-space grid is built ONCE (about 2 seconds) around the
  // assets standing at that moment. Deployables placed later fall
  // outside it and keep the old geometric placement.
  ensureFreeSpace(state, view.dataset, t);
  // Drop what cannot be filmed at all, rather than planning a shot of
  // it and letting the staging pass discover the problem.
  //
  // CACHED, and it has to be: this searches the grid and raycasts for
  // every landmark, and running it on each filler call cost 35 seconds
  // of planning on a 25-minute demo. The set only changes when a
  // deployable appears, so key on the set itself and recompute then.
  if (state.freeSpace) {
    // Cached PER LANDMARK, not per set. Keyed on the set, one deployable
    // appearing mid-match invalidated everything and re-tested all two
    // dozen — 816ms of raycasts, on the frame it happened.
    const grid = state.freeSpace;
    let budget = FILMABLE_PER_TICK;
    marksAll = marksAll.filter((mark) => {
      const key = landmarkKey(mark);
      const known = state.filmable.get(key);
      if (known !== undefined) return known;
      // Not settled yet: answer a couple per tick and leave the rest
      // for the next one. A landmark nobody has vetted is simply not
      // offered, which costs a beat of coverage, not a frozen frame.
      if (budget-- <= 0) return false;
      const ok = filmable(grid, [mark]).length > 0;
      state.filmable.set(key, ok);
      return ok;
    });
    marksAll = marksAll.map((mark) => centredOn(mark, state.aimLift));
  }
  state.landmarks = marksAll;
}

/**
 * One filler shot during team-picking, chosen by how much time the
 * observer count implies is left.
 *
 * The estimate is deliberately crude and re-made every rotation, so a
 * lobby that suddenly fills tightens the coverage on its own. A real
 * countdown, when one arrives, overrides it — and the line-up block
 * takes over entirely at that point.
 */
function emitPreMatchFiller(
  state: SwitcherState,
  view: CausalView,
  t: number,
): void {
  const players = view.playersAt(t);
  const teamed = players.filter((p) => (p.teamId ?? 0) > 0);

  // The establishing run, flag stand to flag stand, is saved for the
  // moment the broadcast begins: both sides have a player, so the
  // booth is about to open, and it opens over this. Before that the
  // tour covers as usual — anything but this. It outranks the pick-ups
  // waiting behind it; they are announced from the queue afterwards.
  if (!state.openingFlyDone && state.sidesReady) {
    const stands = (state.landmarks ?? []).filter((m) => m.kind === "stand");
    if (stands.length >= 2) {
      state.openingFlyDone = true;
      const fly = flyThroughShot(t, stands[0], stands[1]);
      if (fly && inspectShot(fly)?.ok) {
        // Recorded here too, or the rotation fires its own run twenty
        // seconds later — which is what "one near the beginning, then
        // every five minutes" is meant to prevent.
        state.lastFlyBySec = t;
        state.flyByCount++;
        closeShot(state, t);
        state.shots.push({ ...fly, role: "establishing" });
        state.segStartSec = t;
        state.rotateAt = fly.endSec;
        // The pass ENDS on the far stand, so that is what the viewer is
        // looking at — orbiting it next would be two shots of the same
        // thing in a row, which is exactly how this opened before.
        state.preMatchSubject = landmarkKey(stands[1]);
        return;
      }
    }
  }

  // A player who just picked a side. This outranks everything else here
  // — it is the only thing actually HAPPENING during team-picking, and
  // the booth calls it over the shot ("Storm picks up Irvin").
  // A pick-up is not filmable at the instant the team flips: the player
  // is still standing in the observer spot, and is about to be moved to
  // a spawn point. Cutting to them right then is what made this jumpy.
  // Queue the moment, film it once they have settled — and film them
  // WHERE THEY ARE by then, not where they were when the flag changed.
  // And not until there are two sides: the first few names on an empty
  // board are not "picked up" by anyone yet (user direction).
  // Both facts are OBSERVED every tick (observePreMatch), not here:
  // noticed only when a shot ended, a player who joined during a
  // twenty-second fly-by was stamped as having joined when it ended.
  // A pick-up that cannot be framed right now — spawned into a corner,
  // mid-teleport — stays queued and is tried again at the next
  // boundary, once they have moved; the next player in the queue takes
  // this one. Dropping it outright lost Storm's FIRST pick-up on one
  // demo (the one name a side is introduced by), and ten of thirty-five
  // pick-ups overall. Ordinary pick-ups still go stale on their own
  // clock; a side's first is only given up after repeated failures.
  for (const pick of state.sidesReady ? state.readySignings : []) {
    const teamName =
      view.dataset.teams.find((team) => team.teamId === pick.teamId)?.name ??
      "the side";
    // Name them. Commentary reads this line — "Storm picks up Irvin" is
    // the whole point of the shot — and without it two different
    // players joining the same side read as one repeated shot.
    const who = playerName(pick.targetId, view.dataset, t);
    const pickReason = who
      ? `Pre-match — ${teamName} pick up ${who}`
      : `Pre-match — ${teamName} pick-up`;
    const pass = state.preMatchPass++;
    const subject = {
      name: `${teamName} pick-up`,
      pos: pick.pos,
      radius: PLAYER_STANDOFF,
      indoor: false,
      // Frame them on the chest. Their position is their FEET, so the
      // rig's default put the aim on top of their head and left them
      // sitting at the bottom of the picture.
      aimLift: PLAYER_AIM_LIFT,
    };
    // Signings are the bulk of this period, so they carry the bulk of
    // the sameness. Give them the same rotation of moves the tour gets
    // instead of an orbit every other time — placed on the player's
    // face rather than on a jittered bearing. No grid needed: the path
    // check tests real geometry, so these can be placed exactly.
    /** Stamp a candidate with what makes it a pick-up, BEFORE it is
     *  validated — so the shot that gets checked is the shot that
     *  ships, timing and all. */
    const signing = (candidate: Shot): Shot => {
      // A pan needs longer than a hold: the subject has to cross the
      // whole frame, and sixty-four degrees inside a six-second cut is
      // a swivel, not a pan.
      const holdSec =
        candidate.kind === "sweep" && candidate.targetTo
          ? SIGNING_PAN_SEC
          : SIGNING_HOLD_SEC;
      return {
        ...candidate,
        // Verified against real geometry at a height and bearing chosen
        // for a face. Staging must not re-lift it.
        ...(candidate.kind === "sweep"
          ? { pathSolved: true, moveSec: holdSec }
          : {}),
        reason: pickReason,
        role: "signing",
        // The scene names the player picked, not whoever is nearest.
        subject: { type: "player", targetId: pick.targetId },
        endSec: t + holdSec,
      };
    };
    // NO ORBIT here. A pick-up is six seconds on a person's face, and
    // an orbit walks the camera round behind them — measured at 113
    // degrees off their facing by the ninetieth percentile. Holding,
    // tracking and pushing all keep the face in frame.
    //
    // Face-on, knee-to-chest positions only. The grid is no help for a
    // person: its cells are eight units apart, so the lowest one above
    // someone's feet already looks down on them.
    let shot = firstWatchable(
      rotate<ShotCandidate>(
        [
          {
            build: (spot) => signing(holdShotAt(t, subject, spot, pass)),
            spots: () => playerCloseUpSpots(pick, pass),
          },
          {
            // The pan swings off its own start bearing, so it gets the
            // narrow ladder; a hold or push may sit wider when it must.
            build: (spot) => signing(lateralPanAt(t, subject, spot, pass)),
            spots: () =>
              playerCloseUpSpots(pick, pass, { maxOffset: PAN_MAX_OFFSET }),
          },
          {
            build: (spot) => signing(dollyInShotAt(t, subject, spot, pass)),
            spots: () => playerCloseUpSpots(pick, pass),
          },
        ],
        state.signingStyle++,
      ),
    );
    if (!shot && state.freeSpace) {
      // No exact portrait spot works: a pre-match player stands frozen
      // at their spawn, and a spawn inside the base can be a corridor
      // where every ring position at portrait distance is in a wall.
      // Ask the FREE-SPACE GRID, the same search that films base
      // hardware in tighter rooms than this — it knows about the
      // doorway the ring never tries. Front-on preferred, by their
      // facing; the grid's spacing means the height is not chest-exact,
      // which beats no shot of them at all.
      const grid = state.freeSpace;
      const gridSpots = () =>
        cameraSpotsFor(grid, aimOf(subject), {
          wantDist: PLAYER_STANDOFF,
          bearing: pick.heading,
          maxDist: PLAYER_STANDOFF * 3,
        });
      shot = firstWatchable(
        rotate<ShotCandidate>(
          [
            {
              build: (spot) => signing(holdShotAt(t, subject, spot, pass)),
              spots: gridSpots,
            },
            {
              build: (spot) => signing(dollyInShotAt(t, subject, spot, pass)),
              spots: gridSpots,
            },
          ],
          state.signingStyle,
        ),
      );
    }
    if (!shot && state.freeSpace) {
      // Not even the grid has a sighted spot near them. The pick-up is
      // still news, so film the nearest landmark of their base instead
      // and tag it as the pick-up: the booth announces the name over a
      // shot of the base they joined, the way a broadcast cuts to the
      // dugout when it cannot get the player's face.
      const grid = state.freeSpace;
      const near = (state.landmarks ?? [])
        .filter((m) => m.teamId == null || m.teamId === pick.teamId)
        .map((mark) => ({ mark, d: dist(mark.pos, pick.pos) }))
        .filter(({ d }) => d <= SIGNING_FALLBACK_RANGE)
        .sort((a, b) => a.d - b.d);
      for (const { mark } of near) {
        const spots = () =>
          cameraSpotsFor(grid, aimOf(mark), {
            wantDist: standoffFor(mark),
            maxDist: mark.radius * 4,
          });
        shot = firstWatchable([
          {
            build: (spot) => ({
              ...signing(holdShotAt(t, mark, spot, pass)),
              reason: `${pickReason}, from the ${mark.name}`,
            }),
            spots,
          },
        ]);
        if (shot) break;
      }
    }
    if (!shot) {
      // Nothing works from ANY angle on this player right now, and no
      // landmark of theirs is near. A trailing follow was the old
      // answer and it is not an answer: the follow rig rides BEHIND its
      // subject, so every one of those pick-ups was the back of
      // someone's head. Leave them queued.
      const tries = (state.signingAttempts.get(pick.targetId) ?? 0) + 1;
      state.signingAttempts.set(pick.targetId, tries);
      const pinned = [...state.firstSigned.values()].includes(pick.targetId);
      if (pinned && tries >= SIGNING_MAX_ATTEMPTS) {
        state.signedAt.delete(pick.targetId);
      }
      continue;
    }
    state.signedAt.delete(pick.targetId);
    closeShot(state, t);
    state.shots.push(shot);
    state.segStartSec = t;
    state.rotateAt = shot.endSec;
    state.preMatchSubject = `player:${pick.targetId}`;
    return;
  }
  // Observers are what is left to pick. The roster series counts them
  // directly; fall back to "everyone unteamed" for datasets without it.
  const roster = lastRosterAt(view.dataset, t);
  const observers = roster
    ? roster.observers
    : Math.max(0, players.length - teamed.length);
  const { pace } = preMatchPace({ observers });

  const marks = state.landmarks ?? [];
  let shot: Shot | null = null;
  let nextSubject: string | null = null;
  const pass = state.preMatchPass++;

  // Open on the establishing pass: one flag stand to the other, the
  // shot that shows a viewer the whole map at once.
  // Hurrying: the lobby is nearly full, so stop sightseeing and look at
  // the people who are about to play. Roaming: there is real time to
  // fill, so tour the map. Touring sits between, alternating.
  const wantPeople =
    pace === "hurrying" || (pace === "touring" && pass % 2 === 1);
  if (wantPeople && teamed.length >= 2) {
    const teamIds = [...new Set(teamed.map((p) => p.teamId!))].sort();
    const teamId = teamIds[pass % teamIds.length];
    const squad = teamed.filter((p) => p.teamId === teamId);
    const teamName =
      view.dataset.teams.find((team) => team.teamId === teamId)?.name ??
      `team ${teamId}`;
    // Ends at the whistle when it is known: a pan over the ranks that
    // keeps going after they have flown off is a pan over nothing.
    const whistleSec = view.dataset.matchFacts?.matchStartSec;
    const end =
      whistleSec == null
        ? t + DIRECTOR_LINEUP_SWEEP_SEC
        : Math.min(t + DIRECTOR_LINEUP_SWEEP_SEC, whistleSec);
    if (squad.length > 0 && end - t >= 4) {
      // Alternate a pan ACROSS the group with a close-up ON a knot of
      // them; the first version only ever emitted wides, so the whole
      // period produced a single player close-up.
      // CHECKED, like the line-up block's passes. Emitted unchecked,
      // a rank standing inside its base produced a sweep buried for
      // its whole length; staging dropped it and the pick-up hold
      // before it absorbed the time — six seconds on a face became
      // seventeen. A side with no clean framing gets the tour instead.
      shot =
        rosterPass(state, t, end, squad, teamName, pass % 2 === 0) ??
        rosterPass(state, t, end, squad, teamName, false);
      if (shot) nextSubject = `team:${teamId}`;
    }
  }
  if (!shot && marks.length > 0) {
    // NEVER two consecutive shots of the same thing. Nothing changes
    // about a flag stand between two shots taken ten seconds apart, so
    // a second look at it is just a repeat. Walk forward from this
    // pass's slot to the first landmark that is not what we just showed.
    let chosen: Landmark | null = null;
    for (let i = 0; i < marks.length; i++) {
      const candidate = marks[(pass + i) % marks.length];
      if (landmarkKey(candidate) !== state.preMatchSubject) {
        chosen = candidate;
        break;
      }
    }
    if (chosen) {
      // Every third stop is a pass over the map rather than an orbit,
      // so the tour has some shape to it. Its DESTINATION becomes the
      // subject, since that is where the viewer is left looking.
      const partner = marks.find(
        (m) => landmarkKey(m) !== landmarkKey(chosen!),
      );
      // Rotate the STYLE as well as the subject. Orbits were the only
      // move the tour had, so even varied landmarks looked the same —
      // now roughly a third fly between two places, a third dolly past
      // one, and a third orbit it.
      // FIVE moves, and the orbit is only one of them. When the tour
      // was orbit-or-nothing every stop looked the same however varied
      // the subjects were; a held frame, a push in and a lateral track
      // are all cheaper to watch than another slow spin.
      const style = state.preMatchStyle++ % 4;
      // The stand-to-stand run is an EVENT, not a rotation slot: one
      // early to establish the map, then rarely. Counting shots made it
      // recur every minute or so, which is several times more than an
      // establishing shot is worth.
      // No run before the establishing one: that shot is the open.
      const wantFly =
        state.openingFlyDone &&
        (state.lastFlyBySec == null ||
          t - state.lastFlyBySec >= FLYBY_EVERY_SEC);
      // The establishing run is STAND TO STAND, so name the stands
      // rather than hoping the rotation's partner happens to be one.
      const stands = marks.filter((m) => m.kind === "stand");
      // Alternate the direction, so a later run is not a replay.
      const back = state.flyByCount % 2 === 1;
      const fly =
        wantFly && stands.length >= 2
          ? flyThroughShot(t, stands[back ? 1 : 0], stands[back ? 0 : 1])
          : null;
      // No straight-chord lift any more: the run is a CURVE that rises
      // only where it must, and hoisting both its ends to clear the
      // chord would undo exactly that.
      // EVERY candidate is walked frame by frame before it is accepted.
      // The director knows a shot's whole camera path up front, so
      // there is no excuse for publishing one that spends its duration
      // inside a wall or looking at the back of a building.
      shot = fly && inspectShot(fly)?.ok ? fly : null;
      if (shot) {
        state.lastFlyBySec = t;
        state.flyByCount++;
      }
      if (!shot && state.freeSpace) {
        // Ranked camera positions, best first. Try them in order and
        // keep the first whose REALIZED path holds up; one point being
        // clear says nothing about where the move goes next.
        const grid = state.freeSpace;
        const subject = chosen;
        const spots = () =>
          cameraSpotsFor(grid, aimOf(subject), {
            wantDist: standoffFor(subject),
            maxDist: subject.radius * 4,
          });
        shot = firstWatchable(
          orbitLast<ShotCandidate>(
            [
              { build: (p) => holdShotAt(t, subject, p, pass), spots },
              { build: (p) => lateralPanAt(t, subject, p, pass), spots },
              { build: (p) => dollyInShotAt(t, subject, p, pass), spots },
              { build: (p) => tourShotAt(grid, t, subject, p, pass), spots },
            ],
            style,
          ),
        );
      }
      if (!shot) {
        // Nothing about this landmark works from anywhere the grid
        // knows. Skip it rather than broadcast a wall; remember it so
        // the next pass moves on to a different subject.
        state.preMatchSubject = landmarkKey(chosen);
        return;
      }
      nextSubject = landmarkKey(fly && partner ? partner : chosen);
    }
  }
  if (!shot) return;

  closeShot(state, t);
  state.shots.push(shot);
  state.segStartSec = t;
  state.rotateAt = shot.endSec;
  state.preMatchSubject = nextSubject;
}

/** The roster sample in effect at t, for the observer count. */
function lastRosterAt(
  dataset: CausalView["dataset"],
  t: number,
): { assigned: number; observers: number } | null {
  const series = dataset.matchFacts?.roster;
  if (!series || series.length === 0) return null;
  let last: (typeof series)[number] | undefined;
  for (const entry of series) {
    if (entry.timeSec <= t) last = entry;
    else break;
  }
  return last ? { assigned: last.assigned, observers: last.observers } : null;
}

/**
 * One checked roster pass over a squad: the close-up tried across the
 * framings until one's whole path holds up, or the wide vetted against
 * real geometry. Null when nothing works from anywhere — never a shot
 * emitted for the audit to delete later.
 */
function rosterPass(
  state: SwitcherState,
  t: number,
  end: number,
  squad: ReturnType<CausalView["playersAt"]>,
  teamName: string,
  closeUp: boolean,
): Shot | null {
  const teamId = squad[0]?.teamId;
  if (teamId == null) return null;
  let seen = state.lineupFeatured.get(teamId);
  if (!seen) state.lineupFeatured.set(teamId, (seen = new Set()));
  if (!closeUp) {
    return watchableWide(rosterWide(t, end, squad, teamName), state.freeSpace);
  }
  // Try FRAMINGS, not one framing. A rank standing against a wall
  // has no room on its front side, and the answer to that is to film
  // it from somewhere else — not to emit the shot anyway and let the
  // audit delete it later. Measured before this: 9 of the 16
  // unwatchable shots the planner produced were roster close-ups,
  // and every one came from this single un-retried framing.
  // Faces count as featured only when a framing SHIPS: a rejected
  // attempt still marked its knot as seen, so the portraits that
  // followed found nobody fresh and showed the same player twice.
  for (const framing of ROSTER_FRAMINGS) {
    const trial = new Set(seen);
    const shot = rosterCloseUp(t, end, squad, teamName, trial, framing);
    if (shot && inspectShot(shot)?.ok !== false) {
      for (const id of trial) seen.add(id);
      return shot;
    }
  }
  return null;
}

function emitLineupPass(state: SwitcherState, t: number): void {
  const view = state.view;
  const teams = [...new Set(view.dataset.teams.map((team) => team.teamId))]
    .filter((id) => id > 0)
    .sort((a, b) => a - b);
  const end = Math.min(t + DIRECTOR_LINEUP_SWEEP_SEC, state.lineupUntil);
  if (teams.length === 0 || end - t < 4) {
    state.rotateAt = state.lineupUntil;
    return;
  }
  state.lineupTeams = teams.length;
  const pass = state.lineupPass++;
  const closeUpPhase = pass >= teams.length;
  let teamId = teams[pass % teams.length];
  if (closeUpPhase) {
    // Next team still owed a close-up; when every side's budget is
    // spent, the block ends early and normal coverage resumes.
    let owed = teams.filter(
      (id) =>
        (state.lineupCloseDone.get(id) ?? 0) <
        (state.lineupCloseTarget.get(id) ?? 0),
    );
    if (owed.length === 0) {
      // A countdown block runs TO THE WHISTLE. Handing the last
      // stretch back to the tour put a sweep over the ranks that ran
      // on after they had flown off; another round of line-ups is
      // what fills a countdown.
      if (state.lineupUntil !== state.lineupStartAt) {
        state.lineupUntil = t;
        state.rotateAt = t;
        return;
      }
      state.lineupCloseDone.clear();
      owed = teams;
    }
    teamId =
      state.lineupPortraitTeam != null &&
      owed.includes(state.lineupPortraitTeam)
        ? state.lineupPortraitTeam
        : owed[pass % owed.length];
  }
  const teamName =
    view.dataset.teams.find((team) => team.teamId === teamId)?.name ??
    `team ${teamId}`;
  const squad = view.playersAt(t).filter((p) => p.teamId === teamId);
  let shot: Shot | null = null;
  let quickEnd = end;
  if (squad.length > 0) {
    let seen = state.lineupFeatured.get(teamId);
    if (!seen) state.lineupFeatured.set(teamId, (seen = new Set()));
    shot = rosterPass(state, t, end, squad, teamName, closeUpPhase);
    if (shot && closeUpPhase) {
      state.lineupCloseDone.set(
        teamId,
        (state.lineupCloseDone.get(teamId) ?? 0) + 1,
      );
    }
    if (shot) state.lineupPortraitTeam = null;
    // No clean group to pan across: quick cuts to INDIVIDUAL players
    // instead (2-3 seconds each) — a portrait montage beats forcing a
    // pan over stragglers. Three portraits spend one close-up slot.
    if (!shot && closeUpPhase) {
      // A fresh face only. Falling back to "anyone" showed the same
      // player twice in a row once the rank was used up; a side with
      // no one left to introduce has had its close-ups.
      const subject = squad.find((p) => !seen.has(p.targetId));
      if (!subject) {
        state.lineupCloseDone.set(
          teamId,
          state.lineupCloseTarget.get(teamId) ?? 0,
        );
        state.lineupPortraitTeam = null;
      }
      if (subject) {
        seen.add(subject.targetId);
        const name = playerName(subject.targetId, view.dataset, t);
        quickEnd = Math.min(t + 3, state.lineupUntil);
        // The same face-on, knee-to-chest placement a signing gets.
        // Hand-building one framing here was the other half of the
        // unwatchable roster shots — a portrait of somebody standing
        // against a wall has to be taken from somewhere else, and the
        // machinery to find that already exists.
        const portrait = firstWatchable([
          {
            build: (spot) =>
              ({
                ...holdShotAt(
                  t,
                  {
                    name: name ?? "a player",
                    pos: subject.pos,
                    radius: PLAYER_STANDOFF,
                    indoor: false,
                    aimLift: PLAYER_AIM_LIFT,
                  },
                  spot,
                  state.lineupPass,
                ),
                lookSubject: { type: "player", targetId: subject.targetId },
                endSec: quickEnd,
                quickCut: true,
                reason: `Roster — ${name ?? "a player"} (${teamName})`,
                role: "rosterCloseUp",
              }) as Shot,
            spots: () => playerCloseUpSpots(subject, state.lineupPass),
          },
        ]);
        shot = portrait;
        state.lineupCloseDone.set(
          teamId,
          (state.lineupCloseDone.get(teamId) ?? 0) + 1 / 3,
        );
        state.lineupPortraitTeam = shot ? teamId : null;
      }
    }
  }
  if (!shot) {
    // Nobody assembled on this side (or no facings for a close-up):
    // try the next team immediately — bounded, so a server with no one
    // standing around cannot spin the rotation forever.
    state.rotateAt =
      state.lineupPass >= teams.length * 8 ? state.lineupUntil : t;
    return;
  }
  // Seal the previous pass to this one's start (retry turns may have
  // advanced the clock past its planned end).
  pushShot(state, shot, t, shot.quickCut ? quickEnd : end);
}

function scheduleAftermath(
  state: SwitcherState,
  slot: number,
  capSec: number,
): void {
  const view = state.view;
  // The ceremony happens where the flag was the instant before the cap
  // teleports it home — inside the peek, so knowable.
  const at = view.flagAt(slot, capSec - 0.5) ?? view.flagAt(slot);
  if (!at) return;
  state.directive = {
    atSec: capSec,
    untilSec: capSec + DIRECTOR_AFTERMATH_HOLD_SEC,
    kind: "ceremony",
    shot: orbitShot({
      center: at.pos,
      radius: DIRECTOR_AFTERMATH_RADIUS,
      still: true,
      startSec: capSec,
      endSec: capSec + DIRECTOR_AFTERMATH_HOLD_SEC,
      framing: { dataset: view.dataset, variety: state.variety },
      reason: `Aftermath — ${flagLabel(slot, view.dataset)} captured`,
      topic: "aftermath",
    }),
  };
}

/**
 * The busiest inventory station RIGHT NOW: players within the station
 * range, an in-window activation counting double (the activate
 * animation is ground truth for "being used" — a crowd near an idle
 * machine is just a crowd). `awayFrom` steers alternation to the other
 * base's stations.
 */
function busiestInvo(
  view: CausalView,
  t: number,
  awayFrom: DirectorVec3 | null,
): { pos: DirectorVec3; count: number } | null {
  const players = view.playersAt(t);
  let best: { pos: DirectorVec3; count: number; score: number } | null = null;
  for (const station of view.dataset.stations) {
    if (station.kind !== "inventory" || station.deployed) continue;
    if (awayFrom && dist(station.pos, awayFrom) < 80) continue;
    const near = players.filter(
      (p) => dist(p.pos, station.pos) <= DIRECTOR_STATION_RANGE,
    ).length;
    if (near < 2) continue;
    const active = (station.activations ?? []).some(
      (a) => a >= t - 3 && a <= t + 2,
    );
    const score = near + (active ? 2 : 0);
    if (!best || score > best.score) {
      best = { pos: station.pos, count: near, score };
    }
  }
  return best;
}

/**
 * One suit-up pass: orbit the busiest inventory (alternating bases),
 * or — in the very first seconds while everyone is still flying home —
 * the spawn wave itself. Never an empty mid-map wide.
 */
function emitSuitUpPass(state: SwitcherState, t: number): void {
  const view = state.view;
  const end = Math.min(t + 9, state.suitUpUntil);
  let shot: Shot | null = null;
  const invo =
    busiestInvo(view, t, state.suitUpLastPos) ?? busiestInvo(view, t, null);
  if (invo) {
    state.suitUpLastPos = invo.pos;
    shot = orbitShot({
      center: invo.pos,
      radius: DIRECTOR_STATION_CAM_RADIUS,
      heightFactor: DIRECTOR_STATION_CAM_HEIGHT,
      still: true,
      framing: { dataset: view.dataset, variety: state.variety },
      startSec: t,
      endSec: end,
      reason: `${invo.count} players suiting up at the inventory`,
      topic: "suit-up",
    });
  } else {
    const cluster = busiestCluster(Math.max(0, t - 3), t, view.playersAtSec);
    if (cluster) {
      shot = orbitShot({
        center: cluster.center,
        radius: DIRECTOR_CLUSTER_CAM_RADIUS,
        heightFactor: DIRECTOR_CLUSTER_CAM_HEIGHT,
        still: true,
        framing: { dataset: view.dataset, variety: state.variety },
        startSec: t,
        endSec: end,
        reason: `Suiting up — spawn wave (${cluster.count})`,
        topic: "suit-up",
      });
    }
  }
  if (!shot) {
    state.rotateAt = t + 2;
    return;
  }
  pushShot(state, shot, t, end);
}

// ── Causal scoring (the oracle's scoreSubjects, future terms swapped
//    for predictors and the peek) ──

function scoreSubject(
  state: SwitcherState,
  subject: Subject,
  t: number,
): number {
  const view = state.view;
  if (subject.kind === "idle") return SCORE_IDLE;
  const stand = view.standFor(subject.slot);
  if (subject.kind === "bombard") {
    if (!stand) return 0;
    const shells = view.dataset.mortarShots.filter(
      (m) =>
        m.timeSec >= t - DIRECTOR_BOMBARDMENT_WINDOW_SEC &&
        m.timeSec <=
          Math.min(t + DIRECTOR_BOMBARDMENT_WINDOW_SEC, view.horizon) &&
        dist(m.to, stand.pos) <= DIRECTOR_BOMBARDMENT_RANGE,
    ).length;
    return shells >= DIRECTOR_BOMBARDMENT_MIN_SHELLS ? SCORE_BOMBARDMENT : 0;
  }
  if (subject.kind === "base") {
    if (!stand) return SCORE_BASE;
    const attacked = view.dataset.structures.some(
      (s) =>
        s.to > s.from &&
        s.timeSec >= t - 10 &&
        s.timeSec <= view.horizon &&
        s.timeSec <= t + 2 &&
        dist(s.pos, stand.pos) <= 250,
    );
    return attacked ? SCORE_BASE_ATTACK : SCORE_BASE;
  }
  const sample = view.flagAt(subject.slot, t);
  if (!sample || t - sample.timeSec > 3) return 0;
  let score: number;
  if (sample.status === "held") {
    // A possession is the top story from its FIRST tick. The oracle
    // scored a short run as a scramble because it could see the run
    // was a fumble; causally, "held for only half a second" just means
    // THE GRAB JUST HAPPENED — the most valuable moment on the map,
    // not a reason to stay on a speculative stand elsewhere.
    score = SCORE_CARRIED;
    score += capLikelihood(view, subject.slot) * SCORE_CAP_CHAIN_BONUS;
  } else if (sample.status === "field") {
    const homePos = stand?.pos;
    const fromHome = homePos ? dist(sample.pos, homePos) : Infinity;
    const contested = view
      .playersAt(t)
      .some(
        (p) =>
          (p.teamId == null || p.teamId !== subject.slot) &&
          dist(p.pos, sample.pos) <= DIRECTOR_THREAT_RANGE,
      );
    const ramp = Math.min(
      1,
      Math.max(
        0,
        (fromHome - DIRECTOR_DROPPED_NEAR_HOME) /
          (DIRECTOR_DROPPED_FAR - DIRECTOR_DROPPED_NEAR_HOME),
      ),
    );
    score = SCORE_QUIET + (SCORE_DROPPED - SCORE_QUIET) * ramp;
    if (contested) score = Math.max(score, SCORE_THREAT);
    const returnImminent =
      view.peekFlagEvents(subject.slot, ["flag-return"]).length > 0;
    if (returnImminent) {
      score = Math.max(score, SCORE_RETURN_IMMINENT);
    } else if (returnConverging(view, subject.slot)) {
      score = Math.max(score, SCORE_RETURN_SOON);
    }
    // Staleness applies to the FINAL score, never as another branch of
    // the chain above: a team guarding its own parked flag looks
    // exactly like "somebody is converging to return it" — forever —
    // which swallowed the decay entirely. A real return inside the
    // peek is exempt; otherwise interest bleeds to the floor, with a
    // brief periodic check-in so the flag is not forgotten.
    const stale = returnImminent
      ? 0
      : fieldStaleness(view, subject.slot, sample.pos, t);
    if (stale > 0) {
      const idle = view.trailingFieldSec(subject.slot);
      const checkIn =
        idle % DIRECTOR_FIELD_CHECKIN_SEC < DIRECTOR_FIELD_CHECKIN_WINDOW;
      const decayed =
        DIRECTOR_FIELD_FLOOR_SCORE +
        (score - DIRECTOR_FIELD_FLOOR_SCORE) * (1 - stale);
      score = checkIn
        ? Math.max(decayed, DIRECTOR_FIELD_CHECKIN_SCORE)
        : decayed;
    }
  } else {
    const eta = approachEta(view, subject.slot);
    if (view.peekFlagEvents(subject.slot, ["flag-grab"]).length > 0) {
      score = SCORE_GRAB_IMMINENT;
    } else if (eta != null && eta <= DIRECTOR_GRAB_IMMINENT_SEC) {
      score = SCORE_GRAB_IMMINENT;
    } else if (eta != null && eta <= DIRECTOR_GRAB_LOOKAHEAD_SEC) {
      score = SCORE_GRAB_SOON;
    } else {
      const threatened = view
        .playersAt(t)
        .some(
          (p) =>
            (p.teamId == null || p.teamId !== subject.slot) &&
            dist(p.pos, sample.pos) <= DIRECTOR_THREAT_RANGE,
        );
      score = threatened ? SCORE_THREAT : SCORE_QUIET;
    }
  }
  const killsNear = view
    .eventsIn(t - 4, view.horizon)
    .some(
      (e) =>
        e.type === "kill" &&
        e.pos != null &&
        dist(e.pos, sample.pos) <= DIRECTOR_KILL_NEAR_FLAG,
    );
  if (killsNear) score += SCORE_KILLS_NEAR_FLAG;
  return score;
}

function isChasing(view: CausalView, subject: Subject): boolean {
  return (
    subject.kind === "flag" && view.flagAt(subject.slot)?.status === "held"
  );
}

/**
 * How stale a parked flag is, 0..1 — 0 while it is fresh or anyone
 * from the other side is within reach of it, ramping to 1 once it has
 * lain untouched and unthreatened for FRESH + DECAY seconds.
 */
function fieldStaleness(
  view: CausalView,
  slot: number,
  pos: DirectorVec3,
  t: number,
): number {
  const idle = view.trailingFieldSec(slot);
  if (idle <= DIRECTOR_FIELD_FRESH_SEC) return 0;
  const threatened = view
    .playersAt(t)
    .some(
      (p) =>
        p.teamId !== slot && dist(p.pos, pos) <= DIRECTOR_FIELD_QUIET_RANGE,
    );
  if (threatened) return 0;
  return Math.min(
    1,
    (idle - DIRECTOR_FIELD_FRESH_SEC) / DIRECTOR_FIELD_DECAY_SEC,
  );
}

function isLiveFlag(view: CausalView, subject: Subject): boolean {
  if (subject.kind !== "flag") return false;
  const sample = view.flagAt(subject.slot);
  if (sample == null || sample.status === "home") return false;
  // A flag parked in the field with nobody contesting it is a
  // position, not live play — the stale-shot rotation may leave it.
  if (
    sample.status === "field" &&
    fieldStaleness(view, subject.slot, sample.pos, view.now) >= 0.5
  ) {
    return false;
  }
  return true;
}

// ── Shot styles: what the present state calls for ──

function styleFor(state: SwitcherState, t: number): Shot {
  const { view, variety } = state;
  const dataset = view.dataset;
  const subject = state.subjects[state.current];
  const framing = { dataset, variety };
  if (subject.kind === "flag") {
    const slot = subject.slot;
    const sample = view.flagAt(slot);
    const label = flagLabel(slot, dataset);
    const stand = view.standFor(slot);
    if (sample?.status === "held") {
      const carrier = playerName(sample.carrierTargetId, dataset, t);
      // Turtled: the carrier has sat in one spot for a while.
      if (
        view.trailingHeldSec(slot) >= TURTLE_HELD_SEC &&
        (view.trailingFlagDrift(slot, 8) ?? Infinity) <= TURTLE_DRIFT_MAX
      ) {
        const inside = state.turtleViews++ % 2 === 0;
        return inside
          ? orbitShot({
              center: sample.pos,
              radius: DIRECTOR_TURTLE_INSIDE_RADIUS,
              heightFactor: DIRECTOR_TURTLE_INSIDE_HEIGHT,
              still: true,
              lookSubject: { type: "flag", slot },
              startSec: t,
              endSec: t,
              reason: `${label} turtled — holding inside`,
              topic: "turtle",
            })
          : orbitShot({
              center: sample.pos,
              radius: DIRECTOR_DOORWAY_RADIUS,
              heightFactor: DIRECTOR_DOORWAY_HEIGHT,
              still: true,
              doorwayOf: sample.pos,
              startSec: t,
              endSec: t,
              reason: `${label} turtled — watching the doors`,
              topic: "turtle",
            });
      }
      // Closing on the cap: the shot is the PAIR — carrier and the
      // stand they are about to touch. Pull back far enough to hold
      // both (scaled by how far out they still are) and sit behind
      // them looking across at it, alternating a moving profile.
      const home = view.carryDestination(slot);
      const toHome = home ? dist(sample.pos, home) : Infinity;
      if (home && toHome <= DIRECTOR_CAP_APPROACH_RANGE) {
        const pair = Math.max(
          DIRECTOR_CAP_APPROACH_MIN_DIST,
          Math.min(DIRECTOR_CAP_APPROACH_MAX_DIST, toHome * 0.55 + 18),
        );
        const profile = state.chaseStyle++ % 2 === 1;
        if (profile) {
          return {
            kind: "dolly",
            subject: { type: "flag", slot },
            distance: pair,
            height: 10,
            // The stand sits behind them in frame all the way in.
            awayFrom: home,
            startSec: t,
            endSec: t,
            transitionIn: "cut",
            reason: `${label} closing on the cap — ${carrier ?? "the runner"}`,
            topic: "capture",
          };
        }
        return {
          kind: "followFlag",
          slot,
          distance: pair,
          minDistance: DIRECTOR_CAP_APPROACH_MIN_DIST,
          pitch: DIRECTOR_PITCH_CHASE,
          aim: { mode: "toward", target: home },
          startSec: t,
          endSec: t,
          transitionIn: "cut",
          reason: `${label} closing on the cap — ${carrier ?? "the runner"}`,
          topic: "capture",
        };
      }
      // A live carry: rotate chase framings; the destination is the
      // carrier's own stand — map knowledge, not prophecy.
      const style = state.chaseStyle++;
      const speed = view.trailingFlagSpeed(slot, 4);
      const dest = view.carryDestination(slot);
      if (style % 3 === 2 && dest) {
        const [a, b] = view.stands;
        return {
          kind: "dolly",
          subject: { type: "flag", slot },
          distance: distanceForSpeed(speed),
          awayFrom:
            a && b
              ? [
                  (a.pos[0] + b.pos[0]) / 2,
                  (a.pos[1] + b.pos[1]) / 2,
                  (a.pos[2] + b.pos[2]) / 2,
                ]
              : undefined,
          startSec: t,
          endSec: t,
          transitionIn: "cut",
          reason: `${label} carried by ${carrier ?? "the runner"} — tracking shot`,
          topic: "flag-run",
        };
      }
      return {
        kind: "followFlag",
        slot,
        distance: distanceForSpeed(speed),
        pitch: DIRECTOR_PITCH_CHASE,
        aim:
          style % 3 === 1 && dest
            ? { mode: "toward", target: dest }
            : { mode: "forward" },
        startSec: t,
        endSec: t,
        transitionIn: "cut",
        reason: `${label} carried by ${carrier ?? "the runner"}`,
        topic: "flag-run",
      };
    }
    if (sample?.status === "field") {
      const speed = view.trailingFlagSpeed(slot, 2) ?? 0;
      const velocity = view.trailingFlagVelocity(slot, 2);
      // A loose flag is often still FLYING — thrown at ski speed, it
      // covers a hundred units before it settles, which no parked
      // camera can hold (DIRECTOR_FIXED_MAX_SPEED is exactly this
      // judgement). Ride it down instead of framing where it was.
      if (speed > DIRECTOR_FIXED_MAX_SPEED) {
        return {
          kind: "followFlag",
          slot,
          distance: distanceForSpeed(speed),
          pitch: DIRECTOR_PITCH_CHASE,
          aim: { mode: "forward" },
          startSec: t,
          endSec: t,
          transitionIn: "cut",
          reason: `${label} loose — still moving`,
          topic: "flag-run",
        };
      }
      // Settling: frame slightly AHEAD of it, from a bearing square to
      // its drift, so the last of the slide crosses the frame instead
      // of running out of the back of it.
      const settled = view.flagAt(slot, view.horizon) ?? sample;
      const drift = velocity && Math.hypot(velocity.x, velocity.y) > 1;
      const center: DirectorVec3 = drift
        ? [
            settled.pos[0] + velocity!.x * 1.5,
            settled.pos[1] + velocity!.y * 1.5,
            settled.pos[2],
          ]
        : settled.pos;
      // Camera offset is Torque (sinθ, cosθ); perpendicular to the
      // drift means sinθ·vx + cosθ·vy = 0.
      const across = drift
        ? onBroadcastSide(Math.atan2(-velocity!.y, velocity!.x), dataset)
        : undefined;
      const parked = fieldStaleness(view, slot, sample.pos, t) >= 0.5;
      return orbitShot({
        center,
        radius: DIRECTOR_DROPPED_ORBIT_RADIUS,
        heightFactor: DIRECTOR_DROPPED_ORBIT_HEIGHT,
        still: true,
        lookSubject: { type: "flag", slot },
        ...(across != null ? { angle: across } : { framing }),
        startSec: t,
        endSec: t,
        reason: parked
          ? `${label} still parked in the field — checking in`
          : `${label} on the ground — wide view`,
        topic: "flag-run",
      });
    }
    // At the stand. A battle, an incoming attacker, or quiet.
    const anchor = stand?.pos ?? sample?.pos;
    if (anchor) {
      const near = view
        .playersAt(t)
        .filter((p) => dist(p.pos, anchor) <= DIRECTOR_THREAT_RANGE);
      if (near.length >= STAND_BATTLE_MIN_PLAYERS) {
        const { spread } = boundingSpread(near.map((p) => p.pos));
        return orbitShot({
          center: centroid([...near.map((p) => p.pos), anchor]),
          radius: radiusForSpread(spread, dataset),
          lookSubject: { type: "flag", slot },
          framing,
          startSec: t,
          endSec: t,
          reason: `${label} stand — battle overhead`,
          topic: "flag-stand",
        });
      }
      const inbound = inboundAttacker(view, slot);
      if (
        inbound &&
        inbound.eta <= DIRECTOR_GRAB_LOOKAHEAD_SEC &&
        inbound.likelihood >= DIRECTOR_CAPPER_MIN_LIKELIHOOD
      ) {
        // A grab is a fast, wide-open moment: never shoot it tight.
        // Three framings rotate so repeat grabs never look alike.
        const rotation = state.variety.grabViews ?? 0;
        state.variety.grabViews = rotation + 1;
        // A COLD cut opens on an establishing framing. Landing
        // straight into a lateral flight beside a stranger halfway
        // across the map reads as confusion, not coverage — the
        // alongside ride belongs to a story already on screen.
        let pick = rotation % 3;
        if (state.freshSubject && pick === 2) pick = 0;
        const attacker = playerName(inbound.targetId, dataset, t);
        if (pick === 1) {
          // Ride the capper in — the stand sits beyond them in frame.
          return {
            kind: "followPlayer",
            targetId: inbound.targetId,
            distance: DIRECTOR_GRAB_CHASE_DIST,
            minDistance: DIRECTOR_GRAB_MIN_DIST,
            pitch: DIRECTOR_PITCH_CHASE,
            aim: { mode: "toward", target: anchor },
            startSec: t,
            endSec: t,
            transitionIn: "cut",
            reason: `${attacker ?? "An attacker"} diving on the ${label}`,
            topic: "flag-stand",
          };
        }
        if (pick === 2) {
          // Tag along beside them: a flight level with the dive.
          return {
            kind: "dolly",
            subject: { type: "player", targetId: inbound.targetId },
            distance: DIRECTOR_GRAB_ALONGSIDE_DIST,
            height: DIRECTOR_GRAB_ALONGSIDE_HEIGHT,
            side: state.chaseStyle % 2 === 0 ? 1 : -1,
            sideAngle: Math.PI / 2,
            startSec: t,
            endSec: t,
            transitionIn: "cut",
            reason: `Alongside ${attacker ?? "the attacker"} — inbound on the ${label}`,
            topic: "flag-stand",
          };
        }
        return {
          kind: "followFlag",
          slot,
          distance: DIRECTOR_DIST_STAND_WIDE,
          minDistance: DIRECTOR_GRAB_MIN_DIST,
          pitch: DIRECTOR_PITCH_STAND,
          startSec: t,
          endSec: t,
          transitionIn: "cut",
          reason: `${label} — attacker inbound on the stand`,
          topic: "flag-stand",
        };
      }
      return orbitShot({
        center: anchor,
        radius: radiusForSpread(
          near.length > 0 ? boundingSpread(near.map((p) => p.pos)).spread : 0,
          dataset,
        ),
        lookSubject: { type: "flag", slot },
        framing,
        startSec: t,
        endSec: t,
        reason: `${label} home — quiet, wide on the base`,
        topic: "base",
      });
    }
  }
  if (subject.kind === "bombard" || subject.kind === "base") {
    const stand = view.standFor(subject.slot);
    const anchor = stand?.pos ?? view.stands[0]?.pos ?? [0, 0, 0];
    if (subject.kind === "bombard") {
      const shells = dataset.mortarShots.filter(
        (m) =>
          m.timeSec >= t - DIRECTOR_BOMBARDMENT_WINDOW_SEC &&
          m.timeSec <= view.horizon &&
          dist(m.to, anchor) <= DIRECTOR_BOMBARDMENT_RANGE,
      );
      const impact =
        shells.length > 0 ? centroid(shells.map((s) => s.to)) : anchor;
      const closeUp = (state.variety.bombardmentViews ?? 0) % 2 === 1;
      state.variety.bombardmentViews =
        (state.variety.bombardmentViews ?? 0) + 1;
      return orbitShot({
        center: impact,
        radius: closeUp
          ? DIRECTOR_BOMBARDMENT_CLOSE_RADIUS
          : DIRECTOR_BOMBARDMENT_CAM_RADIUS,
        heightFactor: closeUp
          ? DIRECTOR_BOMBARDMENT_CLOSE_HEIGHT
          : DIRECTOR_BOMBARDMENT_CAM_HEIGHT,
        still: true,
        framing,
        startSec: t,
        endSec: t,
        reason: closeUp
          ? `${shells.length} mortars raining down — in the impact zone`
          : `${shells.length} mortars hitting the base`,
        topic: "bombardment",
      });
    }
    return orbitShot({
      center: anchor,
      radius: DIRECTOR_CROWD_ORBIT_RADIUS,
      heightFactor: DIRECTOR_CROWD_ORBIT_HEIGHT,
      framing,
      startSec: t,
      endSec: t,
      reason: `${stand?.name ?? "base"} base — holding pattern`,
      role: "quiet",
    });
  }
  // Idle: the busiest KNOT of players (trailing window), never the
  // bounding sphere of everyone — mid-map centroids of a spread-out
  // server are empty ground with nothing to film.
  const cluster = busiestCluster(Math.max(0, t - 4), t, view.playersAtSec);
  if (cluster) {
    return orbitShot({
      center: cluster.center,
      radius: DIRECTOR_CLUSTER_CAM_RADIUS,
      heightFactor: DIRECTOR_CLUSTER_CAM_HEIGHT,
      framing,
      startSec: t,
      endSec: t,
      reason: `Lull — watching ${cluster.count} players`,
      topic: "lull",
    });
  }
  const fallback = view.stands[0]?.pos ?? [0, 0, 0];
  return orbitShot({
    center: fallback,
    radius: DIRECTOR_CROWD_ORBIT_RADIUS,
    framing,
    startSec: t,
    endSec: t,
    reason: "Quiet moment — wide on the base",
    topic: "lull",
  });
}
