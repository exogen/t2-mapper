import type { TimelineEvent } from "../state/demoTimelineStore";

/** Torque-space position [x, y, z]. */
export type DirectorVec3 = [number, number, number];

export interface DirectorTeam {
  teamId: number;
  name: string;
}

/**
 * A flag's home stand. `slot` uses the same semantics as flag follow
 * (streamPlaybackStore.followFlagSlot): the team id for teamed flags, or
 * the 1-based stable-order index in teamless games (Rabbit).
 */
export interface DirectorFlagStand {
  slot: number;
  teamId: number | null;
  name: string | null;
  pos: DirectorVec3;
}

export interface DirectorFlagSample {
  timeSec: number;
  slot: number;
  pos: DirectorVec3;
  /** Carrying player's respawn-stable target id, or null when grounded. */
  carrierTargetId: number | null;
  status: "home" | "held" | "field";
}

export interface DirectorPlayerSample {
  timeSec: number;
  targetId: number;
  teamId: number | null;
  pos: DirectorVec3;
  /**
   * Which way they are facing, in the orbit-yaw convention (radians,
   * atan2(dx, dy) over Torque x/y). Lets a camera be placed in FRONT of
   * a player — needed for a roster close-up, where the point is their
   * face rather than their back.
   */
  heading?: number;
  /** Armor class from the player's shape ("heavy" carries the mortar;
   *  "light" cannot) — the ground truth for weapon attribution. */
  armor?: "light" | "medium" | "heavy";
  /** Mounted backpack, by commentary name ("energy pack", "mortar
   *  turret barrel", …) — what they're equipped FOR. */
  pack?: string;
  /** Normalized health (0 = dead, 1 = full), from the ghost's damage. */
  health?: number;
}

/** A base structure's damageState change (0 = Enabled, 1 = Disabled,
 *  2 = Destroyed) — the only observer-visible signal for generator and
 *  turret kills, which have no broadcast chat message. */
/** One structure standing on the map, from the moment it was seen. */
export interface StructurePresence {
  /** When this object first entered scope. Deployables appear
   *  mid-match; permanent base hardware is there from the start. */
  firstSeenSec: number;
  name: string;
  className: string;
  teamId: number | null;
  pos: DirectorVec3;
}

export interface StructureTransition {
  timeSec: number;
  /** Owning team, from the ghost's own sensor group (StreamEntity
   *  .teamId) — the game's answer, not an inference from position. */
  teamId?: number | null;
  /** Commentary name ("spider clamp turret", "generator", …) — never a
   *  raw shape filename; placement variants (wall/floor/ceiling,
   *  indoor/outdoor) are deliberately erased. */
  name: string;
  className: string;
  pos: DirectorVec3;
  from: number;
  to: number;
}

/**
 * One mortar shell's flight, tracked from the samples where its ghost
 * was alive: `from` is where it was first seen (near the shooter),
 * `to` where it was last seen (near the impact). Bombardment of a base
 * is one of the few things worth watching when the flags are quiet.
 */
export interface MortarShot {
  timeSec: number;
  from: DirectorVec3;
  to: DirectorVec3;
  /** Shooter's target id, from the projectile packet's sourceObject —
   *  authoritative, not inferred. Null when the source isn't a player
   *  (turret, vehicle weapon) or wasn't in scope. */
  shooterTargetId?: number | null;
  /** When the round was last seen (≈ impact time). */
  endSec?: number;
  /** Its position one sample before `to`, for extrapolating the final
   *  flight segment past the last sample. */
  toPrev?: DirectorVec3;
}

/**
 * A player death seen in the entity stream (damageState alive → not),
 * which — unlike chat kill messages — is available for EVERY player in
 * both observer and first-person recordings.
 */
export interface DirectorDeath {
  timeSec: number;
  targetId: number;
  teamId: number | null;
  pos: DirectorVec3;
  /** Nearest opposing player at the moment of death, if any: the
   *  likely killer, and the other half of a highlight shot. */
  killerTargetId: number | null;
  killerPos?: DirectorVec3;
  /** Damage type from the kill message ("disc", "laser", "shocklance",
   *  …), or inferred from ordnance in flight nearby as the fallback. */
  weapon?: string;
  /** Nothing under the victim's feet when they died — a mid-air kill,
   *  the game's signature skill shot when paired with a disc/mortar. */
  airborne?: boolean;
  /** Victim's speed at death (u/s), from their last two samples. */
  speed?: number;
  /** A verified MID-AIR: the server's own skill-shot announcement
   *  ("X hit a mid air shot.") correlated to this death's killer.
   *  Vehicle rams, splash and snipes never set this. */
  midair?: boolean;
  /** A sniper-rifle headshot, from the server's announcement. */
  headshot?: boolean;
}

/**
 * A server-announced skill shot (chat kind "server", color code 5):
 * "X hit a mid air shot. [69m, Spinfusor]" or "X hit a sniper rifle
 * headshot." Authoritative — no inference. `lethal` marks the ones
 * correlated to a death (whose kill event then carries the flag).
 */
export interface SkillShot {
  timeSec: number;
  /** The shooter's target id, when the name resolved. */
  targetId: number | null;
  name: string;
  kind: "midair" | "headshot";
  rangeM?: number;
  weapon?: string;
  lethal?: boolean;
}

/**
 * A fixed base asset. Inventory stations mark where players suit up;
 * both kinds sit deep inside bases in stock Tribes 2, which makes
 * proximity to them a usable "this player is indoors" signal.
 */
export interface DirectorStation {
  pos: DirectorVec3;
  kind: "inventory" | "generator";
  /** Deployable inventories read differently from base stations. */
  deployed: boolean;
  /**
   * Demo seconds at which this station's activate animation was seen
   * playing — the ground truth for "someone is using THIS station",
   * where mere proximity confuses a queue with a passing crowd.
   * Optional so datasets scanned before this field existed still plan.
   */
  activations?: number[];
}

/**
 * One vehicle sighting: which airframe/chassis, where, and how many
 * riders were mounted (pilot included). A loaded transport heading for
 * the enemy base is a raid announcement — the guides' canonical use of
 * the Havoc — and two opposing flyers tangling is a dogfight.
 */
export interface DirectorVehicleSample {
  timeSec: number;
  /** Stable per-ghost key (stream entity id). */
  key: string;
  kind: "shrike" | "bomber" | "havoc" | "tank" | "mpb" | "wildcat";
  teamId: number | null;
  pos: DirectorVec3;
  passengers: number;
}

export interface DirectorEvent extends TimelineEvent {
  /** match-countdown only: seconds until the announced kickoff. */
  secondsUntil?: number;
  /** Torque-space position correlated from entity samples, when known. */
  pos?: DirectorVec3;
  /** Flag drops only — the carrier's intent, from chat-message order
   *  and teammate proximity/pickup: "died" (killed holding it),
   *  "thrown" (deliberate), or "pass" (thrown to teammates). */
  dropKind?: "died" | "thrown" | "pass";
}

/**
 * Everything the shot planner needs, produced by one background pass of
 * a headless StreamingPlayback over the demo (demoDirectorScanner).
 */
/**
 * The mission's fog range, which bounds how far a camera can usefully
 * stand off: beyond `fogDistance` subjects start washing out, and at
 * `visibleDistance` they are gone entirely.
 */
export interface DirectorVisibility {
  fogDistance: number;
  visibleDistance: number;
}

export interface DirectorDataset {
  durationSec: number;
  /** See MatchFacts — collected during the scan, attached to the plan.
   *  Optional so test fixtures don't need one; real scans always set it. */
  matchFacts?: MatchFacts;
  /** Absent when the recording carried no Sky (fall back to defaults). */
  visibility?: DirectorVisibility;
  flagSampleStepSec: number;
  playerSampleStepSec: number;
  gameClassName: string | null;
  teams: DirectorTeam[];
  flagStands: DirectorFlagStand[];
  events: DirectorEvent[];
  /** Time-ordered; group by `slot` for per-flag tracks. */
  flagSamples: DirectorFlagSample[];
  /** Time-ordered; group by `targetId` for per-player tracks. */
  playerSamples: DirectorPlayerSample[];
  structures: StructureTransition[];
  /**
   * What is actually STANDING on the map, and when we first saw it.
   *
   * `structures` above is a damage LOG — an entry appears only when
   * something is destroyed or repaired — so it says nothing about what
   * exists. Reading it as an inventory produced a pre-match tour of 68
   * assets, every one of which was deployed AFTER the whistle: the
   * earliest first appeared 20 seconds into the match.
   *
   * `firstSeenSec` makes time-filtering possible, which matters because
   * most of these are DEPLOYABLES that players place mid-match. A
   * consumer must never show one before that time.
   */
  structureInventory: StructurePresence[];
  /** Mortar shells seen in flight, oldest first. */
  mortarShots: MortarShot[];
  /** Discs and grenade rounds, tracked the same way (absent in older
   *  datasets) — the direct-hit evidence behind midair verdicts. */
  discShots?: MortarShot[];
  grenadeShots?: MortarShot[];
  /** Server-announced mid-airs and headshots (absent in older data). */
  skillShots?: SkillShot[];
  /** Every player death, from entity state. */
  deaths: DirectorDeath[];
  /** Inventory stations, for suit-up moments. */
  stations: DirectorStation[];
  /** Vehicle sightings with rider counts (absent in older datasets). */
  vehicles?: DirectorVehicleSample[];
  /** Player name → target id, for joining event actor names to samples.
   *  `name` is the LOWERCASE matching key; `displayName` preserves the
   *  original case for commentary, and `skin` the player's skin tag. */
  playerNames: {
    targetId: number;
    /** The client wearing the target over this stretch — the stable
     *  identity; target ids are recycled between players. */
    clientId?: number;
    /** When this client started wearing the target (absent: from the
     *  start) and stopped (absent: still wearing it at the end). One
     *  target id can have several entries, one per client. */
    fromSec?: number;
    toSec?: number;
    name: string;
    displayName?: string;
    /** Every lowercase name this player went by over the stretch,
     *  the current one included — some servers let players change
     *  their clan tag, or their whole name, mid-match, and a kill
     *  message names whoever they were at the time. */
    aliases?: string[];
    skin?: string;
    /** Official clan tag from the name's color-7 segments, when set —
     *  includes its separator character as sent ("TF_", ">You"). */
    clan?: string;
    /** The color-6 base name (the name without the official tag). */
    baseName?: string;
  }[];
  /** Sparse team-score timeline, one row per score change. */
  scoreSamples?: { timeSec: number; teamId: number; score: number }[];
}

// ── The published contract ──
//
// Everything a cast.json consumer may rely on lives in castContract.ts,
// with documentation written for that reader. Re-exported here so the
// director's own code has one import for its types.
export type {
  CastPlan,
  CastShot,
  FramePosition,
  MatchFacts,
  ScenePlayer,
  SceneEvent,
  SceneFlagState,
  SceneTopic,
  ShotScene,
  Venue,
  VenueHardware,
} from "./castContract";
import type {
  CastPlan,
  CastShot,
  MatchFacts,
  SceneFlagState,
  SceneTopic,
  ShotScene,
  Venue,
} from "./castContract";

/**
 * What a shot IS, for code that has to make decisions about it.
 *
 * `reason` is a HUMAN-READABLE description for commentary and logs.
 * Never parse it. Doing so caused three separate silent failures: a
 * `/Pre-match/` test meant to catch roster passes also caught map
 * fly-throughs and skipped their clearance check, converting every one
 * to an orbit; a `/close-up/` test gated the path-trimming rescue so
 * tour pans were discarded instead of trimmed; and reworded reasons
 * changed behaviour with no type error anywhere.
 */
export type ShotRole = NonNullable<CastShot["role"]>;

interface ShotBase {
  startSec: number;
  endSec: number;
  /**
   * Who the shot is OF when its camera geometry does not say so — a
   * pick-up holds on or pans across a person without following them.
   * Read by the scene pass (`focus`), never by the rig: the rig's
   * subject is `shotSubjectOf`, which drives the visibility rail.
   */
  subject?: ShotSubject;
  /** Structured commentary metadata, attached by the planner's final
   *  pass (scene.ts). Facts for an LLM commentator; future knowledge
   *  quarantined under `flags[].future`. */
  scene?: ShotScene;
  /** "cut" snaps camera parameters on entry; "continuous" (same-subject
   *  state change) eases them from the previous shot's values. */
  transitionIn: "cut" | "continuous";
  /** Human-readable story for debugging/tuning and for the commentary
   *  layer ("Storm flag carried…"). DESCRIPTIVE ONLY — never branch on
   *  its text; use `role`. */
  reason: string;
  /** What this shot is, for code that must decide how to treat it.
   *  Absent means "coverage". */
  role?: ShotRole;
  /**
   * What the shot is ABOUT, for the booth — set by the builder that
   * knows. The scene's topic reads this first, then the role; there is
   * no parsing of `reason`.
   */
  topic?: SceneTopic;
  /** Spliced by the coverage pass to put a missed tier-1 event on
   *  camera (see assemble.ts cutInFor). */
  coverageCutIn?: boolean;
  /** A deliberate 2-3s cut (roster portraits): exempt from the normal
   *  minimum hold — rhythm, not flicker. */
  quickCut?: boolean;
}

/**
 * How a follow shot aims the orbit camera. "forward" sits behind the
 * subject looking along their movement (a shooter's view — see their
 * shots land); "backward" sits ahead looking back at the subject and
 * whoever is chasing them; "hold" keeps a fixed world bearing (e.g.
 * from a flag stand toward its incoming grabber). Omitted = slow
 * aimless orbit drift (establishing shots).
 */
export type ShotAim =
  | { mode: "forward" }
  | { mode: "backward" }
  | { mode: "hold"; yaw: number }
  /**
   * Sit on the far side of the subject from `target` and look across
   * them toward it — so the frame holds the subject AND what matters
   * beyond them (the crowd they're skiing into, the stand they're
   * capping at). Unlike "forward" this tracks a slowly-moving world
   * point instead of instantaneous velocity, which on a weaving skier
   * would leave the camera permanently mid-turn, staring at terrain.
   */
  | { mode: "toward"; target: DirectorVec3 };

/** Which flag or player a shot's camera is concerned with. */
export type ShotSubject =
  { type: "flag"; slot: number } | { type: "player"; targetId: number };

/**
 * One planned camera shot. Three mechanism kinds, riding the existing
 * follow/orbit machinery: followFlag/followPlayer drive the watchFollow
 * selection state (StreamingController positions the camera, inheriting
 * respawn re-lock and carrier hand-off); fixedOrbit is written directly
 * by DirectorController. Identities are flag slots and target ids — the
 * respawn/hand-off-stable keys the follow layer re-resolves per frame.
 */
export type Shot =
  | (ShotBase & {
      kind: "followFlag";
      slot: number;
      distance?: number;
      /** Closest this shot may ever ride, in world units. Staging's
       *  pull-in and the runtime's visibility rail both respect it —
       *  a shot whose POINT is the wide view (a grab dive, a capper
       *  closing on the stand) must not be squeezed into a portrait
       *  just because the geometry allows one. */
      minDistance?: number;
      pitch?: number;
      aim?: ShotAim;
    })
  | (ShotBase & {
      kind: "followPlayer";
      targetId: number;
      distance?: number;
      /** See followFlag.minDistance. */
      minDistance?: number;
      pitch?: number;
      aim?: ShotAim;
    })
  | (ShotBase & {
      kind: "fixedOrbit";
      center: DirectorVec3;
      radius: number;
      startAngle?: number;
      /** Radians per DEMO second (scales with playback rate, freezes on
       *  pause); 0 = stationary camera. */
      angularSpeed?: number;
      /** Camera height as a fraction of radius (steeper = overhead). */
      heightFactor?: number;
      /**
       * How far above `center` the lens actually looks, overriding the
       * rig's default. That default is two units — chosen for base
       * hardware, and roughly the top of a PLAYER's head, so a portrait
       * framed with it stares over its subject and leaves them sitting
       * at the bottom of the picture.
       */
      lookLift?: number;
      /**
       * Aim the (still fixed-position) camera at this subject's live
       * position instead of `center` — a locked-off camera with a slow
       * pan, so a subject that drifts from the predicted spot (a
       * dropped flag slides downhill) stays framed.
       */
      lookSubject?: ShotSubject;
      /**
       * When set, this shot is a DOORWAY watch: the point is inside an
       * interior (a turtled carrier's hold), and at apply time the
       * runtime finds a real opening by casting outward from it —
       * bearings that escape to open air or terrain instead of hitting
       * interior walls — then frames the mouth from outside. The
       * planner cannot see geometry; without this the "door" was
       * wherever the attackers happened to mass, often behind a hill.
       */
      doorwayOf?: DirectorVec3;
      /**
       * Geometry-solved placement, attached at plan time by stagePlan()
       * (which runs where the collision world is loaded). When present
       * the runtime applies it directly instead of searching for a
       * clear bearing at the cut.
       */
      staged?: StagedPlacement;
    })
  | (ShotBase & {
      /**
       * A slow lateral flyby along a fixed path, looking at a fixed
       * point — the roster-lineup shot used over a pre-match line-up,
       * where nobody is moving yet and an orbit has nothing to reveal.
       */
      kind: "sweep";
      from: DirectorVec3;
      to: DirectorVec3;
      target: DirectorVec3;
      /**
       * How long the move from `from` to `to` takes, in seconds. NOT
       * the on-air window: `endSec` is rewritten freely after the shot
       * is decided — sealed late when the next decision is slow, or
       * stretched to keep a streaming playhead covered — and scaling
       * the move to the window rewound the camera every time the
       * window grew. The move runs from `startSec` for this long and
       * then holds at its end.
       */
      moveSec: number;
      /** Set by the staging pass: this exact path was verified against
       *  geometry AND player visibility — the runtime must fly it
       *  as-is, never re-lift it (the old ends-visibility probe used to
       *  hoist verified low pans into the roof above the ranks). */
      pathSolved?: boolean;
      /** When set, the look-at pans from `target` to here across the
       *  shot — a dolly past a line of faces rather than a fixed stare. */
      targetTo?: DirectorVec3;
      /**
       * Intermediate waypoints. With these the camera flies a smooth
       * curve through them instead of a straight line — an establishing
       * fly-by that rises over a ridge and settles again, rather than a
       * ruler line drawn at the height of the tallest thing in the way.
       * Plan-time validation and the runtime sample the SAME curve.
       */
      via?: DirectorVec3[];
      /**
       * Steepest the camera may look DOWN mid-route, in radians. The
       * aim is raised toward the camera's own height where the slide
       * from `target` to `targetTo` would pitch it steeper — a fly-by
       * aiming at ground level from forty metres up stared at the
       * ground under it instead of the map going by. The ends are
       * exempt: the shot opens and arrives on what it is aimed at.
       */
      maxPitch?: number;
      /**
       * How the camera is paced along the path.
       *
       * `linear` is a true tracking shot: constant speed, no ramp at
       * either end. Film cuts INTO a pan already moving and OUT of it
       * still moving, and easing one gives it a beginning and an end it
       * is not supposed to have. `settle` eases in and decelerates onto
       * its subject (an establishing run that arrives somewhere);
       * `hold` gets up to speed and stays there, for a pass across a
       * rank that is cut while still travelling.
       */
      easing?: "linear" | "settle" | "hold";
      /**
       * The target is a HEADING, not a subject: an establishing flyover
       * aims at a point far ahead of itself to hold the horizon, and
       * nobody expects to "see" that point. Path validation checks such
       * a shot for camera clearance only — demanding visibility of a
       * look-ahead 300m out rejected every flyover on the map.
       */
      aimIsHeading?: boolean;
    })
  | (ShotBase & {
      /** Cinematic flying camera: trails the subject at a three-quarter
       *  angle with damped, eased motion — film-style, not a rigid
       *  orbit lock. Driven directly by DirectorController in freeFly. */
      kind: "dolly";
      subject: ShotSubject;
      /** Nominal trailing distance and height above the subject. */
      distance?: number;
      height?: number;
      /** Which side of the subject's path the camera rides. */
      side?: 1 | -1;
      /** Angle off the subject's tail, radians (default
       *  DOLLY_SIDE_ANGLE). Math.PI/2 rides level with them — the
       *  "tagging along" flight beside a capper. */
      sideAngle?: number;
      /**
       * A world point the camera should keep at its BACK — the map's
       * midpoint between the bases. The camera rides outside the subject
       * relative to it, so the shot is a profile with the action space
       * as background rather than a chase staring at empty map edge.
       */
      awayFrom?: DirectorVec3;
    });

/**
 * A fixedOrbit placement solved against real geometry at plan time,
 * verified across the shot's whole duration rather than at one instant.
 * Values are ABSOLUTE (not scales of the planned shot) so the runtime
 * applies them without re-deriving the planner's framing arithmetic.
 */
export interface StagedPlacement {
  /** Solved orbit bearing (the fixedOrbit angle convention). */
  angle: number;
  /** Solved standoff radius in world units. */
  radius: number;
  /** Solved camera lift as a fraction of radius (already capped). */
  liftFactor: number;
  /** Anchor override (surface-lifted out of terrain), Torque space. */
  anchor?: DirectorVec3;
  /** Fraction of sampled shot time the subject was visible from the
   *  solved eye (1 = never blocked). */
  visibility: number;
}

/** Guarantee-pass report row: one per tier-1 event. */
export interface CoverageRow {
  timeSec: number;
  description: string;
  covered: boolean;
  by?: string;
}

/**
 * The director's plan. Everything a consumer reads is promised by
 * `CastPlan`; the assignability check below is what keeps the two from
 * drifting — a shot field renamed here without the contract following
 * fails to compile.
 */
export interface ShotPlan {
  contractVersion: CastPlan["contractVersion"];
  gameMode: "ctf" | "rabbit" | "deathmatch" | "landmarks";
  /**
   * Dead air at the head of the recording worth jumping over — a long
   * team-picking period before the whistle, where players trickle in
   * and nothing happens. The director seeks here when it starts rather
   * than making the viewer sit through it. Undefined when the demo
   * opens straight into play.
   */
  skipToSec?: number;
  /**
   * Flag state sampled on CHANGE, independent of camera cuts — see
   * buildFlagTimeline. Scene flag state is one snapshot per shot and
   * shots run to 20s, so a live consumer reading between cuts was
   * describing state up to 12s stale.
   */
  flagTimeline?: { timeSec: number; flags: SceneFlagState[] }[];
  /** Time-ordered, non-overlapping, covering [0, durationSec]. */
  shots: Shot[];
  coverage: CoverageRow[];
  /** Present on plans from current scans; the commentary generator
   *  requires it (its only input is the cast.json). */
  matchFacts?: MatchFacts;
  /** The map as a venue, once the world has arrived. */
  venue?: Venue;
}

/** Compile-time only: the plan the director writes IS a CastPlan. */
type PlanConformsToContract = ShotPlan extends CastPlan ? true : never;
export const PLAN_CONFORMS_TO_CONTRACT: PlanConformsToContract = true;
