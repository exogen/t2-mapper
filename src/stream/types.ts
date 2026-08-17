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

export type StreamVisual = TracerVisual | SpriteVisual;

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
  /** Target manager id backing this entity's target info, if any. */
  targetId?: number;
  /** Sensor group of the entity's target — the team number in stock T2. */
  teamId?: number;
  /** IFF color resolved from the sensor group color table (sRGB 0-255). */
  iffColor?: { r: number; g: number; b: number };
  /** Target render flags bitmask from the Target Manager. */
  targetRenderFlags?: number;
  ghostIndex?: number;
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
  teamId: number;
  score: number;
  ping: number;
  packetLoss: number;
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

/**
 * Loading-screen content the server sends to every joining client
 * (loadingGui.cs sendLoadInfoToClient) — the same MissionInfo text our
 * local map library parses from the .mis, but authoritative for the
 * server's copy of the map. Lines are Torque GUI markup.
 */
export interface ServerLoadInfo {
  quoteLines: string[];
  objectiveLines: string[];
  rulesLines: string[];
}

export interface StreamSnapshot {
  timeSec: number;
  exhausted: boolean;
  camera: StreamCamera | null;
  entities: StreamEntity[];
  controlPlayerGhostId?: string;
  /** Recording player's sensor group (team number). */
  playerSensorGroup: number;
  status: { health: number; energy: number; heat: number };
  chatMessages: ChatMessage[];
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
}

export interface StreamingPlayback {
  reset(): void;
  getSnapshot(): StreamSnapshot;
  stepToTime(targetTimeSec: number, maxMoveTicks?: number): StreamSnapshot;
  /** DTS shape names for weapon effects (explosions) that should be preloaded. */
  getEffectShapes(): string[];
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
