/**
 * Every tunable the shot planner reads: interest scores, hysteresis
 * thresholds, framing distances and timings. Scores are unitless;
 * distances and radii are world units; times are seconds of demo.
 *
 * They live apart from the planning code deliberately: this is where to
 * start when tuning how the director behaves, without reading how it is
 * implemented.
 *
 * ## The rest of the knobs, and why they are not here
 *
 * About 150 more sit next to the code they steer, because each one is
 * justified by a measurement recorded in the comment beside it — moving
 * them here would separate the number from its evidence. Where to look:
 *
 * | to change | look in |
 * |---|---|
 * | pre-match pacing, tour holds, signing lengths | `preMatch.ts` — `TOUR_HOLD_SEC`, `SIGNING_HOLD_SEC`, `OBSERVER_DRAIN_SEC` |
 * | the establishing fly-by (height, bow, waypoints) | `preMatch.ts` — the `FLYBY_*` family |
 * | how far a lateral pan swings, how close a push-in ends | `preMatch.ts` — `PAN_SWING`, `MIN_PUSH_DIST`, `INDOOR_STANDOFF` |
 * | how a subject is framed by kind (stand, generator…) | `preMatch.ts` — `KIND_FRAMING` |
 * | anything about filming a PERSON | `humanScale.ts` |
 * | where a camera may stand (grid resolution, clearance, water) | `freeSpace.ts` — `FREE_SPACE_*`, `TIGHT_CLEARANCE`, `WATERLINE_MARGIN` |
 * | how camera positions are ranked | `freeSpace.ts` — `OPENNESS_WEIGHT`, `ELEV_COMFORT`, `TIGHT_PENALTY` |
 * | camera pacing and easing | `cameraRig.ts` — `SETTLE_RAMP_IN/OUT`, `easeInHold`, `sweepProgress` |
 * | terrain following and ground clearance | `cameraRig.ts` — `TERRAIN_FOLLOW_CLEARANCE`, `GROUND_MIN_CLEARANCE` |
 * | how often the establishing run repeats | `switcher.ts` — `FLYBY_EVERY_SEC` |
 * | roster block sizing and re-arming | `switcher.ts` — the `LINEUP_*` family |
 * | how long a pick-up waits for its player to settle | `switcher.ts` — `SIGNING_SETTLE_SEC` |
 * | placement repair: tight orbits, sweep lifts, drops | `stage.ts` — `STAGE_*`, `SWEEP_*`, `maxHold` |
 *
 * Two rules keep this from rotting. Camera POSITION and AIM come only
 * from `shotPoseAt` (they are branded types; nothing else can make one),
 * and VISIBILITY is only ever `subjectViewBlocked`. Tuning either of
 * those means editing one function, not hunting for copies — which is
 * what the whole system used to require.
 */

/**
 * The causal director's information horizon: how many seconds ahead of
 * its own timestamp any cast decision (shot, cut, cue, scene fact) may
 * see. This models a delayed live stream, so it applies to demos too —
 * the same engine must behave identically on both. Tunable via the
 * CAST_LOOKAHEAD_SEC env var (raise it if 2s proves too blind; the old
 * oracle planner is effectively this at infinity). Distinct from the
 * tracker resolution lags (directorTrackers), which are latency behind
 * the present, and from any stream delay, which is latency budget.
 */
export const DIRECTOR_LOOKAHEAD_SEC = envSeconds(
  process.env.CAST_LOOKAHEAD_SEC,
  2,
);

/**
 * Parse a seconds-valued env var, falling back when it is unset.
 *
 * The EMPTY-STRING trap: Vite's `define` substitutes an unset var as
 * the literal `""`, and `Number("")` is 0 — so a naive isFinite check
 * silently pinned the director's lookahead to ZERO in the browser
 * while node scripts (where it is `undefined` → NaN) got the default.
 * Every peek-based rule — grab and capture preemption, aftermath
 * scheduling, peek holds — was dead in the app and alive in every
 * offline verification.
 */
export function envSeconds(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/**
 * THE VARIETY MIXER. Unless there is flag action to cover, a good cast
 * rotates through many kinds of picture; these weights set the appetite
 * for each story family in the causal switcher's lull scheduler.
 * 0 disables a family outright; relative magnitude is what matters —
 * a family's chance scales with (detector confidence x weight x
 * freshness), freshness recovering fully over
 * DIRECTOR_VARIETY_FRESH_SEC since the family last aired.
 */
export const DIRECTOR_VARIETY_WEIGHTS = {
  /** Player kill shots (arrive-on-the-kill cut-ins). */
  killCutIn: 1.0,
  /** The busiest knot of players, wherever it is. */
  cluster: 0.8,
  /** Structures going down — raids in progress. */
  destruction: 1.2,
  /** Generators/turrets coming back online — repair stories. */
  repair: 0.9,
  /** Inventory-station queues outside the kickoff window. */
  suitUp: 0.6,
  /** A capper winding up their route toward the enemy stand. */
  capperSetup: 1.2,
  /** Ride-alongs with loaded transports / active vehicles. */
  vehicle: 1.1,
  /** Slow map fly-throughs between the bases. */
  flyThrough: 0.45,
};
/**
 * How hot the CURRENT story may be for each family to still interrupt
 * it: breaking events (kills, structures falling) may cut in over
 * quiet stand-watching; ambient filler (clusters, fly-throughs) waits
 * for a true lull. A live carry (SCORE_CARRIED=100) outranks all.
 */
export const DIRECTOR_VARIETY_INTERRUPT: Record<
  keyof typeof DIRECTOR_VARIETY_WEIGHTS,
  number
> = {
  // 95: interrupt anything except an imminent grab (96) or live carry.
  killCutIn: 95,
  destruction: 95,
  repair: 85,
  capperSetup: 85,
  vehicle: 85,
  suitUp: 60,
  cluster: 60,
  flyThrough: 60,
};
/** Seconds for a family's freshness to fully recover after airing. */
export const DIRECTOR_VARIETY_FRESH_SEC = 150;
/** Minimum weighted value a variety candidate needs to air at all. */
export const DIRECTOR_VARIETY_MIN_VALUE = 0.15;
/**
 * Tight-vs-wide balance for solved fixed framings: the fraction of
 * subject-framing shots that take the HERO size target (subject large
 * in frame) instead of the ACTION size. 0 = all wide, 1 = all tight.
 */
export const DIRECTOR_TIGHT_SHOT_SHARE = 0.5;

/** Interest-grid tick. */
export const DIRECTOR_TICK_SEC = 0.5;
/** A shot normally holds at least this long before switching subjects. */
export const DIRECTOR_MIN_SHOT_SEC = 5;
/** Tier-1 preemption (a flag pickup elsewhere) may cut in after this. */
export const DIRECTOR_HARD_FLOOR_SEC = 2.5;
/** Switch subjects only when the challenger beats the current by this. */
export const DIRECTOR_SWITCH_PENALTY = 25;
/**
 * …but the penalty exists to stop churn between COMPARABLE stories,
 * not to strand the camera on a dead one. Once the current subject
 * has decayed to this (a parked flag past its check-in, a stand
 * nobody is near), anything better takes over after the minimum hold.
 */
export const DIRECTOR_ABANDON_SCORE = 10;
/** Challenger score that allows preempting before MIN_SHOT. */
export const DIRECTOR_PREEMPT_SCORE = 95;
/** Static (non-chase) shots rotate away after this long. */
export const DIRECTOR_MAX_STATIC_SEC = 20;
/** Camera parked at the flag this long before a known grab. */
export const DIRECTOR_GRAB_LOOKAHEAD_SEC = 10;
/**
 * How long AFTER a grab the director will still cut to it. The peek
 * (DIRECTOR_LOOKAHEAD_SEC) is anticipation; this is pure reaction, and
 * it is what guarantees grab coverage at zero lookahead — a live feed
 * with no delay still cuts to the carrier a beat after the touch.
 */
export const DIRECTOR_GRAB_REACT_SEC = 3;
/** Inside this window the grab pre-empts whatever else is on. */
export const DIRECTOR_GRAB_IMMINENT_SEC = 6;
/**
 * A flag dropped this close to its own stand, uncontested, is about as
 * interesting as a flag AT the stand — it will be trivially returned.
 * Interest ramps with distance from home, saturating at the FAR mark:
 * a flag lying deep in enemy territory is a live grenade.
 */
/**
 * A flag left in the field is not automatically live play. Teams park
 * one deliberately — deep in their own ground it is often EASIER to
 * defend than at the stand — and a camera that treats every dropped
 * flag as a story sits on a motionless prop while the match happens
 * elsewhere. With no opponent inside QUIET_RANGE, interest holds for
 * FRESH_SEC and then decays to FLOOR over DECAY_SEC, so the mixer can
 * spend the time on other pictures; every CHECKIN_SEC it briefly
 * becomes worth a look again ("still out there") for CHECKIN_WINDOW.
 */
export const DIRECTOR_FIELD_QUIET_RANGE = 200;
export const DIRECTOR_FIELD_FRESH_SEC = 20;
export const DIRECTOR_FIELD_DECAY_SEC = 45;
/** Below SCORE_IDLE and SCORE_QUIET on purpose: once a flag is fully
 *  stale, whatever players are actually doing outranks it. */
export const DIRECTOR_FIELD_FLOOR_SCORE = 6;
export const DIRECTOR_FIELD_CHECKIN_SEC = 50;
/** A check-in outranks ambient filler (so it actually airs) but never
 *  breaking news — see DIRECTOR_VARIETY_INTERRUPT. */
export const DIRECTOR_FIELD_CHECKIN_SCORE = 65;
export const DIRECTOR_FIELD_CHECKIN_WINDOW = 7;

export const DIRECTOR_DROPPED_NEAR_HOME = 25;
export const DIRECTOR_DROPPED_FAR = 175;
/** Enemy within this range of a home flag reads as a threat. */
export const DIRECTOR_THREAT_RANGE = 80;
/** Kill clustering: spatial radius and time window. */
export const DIRECTOR_CLUSTER_RADIUS = 50;
export const DIRECTOR_CLUSTER_WINDOW_SEC = 8;
/**
 * Players further apart than this vertically are on different FLOORS,
 * not in one crowd: a cluster mixing the inventory room with the
 * courtyard above it has its 3D centroid inside the slab between them —
 * a camera anchored there is buried in solid geometry and every
 * placement cast reports no room, so it degenerates to a minimum-
 * standoff camera staring at dirt.
 */
export const DIRECTOR_FLOOR_BAND = 5;
/** Kills within this range of a flag feed its interest. */
export const DIRECTOR_KILL_NEAR_FLAG = 60;
/** Guarantee pass: an event is covered within this range. */
export const DIRECTOR_COVER_RANGE = 120;
/**
 * Minimum spacing between spliced cut-ins.
 *
 * In a scramble the flag changes hands every few seconds, and covering
 * every grab means cutting across the map four to six times in half a
 * minute — the viewer sees a slideshow of unrelated angles instead of
 * the fight. Broadcast practice is to stay with the play and let a touch
 * go uncovered, so beyond this rate events are deliberately left
 * uncovered (and reported as such) rather than spliced.
 */
export const DIRECTOR_GUARANTEE_MIN_GAP_SEC = 25;
/**
 * Hard floor on a finished shot: anything briefer reads as a jump cut
 * rather than a shot, and is absorbed into its neighbour. Long enough
 * that a viewer can orient in the new frame before it changes again —
 * splices and segment arithmetic both leave fragments, and a two-second
 * one is a flicker, not coverage.
 */
export const DIRECTOR_MIN_SHOT_HOLD_SEC = 4;
/**
 * Longest a carrier chase holds while ANOTHER flag is also being
 * carried. A lone runner has no cap (a 40-second flag run is one
 * unbroken shot), but two simultaneous drives are two stories, and
 * without this the first one to be picked up owns the camera for as long
 * as it lasts — both score as a carry, so neither can ever out-score the
 * other by enough to earn a cut.
 */
export const DIRECTOR_MAX_CHASE_SEC = 22;
/**
 * How long a cut made for FAIRNESS is protected from being undone.
 *
 * Without this the alternation is pointless: a possession that ends in a
 * capture carries a permanent outcome bonus, so the moment the camera
 * cuts to the other drive the pre-empt rule reads the first flag as
 * decisively more interesting and yanks it straight back — the other
 * team's carrier gets two and a half seconds, which the minimum-hold
 * pass then absorbs into its neighbour entirely.
 */
export const DIRECTOR_FAIR_SHARE_SEC = 12;
/** Follow-shot orbit distances by flag state. A chase sits well back
 *  (a tight orbit fills the frame with one body and the dirt under it,
 *  which is the least informative shot available). */
export const DIRECTOR_DIST_CHASE = 15;
export const DIRECTOR_DIST_STAND = 14;
/**
 * Grab coverage rides WIDE: a capper arrives at ski speed, and a 14m
 * lens on a dive that crosses fifty metres in a second is a blur of
 * armour. These three framings rotate — the stand watched wide, the
 * incoming capper ridden from behind with the stand beyond them, and
 * a flight alongside them — so grabs never look the same twice.
 */
export const DIRECTOR_DIST_STAND_WIDE = 34;
export const DIRECTOR_GRAB_CHASE_DIST = 28;
export const DIRECTOR_GRAB_ALONGSIDE_DIST = 24;
/** No grab shot rides closer than this, whatever the geometry
 *  solvers would prefer — the whole point is the wide view. */
export const DIRECTOR_GRAB_MIN_DIST = 20;
/** Below this capper likelihood (see inboundAttacker) an approach is
 *  a base push, not a flag dive — it gets no grab framing. */
export const DIRECTOR_CAPPER_MIN_LIKELIHOOD = 0.5;
export const DIRECTOR_GRAB_ALONGSIDE_HEIGHT = 6;
/**
 * Closing on the cap, the SHOT IS THE PAIR: the carrier and the stand
 * they are about to touch. Inside this range the camera pulls back to
 * hold both — framing scales with how far out they still are — and
 * sits behind them looking across at the stand rather than head-on or
 * tight from the side.
 */
export const DIRECTOR_CAP_APPROACH_RANGE = 220;
export const DIRECTOR_CAP_APPROACH_MIN_DIST = 30;
export const DIRECTOR_CAP_APPROACH_MAX_DIST = 70;
export const DIRECTOR_DIST_HERO = 8;
/** Follow-shot orbit pitch (radians; positive looks down). Chases stay
 *  shallow so the frame carries the horizon and the players ahead
 *  rather than the ground. */
export const DIRECTOR_PITCH_CHASE = 0.16;
export const DIRECTOR_PITCH_STAND = 0.4;
/** Establishing/idle orbit framing. */
export const DIRECTOR_BASE_ORBIT_RADIUS = 35;
export const DIRECTOR_WIDE_ORBIT_RADIUS = 55;
export const DIRECTOR_BASE_ORBIT_SPEED = 0.12;
/**
 * Which side of the axis of action the whole broadcast sits on — the
 * 180-degree rule. Every field sport puts all its cameras along one
 * sideline so a team always attacks the same direction across the
 * screen; crossing the line mid-coverage makes play unreadable. +1/-1
 * simply picks which of the two perpendiculars is "our" side; what
 * matters is that it never changes within a plan.
 */
export const DIRECTOR_BROADCAST_SIDE = 1;
/**
 * The primary wide shot holds a fraction of the pitch, not all of it
 * (soccer coverage frames 25–50% of the field). Fixed cameras are
 * therefore capped to this fraction of the distance between the bases,
 * so "wide" never becomes "too far away to read".
 */
export const DIRECTOR_WIDE_FIELD_FRACTION = 0.35;
/**
 * How far away a base can be and still work as the landmark a shot is
 * aimed past. Beyond this it is lost in fog, so the frame gains haze
 * rather than orientation.
 */
export const DIRECTOR_LANDMARK_MAX_RANGE = 420;
/** Two shots whose cameras land within this of each other, on the same
 *  subject, are the same picture — merge rather than cut. */
/** Two "hold" aims within this many radians point the same way. */
export const DIRECTOR_REDUNDANT_AIM_RADIANS = 0.35;
export const DIRECTOR_REDUNDANT_CUT_RANGE = 25;
/** Crowded action: players within this range of the subject count. */
export const DIRECTOR_CROWD_RADIUS = 60;
/**
 * "Crowded" is partly relative to the match's own density — a 12-player
 * LT map and a stacked retail pub differ by ~3x in players-near-the-
 * flag, so a purely absolute count fires constantly on one and never on
 * the other. The threshold is this percentile of the match's own
 * flag-proximity distribution, but clamped: below MIN_ABSOLUTE it isn't
 * a crowd, and at MAX_ABSOLUTE it is one regardless of how normal that
 * is for the match — that many bodies simply don't fit in a close
 * orbit, which is a framing fact, not a relative one.
 */
export const DIRECTOR_CROWD_PERCENTILE = 0.75;
export const DIRECTOR_CROWD_MIN_ABSOLUTE = 2;
export const DIRECTOR_CROWD_MAX_ABSOLUTE = 3;
/** Dropped flag: a stationary, zoomed-out camera watching the area
 *  (a close locked orbit on a flag lying on the ground is dead air).
 *  Wide enough to hold the players converging on it, not just the flag. */
export const DIRECTOR_DROPPED_ORBIT_RADIUS = 45;
export const DIRECTOR_DROPPED_ORBIT_HEIGHT = 0.5;
/** Crowded stand fight: static wide overhead of the whole battle. */
export const DIRECTOR_CROWD_ORBIT_RADIUS = 40;
export const DIRECTOR_CROWD_ORBIT_HEIGHT = 0.75;
export const DIRECTOR_STAND_BATTLE_SPEED = 0.03;
/** Dense kill clusters get a steeper overhead orbit. */
export const DIRECTOR_CLUSTER_OVERHEAD_KILLS = 3;
export const DIRECTOR_CLUSTER_OVERHEAD_HEIGHT = 0.85;
/**
 * Shot width tracks subject speed, the way a camera operator zooms out
 * as play breaks: a walking player can be framed tight, but a skier at
 * 70 u/s needs room or they leave frame before the operator reacts.
 */
export const DIRECTOR_SLOW_SPEED = 8;
export const DIRECTOR_FAST_SPEED = 65;
export const DIRECTOR_DIST_SLOW = 9;
export const DIRECTOR_DIST_FAST = 24;
/** Inside-the-base shot on a turtling carrier: close, low, and tight. */
export const DIRECTOR_TURTLE_INSIDE_RADIUS = 12;
export const DIRECTOR_TURTLE_INSIDE_HEIGHT = 0.3;
/** Doorway watch: framing on the attackers outside trying to get in. */
export const DIRECTOR_DOORWAY_RADIUS = 30;
export const DIRECTOR_DOORWAY_HEIGHT = 0.4;
/**
 * Pre-match line-up: before the whistle nobody moves, so orbiting a
 * flag reveals nothing. Sweep past the assembled teams instead, like a
 * roster shot. Each team gets a pass of about this long.
 */
export const DIRECTOR_LINEUP_SWEEP_SEC = 11;
/**
 * Roster close-up: a pass along the front of a knot of players, close
 * enough to read faces, positioned by their own facing so they look
 * roughly into the lens. Alternates with the wide passes so the
 * pre-match reads as a line-up rather than one distant fly-by.
 */
export const DIRECTOR_ROSTER_STANDOFF = 7;
/** Shortest roster pass worth making — below this it reads as a stare. */
export const DIRECTOR_ROSTER_MIN_TRAVEL = 6;
/** Roster passes fly LOW — a knee-height hero angle looking up at the
 *  faces, not a chest-high drift past torsos. */
export const DIRECTOR_ROSTER_EYE_HEIGHT = 0.9;
/**
 * Players this close together can be panned across in one pass. Kept
 * SMALL on purpose: at a 7m standoff a knot spread over 20m puts most
 * of its members beside or behind the lens, and the frame ends up on
 * whoever happens to be 100m down the line. A handful of faces close
 * together is the shot.
 */
export const DIRECTOR_ROSTER_GROUP_RANGE = 9;
/** A pass covers at most this much ground, so it stays slow. */
export const DIRECTOR_SWEEP_MAX_SPEED = 9;
/**
 * Only the run-up to the whistle is the line-up. Everything earlier is
 * team-picking — players trickling onto an empty server, which can run
 * a quarter of an hour on a tournament recording — and is skipped past
 * rather than covered.
 */
export const DIRECTOR_LINEUP_LEAD_SEC = 45;
/** A pre-match longer than this is worth seeking past on start. */
export const DIRECTOR_SKIP_DEAD_AIR_SEC = 90;
/**
 * How far out and how high the line-up sweep flies, and how far along
 * its own axis it travels. The standoff only grows with a scattered
 * roster up to a cap: letting it scale freely put the camera 180u back
 * on a 25-player spawn and shrank everyone to specks. Travel is NOT
 * capped — the pass still covers the whole line, it just flies closer
 * to it.
 */
export const DIRECTOR_LINEUP_STANDOFF = 30;
export const DIRECTOR_LINEUP_STANDOFF_MAX_EXTRA = 40;
export const DIRECTOR_LINEUP_HEIGHT = 9;
export const DIRECTOR_LINEUP_TRAVEL = 55;
/** Cinematic dolly: qualifying long chases/sprees ride a smooth flying
 *  camera instead of the locked orbit. */
export const DIRECTOR_DOLLY_MIN_SEC = 8;
export const DIRECTOR_DOLLY_DISTANCE = 12;
export const DIRECTOR_DOLLY_HEIGHT = 4;
/**
 * A long carry is cut into segments of about this length, each taking
 * the next camera style. A single unbroken 110-second locked orbit is
 * monotonous however well aimed; real coverage changes angle.
 */
export const DIRECTOR_CHASE_SEGMENT_SEC = 18;
/**
 * Watching a player cluster instead of an idle flag. The floor is
 * deliberately wide: the planner has no map geometry, so a camera
 * placed close to a tight group (typically one inside a base) ends up
 * against a wall or roof. Standing well back both establishes the
 * location and makes that far less likely.
 */
export const DIRECTOR_CLUSTER_CAM_RADIUS = 55;
export const DIRECTOR_CLUSTER_CAM_HEIGHT = 0.8;
/**
 * Bombardment coverage: with the flags static, shells landing on a base
 * are the story. Needs this many in the window to count as a barrage
 * rather than a stray lob, landing within this range of the target.
 */
export const DIRECTOR_BOMBARDMENT_MIN_SHELLS = 3;
/** Shells within this much time of a tick count toward its barrage. */
export const DIRECTOR_BOMBARDMENT_WINDOW_SEC = 5;
export const DIRECTOR_BOMBARDMENT_RANGE = 120;
/** Suit-up: players within this range of an inventory station, and how
 *  many of them make it a moment worth a tight camera inside. */
export const DIRECTOR_STATION_RANGE = 18;
/**
 * A crowd at an inventory only MEANS something at particular moments:
 * the pre-match/kickoff suit-up, or a base coming back online after a
 * repair. On a 50-player server somebody is always at a station, so
 * without this window the shot recurs every other chunk and becomes the
 * new monotony it was meant to break.
 */
export const DIRECTOR_SUITUP_KICKOFF_SEC = 45;
export const DIRECTOR_STATION_CAM_RADIUS = 14;
export const DIRECTOR_STATION_CAM_HEIGHT = 0.35;
/** Framing for the two bombardment shots: the impacts, and the crew. */
export const DIRECTOR_BOMBARDMENT_CAM_RADIUS = 70;
export const DIRECTOR_BOMBARDMENT_CAM_HEIGHT = 0.55;
/**
 * A fixed camera has to contain its subject for the whole shot. Rather
 * than reject any group that moves, the camera is pulled back to cover
 * however far they range (radiusForSpread) — which is where the wide
 * and overhead shots come from. Only a group that scatters beyond this
 * is unframeable, and gets a following camera instead.
 */
export const DIRECTOR_FIXED_HOLD_RADIUS = 160;
export const DIRECTOR_WIDE_CAM_MARGIN = 30;
/** A fixed shot's aim subject must sit within this multiple of its
 *  radius to stay its pan target (see sanitizeLookSubjects). */
export const DIRECTOR_LOOK_SUBJECT_REACH = 1.5;
/**
 * A fixed camera's bearing is chosen against the subject's WHOLE path
 * through the shot, not just its starting point: a carrier who skis at
 * the camera and drops the flag at its feet turns a considered wide
 * shot into a distorted close-up. Candidate bearings whose worst-case
 * path distance stays above this fraction of the radius are acceptable;
 * failing that, the bearing with the best worst-case wins.
 */
export const DIRECTOR_PATH_STANDOFF_FRACTION = 0.55;
/**
 * A wide overview shot lives well under 100u from the action — far
 * enough to read the shape of the play, close enough that the players
 * are still people rather than dots. The CAMERA sits at radius x
 * sqrt(1 + height²) from the anchor, so the on-screen distance runs
 * noticeably past the radius (85 here measured as an aerial map).
 */
export const DIRECTOR_WIDE_CAM_MAX_RADIUS = 70;
/** How far into the fog band a camera may stand off — 0 keeps it at the
 *  distance haze begins, 1 lets it reach the vanishing point. */
export const DIRECTOR_FOG_TOLERANCE = 0.25;
/**
 * A carrier moving faster than this (u/s) cannot be held by a fixed
 * camera: it takes a following one. A camera parked on a skier's start
 * point is aimed correctly at an empty hillside within seconds, and
 * re-anchoring it each time it loses them just reads as snapping.
 */
export const DIRECTOR_FIXED_MAX_SPEED = 14;
/** Fixed shots re-anchor at least this often, so their aim point can't
 *  go stale while the fight moves on. */
export const DIRECTOR_FIXED_CHUNK_SEC = 8;
/**
 * After a capture or a return, hold a static camera on the spot where
 * it HAPPENED for this long. The flag itself teleports home the moment
 * it is capped or returned, and any camera still attached to it snaps
 * across the map with it — the most anti-climactic cut a broadcast can
 * make. The story for the next beat is the aftermath, not the item.
 */
export const DIRECTOR_AFTERMATH_HOLD_SEC = 4.5;
export const DIRECTOR_AFTERMATH_RADIUS = 30;
/** Riders aboard (pilot included) before a transport reads as a raid
 *  under way, and how far it must move within the window to count as
 *  flying rather than loading. */
export const DIRECTOR_TRANSPORT_MIN_CREW = 3;
export const DIRECTOR_TRANSPORT_MIN_TRAVEL = 80;
/** Opposing flyers this close, this often, are a dogfight. */
export const DIRECTOR_DOGFIGHT_RANGE = 60;
export const DIRECTOR_DOGFIGHT_MIN_MEETINGS = 3;

/** A lone flyer passing this close to enemies, repeatedly, is a
 *  strafing run — worth a camera even without an opposing flyer. */
export const DIRECTOR_STRAFE_RANGE = 50;
export const DIRECTOR_STRAFE_MIN_PASSES = 2;
/** Every other bombardment impact shot sits IN the impact zone. */
export const DIRECTOR_BOMBARDMENT_CLOSE_RADIUS = 24;
export const DIRECTOR_BOMBARDMENT_CLOSE_HEIGHT = 0.35;
export const DIRECTOR_SCRAMBLE_RADIUS = 80;
/** Interest scores. */
export const SCORE_CARRIED = 100;
export const SCORE_DROPPED = 80;
export const SCORE_GRAB_SOON = 70;
/**
 * A grab off the stand is one of the most important events in the game,
 * and the scan KNOWS it is coming — so in the last few seconds it must
 * outrank filler outright (>= DIRECTOR_PREEMPT_SCORE + the switch
 * penalty over anything below a live carry). Without this the approach
 * is lost to hysteresis: a mortar barrage scoring 60 holds the camera
 * because 70 never beats 60 + the switch penalty, and the cut lands a
 * tenth of a second AFTER the grab — the setup nobody saw.
 */
export const SCORE_GRAB_IMMINENT = 96;
export const SCORE_THREAT = 55;
export const SCORE_QUIET = 10;
/** A RETURN is coming (future knowledge, like the grab lookahead): the
 *  dropped flag's story is about to resolve — never cut away to a quiet
 *  stand seconds before the touch. Imminent outranks a plain drop. */
export const SCORE_RETURN_SOON = 60;
export const SCORE_RETURN_IMMINENT = 85;
export const SCORE_IDLE = 8;
export const SCORE_BASE = 5;
export const SCORE_BASE_ATTACK = 45;
export const SCORE_CAP_CHAIN_BONUS = 40;
export const SCORE_KILLS_NEAR_FLAG = 10;
/** Above a quiet or merely threatened flag, below a live carry or an
 *  imminent grab: shelling fills the lulls, it doesn't pre-empt play. */
export const SCORE_BOMBARDMENT = 60;

export const TIER1_TYPES = new Set([
  "flag-grab",
  "flag-cap",
  "flag-return",
  "match-start",
  "match-end",
]);
