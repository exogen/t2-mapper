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
}

/** A base structure's damageState change (0 = Enabled, 1 = Disabled,
 *  2 = Destroyed) — the only observer-visible signal for generator and
 *  turret kills, which have no broadcast chat message. */
export interface StructureTransition {
  timeSec: number;
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
    name: string;
    displayName?: string;
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

// ── Commentary scene shapes ──
//
// The structured, factual description of what a shot shows, attached by
// the planner's final pass (scene.ts) and consumed by the LLM
// commentator. Defined HERE because Shot carries one — types.ts is the
// leaf of the director dependency DAG and must import no sibling.

/** What kind of story a shot tells — the coarse tag for a commentator. */
export type SceneTopic =
  | "lineup"
  | "kickoff"
  | "flag-run"
  | "flag-stand"
  | "capture"
  | "aftermath"
  | "turtle"
  | "kill"
  | "raid"
  | "bombardment"
  | "vehicle"
  | "suit-up"
  | "lull"
  | "base"
  | "action";

/** Rough screen position, from the PLANNED camera (runtime corrections
 *  make this approximate — good enough for "actionswanson back right"). */
export type FramePosition =
  | "front left"
  | "front center"
  | "front right"
  | "mid left"
  | "mid center"
  | "mid right"
  | "back left"
  | "back center"
  | "back right"
  | "offscreen";

export interface ScenePlayer {
  name: string;
  targetId: number;
  team: string | null;
  armor?: "light" | "medium" | "heavy";
  skin?: string;
  /** Mounted backpack ("energy pack", "shield pack", "mortar turret
   *  barrel", …) — often the clearest tell of a player's job. */
  pack?: string;
  /** Clan tag (official color-delimited, or the typed "=USA=" style),
   *  separated from the spoken name. */
  clan?: string;
  /** Metres from the shot's anchor and a compass bearing from it. */
  dist: number;
  bearing: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
  /** Rough position in the expected frame (110° hFOV from the PLANNED
   *  camera; runtime corrections make this approximate). Absent when
   *  the camera bearing isn't knowable at plan time. */
  frame?: FramePosition;
  /** What they are doing, from the same signals shot selection reads. */
  doing?:
    | "carrying the flag"
    | "chasing the carrier"
    | "posted on defense"
    | "firing mortars"
    | "suiting up"
    | "skiing"
    | "fighting"
    | "inbound";
  /** Speed in u/s — ~40+ reads as skiing, ~70+ is coming in hot. */
  speed?: number;
  /** Which way they're headed, relative to the bases — the ground truth
   *  for "pouring out" vs "heading in" style calls. */
  moving?:
    | "into their own base"
    | "out of their base"
    | "toward the enemy base"
    | "back toward their base";
}

export interface SceneEvent {
  timeSec: number;
  type:
    | "kill"
    | "grab"
    | "drop"
    | "cap"
    | "return"
    | "structure-destroyed"
    | "structure-repaired"
    | "near-miss"
    | "skill-shot"
    | "teamkill";
  /** Factual one-liner: "MID-AIR disc kill, 84m" / "carrier died 32m
   *  from the capture". */
  detail: string;
  actors: { name: string; role: string }[];
  weapon?: string;
  midair?: boolean;
  /** Drop events: died / thrown / pass (see DirectorEvent.dropKind). */
  dropKind?: "died" | "thrown" | "pass";
}

export interface SceneFlagState {
  slot: number;
  team: string;
  status: "home" | "carried" | "dropped";
  carrier?: string;
  /** Metres from its home stand (0 = at the stand). */
  distFromHome: number;
  /** Carrier's remaining distance to a capture, when carried. */
  distToCapture?: number;
  /**
   * FUTURE KNOWLEDGE — how this possession resolves. Quarantined so a
   * live commentator can skip it; a broadcast-style one may foreshadow.
   */
  future?: { outcome: "cap" | "return"; atSec: number };
}

export interface ShotScene {
  /** Factual one-or-two sentence summary of what the shot shows. */
  summary: string;
  topic: SceneTopic;
  /** Consecutive shots telling one story share an id (a whole capture
   *  ceremony, a chunked stand battle) — commentators narrate scenes,
   *  not cuts. */
  sequenceId: string;
  players: ScenePlayer[];
  events: SceneEvent[];
  flags: SceneFlagState[];
  score?: { team: string; score: number }[];
}

interface ShotBase {
  startSec: number;
  endSec: number;
  /** Structured commentary metadata, attached by the planner's final
   *  pass (scene.ts). Facts for an LLM commentator; future knowledge
   *  quarantined under `flags[].future`. */
  scene?: ShotScene;
  /** "cut" snaps camera parameters on entry; "continuous" (same-subject
   *  state change) eases them from the previous shot's values. */
  transitionIn: "cut" | "continuous";
  /** Human-readable story for debugging/tuning ("Storm flag carried…"). */
  reason: string;
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
      pitch?: number;
      aim?: ShotAim;
    })
  | (ShotBase & {
      kind: "followPlayer";
      targetId: number;
      distance?: number;
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
      /** When set, the look-at pans from `target` to here across the
       *  shot — a dolly past a line of faces rather than a fixed stare. */
      targetTo?: DirectorVec3;
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
      /**
       * A world point the camera should keep at its BACK — the map's
       * midpoint between the bases. The camera rides outside the subject
       * relative to it, so the shot is a profile with the action space
       * as background rather than a chase staring at empty map edge.
       */
      awayFrom?: DirectorVec3;
    });

/** Guarantee-pass report row: one per tier-1 event. */
export interface CoverageRow {
  timeSec: number;
  description: string;
  covered: boolean;
  by?: string;
}

export interface ShotPlan {
  gameMode: "ctf" | "rabbit" | "deathmatch" | "landmarks";
  /**
   * Dead air at the head of the recording worth jumping over — a long
   * team-picking period before the whistle, where players trickle in
   * and nothing happens. The director seeks here when it starts rather
   * than making the viewer sit through it. Undefined when the demo
   * opens straight into play.
   */
  skipToSec?: number;
  /** Time-ordered, non-overlapping, covering [0, durationSec]. */
  shots: Shot[];
  coverage: CoverageRow[];
}
