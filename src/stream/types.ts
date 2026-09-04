import type { ParsedData } from "t2-demo-parser";
import type { SceneObject } from "../scene/types";

/** A mounted image in one of 8 ShapeBase image slots. The mount bone
 *  comes from the image datablock's mountPoint field, not the slot index. */
export interface ImageSlot {
  shapeName: string;
  mountPoint: number;
  dataBlockId: number;
  skinName?: string;
}

/** DTS animation thread state from ghost ThreadMask data. */
export interface ThreadState {
  index: number;
  sequence: number;
  state: number;
  forward: boolean;
  atEnd: boolean;
}

export interface WeaponImageState {
  dataBlockId: number;
  triggerDown: boolean;
  ammo: boolean;
  loaded: boolean;
  target: boolean;
  wet: boolean;
  fireCount: number;
}

export interface WeaponImageDataBlockState {
  name: string;
  transitionOnLoaded: number;
  transitionOnNotLoaded: number;
  transitionOnAmmo: number;
  transitionOnNoAmmo: number;
  transitionOnTarget: number;
  transitionOnNoTarget: number;
  transitionOnWet: number;
  transitionOnNotWet: number;
  transitionOnTriggerUp: number;
  transitionOnTriggerDown: number;
  transitionOnTimeout: number;
  timeoutValue?: number;
  waitForTimeout: boolean;
  fire: boolean;
  sequence?: number;
  spin: number;
  direction: boolean;
  scaleAnimation: boolean;
  loaded: number;
  /** AudioProfile datablock ID for the state's entry sound, or -1 if none. */
  soundDataBlockId: number;
}

export interface Keyframe {
  time: number;
  /** Position in Torque space [x, y, z]. */
  position: [number, number, number];
  /** Quaternion in Three.js space [x, y, z, w]. */
  rotation: [number, number, number, number];
  /** Camera FOV in degrees (camera entity keyframes only). */
  fov?: number;
  /** Velocity in Torque world space [x, y, z]. */
  velocity?: [number, number, number];
  /** Normalized health (0 = dead, 1 = full). Derived from ghost damageLevel. */
  health?: number;
  /** Normalized energy (0 = empty, 1 = full). Derived from ghost energyPercent. */
  energy?: number;
  /** Torque DamageState: 0 = Enabled, 1 = Disabled (dead), 2 = Destroyed. */
  damageState?: number;
  /** Action animation index from ghost ActionMask (indices >= 7 are non-table
   *  actions like death animations). */
  actionAnim?: number;
  /** True when the action animation has reached its final frame. */
  actionAtEnd?: boolean;
  /** The action holds its last frame until another arrives; otherwise
   *  the client ends it itself when the clip finishes. */
  actionHoldAtEnd?: boolean;
  /** Counts ActionMask updates: a re-sent action of the same index is
   *  a new one. */
  actionSeq?: number;
}

export interface TracerVisual {
  kind: "tracer";
  /** Main tracer streak texture (e.g. "special/tracer00"). */
  texture: string;
  /** Edge-on cross section texture (e.g. "special/tracercross"). */
  crossTexture?: string;
  tracerLength: number;
  tracerWidth: number;
  crossViewAng: number;
  crossSize: number;
  renderCross: boolean;
  /** Motion-blur tail (EnergyProjectile blur* fields) — an untextured
   *  additive ribbon along the bolt's recent path. */
  blur?: {
    lifetime: number;
    width: number;
    /** sRGB rgb; alpha fades with segment age. */
    color: { r: number; g: number; b: number };
  };
}

/**
 * Sniper-rifle laser beam (SniperProjectileData) — a camera-facing
 * ribbon between two fixed endpoints, drawn in two passes (binary-
 * verified in Tribes2.exe FUN_00642f60): the white core (textures[11])
 * and the beamColor-tinted pulse overlay whose texture steps through
 * the laserrip sequence as the beam fades.
 */
export interface BeamVisual {
  kind: "beam";
  /** sRGB beam color (the red pass tint). */
  color: { r: number; g: number; b: number };
  fadeTime: number;
  startWidth: number;
  endWidth: number;
  pulseSpeed: number;
  pulseLength: number;
  /** The datablock's 12 textures: [0] flare, [1] nonlingradient,
   *  [2..10] laserrip01-09, [11] the main beam (sniper00). */
  textures: string[];
}

export interface SpriteVisual {
  kind: "sprite";
  /** Sprite texture (e.g. "flarebase"). */
  texture: string;
  /** sRGB tint color from the datablock (e.g. flareColor). */
  color: { r: number; g: number; b: number };
  /** Billboard size in world units. */
  size: number;
}

/**
 * A beam linking two LIVE objects (ELF gun / repair beam): endpoints
 * re-derived every frame from the source's muzzle and the target's
 * position, unlike the sniper beam's fixed points. Binary-verified
 * render passes (ELF FUN_0064cff0, repair FUN_00645fc0): an additive
 * camera-facing ribbon whose U scrolls with age, plus an impact flare
 * billboard at the target — the ELF adds a bow through the shooter's
 * aim point and three jittered lightning ribbons.
 */
export interface LinkBeamVisual {
  kind: "linkBeam";
  variant: "elf" | "repair";
  /** Main ribbon texture (ELFBeam / redbump2). */
  texture: string;
  /** Impact flare at the target (BlueImpact / redflare). */
  flareTexture?: string;
  /** ELF only: the lightning ribbon texture. */
  lightningTexture?: string;
  /** TOTAL ribbon width in meters (elf 2x mainBeamWidth; repair 0.2). */
  width: number;
  /** Main ribbon alpha (repair 0.75, elf 1). */
  alpha: number;
  /** U scroll rate (mainBeamSpeed / beamSpeed). */
  scrollSpeed: number;
  /** Texture repeats per meter (mainBeamRepeat / texRepeat). */
  texRepeat: number;
  /** Impact flare size in meters (elf 0.5, repair 0.6). */
  flareSize: number;
  /** ELF lightning: ribbon width and jitter distance off the beam. */
  lightningWidth?: number;
  lightningDist?: number;
}

export type StreamVisual =
  TracerVisual | SpriteVisual | BeamVisual | LinkBeamVisual;

export interface StreamEntity {
  id: string;
  type: string;
  dataBlock?: string;
  visual?: StreamVisual;
  direction?: [number, number, number];
  /** Mounted image slots (0-7). Mount bone from dataBlock->mountPoint. */
  imageSlots?: (ImageSlot | undefined)[];
  /** Item/ShapeBase built-in dynamic light from datablock. */
  lightType?: number;
  lightColor?: [number, number, number, number];
  lightTime?: number;
  lightRadius?: number;
  lightOnlyStatic?: boolean;
  isStaticItem?: boolean;
  playerName?: string;
  /** The name as sent, color codes included — the official clan tag is
   *  the color-7 segments, the base name the color-6 ones. */
  playerRawName?: string;
  /** Target manager id backing this entity's target info, if any. */
  targetId?: number;
  /** How many times that id had been freed and reissued when this entity
   *  took it: the id plus this names one occupant, since ids are recycled. */
  targetGeneration?: number;
  /** Sensor group of the entity's target — the team number in stock T2. */
  teamId?: number;
  /** IFF color resolved from the sensor group color table (sRGB 0-255). */
  iffColor?: { r: number; g: number; b: number };
  /** Target render flags bitmask from the Target Manager. */
  targetRenderFlags?: number;
  ghostIndex?: number;
  /** Projectiles: the shooter's ghost index (packet sourceObject). */
  sourceGhostIndex?: number;
  /** Beam projectiles: Torque-space endpoints from the ghost
   *  (SniperProjectile initialPosition/endPos). */
  beamStart?: [number, number, number];
  beamEnd?: [number, number, number];
  /** Link beams (ELF/repair): live source and target entity ids,
   *  resolved from the ghost's sourceObject/targetObject indices. */
  linkSourceId?: string;
  linkTargetId?: string;
  className?: string;
  dataBlockId?: number;
  shapeHint?: string;
  /** Position in Torque space [x, y, z]. */
  position?: [number, number, number];
  /** Quaternion in Three.js space [x, y, z, w]. */
  rotation?: [number, number, number, number];
  /** Velocity in Torque world space [x, y, z]. */
  velocity?: [number, number, number];
  health?: number;
  energy?: number;
  actionAnim?: number;
  actionAtEnd?: boolean;
  /** The action holds its last frame until another arrives (see
   *  Keyframe.actionHoldAtEnd). */
  actionHoldAtEnd?: boolean;
  /** Counts ActionMask updates (see Keyframe.actionSeq). */
  actionSeq?: number;
  damageState?: number;
  /** ShapeBase fade value (0=invisible, 1=fully visible). Matches mFadeVal. */
  fadeVal?: number;
  /** Cloak level (0=visible, 1=fully cloaked). Separate from fadeVal so the
   *  renderer can apply the cloak texture effect. */
  cloakLevel?: number;
  faceViewer?: boolean;
  /** DTS animation thread states from ghost ThreadMask data. */
  threads?: ThreadState[];
  /** Numeric ID of the ExplosionData datablock (for particle effect resolution). */
  explosionDataBlockId?: number;
  /** Projectile has already detonated (client-side impact/expiry). The ghost
   *  entity may linger until the server's delete arrives — flight effects
   *  (trail, loop sound) must stop at the explosion, not at the delete. */
  hasExploded?: boolean;
  /** Numeric ID of the ParticleEmitterData for in-flight trail particles. */
  maintainEmitterId?: number;
  /** Weapon image condition flags from ghost ImageMask data. */
  weaponImageState?: WeaponImageState;
  /** Weapon image state machine states from the ShapeBaseImageData datablock. */
  weaponImageStates?: WeaponImageDataBlockState[];
  /** Entity ID of the object this entity is mounted on (vehicle, etc.). */
  mountObjectId?: string;
  /** Mount point node index on the mount target (0 = pilot). */
  mountNode?: number;
  /** Player skin (team skin like "base", "baseb"). */
  skinName?: string;
  /** Player preferred skin (chosen skin like "RandySavage"). */
  skinPrefName?: string;
  /** True when the player has no ground contact and is falling. */
  falling?: boolean;
  /** True when the player is using jetpack thrust. */
  jetting?: boolean;
  /** Head pitch for blend animations, normalized [-1,1]. -1 = max down, 1 = max up. */
  headPitch?: number;
  /** Head yaw for blend animations (freelook), normalized [-1,1]. -1 = max right, 1 = max left. */
  headYaw?: number;
  /** Arm blend animation action index from Player ghost (networked). */
  armAction?: number;
  /** ShapeBase sound slots (from ghost SoundMask). */
  soundSlots?: Array<{ index: number; playing: boolean; profileId?: number }>;
  /** WayPoint display label. */
  label?: string;
  // AudioEmitter ghost fields
  audioFileName?: string;
  audioVolume?: number;
  audioIs3D?: boolean;
  audioIsLooping?: boolean;
  audioMinDistance?: number;
  audioMaxDistance?: number;
  audioMinLoopGap?: number;
  audioMaxLoopGap?: number;
  /** WheeledVehicle per-wheel state. */
  wheels?: Array<{
    speed: number;
    lateralSlip: number;
    longitudinalSlip: number;
  }>;
  /** Vehicle steering angle (radians). */
  steeringYaw?: number;
  /** Vehicle frozen state (deployed). */
  frozen?: boolean;
  /** Vehicle max steering angle (radians). */
  maxSteeringAngle?: number;
  /** Scene infrastructure data (terrain, interior, sky, etc.). */
  sceneData?: SceneObject;
  /** Force field visual data from ForceFieldBareData datablock. */
  forceFieldData?: {
    textures: string[];
    color: [number, number, number];
    baseTranslucency: number;
    dimensions: [number, number, number];
    framesPerSec: number;
    scrollSpeed: number;
    umapping: number;
    vmapping: number;
  };
}

export interface StreamCamera {
  /** Timestamp in seconds for the current camera state. */
  time: number;
  /** Position in Torque space [x, y, z]. */
  position: [number, number, number];
  /** Quaternion in Three.js space [x, y, z, w]. */
  rotation: [number, number, number, number];
  fov: number;
  mode: "first-person" | "third-person" | "observer";
  controlEntityId?: string;
  orbitTargetId?: string;
  /** Orbit distance used for third-person camera positioning. */
  orbitDistance?: number;
  /** Vertical offset for orbit target (from VehicleData.cameraOffset). */
  orbitOffset?: number;
  /** Absolute control-object yaw in Torque radians (rotZ/rotationZ). */
  yaw?: number;
  /** Absolute control-object pitch in Torque radians (rotX/headX). */
  pitch?: number;
  /** Explicit orbit pullback direction in Three.js space (overrides yaw/pitch). */
  orbitDirection?: [number, number, number];
}

/** A colored text segment from inline \c color switching. */
export interface ChatSegment {
  text: string;
  /** Torque \c color index (0–9) from the GuiChatHudProfile fontColors palette. */
  colorCode: number;
}

/** One raw ServerMessage as broadcast: type + args with netstrings
 *  resolved (markup intact), stamped at the message's own time. */
export interface ServerMessageEvent {
  id: number;
  timeSec: number;
  msgType: string;
  args: string[];
}

export interface ChatMessage {
  id: number;
  timeSec: number;
  sender: string;
  text: string;
  kind: "chat" | "server";
  /**
   * Torque \c color index (0–9) from the GuiChatHudProfile fontColors palette.
   * 0=default/death, 1=join/drop, 2=gameplay/flags, 3=team chat, 4=global chat,
   * 6=player name, 7=tribe tag, 8=smurf name, 9=bot name.
   */
  colorCode?: number;
  /** Colored text segments for inline color switching in rendered text. */
  segments?: ChatSegment[];
  /** Audio file path from ~w tag (e.g. "fx/misc/flag_taken.wav"). */
  soundPath?: string;
  /** Pitch multiplier for voice chat (default 1.0). */
  soundPitch?: number;
}

export interface WeaponsHudSlot {
  /** HUD slot index (0–17), matching the $WeaponsHudData table. */
  index: number;
  /** Ammo count, or -1 for infinite (energy weapons). */
  ammo: number;
}

export interface TeamScore {
  teamId: number;
  name: string;
  score: number;
  playerCount: number;
  /** CTF flag state for this team's flag, from MsgCTFFlag* messages. */
  flagStatus?: "home" | "held" | "field";
  /**
   * The team's flag skin (lowercase), from the flag target's skin tag —
   * the target is named exactly the team name and outlives the flag item
   * ghost while carried. Stock CTF uses base/baseb; servers like Classic
   * use custom skins (beagle/dsword).
   */
  skinName?: string;
  /** Name of the player holding this team's flag, while flagStatus is
   *  "held" (from MsgCTFFlagTaken / MsgCTFAddTeam). */
  flagCarrier?: string;
}

export interface PlayerRosterEntry {
  clientId: number;
  name: string;
  /** Raw name preserving color-code bytes, for colored scoreboard display.
   *  Match/key on `name` (stripped); render `rawName` via parseColorSegments. */
  rawName: string;
  teamId: number;
  score: number;
  ping: number;
  packetLoss: number;
  /** Kills, from the end-of-match debrief (MsgDebriefAddLine); 0 until then. */
  kills?: number;
  /** The client's target id (MsgClientJoin arg %3) — exact join key to
   *  the entity that represents this client's player. */
  targetId?: number;
}

export interface BackpackHudState {
  /** Index into the $BackpackHudData table, or -1 if no pack. */
  packIndex: number;
  /** Whether the pack is currently activated/armed. */
  active: boolean;
  /** Optional text overlay (e.g. sensor pack counts). */
  text: string;
}

export interface InventoryHudSlot {
  /** Display slot (0=grenade, 1=mine, 2=beacon, 3=repairkit). */
  slot: number;
  /** Item count. */
  count: number;
}

export interface PendingAudioEvent {
  profileId: number;
  position?: { x: number; y: number; z: number };
  timeSec: number;
}

import type { ServerLoadInfo } from "../../relay/types";
export type { ServerLoadInfo };

export interface StreamSnapshot {
  timeSec: number;
  /**
   * When the server said the always-scoped ghost set was complete
   * (GhostingMessageEvent / GhostAlwaysDone), or null if it has not
   * said so yet.
   *
   * This is the protocol's own answer to "is the world here" — terrain,
   * interiors, flags, generators, every piece of base hardware. Anything
   * that needs the whole map should wait for it rather than guess from
   * what has turned up so far: a map whose only landmarks are flags
   * would never satisfy such a guess.
   */
  ghostAlwaysDoneSec: number | null;
  exhausted: boolean;
  camera: StreamCamera | null;
  entities: StreamEntity[];
  controlPlayerGhostId?: string;
  /** Recording player's sensor group (team number). */
  playerSensorGroup: number;
  status: { health: number; energy: number; heat: number };
  chatMessages: ChatMessage[];
  /** Raw ServerMessage feed (netstring-resolved args), for consumers
   *  that parse game events themselves — see directorEventScanner. */
  serverEvents: ServerMessageEvent[];
  /** One-shot audio events from Sim3DAudioEvent / Sim2DAudioEvent. */
  audioEvents: PendingAudioEvent[];
  /** Weapons HUD state from inventory RemoteCommandEvents. */
  weaponsHud: {
    /** Weapon slots present in the player's inventory, in HUD index order. */
    slots: WeaponsHudSlot[];
    /** Currently active (selected) HUD slot index, or -1 if none. */
    activeIndex: number;
  };
  /** Backpack/pack HUD state from RemoteCommandEvents. */
  backpackHud: BackpackHudState | null;
  /** Inventory HUD state (grenades, mines, beacons, repair kits). */
  inventoryHud: {
    slots: InventoryHudSlot[];
    activeSlot: number;
  };
  /** Team scores aggregated from the PLAYERLIST demoValues section. */
  teamScores: TeamScore[];
  /** Player roster from MsgClientJoin / MsgPlayerScore messages. */
  playerRoster: PlayerRosterEntry[];
  /** Client ID of the connected/recording player, for highlighting in roster. */
  connectedClientId: number | null;
  /** Server-sent loading-screen text, complete once MsgLoadInfoDone
   *  arrives. Null when never received (e.g. demos recorded mid-mission). */
  loadInfo: ServerLoadInfo | null;
  /** Match clock value in milliseconds, mirroring HudClockCtrl's actualTimeMS.
   *  Negative = counting down (remaining time), positive = counting up (elapsed).
   *  Null if no clock has been set. Pauses/seeks with playback. */
  matchClockMs: number | null;
  /** Match-over interval: the gameOver debrief has arrived and the next
   *  mission's MsgClientReady hasn't. Drives the auto score screen. */
  matchEnded: boolean;
  /** The match has been seen running (MsgMissionStart or a running clock
   *  > 60 s); cleared when the next mission drops us in. */
  matchStarted: boolean;
}

/** One prefetchable asset; `name` is the game-file name (resolution to a
 *  URL and loader happens in the shape preloader). */
export interface PreloadAsset {
  kind: "shape" | "interior" | "terrain" | "texture";
  name: string;
}

export interface StreamingPlayback {
  reset(): void;
  getSnapshot(): StreamSnapshot;
  stepToTime(targetTimeSec: number, maxMoveTicks?: number): StreamSnapshot;
  /**
   * First playback time (seconds) with a scene to render — world geometry
   * plus a camera. ~0 for retail demos; a few seconds for from-connect
   * relay demos whose scene streams in. Steps the cursor forward.
   */
  findSceneReadyTime(maxSec?: number): number;
  /**
   * False while a progressive download is still feeding the stream —
   * an exhausted snapshot then means "buffering", not end-of-demo.
   * Absent (undefined) on sources without a download, e.g. live.
   */
  readonly streamComplete?: boolean;
  /**
   * Demo time buffered so far in seconds (exact, from move-tick
   * counting). Absent on sources without a download, e.g. live.
   */
  readonly bufferedSec?: number;
  /** DTS shape names for weapon effects (explosions) that should be preloaded. */
  getEffectShapes(): string[];
  /**
   * Prioritized prefetch list for this session, scene geometry first:
   * the terrain file, interior GLBs, and TSStatic shapes detected from
   * scene entities, followed by DTS shapes from datablock categories
   * certain to render (player armors, held weapon/pack images, items,
   * static shapes). Order is priority — the prefetcher drains from the
   * front; everything else loads on demand at first sight.
   */
  getPreloadAssets(): PreloadAsset[];
  /** Resolve a datablock by its numeric ID. */
  getDataBlockData(id: number): ParsedData | undefined;
  /**
   * Get TSShapeConstructor sequence entries for a shape (e.g. "heavy_male.dts").
   * Returns the raw sequence strings like `"heavy_male_root.dsq root"`.
   */
  getShapeConstructorSequences(shapeName: string): string[] | undefined;

  // ── Mission info (populated from server messages) ──
  /** Mission display name (e.g. "Riverdance"), from MsgMissionDropInfo. */
  missionDisplayName: string | null;
  /** Game type display name (e.g. "Capture the Flag"), from MsgMissionDropInfo. */
  missionTypeDisplayName: string | null;
  /** Game class name (e.g. "CTFGame"), from MsgClientReady. */
  gameClassName: string | null;
  /** Server name, from MsgMissionDropInfo. */
  serverDisplayName: string | null;
  /** Server-assigned name of the connected/recording player, from MsgClientJoin. */
  connectedPlayerName: string | null;
  /** Called when any mission info field changes. */
  onMissionInfoChange?: () => void;
}

export interface StreamRecording {
  /** "demo" for .rec file playback, "live" for live server observation. */
  source: "demo" | "live";
  duration: number;
  /** Mission name (e.g. "S5-WoodyMyrk"). */
  missionName: string | null;
  /** Game type display name (e.g. "Capture the Flag"). */
  gameType: string | null;
  /** Server display name. */
  serverDisplayName: string | null;
  /** Name of the player who recorded the demo. */
  recorderName: string | null;
  /** Recording date string (e.g. "May-4-2025 10:37PM"). */
  recordingDate: string | null;
  /** Streaming parser session for tick-driven playback. */
  streamingPlayback: StreamingPlayback;
}
