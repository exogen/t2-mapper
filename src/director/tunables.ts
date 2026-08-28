/**
 * Every tunable the shot planner reads: interest scores, hysteresis
 * thresholds, framing distances and timings. Scores are unitless;
 * distances and radii are world units; times are seconds of demo.
 *
 * They live apart from the planning code deliberately — this is the file
 * to open when tuning how the director behaves, without reading how it
 * is implemented.
 */

/** Interest-grid tick. */
export const DIRECTOR_TICK_SEC = 0.5;
/** A shot normally holds at least this long before switching subjects. */
export const DIRECTOR_MIN_SHOT_SEC = 5;
/** Tier-1 preemption (a flag pickup elsewhere) may cut in after this. */
export const DIRECTOR_HARD_FLOOR_SEC = 2.5;
/** Switch subjects only when the challenger beats the current by this. */
export const DIRECTOR_SWITCH_PENALTY = 25;
/** Challenger score that allows preempting before MIN_SHOT. */
export const DIRECTOR_PREEMPT_SCORE = 95;
/** Static (non-chase) shots rotate away after this long. */
export const DIRECTOR_MAX_STATIC_SEC = 20;
/** Over-the-shoulder grab views ride the grabber for this long before
 *  the grab (alternating with the classic stand camera for variety). */
export const DIRECTOR_GRAB_OTS_LEAD_SEC = 7;
/** Camera parked at the flag this long before a known grab. */
export const DIRECTOR_GRAB_LOOKAHEAD_SEC = 10;
/** Inside this window the grab pre-empts whatever else is on. */
export const DIRECTOR_GRAB_IMMINENT_SEC = 6;
/** Boundary shift so the camera settles before a tier-1 event. */
export const DIRECTOR_ANTICIPATION_SEC = 2;
/**
 * A capture PREEMPTS everything inside this window — fairness holds,
 * hysteresis, the guarantee rate limit, aftermath holds. A flag capture
 * is always the most valuable thing on the map; no other rule may hold
 * the camera elsewhere while one lands.
 */
export const DIRECTOR_CAP_PREEMPT_SEC = 8;
/** Cap-ceremony framing begins this long before a capture. */
export const DIRECTOR_CAP_PREROLL_SEC = 5;
/**
 * A flag dropped this close to its own stand, uncontested, is about as
 * interesting as a flag AT the stand — it will be trivially returned.
 * Interest ramps with distance from home, saturating at the FAR mark:
 * a flag lying deep in enemy territory is a live grenade.
 */
export const DIRECTOR_DROPPED_NEAR_HOME = 25;
export const DIRECTOR_DROPPED_FAR = 175;
/**
 * The first seconds after the whistle get one wide shot of the spawn
 * rush — everyone pouring out of the bases is the only action anywhere,
 * and it establishes both teams' opening routes.
 */
export const DIRECTOR_KICKOFF_WIDE_SEC = 10;
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
/** A cluster within this range of a stand is "at the X base". */
export const DIRECTOR_PLACE_NAME_RANGE = 250;
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
 * A flag on the ground for less than this, between two carries, is a
 * PASS (or a fumble-and-regrab) — one continuous play, not three shots.
 * The follow machinery tracks item and carriers seamlessly, so the
 * camera just rides through it instead of cutting to a "dropped flag"
 * framing and back.
 */
export const DIRECTOR_PASS_CONTINUITY_SEC = 5;
/** Sub-shots (status runs) shorter than this merge into the previous. */
export const DIRECTOR_MIN_RUN_SEC = 2;
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
/** A grab held for less than this is a scramble, not a carry, and does
 *  not earn a cut away from whatever is already on screen. */
export const DIRECTOR_MIN_POSSESSION_SEC = 4;
/**
 * A defender posted near a home flag makes the stand shot: within this
 * range they join the frame, and the orbit widens (capped) so flag and
 * guard read together instead of a lone flag filling the lens.
 */
export const DIRECTOR_STAND_GUARD_RANGE = 45;
export const DIRECTOR_DIST_STAND_GUARDED_MAX = 30;
/** Follow-shot orbit distances by flag state. A chase sits well back
 *  (a tight orbit fills the frame with one body and the dirt under it,
 *  which is the least informative shot available). */
export const DIRECTOR_DIST_CHASE = 15;
export const DIRECTOR_DIST_STAND = 14;
export const DIRECTOR_DIST_CEREMONY = 16;
export const DIRECTOR_DIST_HERO = 8;
/** Follow-shot orbit pitch (radians; positive looks down). Chases stay
 *  shallow so the frame carries the horizon and the players ahead
 *  rather than the ground. */
export const DIRECTOR_PITCH_CHASE = 0.16;
export const DIRECTOR_PITCH_STAND = 0.4;
/** The defender hip-view: tight and low beside the posted defender,
 *  looking across them at the flag — the counterweight to a diet of
 *  wide overheads on quiet stands. */
export const DIRECTOR_DIST_HIP = 7;
export const DIRECTOR_PITCH_HIP = 0.1;
/** How much of a pre-grab stand the approach-aimed flag shot keeps for
 *  itself when a hip view covers the wait — the approach bearing only
 *  earns the frame once the grabber is actually closing. */
export const DIRECTOR_STAND_APPROACH_TAIL_SEC = 4.5;
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
/** Aim: a pre-grab shot looks toward where the grabber was this long
 *  before the grab (their approach corridor). */
export const DIRECTOR_APPROACH_LOOKBACK_SEC = 4;
/** Aim: an approach farther than this from the flag is ignored. */
export const DIRECTOR_APPROACH_MAX_RANGE = 400;
/** Aim: a defender this close to the carrier counts as a chaser. */
export const DIRECTOR_CHASE_RADIUS = 35;
/** Aim: fraction of a chase shot spent with a chaser in range that
 *  flips the camera to look back at the pursuit. */
export const DIRECTOR_CHASE_FRACTION = 0.35;
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
/**
 * A dropped flag is only worth a camera while someone is this close to
 * it; otherwise it is just an object in a field. Kept in scale with the
 * dropped-flag camera's own frame (roughly its radius plus a beat of
 * approach) so "contested" means "will be on screen", not "somewhere on
 * the same hillside".
 */
export const DIRECTOR_CONTESTED_RANGE = 70;
/** Crowded chase: still locked on the carrier, but pulled back and
 *  near top-down so the whole fight reads. */
export const DIRECTOR_DIST_CROWD = 20;
/** Steep enough to read a scrum, shallow enough that the frame is
 *  still players and horizon rather than mostly dirt. */
export const DIRECTOR_PITCH_CROWD = 0.45;
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
/**
 * Turtling: a carrier sitting still deep inside a base (next to a
 * generator or inventory, which only ever exist indoors) rather than
 * running. It needs its own coverage — a static orbit on a stationary
 * body is nothing — alternating the carrier inside with the attackers
 * massing at the doors outside.
 */
export const DIRECTOR_TURTLE_SPEED = 6;
export const DIRECTOR_TURTLE_ASSET_RANGE = 35;
export const DIRECTOR_TURTLE_MIN_SEC = 6;
/** Inside-the-base shot on a turtling carrier: close, low, and tight. */
export const DIRECTOR_TURTLE_INSIDE_RADIUS = 12;
export const DIRECTOR_TURTLE_INSIDE_HEIGHT = 0.3;
/** Enemies this close to a turtling carrier make the inside shot the
 *  more urgent of the two. */
export const DIRECTOR_TURTLE_THREAT_RANGE = 30;
/** Doorway watch: framing on the attackers outside trying to get in. */
export const DIRECTOR_DOORWAY_RADIUS = 30;
export const DIRECTOR_DOORWAY_HEIGHT = 0.4;
/**
 * Pre-match line-up: before the whistle nobody moves, so orbiting a
 * flag reveals nothing. Sweep past the assembled teams instead, like a
 * roster shot. Each team gets a pass of about this long.
 */
export const DIRECTOR_LINEUP_SWEEP_SEC = 9;
/**
 * Roster close-up: a pass along the front of a knot of players, close
 * enough to read faces, positioned by their own facing so they look
 * roughly into the lens. Alternates with the wide passes so the
 * pre-match reads as a line-up rather than one distant fly-by.
 */
export const DIRECTOR_ROSTER_STANDOFF = 7;
/** Shortest roster pass worth making — below this it reads as a stare. */
export const DIRECTOR_ROSTER_MIN_TRAVEL = 6;
export const DIRECTOR_ROSTER_EYE_HEIGHT = 1.9;
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
 * Carried-flag runs alternate locked chase ↔ cinematic dolly. (A fixed
 * camera can't cover a cross-map run — see DIRECTOR_FIXED_HOLD_RADIUS —
 * so fixed coverage of carries comes from the cap camera instead.)
 */
export const DIRECTOR_CHASE_STYLES = 2;
/**
 * A long carry is cut into segments of about this length, each taking
 * the next camera style. A single unbroken 110-second locked orbit is
 * monotonous however well aimed; real coverage changes angle.
 */
export const DIRECTOR_CHASE_SEGMENT_SEC = 18;
/** Cap camera: wide and high at the stand, for the arrival itself. */
export const DIRECTOR_GOAL_CAM_RADIUS = 40;
export const DIRECTOR_GOAL_CAM_HEIGHT = 0.6;
/**
 * Watching a player cluster instead of an idle flag. The floor is
 * deliberately wide: the planner has no map geometry, so a camera
 * placed close to a tight group (typically one inside a base) ends up
 * against a wall or roof. Standing well back both establishes the
 * location and makes that far less likely.
 */
export const DIRECTOR_CLUSTER_CAM_RADIUS = 55;
export const DIRECTOR_CLUSTER_CAM_HEIGHT = 0.8;
/** A cluster needs this many players to be worth a camera of its own. */
export const DIRECTOR_CLUSTER_CAM_MIN_PLAYERS = 2;
/**
 * Bombardment coverage: with the flags static, shells landing on a base
 * are the story. Needs this many in the window to count as a barrage
 * rather than a stray lob, landing within this range of the target.
 */
export const DIRECTOR_BOMBARDMENT_MIN_SHELLS = 3;
/** Shells within this much time of a tick count toward its barrage. */
export const DIRECTOR_BOMBARDMENT_WINDOW_SEC = 5;
export const DIRECTOR_BOMBARDMENT_RANGE = 120;
/** How near the shells' origin a player must be to read as the crew. */
export const DIRECTOR_SHOOTER_RANGE = 60;
/**
 * Highlight kills: a death with an identifiable killer is a duel worth
 * showing, and the good ones (a mortar hit, a disc) are worth showing
 * most. The shot spans its whole chunk, so it is already up before the
 * kill lands and holds through the aftermath.
 *
 * A killer this far from their victim still frames as one duel.
 */
export const DIRECTOR_HIGHLIGHT_MAX_SEPARATION = 140;
/** Suit-up: players within this range of an inventory station, and how
 *  many of them make it a moment worth a tight camera inside. */
export const DIRECTOR_STATION_RANGE = 18;
export const DIRECTOR_STATION_MIN_PLAYERS = 3;
/**
 * A crowd at an inventory only MEANS something at particular moments:
 * the pre-match/kickoff suit-up, or a base coming back online after a
 * repair. On a 50-player server somebody is always at a station, so
 * without this window the shot recurs every other chunk and becomes the
 * new monotony it was meant to break.
 */
export const DIRECTOR_SUITUP_KICKOFF_SEC = 45;
export const DIRECTOR_SUITUP_REPAIR_SEC = 30;
/** Minimum gap between suit-up shots, whatever else is happening. */
export const DIRECTOR_SUITUP_COOLDOWN_SEC = 150;
export const DIRECTOR_STATION_CAM_RADIUS = 14;
export const DIRECTOR_STATION_CAM_HEIGHT = 0.35;
/** Framing for the two bombardment shots: the impacts, and the crew. */
export const DIRECTOR_BOMBARDMENT_CAM_RADIUS = 85;
export const DIRECTOR_BOMBARDMENT_CAM_HEIGHT = 0.55;
export const DIRECTOR_SHOOTER_CAM_RADIUS = 22;
/**
 * Live fire within this range of a candidate suit-up trumps it: a
 * mortar being FIRED (or landing) feet from the inventory is the shot,
 * and people topping up their packs is the background.
 */
export const DIRECTOR_STATION_ACTION_RANGE = 60;
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
 * A wide overview shot lives around 100u from the action — far enough to
 * read the shape of the play, close enough that the players are still
 * people rather than dots. The CAMERA sits at radius x sqrt(1 + height²)
 * from the anchor, so a 100u eye distance means a radius in the high
 * 80s, not 110 (which measured ~125-150u on screen).
 */
export const DIRECTOR_WIDE_CAM_MAX_RADIUS = 85;
/**
 * Enemy presence, per second of the run, before a crowded stand counts
 * as a battle. A lone scout drifting through is not a battle — without
 * this floor the early game reads spawn crowds as "battle overhead"
 * shots of teams standing around.
 */
export const DIRECTOR_BATTLE_MIN_ENEMY_RATE = 0.5;
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
/** Somebody must actually be at the scene for an aftermath hold (or a
 *  return-imminent score boost) to make sense — a flag whose return
 *  timer simply expired resolves in an empty field. */
export const DIRECTOR_AFTERMATH_CROWD_RANGE = 30;
/** A victim slower than this at death wasn't really flying — hovering
 *  in place and getting hit is not the MA highlight. */
export const DIRECTOR_MIDAIR_MIN_SPEED = 15;
/** Two non-generator asset kills within this range read as one raid. */
export const DIRECTOR_RAID_RANGE = 40;
/** Riders aboard (pilot included) before a transport reads as a raid
 *  under way, and how far it must move within the window to count as
 *  flying rather than loading. */
export const DIRECTOR_TRANSPORT_MIN_CREW = 3;
export const DIRECTOR_TRANSPORT_MIN_TRAVEL = 80;
/** Opposing flyers this close, this often, are a dogfight. */
export const DIRECTOR_DOGFIGHT_RANGE = 60;
export const DIRECTOR_DOGFIGHT_MIN_MEETINGS = 3;
/** One vehicle set piece per stretch — they repeat (ferry runs). */
export const DIRECTOR_VEHICLE_COOLDOWN_SEC = 45;

/**
 * Situational story priorities — which one story a coverage window
 * tells when several are available. Data, not statement order: a
 * MID-AIR disc or a kill on the flag carrier now outranks a routine
 * barrage, while a plain duel still defers to the (cooldown-limited)
 * suit-up so lulls keep their variety.
 */
export const SCORE_STORY_KILL_FLAG = 85;
export const SCORE_STORY_RAID = 80;
export const SCORE_STORY_KILL_MIDAIR = 75;
export const SCORE_STORY_BOMBARDMENT = 70;
export const SCORE_STORY_VEHICLE = 60;
export const SCORE_STORY_SUITUP = 55;
export const SCORE_STORY_KILL = 50;
/** A kill at longer range than this reads as two dots in a wide frame
 *  — follow the KILLER instead, looking down their line of fire. */
export const DIRECTOR_KILL_FOLLOW_SEPARATION = 40;
/** Players/vehicles this close to a dropped flag are part of its scene
 *  and the wide view widens to hold them. */
export const DIRECTOR_DROP_SCENE_RANGE = 60;
/** A lull anchored this close to the previous lull is the same shot
 *  again — look somewhere else if anyone is watchable there. */
export const DIRECTOR_LULL_REPEAT_RANGE = 60;
/** A lone flyer passing this close to enemies, repeatedly, is a
 *  strafing run — worth a camera even without an opposing flyer. */
/** A generator repair only explains re-arming at stations in the SAME
 *  base — within this range of the repaired generator. */
export const DIRECTOR_SUITUP_REPAIR_RANGE = 120;
export const DIRECTOR_STRAFE_RANGE = 50;
export const DIRECTOR_STRAFE_MIN_PASSES = 2;
/** Every other bombardment impact shot sits IN the impact zone. */
export const DIRECTOR_BOMBARDMENT_CLOSE_RADIUS = 24;
export const DIRECTOR_BOMBARDMENT_CLOSE_HEIGHT = 0.35;
/**
 * A scramble — the flag changing hands over and over in one area —
 * reads as chaos when every grab/drop cuts to a new camera. When this
 * many consecutive short runs stay inside DIRECTOR_SCRAMBLE_RADIUS, the
 * whole stretch gets ONE slowly rotating overhead that pans with the
 * flag instead.
 */
export const DIRECTOR_SCRAMBLE_MIN_RUNS = 4;
export const DIRECTOR_SCRAMBLE_RUN_SEC = 10;
export const DIRECTOR_SCRAMBLE_RADIUS = 80;
export const DIRECTOR_SCRAMBLE_ORBIT_SPEED = 0.05;
/**
 * Turtle-stalemate variety: an attacker inbound from midfield — between
 * these fractions of the base separation, closing at least this fast —
 * is worth a cutaway. Mortar fire from their position ranks them up.
 */
export const DIRECTOR_INBOUND_MIN_FRACTION = 0.2;
export const DIRECTOR_INBOUND_MAX_FRACTION = 0.75;
export const DIRECTOR_INBOUND_MIN_APPROACH = 15;
export const DIRECTOR_INBOUND_MORTAR_RANGE = 25;
/** How near the base a kill or asset hit must land to count as the
 *  attacker's payoff there. */
export const DIRECTOR_INBOUND_PAYOFF_RANGE = 100;
/** Held past the payoff so the viewer sees it land, and less past a
 *  death — a corpse needs only a beat. */
export const DIRECTOR_INBOUND_PAYOFF_SEC = 2.5;
export const DIRECTOR_INBOUND_DEATH_BEAT_SEC = 1.5;
/** Never ride an attacker who circles forever — give up after this. */
export const DIRECTOR_INBOUND_MAX_FOLLOW_SEC = 22;
/** A followed hero should be DOING something; above this speed skiing
 *  itself counts as the something. */
export const DIRECTOR_HERO_MIN_SPEED = 35;
/**
 * Where a followed hero is HEADING, for the camera's aim: their travel
 * has to cover at least this much ground to count as a direction, a
 * base within this cosine of that direction snaps the aim to the base
 * ("show what he's about to attack"), and otherwise the aim projects
 * this far ahead along the path.
 */
export const DIRECTOR_HERO_DEST_MIN_TRAVEL = 40;
export const DIRECTOR_HERO_DEST_CONE_COS = 0.72;
export const DIRECTOR_HERO_DEST_AHEAD = 250;
/**
 * A "battle overhead" at a stand must actually be AT the stand: the
 * cluster it frames has to sit within this range of the flag, or the
 * shot gets labeled one thing and centred on another base entirely.
 */
export const DIRECTOR_BATTLE_STAND_RANGE = 120;
/** A kill highlight starts this long before the kill lands — arriving
 *  at the moment of the kill means the viewer missed it. */
export const DIRECTOR_KILL_PREROLL_SEC = 4;
export const DIRECTOR_KILL_POSTROLL_SEC = 4;
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
