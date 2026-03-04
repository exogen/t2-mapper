export interface DemoThreadState {
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

export interface DemoKeyframe {
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

export interface DemoTracerVisual {
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

export interface DemoSpriteVisual {
  kind: "sprite";
  /** Sprite texture (e.g. "flarebase"). */
  texture: string;
  /** sRGB tint color from the datablock (e.g. flareColor). */
  color: { r: number; g: number; b: number };
  /** Billboard size in world units. */
  size: number;
}

export type DemoVisual = DemoTracerVisual | DemoSpriteVisual;

export interface DemoEntity {
  id: number | string;
  type: string;
  dataBlock?: string;
  visual?: DemoVisual;
  /** Projectile forward direction in Torque space [x, y, z]. */
  direction?: [number, number, number];
  /** Ghost index for streamed entities (debug/inspection). */
  ghostIndex?: number;
  /** Ghost class name for streamed entities (debug/inspection). */
  className?: string;
  /** Last seen datablock object id (debug/inspection). */
  dataBlockId?: number;
  /** Datablock-derived shape hint, if any (debug/inspection). */
  shapeHint?: string;
  /** Time (seconds) when this entity enters ghost scope. */
  spawnTime?: number;
  /** Time (seconds) when this entity leaves ghost scope. */
  despawnTime?: number;
  keyframes: DemoKeyframe[];
  /** DTS animation thread states from ghost ThreadMask data. */
  threads?: DemoThreadState[];
  /** Weapon shape file name for Player entities (e.g. "weapon_disc.dts"). */
  weaponShape?: string;
  /** Player name resolved from the target system string table. */
  playerName?: string;
  /** IFF color resolved from the sensor group color table (sRGB 0-255). */
  iffColor?: { r: number; g: number; b: number };
  /** Weapon image condition flags from ghost ImageMask data. */
  weaponImageState?: WeaponImageState;
  /** Weapon image state machine states from the ShapeBaseImageData datablock. */
  weaponImageStates?: WeaponImageDataBlockState[];
  /** Head pitch for blend animations, normalized [-1,1]. -1 = max down, 1 = max up. */
  headPitch?: number;
  /** Head yaw for blend animations (freelook), normalized [-1,1]. -1 = max right, 1 = max left. */
  headYaw?: number;
}

export interface DemoRecording {
  duration: number;
  /** Mission name as it appears in the demo (e.g. "S5-WoodyMyrk"). */
  missionName: string | null;
  /** Game type display name from the demo (e.g. "Capture the Flag"). */
  gameType: string | null;
  /** Streaming parser session used for Move-tick-driven playback. */
  streamingPlayback: DemoStreamingPlayback;
}

export interface DemoStreamEntity {
  id: string;
  type: string;
  dataBlock?: string;
  visual?: DemoVisual;
  direction?: [number, number, number];
  weaponShape?: string;
  playerName?: string;
  /** IFF color resolved from the sensor group color table (sRGB 0-255). */
  iffColor?: { r: number; g: number; b: number };
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
  faceViewer?: boolean;
  /** DTS animation thread states from ghost ThreadMask data. */
  threads?: DemoThreadState[];
  /** Numeric ID of the ExplosionData datablock (for particle effect resolution). */
  explosionDataBlockId?: number;
  /** Numeric ID of the ParticleEmitterData for in-flight trail particles. */
  maintainEmitterId?: number;
  /** Weapon image condition flags from ghost ImageMask data. */
  weaponImageState?: WeaponImageState;
  /** Weapon image state machine states from the ShapeBaseImageData datablock. */
  weaponImageStates?: WeaponImageDataBlockState[];
  /** Head pitch for blend animations, normalized [-1,1]. -1 = max down, 1 = max up. */
  headPitch?: number;
  /** Head yaw for blend animations (freelook), normalized [-1,1]. -1 = max right, 1 = max left. */
  headYaw?: number;
}

export interface DemoStreamCamera {
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
  /** Absolute control-object yaw in Torque radians (rotZ/rotationZ). */
  yaw?: number;
  /** Absolute control-object pitch in Torque radians (rotX/headX). */
  pitch?: number;
}

/** A colored text segment from inline \c color switching. */
export interface ChatSegment {
  text: string;
  /** Torque \c color index (0–9) from the GuiChatHudProfile fontColors palette. */
  colorCode: number;
}

export interface DemoChatMessage {
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

export interface DemoStreamSnapshot {
  timeSec: number;
  exhausted: boolean;
  camera: DemoStreamCamera | null;
  entities: DemoStreamEntity[];
  controlPlayerGhostId?: string;
  /** Recording player's sensor group (team number). */
  playerSensorGroup: number;
  status: { health: number; energy: number };
  chatMessages: DemoChatMessage[];
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
}

export interface DemoStreamingPlayback {
  reset(): void;
  getSnapshot(): DemoStreamSnapshot;
  stepToTime(targetTimeSec: number, maxMoveTicks?: number): DemoStreamSnapshot;
  /** DTS shape names for weapon effects (explosions) that should be preloaded. */
  getEffectShapes(): string[];
  /** Resolve a datablock by its numeric ID. */
  getDataBlockData(id: number): Record<string, unknown> | undefined;
}
