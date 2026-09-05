/**
 * THE CAST CONTRACT: what a cast.json promises to whoever reads it.
 *
 * The director writes a plan; the commentary generator (the CastGenius
 * repo) reads it and nothing else. This module is the whole of what
 * crosses that boundary — every field a consumer may rely on, with a
 * description that says what it MEANS, because the descriptions are
 * the consumer's documentation: `npm run cast:export-schema` turns this
 * file into a JSON Schema, and CastGenius turns that into its types, a
 * validator, and the field guide its language model reads.
 *
 * So the JSDoc here is written for that reader: meaning, units, frame
 * of reference, and what not to do with a value. A camera-internal
 * field (how a sweep is paced, where an orbit was staged) does not
 * belong here; those live on the director's own Shot types and are
 * free to change.
 *
 * Bump CAST_CONTRACT_VERSION whenever a consumer would read an existing
 * field differently. Adding an optional field is not a bump.
 *
 * This module imports nothing: it is the leaf of the director's
 * dependency graph.
 */

/**
 * The version of this contract a plan was written against. A consumer
 * whose schema declares a different number must refuse the plan.
 */
export const CAST_CONTRACT_VERSION = 1;

/**
 * What kind of story a shot tells — the coarse tag for a commentator.
 * lineup: a pass along a rank of players before the match, standing
 * frozen; names are read. pick-up: one player who has just been
 * assigned to a team, before the match. kickoff: the match has just
 * started. flag-run: a flag is being
 * carried. flag-stand: coverage of a flag stand — defence, an incoming
 * run, a grab. capture: a capture has just landed or is about to.
 * aftermath: the moments after a capture. turtle: a carrier holed up
 * with the enemy flag, waiting. kill: a kill worth a look. raid: an
 * attack on base assets (generators, stations, turrets). bombardment:
 * mortars raining on a position. vehicle: a vehicle at work. suit-up:
 * players at the inventory stations choosing loadouts. lull: nothing
 * happening — the cue to talk about the match. base: a look at a base
 * or a piece of its hardware with no story attached — before the
 * match this is the tour that fills time while teams are picked, and
 * nothing in it is happening. action: fighting with no flag at stake.
 */
export type SceneTopic =
  | "lineup"
  | "pick-up"
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

/**
 * Where a player sits in the picture, as the camera was PLANNED. The
 * running camera corrects itself a little, so treat this as
 * approximate: good enough for "back right", not for pixel placement.
 */
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

/** A player in view during a shot. */
export interface ScenePlayer {
  /** Spoken display name, clan tag removed. Say it exactly as given. */
  name: string;
  /** The game's id for this player. Never spoken. */
  targetId: number;
  /** Team name, or null for an observer. */
  team: string | null;
  /** Armor class, once they have suited up. Absent before that. */
  armor?: "light" | "medium" | "heavy";
  /** The player-model skin they are wearing. */
  skin?: string;
  /** Mounted backpack ("energy pack", "shield pack", "mortar turret
   *  barrel", …) — often the clearest tell of a player's job. */
  pack?: string;
  /** Clan tag, separated from the spoken name. Colour only; never
   *  re-attach it to the name. */
  clan?: string;
  /**
   * The player this shot is OF, as opposed to one who happens to be in
   * view. A follow shot names its subject outright, so a commentator
   * never has to guess from proximity. Name this player first.
   */
  focus?: boolean;
  /** Metres from the shot's anchor — the point the camera is centred
   *  on. Never spoken as a figure. */
  dist: number;
  /** Compass bearing from the shot's anchor to the player. */
  bearing: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
  /** Where they sit in the picture. Absent when the camera bearing was
   *  not knowable when the shot was planned. */
  frame?: FramePosition;
  /** What they are doing right now, read from the same signals the
   *  director used to choose the shot. "inbound" means a player who has
   *  already grabbed off the enemy stand this match is running at it
   *  again: a grab attempt is coming. A first-timer on the same run is
   *  not marked — nobody knows yet whether they are going for the flag
   *  or the base. */
  doing?:
    | "carrying the flag"
    | "chasing the carrier"
    | "posted on defense"
    | "firing mortars"
    | "suiting up"
    | "skiing"
    | "fighting"
    | "inbound";
  /** With "inbound": seconds until they reach the stand at their
   *  current speed. A grab attempt is likely inside it, and a line
   *  longer than that gets cut off by the grab call — size the line
   *  by it. Never spoken as a figure. */
  etaSec?: number;
  /** Flags taken OFF THE ENEMY STAND so far this match, when any. A
   *  player with grabs is a capper: the one whose run at a stand is
   *  worth a word, and whose grab count is fair colour ("his third
   *  grab tonight"). Absent means none yet. */
  standGrabs?: number;
  /** Captures so far this match, when any. */
  caps?: number;
  /** Speed in kph, the in-game speedometer's units: ~145+ is skiing
   *  well, ~250+ is coming in hot, under ~70 is crawling. Still
   *  changing while a line airs — describe it, never quote it. */
  speed?: number;
  /** Health percent, 100 = full. Same rule: describe, never quote. */
  health?: number;
  /** Which way they are headed relative to the two bases — the only
   *  ground truth for "pouring out" or "heading in" calls. */
  moving?:
    | "into their own base"
    | "out of their base"
    | "toward the enemy base"
    | "back toward their base";
}

/** One canned voice line over global chat. */
export interface SceneChatter {
  /** Demo time in seconds. Never spoken. */
  timeSec: number;
  kind: "taunt" | "cheer" | "compliment";
  /** Spoken-name form. */
  name: string;
  team?: string;
  /** The line as the game prints it, e.g. "Aww, that's too bad!". */
  text: string;
}

/** Something that happened during (or just before) a shot. */
export interface SceneEvent {
  /** Demo time in seconds. Never spoken. */
  timeSec: number;
  /**
   * kill: a player died to another. grab: a flag taken — off its stand
   * or picked up loose; `detail` says which. drop: a carrier lost the
   * flag; `dropKind` says how. cap: a flag captured. return: a flag
   * sent home. structure-destroyed / structure-repaired: a piece of
   * BASE hardware (generator, inventory station, vehicle station, base
   * turret, base sensor) went down or came back. raid: deployables
   * (clamp and spike turrets, motion and pulse sensors, deployable
   * inventories) destroyed, rolled up into one event per team per
   * shot — `count` says how many, `detail` what kinds; these are never
   * listed one by one. near-miss: a carrier killed short of the
   * capture. skill-shot: a mid-air or a sniper headshot, announced by
   * the game itself. teamkill: a player killed a TEAMMATE at the worst
   * moment — carrying the flag, or on the enemy stand about to grab.
   */
  type:
    | "kill"
    | "grab"
    | "drop"
    | "cap"
    | "return"
    | "structure-destroyed"
    | "structure-repaired"
    | "raid"
    | "near-miss"
    | "skill-shot"
    | "teamkill";
  /**
   * How much this matters, 0 to 3, judged by the same facts the
   * director used. 3: a flag play — a grab, a capture, a pass, a
   * carrier or their killer involved, a near-miss, a teamkill that
   * cost a flag play. 2: worth a line — a return, a drop, a skill
   * shot, a kill at a flag stand, base hardware down or back, a raid
   * of three or more deployables. 1: background — a routine kill away
   * from the flags, a small raid, a repair. 0: noise. Call what is 3,
   * mention what is 2, fold 1 into the picture, ignore 0.
   */
  weight: 0 | 1 | 2 | 3;
  /** Raid events: how many of that team's deployables went down in the
   *  last thirty seconds — the size of the raid, not of this shot. */
  count?: number;
  /** A factual one-liner saying WHAT happened, never WHO: "MID-AIR disc
   *  kill, 84m", "carrier died 32m from the capture", "grabbed the
   *  Storm flag off the stand — it was home". Players appear only in
   *  `actors`. */
  detail: string;
  /** Who was involved and how ("killer", "victim", "carrier", …), in
   *  spoken-name form. The only place names appear. */
  actors: { name: string; role: string }[];
  /** Kill events: the weapon. A weapon named with a vehicle ("shrike
   *  blaster") is the vehicle's gun; "impact" or "collision" means the
   *  victim was run over. */
  weapon?: string;
  /** Kill events: the shot connected with an airborne target — the
   *  game's signature skill shot. Only a true value is a mid-air. */
  midair?: boolean;
  /** Drop events: how the carrier lost it. "died" — killed holding it;
   *  "thrown" — a deliberate toss with nobody to receive; "pass" —
   *  thrown to a teammate, or picked up by one. Follow this exactly. */
  dropKind?: "died" | "thrown" | "pass";
  /** Cap events: seconds the capturer carried the flag before scoring. */
  holdSec?: number;
  /** Which team owns the thing that happened — the base a destroyed
   *  structure belongs to. Without it a commentator cannot tell whose
   *  defence just fell. */
  team?: string;
  /** Which team's flag a flag play concerns. Two carriers can be
   *  running opposite flags at the same time. */
  flagTeam?: string;
  /** Whether the CAMERA could see this happen. Kills are only listed
   *  when they were visible; flag plays are listed regardless, so a
   *  grab, drop or return marked false happened off-camera and is
   *  context, not something the viewer watched. A capture is always
   *  true: it decides the match and is called either way. */
  onScreen?: boolean;
}

/** The state of one flag at the moment the shot was described. */
export interface SceneFlagState {
  /** The flag's slot number. Never spoken. */
  slot: number;
  /** The team whose flag this is. */
  team: string;
  /** "home" — on its stand; "carried" — in someone's hands; "dropped"
   *  — lying loose in the field. */
  status: "home" | "carried" | "dropped";
  /** Spoken name of the carrier, when carried. */
  carrier?: string;
  /** Metres from its own stand; 0 means it is home. */
  distFromHome: number;
  /** When carried: metres the carrier still has to cover to score.
   *  Around 250 or more is "a long way to go". Changing while a line
   *  airs — never spoken as a figure. */
  distToCapture?: number;
  /** Set when the flag is lying in a liquid. Water is harmless; lava
   *  and quicksand are lethal ground that changes who can go and get
   *  it. */
  liquid?: "water" | "lava" | "quicksand";
  /**
   * FUTURE KNOWLEDGE: how this possession eventually resolves. A live
   * commentator must not know this; it is removed before the model
   * sees the scene.
   */
  future?: { outcome: "cap" | "return"; atSec: number };
}

/**
 * What a shot SHOWS, as facts rather than prose.
 *
 * Structured all the way down: no rendered sentence lives here. The
 * commentary layer composes its own line from this at whatever moment
 * it is speaking.
 */
export interface ShotScene {
  topic: SceneTopic;
  /** Consecutive shots telling one story share an id (a whole capture
   *  ceremony, a chunked stand battle). Commentators narrate scenes,
   *  not cuts: never restart the conversation because the camera cut
   *  within the same sequence. */
  sequenceId: string;
  /** Everyone in view, nearest to the camera first. */
  players: ScenePlayer[];
  /** What happened during the shot, in time order. */
  events: SceneEvent[];
  /** Both flags, as of this shot. For state BETWEEN cuts read the
   *  plan's `flagTimeline` instead — a shot can run twenty seconds and
   *  this snapshot goes stale. */
  flags: SceneFlagState[];
  /** The score, decoded to CAPTURES per team. The game's raw scoreboard
   *  number is 100 × caps + grabs; this is already the cap count, so
   *  say it as it stands. After a cap it already includes that cap. */
  score?: { team: string; score: number }[];
  /**
   * Seconds left on the MATCH CLOCK as this shot begins, from the
   * game's own clock. Null when the clock is counting up or not set.
   * Say it rounded — "about ten minutes left" — never to the second;
   * it is moving while a line airs.
   */
  clockRemainingSec?: number | null;
  /** Captures by each team in the last five minutes — the momentum of
   *  the match, as opposed to its score. */
  recentCaps?: { team: string; caps: number }[];
  /** The top scorers on the server as of this shot, from the game's
   *  own scoreboard; who is carrying each team. */
  topScorers?: { name: string; team: string | null; score: number }[];
  /**
   * Voice binds fired over global chat during the shot — taunts,
   * cheers and compliments, wherever the speaker is. Filler at most:
   * "Slush taunting in the chat there", or "players celebrating in
   * the chat" when several cheer at once. Worth a line a couple of
   * times a match when nothing else is happening, never over a play.
   */
  chatter?: SceneChatter[];
  /**
   * Players running at the enemy flag stand as the shot begins,
   * nearest first, whether or not the camera has them — a grab call
   * cuts across whatever is being said, whichever shot is up. `etaSec`
   * is seconds to the stand at their speed AT THE SHOT'S START: subtract
   * the time into the shot. Never spoken as a figure.
   */
  inbound?: { name: string; team: string; etaSec: number }[];
}

/**
 * One shot of the broadcast, as a consumer sees it. The director's own
 * shot objects carry camera geometry as well; none of that is part of
 * the contract, and a consumer must ignore fields not listed here.
 */
export interface CastShot {
  /** The camera move: following a flag or a player, a fixed orbit, a
   *  sweep along a path, or a film-style dolly. */
  kind: "followFlag" | "followPlayer" | "fixedOrbit" | "sweep" | "dolly";
  /** Demo time the shot starts, in seconds. */
  startSec: number;
  /** Demo time the shot ends. Shots are contiguous: the next starts
   *  here. */
  endSec: number;
  /** A human-readable description of the shot ("Storm flag carried —
   *  chasing the run home"). Descriptive only: never branch on its
   *  text, use `role` and `scene.topic`. */
  reason: string;
  /**
   * What the shot is, for code that must treat kinds of shot
   * differently. Absent means ordinary in-match coverage. coverage:
   * ordinary in-match coverage. rosterWide: a wide pass ACROSS a
   * standing group of players. rosterCloseUp: a tight pan on a knot of
   * players. signing: a player being assigned to a team. establishing:
   * the opening run across the map from one flag stand to the other,
   * taken the moment both teams have a player — the broadcast opens
   * over it. tourHold: holding on a piece of map hardware. tourMove:
   * travelling past a landmark, or between two of them. quiet: a
   * deliberate resting shot.
   */
  role?:
    | "coverage"
    | "rosterWide"
    | "rosterCloseUp"
    | "signing"
    | "establishing"
    | "tourHold"
    | "tourMove"
    | "quiet";
  /** The facts of what the shot shows. */
  scene?: ShotScene;
}

/**
 * Match facts embedded in the plan so the commentary generator can run
 * from cast.json ALONE. Time-series values resolve as "the last entry
 * with timeSec <= t".
 */
export interface MatchFacts {
  /** The map's file name. Prefer `missionDisplayName` on air. */
  missionName: string | null;
  /** The map's name as the game shows it. */
  missionDisplayName: string | null;
  /** The game type as the server reports it ("CTF", "LakRabbit", …). */
  gameType: string | null;
  /** The server's name: the venue. */
  serverDisplayName: string | null;
  /** Length of the recording in seconds. Not the match clock. */
  durationSec: number;
  /** Demo time the match started, or null if the recording joined it
   *  already running. */
  matchStartSec: number | null;
  /** Demo time the match ended, or null. Never use it to derive time
   *  remaining: read `clock`. */
  matchEndSec: number | null;
  teams: { teamId: number; name: string }[];
  /** Full score vector, pushed on any team-score change. RAW scoreboard
   *  numbers (100 × caps + grabs); divide by 100 for captures. */
  scores: {
    timeSec: number;
    teams: { teamId: number; score: number }[];
  }[];
  /**
   * Connected-player counts and top scorers, pushed on any count change
   * and refreshed at least every 30s. `count` includes observers — it
   * is the number a server browser shows.
   */
  roster: {
    timeSec: number;
    count: number;
    /** Players who have picked a side. */
    assigned: number;
    /** Still in observer. Before a match this is the only honest gauge
     *  of how close the start is: an emptying observer list means soon. */
    observers: number;
    scorers: { name: string; teamId: number; score: number }[];
  }[];
  /**
   * THE MATCH CLOCK, sampled from the game's own HUD clock: negative
   * counts DOWN to the end of the match, positive counts UP. Empty
   * before any clock is set. The only correct source of "time
   * remaining" — the recording's length and `matchEndSec` both know
   * the future. Sampled on re-anchor and at least every 30s, so the
   * clock at any instant is the last entry at or before it plus the
   * time since.
   */
  clock: { timeSec: number; clockMs: number }[];
  /** When the recording first SAW the match running. If this is later
   *  than a few seconds in, the recording joined a match in progress:
   *  open with "we're already under way", not a countdown. */
  matchSeenRunningSec: number | null;
  /** When the map had fully arrived from the server. Internal. */
  worldCompleteSec?: number | null;
}

/** One kind of base hardware, counted for ONE side. */
export interface VenueHardware {
  /** "generator", "inventory station", "base turret", "large pulse
   *  sensor", "vehicle station", … */
  kind: string;
  /** How many of them each base has. */
  count: number;
  /** How many of those sit below the terrain — in a basement or a
   *  bunker, reachable only through the base. */
  underground: number;
}

/**
 * The map as a venue: what each base is made of and how far apart the
 * flags sit. Known before the whistle, so the booth can talk about
 * where it is while the teams are picked. The two bases mirror each
 * other, so hardware is counted for one side.
 */
export interface Venue {
  /** Straight-line distance between the two flag stands, in metres. */
  flagDistanceM: number;
  /** Rough size from that distance: small around 500m, medium around
   *  1000m, large around 1500m, very large beyond. */
  size: "small" | "medium" | "large" | "very large";
  /** How many of the flag stands sit below the terrain. */
  flagStandsUnderground: number;
  /** Each base's hardware. A kind that is absent is simply not listed
   *  — no vehicle station means no vehicles on this map. */
  hardwarePerBase: VenueHardware[];
  /** Force fields on the whole map — doors and screens a base is built
   *  around; zero is not a fact worth a line. */
  forceFields: number;
}

/** A cast: the shot list plus everything needed to talk over it. */
export interface CastPlan {
  /** The contract version this plan was written against. */
  contractVersion: typeof CAST_CONTRACT_VERSION;
  gameMode: "ctf" | "rabbit" | "deathmatch" | "landmarks";
  /**
   * Dead air at the head of the recording worth jumping over — a long
   * team-picking period before the whistle. The player seeks here when
   * it starts. Absent when the recording opens straight into play.
   */
  skipToSec?: number;
  /**
   * Flag state sampled on every CHANGE, independent of camera cuts. A
   * live consumer reading between cuts should read this, not the
   * per-shot snapshot, which can be up to twenty seconds old.
   */
  flagTimeline?: { timeSec: number; flags: SceneFlagState[] }[];
  /** Time-ordered, non-overlapping, covering the whole recording. */
  shots: CastShot[];
  /** Present on every current plan; the commentary generator requires
   *  it. */
  matchFacts?: MatchFacts;
  /** The map as a venue. Absent until the world has arrived. */
  venue?: Venue;
}
