// Imported from the module rather than the `../scene` barrel: the
// barrel re-exports misToScene, which pulls the entire TorqueScript
// runtime (15 modules and a 0.2MB generated parser) into every
// consumer. The demo/live path takes its scene objects from GHOSTS
// and never interprets a line of TorqueScript.
import { ghostToSceneObject } from "../scene/ghostToScene";
import type { SceneObject } from "../scene/types";
import {
  buildLinearSegment,
  linearSegmentPosition,
  stepBallistic,
  type LinearSegment,
} from "../collision/projectilePhysics";
import { castWorldRay } from "../collision/worldCollision";
import { isPointSubmergedSimple } from "../collision/waterLevel";
import {
  linearProjectileClassNames,
  ballisticProjectileClassNames,
  seekerProjectileClassNames,
  worldAlignedProjectileClassNames,
  toEntityType,
  allocateEntityId,
  GhostMessage,
  IFF_GREEN,
  IFF_RED,
  TICK_DURATION_MS,
} from "./entityClassification";
import {
  clamp,
  MAX_PITCH,
  CameraMode_OrbitObject,
  yawPitchToQuaternion,
  playerYawToQuaternion,
  torqueQuatToThreeJS,
  matrixFToThreeJSQuat,
  torqueQuatHeading,
  torqueQuatPitch,
  isValidPosition,
  isVec3Like,
  isQuatLike,
  resolveShapeName,
  getNumberField,
  isTruthyField,
  resolveTracerVisual,
  resolveBoltVisual,
  resolveBeamVisual,
  resolveLinkBeamVisual,
  resolveShockLanceVisual,
  resolveSpriteVisual,
  parseWeaponImageStates,
  stripTaggedStringMarkup,
  detectColorCode,
  extractWavTag,
  detectControlObjectType,
  resolveNetString as resolveNetStringHelper,
  formatRemoteArgs as formatRemoteArgsHelper,
  formatRemoteArgsColored,
  parseColorSegments,
  orientationAlongDirection,
} from "./streamHelpers";
import type { Vec3 } from "./streamHelpers";
import {
  advanceForceField,
  forceFieldAlpha,
  forceFieldPositionForState,
} from "./forceFieldState";
import {
  LoadInfoCollector,
  decodeTeamAdd,
  decodeFlagEvent,
  applyScoreHudToRoster,
  applyDebriefRowToRoster,
} from "../../relay/serverMessageDecode";
import type {
  ServerLoadInfo,
  BackpackHudState,
  ChatSegment,
  ChatMessage,
  ImageSlot,
  ThreadState,
  StreamVisual,
  StreamCamera,
  StreamEntity,
  StreamSnapshot,
  StreamingPlayback,
  PreloadAsset,
  InventoryHudSlot,
  PendingAudioEvent,
  PlayerRosterEntry,
  TeamScore,
  WeaponsHudSlot,
  ServerMessageEvent,
  StreamForceFieldData,
  LightAnchor,
} from "./types";
import {
  explosionExplodeTicks,
  explosionLifetimeTicks,
  resolveExplosionTiming,
} from "./explosionLifetime";
import { getShapeSequenceDurationSec } from "./shapeSequences";
import { getShapeBounds } from "./shapeBounds";
import { DEFAULT_WORLD_GRAVITY, worldGravityToMS2 } from "./worldGravity";
import type {
  ParsedData,
  GhostAlwaysObjectEventData,
  NetStringEventData,
  TargetInfoEventData,
  SetSensorGroupEventData,
  SensorGroupColorEventData,
  RemoteCommandEventData,
  Sim3DAudioEventData,
  Sim2DAudioEventData,
  GhostingMessageEventData,
} from "t2-demo-parser";
import { createLogger } from "../logger";

const log = createLogger("StreamEngine");

/**
 * Raw ServerMessage ring for self-parsing consumers. Sized for the
 * bursts that land between two snapshots: a catch-up's buffered live
 * packets replayed at once, or a full-roster join sweep.
 */
const MAX_SERVER_EVENTS = 2000;

/** Scratch segment end for advanceItems' swept casts (not retained). */
const _itemCastEnd: [number, number, number] = [0, 0, 0];

export type { Vec3 };

// ── Internal mutable entity type ──

export interface MutableEntity {
  id: string;
  ghostIndex: number;
  className: string;
  /** Move tick when this ghost instance first entered scope. */
  spawnTick: number;
  type: string;
  dataBlockId?: number;
  shapeHint?: string;
  dataBlock?: string;
  visual?: StreamVisual;
  direction?: [number, number, number];
  /** Mounted image slots (0-7). Each has shape, mount bone from datablock. */
  imageSlots?: (ImageSlot | undefined)[];
  playerName?: string;
  /** The name as sent, color codes included (see targetRawNames). */
  playerRawName?: string;
  /** Generation of `targetId` when this entity took it (see
   *  targetGenerations). */
  targetGeneration?: number;
  /** Player skin (team skin like "base", "baseb"). */
  skinName?: string;
  /** Player preferred skin override (chosen skin like "RandySavage"). */
  skinPrefName?: string;
  position?: [number, number, number];
  rotation: [number, number, number, number];
  velocity?: [number, number, number];
  health?: number;
  energy?: number;
  maxEnergy?: number;
  actionAnim?: number;
  actionAtEnd?: boolean;
  /** The action holds its last frame until the server sends another
   *  (death poses, sitting); otherwise the client returns to its own
   *  movement animation when the clip ends — table actions are never
   *  sent, so nothing else would end it (Tribes2.exe FUN_005d5bc0). */
  actionHoldAtEnd?: boolean;
  /** Counts ActionMask updates, so a re-sent action of the same index
   *  (the PDA opened twice) reads as a new one. */
  actionSeq?: number;
  armAction?: number;
  damageState?: number;
  targetId?: number;
  projectilePhysics?: "linear" | "ballistic" | "seeker";
  /** Shooter's ghost index from the projectile packet (sourceObject —
   *  the engine transmits who fired every projectile). */
  sourceGhostIndex?: number;
  simulatedVelocity?: [number, number, number];
  gravityMod?: number;
  /** Ticks since the projectile left the muzzle (seeded from currTick). */
  projAgeTicks?: number;
  /** LinearProjectileData activateDelayMS: the projectile's shape plays
   *  its "activate" sequence once this old, then loops "maintain"
   *  (binary-verified, FUN_0062e010 / FUN_0062ee40). */
  projActivateDelayMS?: number;
  /** Beam projectiles: Torque-space endpoints from the ghost. */
  beamStart?: [number, number, number];
  beamEnd?: [number, number, number];
  /** Link beams (ELF/repair): the target's ghost index. */
  linkTargetGhostIndex?: number;
  /** ShockLanceProjectile: whether the bolt pinned to its target. */
  beamHit?: boolean;
  /** Precomputed flight segment for linear projectiles (Torque model:
   *  one static-world raycast at spawn, closed-form position per tick). */
  linearSegment?: LinearSegment;
  /** Grenade-family bounce parameters resolved from the datablock. */
  projElasticity?: number;
  projFriction?: number;
  /** Tick after which contact explodes instead of bouncing. */
  projArmedTick?: number;
  explosionShape?: string;
  hasExploded?: boolean;
  isExplosion?: boolean;
  expiryTick?: number;
  /** Engine lifetime (ms) of a spawned explosion entity (see explosionLifetime.ts). */
  explosionLifetimeMS?: number;
  /** How far into that lifetime the explosion was when it exploded (its delayMS). */
  explosionStartAgeMS?: number;
  /** Stream time (getTimeSec) at explode(): the renderer's animation origin. */
  explosionSpawnSec?: number;
  faceViewer?: boolean;
  /** Explosion datablock's faceViewer, stashed for spawnExplosion — NOT this entity's. */
  explosionFaceViewer?: boolean;
  explosionDataBlockId?: number;
  maintainEmitterId?: number;
  sensorGroup?: number;
  threads?: ThreadState[];
  falling?: boolean;
  jetting?: boolean;
  headPitch?: number;
  headYaw?: number;
  targetRenderFlags?: number;
  /** Ghost index of the object this entity is mounted on (vehicle, etc.).
   *  When set, the entity's rendered position is derived from the mount
   *  target's transform, not from its own ghost position. */
  mountObjectGhostIndex?: number;
  /** Mount point node on the mount target (0 = pilot, 1+ = passenger/turret). */
  mountNode?: number;
  /** ShapeBase sound slots (4 max). Raw ghost SoundMask data — components
   *  manage PositionalAudio objects directly, matching Tribes 2's approach. */
  soundSlots?: Array<{ index: number; playing: boolean; profileId?: number }>;
  /** ShapeBase fade value (0=invisible, 1=fully visible). Matches mFadeVal. */
  fadeVal?: number;
  /** Active fade animation state. Set when CloakMask fading=true. */
  fadeState?: { fadeOut: boolean; fadeTime: number; elapsed: number };
  /** Whether the cloak is active (mCloaked). */
  cloaked?: boolean;
  /** Cloak level (0=visible, 1=fully cloaked). Interpolated client-side
   *  at rate dt*2 per tick (0.5s transition). Binary-verified. */
  cloakLevel?: number;
  /** Item mStatic flag (from InitialUpdateMask). Static items (flags at
   *  flagstand) skip all physics in Item::processTick. */
  isStaticItem?: boolean;
  /** Item/ShapeBase built-in dynamic light from datablock. */
  lightType?: number;
  lightColor?: [number, number, number, number];
  lightTime?: number;
  lightRadius?: number;
  lightOnlyStatic?: boolean;
  lightAnchor?: LightAnchor;

  /** Item velocity interpolation state. The client simulates full physics
   *  (gravity, collision, bounce) for non-static, non-at-rest items. */
  itemPhysics?: {
    velocity: [number, number, number];
    atRest: boolean;
  };
  label?: string;
  audioFileName?: string;
  audioVolume?: number;
  audioIs3D?: boolean;
  audioIsLooping?: boolean;
  audioMinDistance?: number;
  audioMaxDistance?: number;
  audioMinLoopGap?: number;
  audioMaxLoopGap?: number;
  sceneData?: SceneObject;
  /** WheeledVehicle per-wheel state from ghost data. */
  wheels?: Array<{
    speed: number;
    lateralSlip: number;
    longitudinalSlip: number;
  }>;
  /** Vehicle steering angle (radians), from ghost data. */
  steeringYaw?: number;
  /** Vehicle frozen state (deployed MPB, etc.). */
  frozen?: boolean;
  /** Vehicle max steering angle (radians), from VehicleData datablock. */
  maxSteeringAngle?: number;
  /** Ghost scale in Three.js axis order (StaticShape PositionMask). */
  scale?: [number, number, number];
  /** ForceFieldBare mCurrState (see forceFieldState.ts). */
  forceFieldState?: number;
  /** ForceFieldBare mCurrPosition, ms along the fade. */
  forceFieldPosition?: number;
  /** Force field visual data extracted from ForceFieldBareData datablock. */
  forceFieldData?: StreamForceFieldData;
}

type RuntimeControlObject = {
  ghostIndex: number;
  data?: ParsedData;
  position?: Vec3;
};

/** Minimal interface for the parser registry (ghost/event class lookup). */
interface ParserRegistry {
  getGhostParser(classId: number): { name: string } | undefined;
  getEventParser(classId: number): { name: string } | undefined;
}

/** Minimal interface for ghost tracking (class name by ghost index). */
interface GhostTrackerLike {
  getGhost(ghostIndex: number): { className: string } | undefined;
  clear?(): void;
}

/** An explosion added (Explosion::onAdd) but still waiting on its delayMS. */
interface PendingExplosion {
  /** Tick of Explosion::onAdd (the lifetime clock starts here). */
  addTick: number;
  /** Tick at which explode() runs. */
  explodeTick: number;
  explosionDataBlockId: number;
  shape?: string;
  faceViewer: boolean;
  position: [number, number, number];
  lifetimeMS: number;
}

/**
 * Shared engine that processes parsed packet data (events, ghosts, control
 * object state) and maintains all game state. Subclasses provide the data
 * source: DemoParser blocks for demo playback, or PacketParser for live.
 */
export abstract class StreamEngine implements StreamingPlayback {
  // ── Parser infrastructure (set by subclass constructors) ──
  protected registry!: ParserRegistry;
  protected ghostTracker!: GhostTrackerLike;

  // ── Entities ──
  protected entities = new Map<string, MutableEntity>();
  protected entityIdByGhostIndex = new Map<number, string>();
  /** Incremented on structural entity changes (add/remove/create). */
  protected entityGeneration = 0;

  // ── Tick / time ──
  protected tickCount = 0;

  // ── Camera ──
  protected camera: StreamCamera | null = null;

  // ── Chat & audio ──
  protected chatMessages: ChatMessage[] = [];
  protected serverEvents: ServerMessageEvent[] = [];
  private serverEventIdCounter = 0;
  private _serverEventsGen = 0;
  private _serverEventsSnapshotGen = -1;
  private _serverEventsSnapshot: ServerMessageEvent[] = [];
  protected chatMessageIdCounter = 0;
  private _chatGen = 0;
  private _chatSnapshotGen = -1;
  private _chatSnapshot: ChatMessage[] = [];
  protected audioEvents: PendingAudioEvent[] = [];

  // ── Net strings ──
  protected netStrings = new Map<number, string>();

  // ── Target system ──
  protected targetNames = new Map<number, string>();
  /** Target names as sent, color codes included — the official clan
   *  tag is the color-7 segments, the base name the color-6 ones. */
  protected targetRawNames = new Map<number, string>();
  /** How many times each target id has been freed (TargetFreeEvent).
   *  Target ids are recycled, so an id plus its generation is what
   *  names one occupant. */
  protected targetGenerations = new Map<number, number>();
  protected targetSkins = new Map<number, string>();
  protected targetSkinPrefs = new Map<number, string>();
  protected targetTeams = new Map<number, number>();
  protected targetRenderFlags = new Map<number, number>();
  /** Deferred nameTag→targetId for TargetInfoEvents that arrived before their NetStringEvent. */
  protected pendingNameTags = new Map<number, number>();
  protected sensorGroupColors = new Map<
    number,
    Map<number, { r: number; g: number; b: number }>
  >();
  protected playerSensorGroup = 0;

  // ── Control object ──
  protected lastStatus = { health: 1, energy: 1, heat: 0 };
  /** Client-predicted energy for the control player (absolute units).
   *  Simulated per tick like the real client (jet drain in updateMove,
   *  recharge in processTick) and snapped by control-sync corrections. */
  protected predictedEnergy: number | null = null;
  /** Client-predicted heat signature (0..1). Binary-verified model from
   *  Tribes2.exe Player code: while jetting, updateMove raises heat by
   *  heatIncreasePerSec per second (full in 3s); when not jetting,
   *  processTick decays it by heatDecayPerSec per second (clear in 4s).
   *  Purely client-side — never corrected by the server. */
  protected predictedHeat = 0;
  /** mRechargeRate from the latest control sync (per-object, script-set). */
  protected controlRechargeRate = 0;
  /** Identity of the last control data whose correction we applied. */
  private lastEnergyCorrectionData: unknown = null;
  protected latestControl: RuntimeControlObject = { ghostIndex: -1 };
  protected controlPlayerGhostId?: string;
  protected lastControlType: "camera" | "player" = "camera";
  protected isPiloting = false;
  protected lastPilotGhostIndex?: number;
  protected lastVehicleHeading = 0;
  protected lastVehiclePitch = 0;
  protected lastVehicleOrbitDir?: [number, number, number];
  /** Vehicle velocity in Torque space (estimated from linMomentum/mass). */
  protected lastVehicleVelocity?: [number, number, number];
  /** Last known vehicle position in Torque space for extrapolation. */
  protected lastVehiclePos?: [number, number, number];
  protected firstPerson = true;
  protected lastCameraMode?: number;
  protected lastOrbitGhostIndex?: number;
  protected lastOrbitDistance?: number;
  protected latestFov = 90;

  // ── HUD state ──
  protected weaponsHud = { slots: new Map<number, number>(), activeIndex: -1 };
  protected backpackHud = { packIndex: -1, active: false, text: "" };
  protected inventoryHud = { slots: new Map<number, number>(), activeSlot: -1 };
  // Generation counters bumped by the on*Changed hooks when the underlying
  // state mutates, so buildCachedHudState() rebuilds only the derived arrays
  // that actually changed on each playback frame.
  private _teamScoresGen = 0;
  private _rosterGen = 0;
  private _weaponsHudGen = 0;
  private _inventoryHudGen = 0;
  private _hudCache: {
    weaponsHudGen: number;
    inventoryHudGen: number;
    teamScoresGen: number;
    rosterGen: number;
    backpackPackIndex: number;
    backpackActive: boolean;
    backpackText: string;
    weaponsHud: { slots: WeaponsHudSlot[]; activeIndex: number };
    inventoryHud: { slots: InventoryHudSlot[]; activeSlot: number };
    backpackHud: BackpackHudState | null;
    teamScores: TeamScore[];
    playerRoster: PlayerRosterEntry[];
  } | null = null;
  protected teamScores: TeamScore[] = [];
  protected playerRoster = new Map<
    number,
    {
      /** Markup-stripped name, for matching/keying. */
      name: string;
      /** Raw name with color-code bytes, for colored display (scoreboard). */
      rawName: string;
      targetId?: number;
      teamId: number;
      score: number;
      ping: number;
      packetLoss: number;
      kills?: number;
    }
  >();
  /** Stream time (seconds) when the clock was last set. */
  protected clockAnchorStreamSec: number | null = null;
  /** Duration in ms passed to setTime (0 = count-up, >0 = count-down). */
  protected clockDurationMs: number = 0;

  // ── Mission info (from server messages) ──
  /** Completed server loading-screen info (set on MsgLoadInfoDone). */
  serverLoadInfo: ServerLoadInfo | null = null;
  private loadInfo = new LoadInfoCollector((info) => {
    this.serverLoadInfo = info;
    this.onMissionInfoChange?.();
  });

  /** Mission display name (e.g. "Riverdance"), from MsgMissionDropInfo/MsgLoadInfo. */
  missionDisplayName: string | null = null;
  /** Game type display name (e.g. "Capture the Flag"), from MsgMissionDropInfo/MsgLoadInfo. */
  missionTypeDisplayName: string | null = null;
  /** Game class name (e.g. "CTFGame"), from MsgClientReady. */
  gameClassName: string | null = null;
  /** Match-over interval: set by the gameOver debrief burst, cleared when
   *  the next mission's MsgClientReady drops the player in. */
  matchEnded = false;
  /**
   * The match has been seen running: MsgMissionStart (countdown/start),
   * a running clock > 60 s, or a team with points on the board (late
   * joins — untimed servers never send a running clock). Cleared when
   * the next mission drops us in. Gates the auto score screen: some
   * servers send a debrief burst on join, which must not read as a
   * witnessed match end.
   */
  matchStarted = false;

  /** Team objectives only score once the match is running. */
  protected noteTeamScore(score: number): void {
    if (score > 0) this.matchStarted = true;
  }

  /** Server name from MsgMissionDropInfo. */
  serverDisplayName: string | null = null;
  /** Server-assigned name of the connected/recording player. */
  connectedPlayerName: string | null = null;
  /** Client ID of the connected player (from MsgClientJoin "Welcome" message). */
  connectedClientId: number | null = null;
  /** Called when mission info changes (mission name, game type, etc.). */
  onMissionInfoChange?: () => void;

  // ── Explosions ──
  /**
   * Never reset: renderers dedupe explosions (particles, impact sounds) by
   * id, so an id must not come back after a seek re-simulates the demo.
   */
  protected nextExplosionId = 0;
  /** Explosions added but still waiting on their delayMS. */
  protected pendingExplosions: PendingExplosion[] = [];
  /** setGravity() units (see worldGravity.ts); demo header or GravityEvent. */
  protected worldGravity = DEFAULT_WORLD_GRAVITY;

  // ── Abstract methods ──

  /** Resolve datablock data by numeric ID. */
  abstract getDataBlockData(id: number): ParsedData | undefined;

  /** Get TSShapeConstructor sequence entries for a shape name. */
  abstract getShapeConstructorSequences(
    shapeName: string,
  ): string[] | undefined;

  /** Get the current playback time in seconds. */
  protected abstract getTimeSec(): number;

  /** World gravity in m/s² (negative is down); −9.81 at the T2 default. */
  get gravity(): number {
    return worldGravityToMS2(this.worldGravity);
  }

  /**
   * Get camera yaw/pitch for this tick. Demo accumulates from move deltas;
   * live reads from server-provided rotation.
   */
  protected abstract getCameraYawPitch(data: ParsedData | undefined): {
    yaw: number;
    pitch: number;
  };

  /** DTS shape names for weapon effects that should be preloaded. */
  abstract getEffectShapes(): string[];
  /** Category-scoped shape names for getPreloadAssets (per data source). */
  protected abstract getPreloadShapeNames(): string[];

  /**
   * Prioritized prefetch list: the terrain file, interior GLBs, and
   * TSStatic shapes from scene entities come first (the world's biggest
   * visual chunks), then the category shapes. The prefetcher drains
   * from the front.
   */
  getPreloadAssets(): PreloadAsset[] {
    const assets: PreloadAsset[] = [];
    for (const entity of this.entities.values()) {
      const scene = entity.sceneData;
      if (!scene) continue;
      if (scene.className === "TerrainBlock" && scene.terrFileName) {
        assets.push({ kind: "terrain", name: scene.terrFileName });
        if (scene.detailTextureName) {
          assets.push({ kind: "texture", name: scene.detailTextureName });
        }
      } else if (scene.className === "InteriorInstance" && scene.interiorFile) {
        assets.push({ kind: "interior", name: scene.interiorFile });
      } else if (scene.className === "TSStatic" && scene.shapeName) {
        assets.push({ kind: "shape", name: scene.shapeName });
      }
    }
    // Explosion shapes next: few and small, and the explosion lifetime is
    // read from the loaded shape's ambient sequence (shapeSequences.ts), as
    // ExplosionData::preload makes it available to the engine.
    for (const name of this.getEffectShapes()) {
      assets.push({ kind: "shape", name });
    }
    for (const name of this.getPreloadShapeNames()) {
      assets.push({ kind: "shape", name });
    }
    return assets;
  }

  // ── Ghost/entity resolution (shared, uses registry + ghostTracker) ──

  protected resolveGhostClassName(
    ghostIndex: number,
    classId: number | undefined,
  ): string | undefined {
    if (typeof classId === "number") {
      const fromClassId = this.registry.getGhostParser(classId)?.name;
      if (fromClassId) return fromClassId;
    }
    const entityId = this.entityIdByGhostIndex.get(ghostIndex);
    if (entityId) {
      const entity = this.entities.get(entityId);
      if (entity?.className) return entity.className;
    }
    const trackerGhost = this.ghostTracker.getGhost(ghostIndex);
    if (trackerGhost?.className) return trackerGhost.className;
    return undefined;
  }

  protected resolveEntityIdForGhostIndex(
    ghostIndex: number,
  ): string | undefined {
    const byMap = this.entityIdByGhostIndex.get(ghostIndex);
    if (byMap) return byMap;
    // Ghost exists but has no ID yet — allocate one.
    const trackerGhost = this.ghostTracker.getGhost(ghostIndex);
    if (trackerGhost) {
      const id = allocateEntityId();
      this.entityIdByGhostIndex.set(ghostIndex, id);
      return id;
    }
    return undefined;
  }

  // ── StreamingPlayback interface ──

  abstract reset(): void;
  abstract getSnapshot(): StreamSnapshot;
  abstract stepToTime(
    targetTimeSec: number,
    maxMoveTicks?: number,
  ): StreamSnapshot;

  /** Live streams are always at the present; demo playback overrides this
   *  to skip a from-connect recording's black lead-in. */
  findSceneReadyTime(_maxSec?: number): number {
    return 0;
  }

  // ── Shared reset logic ──

  /** Clear all entity state (entities, ghost→ID map, generation).
   *  Called on full reset and on GhostingMessageEvent (mission change).
   *  Does NOT reset the ID counter — IDs must never be reused to avoid
   *  stale entity collisions in the render store after seeks. */
  /** See StreamSnapshot.ghostAlwaysDoneSec. */
  protected ghostAlwaysDoneSec: number | null = null;

  protected clearAllEntities(): void {
    // A reset invalidates every ghost, so the world is incomplete again
    // until the server says otherwise.
    this.ghostAlwaysDoneSec = null;
    this.entities.clear();
    this.entityIdByGhostIndex.clear();
    this.entityGeneration++;
  }

  protected resetSharedState(): void {
    this._hudCache = null;
    this.serverLoadInfo = null;
    this.loadInfo.reset();
    this.clearAllEntities();
    this.tickCount = 0;
    this.camera = null;
    this.chatMessages = [];
    this.chatMessageIdCounter = 0;
    this._chatGen = 0;
    this._chatSnapshotGen = -1;
    this._chatSnapshot = [];
    // The id counter deliberately survives resets so consumers' seen-id
    // dedupe never collides across a rebuild.
    this.serverEvents = [];
    this._serverEventsGen = 0;
    this._serverEventsSnapshotGen = -1;
    this._serverEventsSnapshot = [];
    this.audioEvents = [];
    this.netStrings.clear();
    this.targetNames.clear();
    this.targetRawNames.clear();
    this.targetGenerations.clear();
    this.targetSkins.clear();
    this.targetSkinPrefs.clear();
    this.targetTeams.clear();
    this.targetRenderFlags.clear();
    this.sensorGroupColors.clear();
    this.playerSensorGroup = 0;
    this.lastStatus = { health: 1, energy: 1, heat: 0 };
    this.predictedEnergy = null;
    this.predictedHeat = 0;
    this.controlRechargeRate = 0;
    this.lastEnergyCorrectionData = null;
    this.latestControl = { ghostIndex: -1 };
    this.controlPlayerGhostId = undefined;
    this.lastControlType = "camera";
    this.isPiloting = false;
    this.lastPilotGhostIndex = undefined;
    this.lastVehicleHeading = 0;
    this.lastVehiclePitch = 0;
    this.lastVehicleOrbitDir = undefined;
    this.lastVehicleVelocity = undefined;
    this.lastVehiclePos = undefined;
    this.firstPerson = true;
    this.lastCameraMode = undefined;
    this.lastOrbitGhostIndex = undefined;
    this.lastOrbitDistance = undefined;
    this.latestFov = 90;
    this.weaponsHud = { slots: new Map(), activeIndex: -1 };
    this.backpackHud = { packIndex: -1, active: false, text: "" };
    this.inventoryHud = { slots: new Map(), activeSlot: -1 };
    this.teamScores = [];
    this.playerRoster.clear();
    this.clockAnchorStreamSec = null;
    this.clockDurationMs = 0;
    this.matchEnded = false;
    this.matchStarted = false;
    this.pendingExplosions = [];
    this.worldGravity = DEFAULT_WORLD_GRAVITY;
    this.missionDisplayName = null;
    this.missionTypeDisplayName = null;
    this.gameClassName = null;
    this.serverDisplayName = null;
    // Note: connectedPlayerName and connectedClientId are NOT cleared here —
    // they are connection-level state set once from the "Welcome" MsgClientJoin,
    // and should persist across mission changes.
  }

  // ── Net string resolution ──

  protected resolveNetString(s: string): string {
    return resolveNetStringHelper(s, this.netStrings);
  }

  protected formatRemoteArgs(template: string, args: string[]): string {
    return formatRemoteArgsHelper(template, args, this.netStrings);
  }

  // ── Control object processing ──

  protected processControlObject(gameState: {
    controlObjectGhostIndex?: number;
    controlObjectData?: ParsedData;
    compressionPoint?: Vec3;
    cameraFov?: number;
  }): void {
    const controlData = gameState.controlObjectData;
    const prevControl = this.latestControl;
    const nextGhostIndex =
      typeof gameState.controlObjectGhostIndex === "number"
        ? gameState.controlObjectGhostIndex
        : prevControl.ghostIndex;
    const compressionPoint = gameState.compressionPoint;
    // When piloting a vehicle, the player's writePacketData skips position
    // (binary-verified: mounted check at Player::writePacketData). The
    // controlData.position may be (0,0,0) or absent. Use compressionPoint
    // which is the vehicle position, updated every packet.
    const controlPosition =
      !this.isPiloting && isValidPosition(controlData?.position as Vec3)
        ? (controlData?.position as Vec3)
        : isValidPosition(compressionPoint)
          ? compressionPoint
          : prevControl.position;

    this.latestControl = {
      ghostIndex: nextGhostIndex,
      data: controlData,
      position: controlPosition,
    };

    if (nextGhostIndex !== prevControl.ghostIndex) {
      const entityId = this.entityIdByGhostIndex.get(nextGhostIndex);
      const entity = entityId ? this.entities.get(entityId) : undefined;
      if (entity?.sensorGroup != null && entity.sensorGroup > 0) {
        this.playerSensorGroup = entity.sensorGroup;
      }
    }

    if (controlData) {
      const detected = detectControlObjectType(controlData);
      if (detected) this.lastControlType = detected;

      if (this.lastControlType === "player") {
        this.isPiloting = !!(
          controlData.pilot || controlData.controlObjectGhost != null
        );
        if (
          this.isPiloting &&
          typeof controlData.controlObjectGhost === "number"
        ) {
          this.lastPilotGhostIndex = controlData.controlObjectGhost;
        } else if (!this.isPiloting) {
          this.lastPilotGhostIndex = undefined;
          this.lastVehicleHeading = 0;
          this.lastVehiclePitch = 0;
          this.lastVehicleOrbitDir = undefined;
          this.lastVehicleVelocity = undefined;
          this.lastVehiclePos = undefined;
        }
      } else {
        this.isPiloting = false;
        if (typeof controlData.cameraMode === "number") {
          this.lastCameraMode = controlData.cameraMode;
          if (controlData.cameraMode === CameraMode_OrbitObject) {
            if (typeof controlData.orbitObjectGhostIndex === "number") {
              this.lastOrbitGhostIndex = controlData.orbitObjectGhostIndex;
            }
            const minOrbit = controlData.minOrbitDist as number | undefined;
            const maxOrbit = controlData.maxOrbitDist as number | undefined;
            const curOrbit = controlData.curOrbitDist as number | undefined;
            if (
              typeof minOrbit === "number" &&
              typeof maxOrbit === "number" &&
              Number.isFinite(minOrbit) &&
              Number.isFinite(maxOrbit)
            ) {
              this.lastOrbitDistance = Math.max(0, maxOrbit - minOrbit);
            } else if (
              typeof curOrbit === "number" &&
              Number.isFinite(curOrbit)
            ) {
              this.lastOrbitDistance = Math.max(0, curOrbit);
            }
          } else {
            this.lastOrbitGhostIndex = undefined;
            this.lastOrbitDistance = undefined;
          }
        }
      }
    }

    if (gameState.cameraFov !== undefined) {
      this.latestFov = gameState.cameraFov;
    }
  }

  // ── Event processing ──

  protected processEvent(
    event: { classId: number; parsedData?: ParsedData },
    eventName: string | undefined,
  ): void {
    const data = event.parsedData;
    if (!data) return;
    const type = data.type as string | undefined;

    // GravityEvent: setGravity() on the server, and the current value on
    // connect. Everything that falls uses it.
    if (type === "GravityEvent") {
      if (typeof data.gravity === "number" && Number.isFinite(data.gravity)) {
        this.worldGravity = data.gravity;
      }
      return;
    }

    // GhostAlwaysObjectEvent — scope-always objects (terrain, sky, interiors).
    // These arrive as events, not ghost updates, but contain full ghost data.
    // Create entities from them so scene infrastructure renders.
    if (type === "GhostAlwaysObjectEvent") {
      const evt = data as GhostAlwaysObjectEventData;
      const ghostIndex = evt.ghostIndex;
      const classId = evt.classId;
      const objectData = evt.objectData;
      const hasData = evt.hasObjectData;
      const className =
        typeof classId === "number"
          ? (this.registry.getGhostParser(classId)?.name ??
            `classId=${classId}`)
          : "?";
      log.debug(
        "GhostAlwaysObjectEvent: ghost=%d class=%s hasData=%s %s",
        ghostIndex,
        className,
        hasData,
        objectData
          ? `keys=[${Object.keys(objectData).join(",")}]`
          : "(no data)",
      );
      if (ghostIndex != null && classId != null) {
        this.processGhostUpdate({
          index: ghostIndex,
          type: "create",
          classId,
          parsedData: objectData,
        });
      }
      return;
    }

    if (type === "NetStringEvent" || eventName === "NetStringEvent") {
      const evt = data as NetStringEventData;
      const id = evt.id;
      const value = evt.value;
      if (id != null && typeof value === "string") {
        this.netStrings.set(id, value);
        // Resolve any TargetInfoEvents that were waiting for this string.
        const pendingTargetId = this.pendingNameTags.get(id);
        if (pendingTargetId != null) {
          this.pendingNameTags.delete(id);
          const name = stripTaggedStringMarkup(value).trim();
          this.targetNames.set(pendingTargetId, name);
          this.targetRawNames.set(pendingTargetId, value);
          for (const entity of this.entities.values()) {
            if (entity.targetId === pendingTargetId) {
              entity.playerName = name;
              entity.playerRawName = value;
            }
          }
        }
      }
      return;
    }

    if (type === "TargetFreeEvent" || eventName === "TargetFreeEvent") {
      // The slot is free: whatever wears this id next is somebody else,
      // and nothing about the old holder (name, skin, team, flag bits)
      // may leak onto it — the re-issue's TargetInfoEvent starts clean.
      const targetId = (data as { targetId?: number }).targetId;
      if (targetId != null) {
        this.targetGenerations.set(
          targetId,
          (this.targetGenerations.get(targetId) ?? 0) + 1,
        );
        this.targetNames.delete(targetId);
        this.targetRawNames.delete(targetId);
        this.targetSkins.delete(targetId);
        this.targetSkinPrefs.delete(targetId);
        this.targetTeams.delete(targetId);
        this.targetRenderFlags.delete(targetId);
      }
      return;
    }

    if (type === "TargetInfoEvent" || eventName === "TargetInfoEvent") {
      const evt = data as TargetInfoEventData;
      const targetId = evt.targetId;
      const nameTag = evt.nameTag;
      if (targetId != null && nameTag != null) {
        const resolved = this.netStrings.get(nameTag);
        if (resolved) {
          this.targetNames.set(
            targetId,
            stripTaggedStringMarkup(resolved).trim(),
          );
          this.targetRawNames.set(targetId, resolved);
        } else {
          // NetStringEvent hasn't arrived yet — defer resolution.
          this.pendingNameTags.set(nameTag, targetId);
        }
      }
      const sensorGroup = evt.sensorGroup;
      if (targetId != null && sensorGroup != null) {
        this.targetTeams.set(targetId, sensorGroup);
      }
      const renderFlags = evt.renderFlags;
      if (targetId != null && renderFlags != null) {
        this.targetRenderFlags.set(targetId, renderFlags);
      }
      // Skin tags — resolve via net string table.
      const skinTag = evt.skinTag;
      if (targetId != null && skinTag != null && skinTag !== 0x400) {
        const resolved = this.netStrings.get(skinTag);
        if (resolved) this.targetSkins.set(targetId, resolved);
      }
      const skinPrefTag = evt.skinPrefTag;
      if (targetId != null && skinPrefTag != null && skinPrefTag !== 0x400) {
        const resolved = this.netStrings.get(skinPrefTag);
        if (resolved) this.targetSkinPrefs.set(targetId, resolved);
      }
      // Apply all known target info to existing entities.
      if (targetId != null) {
        const name = this.targetNames.get(targetId);
        const rawName = this.targetRawNames.get(targetId);
        const team = this.targetTeams.get(targetId);
        const rf = this.targetRenderFlags.get(targetId);
        const skin = this.targetSkins.get(targetId);
        const skinPref = this.targetSkinPrefs.get(targetId);
        for (const entity of this.entities.values()) {
          if (entity.targetId === targetId) {
            if (name) entity.playerName = name;
            if (rawName) entity.playerRawName = rawName;
            if (team != null) entity.sensorGroup = team;
            if (rf != null) entity.targetRenderFlags = rf;
            if (skin) entity.skinName = skin;
            if (skinPref) entity.skinPrefName = skinPref;
          }
        }
      }
      return;
    }

    if (type === "SetSensorGroupEvent" || eventName === "SetSensorGroupEvent") {
      const evt = data as SetSensorGroupEventData;
      const sg = evt.sensorGroup;
      if (sg != null) this.playerSensorGroup = sg;
      return;
    }

    if (
      type === "SensorGroupColorEvent" ||
      eventName === "SensorGroupColorEvent"
    ) {
      const evt = data as SensorGroupColorEventData;
      const sg = evt.sensorGroup;
      const colors = evt.colors;
      if (colors) {
        let map = this.sensorGroupColors.get(sg);
        if (!map) {
          map = new Map();
          this.sensorGroupColors.set(sg, map);
        }
        for (const c of colors) {
          if (c.default) {
            map.delete(c.index);
          } else {
            map.set(c.index, { r: c.r ?? 0, g: c.g ?? 0, b: c.b ?? 0 });
          }
        }
      }
      return;
    }

    // EndGhosting (message=2): the server called resetGhosting — all ghosts
    // are invalidated. The parser clears the ghost tracker; we clear entities.
    if (type === "GhostingMessageEvent") {
      const evt = data as GhostingMessageEventData;
      if (evt.message === GhostMessage.EndGhosting) {
        this.clearAllEntities();
      } else if (evt.message === GhostMessage.GhostAlwaysDone) {
        // The world is now all here. Consumers that need the whole map
        // — the director's free-space grid, for one — wait for this
        // rather than inferring it from what has arrived so far.
        this.ghostAlwaysDoneSec = this.getTimeSec();
      }
      return;
    }

    if (type === "RemoteCommandEvent" || eventName === "RemoteCommandEvent") {
      const evt = data as RemoteCommandEventData;
      const funcName = this.resolveNetString(evt.funcName);
      const args = evt.args;
      const timeSec = this.getTimeSec();

      if (funcName === "ChatMessage" && args.length >= 4) {
        // Preserve per-segment color: format the template + args WITHOUT
        // stripping color bytes, drop the trailing ~w sound cue, then split
        // into colored segments (mirrors the demo chat path). The sender's
        // clan color and any mid-message colors survive to the UI.
        const colored = extractWavTag(
          formatRemoteArgsColored(args[3], args.slice(4), this.netStrings),
        );
        const wavPath = colored.wavPath;
        const segments = parseColorSegments(colored.text);
        const fullText = segments.map((s) => s.text).join("");
        if (fullText.trim()) {
          const colonIdx = fullText.indexOf(": ");
          const sender = colonIdx >= 0 ? fullText.slice(0, colonIdx) : "";
          const displayText =
            colonIdx >= 0 ? fullText.slice(colonIdx + 2) : fullText;
          let soundPath: string | undefined;
          let soundPitch: number | undefined;
          if (wavPath) {
            const voice = this.resolveNetString(args[1]);
            soundPath = voice ? `voice/${voice}/${wavPath}.wav` : wavPath;
            const pitchStr = this.resolveNetString(args[2]);
            if (pitchStr) {
              const p = parseFloat(pitchStr);
              if (Number.isFinite(p))
                soundPitch = Math.max(0.5, Math.min(2.0, p));
            }
          }
          this.pushChatMessage({
            timeSec,
            sender,
            text: displayText,
            kind: "chat",
            colorCode: segments[0]?.colorCode ?? 0,
            segments,
            soundPath,
            soundPitch,
          });
        }
      } else if (funcName === "CannedChatMessage" && args.length >= 6) {
        const cannedColorCode = detectColorCode(this.resolveNetString(args[1]));
        const name = stripTaggedStringMarkup(this.resolveNetString(args[2]));
        const keys = stripTaggedStringMarkup(this.resolveNetString(args[4]));
        const rawText = this.formatRemoteArgs(args[1], args.slice(2));
        if (rawText) {
          const { wavPath } = extractWavTag(rawText);
          const voiceLine = extractWavTag(
            stripTaggedStringMarkup(this.resolveNetString(args[3])),
          ).text;
          let soundPath: string | undefined;
          let soundPitch: number | undefined;
          if (wavPath) {
            const voice = this.resolveNetString(args[5]);
            soundPath = voice ? `voice/${voice}/${wavPath}.wav` : wavPath;
            if (args[6]) {
              const p = parseFloat(this.resolveNetString(args[6]));
              if (Number.isFinite(p))
                soundPitch = Math.max(0.5, Math.min(2.0, p));
            }
          }
          const cc = cannedColorCode ?? 0;
          const cannedSegments: ChatSegment[] = [];
          if (keys) cannedSegments.push({ text: `[${keys}] `, colorCode: 0 });
          cannedSegments.push({
            text: name ? `${name}: ${voiceLine}` : voiceLine,
            colorCode: cc,
          });
          this.pushChatMessage({
            timeSec,
            sender: name,
            text: voiceLine,
            kind: "chat",
            colorCode: cc,
            segments: cannedSegments,
            soundPath,
            soundPitch,
          });
        }
      } else if (funcName === "ServerMessage" && args.length >= 1) {
        // Some messages carry only a type and no format string (e.g.
        // MsgLoadInfoDone) — dispatch them, but skip the chat path.
        this.pushServerEvent(timeSec, args);
        this.handleServerMessage(args);
        if (args.length >= 2) {
          const rawTemplate = this.resolveNetString(args[1]);
          const serverColorCode = detectColorCode(rawTemplate);
          const rawText = this.formatRemoteArgs(args[1], args.slice(2));
          if (rawText) {
            const { text, wavPath } = extractWavTag(rawText);
            const scc = serverColorCode ?? 0;
            this.pushChatMessage({
              timeSec,
              sender: "",
              text,
              kind: "server",
              colorCode: scc,
              segments: [{ text, colorCode: scc }],
              soundPath: wavPath ?? undefined,
            });
          }
        }
      } else {
        this.handleHudRemoteCommand(funcName, args);
      }
      return;
    }

    if (
      type === "Sim3DAudioEvent" ||
      type === "Sim2DAudioEvent" ||
      eventName === "Sim3DAudioEvent" ||
      eventName === "Sim2DAudioEvent"
    ) {
      const is3D =
        type === "Sim3DAudioEvent" || eventName === "Sim3DAudioEvent";
      const evt = is3D
        ? (data as Sim3DAudioEventData)
        : (data as Sim2DAudioEventData);
      const profileId = evt.profileId;
      if (typeof profileId === "number") {
        const timeSec = this.getTimeSec();
        const position = is3D
          ? (data as Sim3DAudioEventData).position
          : undefined;
        this.audioEvents.push({ profileId, position, timeSec });
        if (this.audioEvents.length > 100) {
          this.audioEvents.splice(0, this.audioEvents.length - 100);
        }
      }
    }
  }

  // ── Ghost processing ──

  protected processGhostUpdate(ghost: {
    index: number;
    type: "create" | "update" | "delete";
    classId?: number;
    parsedData?: ParsedData;
  }): void {
    const ghostIndex = ghost.index;
    const prevEntityId = this.entityIdByGhostIndex.get(ghostIndex);

    // Spawn explosion for projectiles being removed
    if (prevEntityId) {
      const prevEntity = this.entities.get(prevEntityId);
      if (
        prevEntity &&
        prevEntity.type === "Projectile" &&
        !prevEntity.hasExploded &&
        prevEntity.explosionDataBlockId != null &&
        prevEntity.position &&
        (ghost.type === "delete" || ghost.type === "create")
      ) {
        this.spawnExplosion(prevEntity, [...prevEntity.position] as [
          number,
          number,
          number,
        ]);
      }
    }

    if (ghost.type === "delete") {
      if (prevEntityId) {
        this.entities.delete(prevEntityId);
        this.entityIdByGhostIndex.delete(ghostIndex);
        this.entityGeneration++;
      }
      return;
    }

    const className = this.resolveGhostClassName(ghostIndex, ghost.classId);
    if (!className) {
      if (ghost.type === "create") {
        throw new Error(
          `No ghost parser for classId ${ghost.classId} (ghost index ${ghostIndex})`,
        );
      }
      return;
    }

    const entityId = prevEntityId ?? allocateEntityId();
    if (prevEntityId && prevEntityId !== entityId) {
      this.entities.delete(prevEntityId);
    }

    let entity: MutableEntity;
    const existingEntity = this.entities.get(entityId);
    if (existingEntity && ghost.type === "create") {
      existingEntity.spawnTick = this.tickCount;
      this.resetEntity(existingEntity);
      entity = existingEntity;
    } else if (existingEntity) {
      entity = existingEntity;
    } else {
      entity = {
        id: entityId,
        ghostIndex,
        className,
        spawnTick: this.tickCount,
        type: toEntityType(className),
        rotation: [0, 0, 0, 1],
      };
      this.entities.set(entityId, entity);
      this.entityGeneration++;
    }

    entity.ghostIndex = ghostIndex;
    entity.className = className;
    entity.type = toEntityType(className);
    this.entityIdByGhostIndex.set(ghostIndex, entityId);
    this.applyGhostData(entity, ghost.parsedData);
    // Only set sceneData on ghost creates — updates contain sparse fields
    // that would overwrite the initial data with defaults (e.g. empty
    // interiorFile, identity transform).
    if (ghost.type === "create" && ghost.parsedData) {
      const sceneObj = ghostToSceneObject(
        className,
        ghostIndex,
        ghost.parsedData as ParsedData,
      );
      if (sceneObj) entity.sceneData = sceneObj;
    }
  }

  protected resetEntity(entity: MutableEntity): void {
    entity.rotation = [0, 0, 0, 1];
    entity.hasExploded = undefined;
    entity.explosionShape = undefined;
    entity.faceViewer = undefined;
    entity.explosionFaceViewer = undefined;
    entity.simulatedVelocity = undefined;
    entity.projectilePhysics = undefined;
    entity.gravityMod = undefined;
    entity.projAgeTicks = undefined;
    entity.projActivateDelayMS = undefined;
    entity.linearSegment = undefined;
    entity.projElasticity = undefined;
    entity.projFriction = undefined;
    entity.projArmedTick = undefined;
    entity.direction = undefined;
    entity.velocity = undefined;
    entity.position = undefined;
    entity.scale = undefined;
    entity.forceFieldState = undefined;
    entity.forceFieldPosition = undefined;
    entity.forceFieldData = undefined;
    entity.dataBlock = undefined;
    entity.dataBlockId = undefined;
    entity.shapeHint = undefined;
    entity.visual = undefined;
    entity.targetId = undefined;
    entity.targetRenderFlags = undefined;
    entity.sensorGroup = undefined;
    entity.playerName = undefined;
    entity.playerRawName = undefined;
    entity.imageSlots = undefined;
    entity.mountObjectGhostIndex = undefined;
    entity.mountNode = undefined;
    entity.skinName = undefined;
    entity.skinPrefName = undefined;
    entity.falling = undefined;
    entity.jetting = undefined;
    entity.itemPhysics = undefined;
    entity.threads = undefined;
    entity.headPitch = undefined;
    entity.headYaw = undefined;
    entity.health = undefined;
    entity.energy = undefined;
    entity.maxEnergy = undefined;
    entity.damageState = undefined;
    entity.fadeVal = undefined;
    entity.fadeState = undefined;
    entity.cloaked = undefined;
    entity.cloakLevel = undefined;
    entity.actionAnim = undefined;
    entity.actionAtEnd = undefined;
    entity.actionHoldAtEnd = undefined;
    entity.armAction = undefined;
    entity.explosionDataBlockId = undefined;
    entity.maintainEmitterId = undefined;
    entity.soundSlots = undefined;
    entity.isStaticItem = undefined;
    entity.lightType = undefined;
    entity.lightColor = undefined;
    entity.lightTime = undefined;
    entity.lightRadius = undefined;
    entity.lightOnlyStatic = undefined;
    entity.lightAnchor = undefined;
  }

  // ── Apply ghost data ──

  protected applyGhostData(
    entity: MutableEntity,
    rawData: ParsedData | undefined,
  ): void {
    if (!rawData) return;
    const data = rawData;

    const dataBlockId = data.dataBlockId as number | undefined;
    if (dataBlockId != null) {
      entity.dataBlockId = dataBlockId;
      const blockData = this.getDataBlockData(dataBlockId);
      const shapeName = resolveShapeName(entity.className, blockData);
      entity.visual =
        resolveTracerVisual(entity.className, blockData) ??
        resolveBoltVisual(entity.className, blockData) ??
        resolveBeamVisual(entity.className, blockData) ??
        resolveLinkBeamVisual(entity.className, blockData) ??
        resolveShockLanceVisual(entity.className, blockData) ??
        resolveSpriteVisual(entity.className, blockData);
      if (typeof shapeName === "string") {
        entity.shapeHint = shapeName;
        entity.dataBlock = shapeName;
      }
      if (
        entity.type === "Player" &&
        typeof blockData?.maxEnergy === "number"
      ) {
        entity.maxEnergy = blockData.maxEnergy;
      }

      // Item/ShapeBase built-in dynamic light (binary-verified).
      const lt = blockData?.lightType as number | undefined;
      if (lt && lt > 0 && blockData) {
        entity.lightType = lt;
        const lc = blockData.lightColor as
          { r: number; g: number; b: number; a?: number } | undefined;
        entity.lightColor = lc ? [lc.r, lc.g, lc.b, lc.a ?? 1] : [1, 1, 1, 1];
        entity.lightTime = (blockData.lightTime as number | undefined) ?? 1000;
        entity.lightRadius =
          (blockData.lightRadius as number | undefined) ?? 10;
        entity.lightOnlyStatic = !!(blockData.lightOnlyStatic as boolean);
        // Item::registerLights (FUN_00603de0) lights the world box centre.
        entity.lightAnchor = "boxCenter";
      }

      // Classify projectile physics
      if (entity.type === "Projectile") {
        // Projectile::registerLights (FUN_006323d0): a hasLight datablock
        // adds a point light of lightRadius/lightColor at the projectile.
        // The parser decodes the two only under the hasLight flag.
        const projLightRadius = getNumberField(blockData, ["lightRadius"]);
        if (projLightRadius != null && entity.lightType == null) {
          const lc = blockData?.lightColor as
            { r: number; g: number; b: number } | undefined;
          entity.lightType = 1;
          entity.lightColor = lc ? [lc.r, lc.g, lc.b, 1] : [1, 1, 1, 1];
          entity.lightTime = 1000;
          entity.lightRadius = projLightRadius;
          entity.lightOnlyStatic = false;
          entity.lightAnchor = "origin";
        }
        if (linearProjectileClassNames.has(entity.className)) {
          entity.projectilePhysics = "linear";
          const activateDelayMS = getNumberField(blockData, [
            "activateDelayMS",
          ]);
          if (activateDelayMS != null && activateDelayMS >= 0) {
            entity.projActivateDelayMS = activateDelayMS;
          }
        } else if (ballisticProjectileClassNames.has(entity.className)) {
          entity.projectilePhysics = "ballistic";
          entity.gravityMod = getNumberField(blockData, ["gravityMod"]) ?? 1.0;
          // Bounce parameters (GrenadeProjectileData defaults). Arming
          // delay is floored at 250ms and rounded up to a tick multiple
          // by the engine's onAdd.
          entity.projElasticity =
            getNumberField(blockData, ["grenadeElasticity"]) ?? 0.999;
          entity.projFriction =
            getNumberField(blockData, ["grenadeFriction"]) ?? 0.3;
          const armingDelayMS = Math.max(
            250,
            getNumberField(blockData, ["armingDelayMS", "armingDelay"]) ?? 3000,
          );
          entity.projArmedTick = Math.ceil(armingDelayMS / TICK_DURATION_MS);
        } else if (seekerProjectileClassNames.has(entity.className)) {
          entity.projectilePhysics = "seeker";
        }
      }

      // Resolve explosion shape
      if (entity.type === "Projectile" && entity.explosionDataBlockId == null) {
        const info = this.resolveExplosionInfo(dataBlockId);
        if (info) {
          entity.explosionShape = info.shape;
          entity.explosionFaceViewer = info.faceViewer;
          entity.explosionDataBlockId = info.explosionDataBlockId;
        }
      }

      // Trail emitter
      if (entity.type === "Projectile" && entity.maintainEmitterId == null) {
        const trailEmitterId = blockData?.baseEmitter as number | null;
        if (typeof trailEmitterId === "number" && trailEmitterId > 0) {
          entity.maintainEmitterId = trailEmitterId;
        }
      }

      // Vehicle maxSteeringAngle from VehicleData datablock.
      if (
        entity.className === "WheeledVehicle" &&
        typeof blockData?.maxSteeringAngle === "number"
      ) {
        entity.maxSteeringAngle = blockData.maxSteeringAngle;
      }

      // Force field visual data from ForceFieldBareData datablock. The
      // box dimensions are the ghost scale, applied below on every
      // transform update (servers retract an open field by zeroing it).
      if (entity.className === "ForceFieldBare" && blockData) {
        const color1 = blockData.color1 as
          { r: number; g: number; b: number } | undefined;
        const color2 = blockData.color2 as
          { r: number; g: number; b: number } | undefined;
        const textures: string[] = [];
        for (let i = 0; i < 5; i++) {
          const tex = blockData[`texture${i}`] as string | undefined;
          if (tex) textures.push(tex);
        }
        entity.forceFieldData = {
          textures,
          color: color1 ? [color1.r, color1.g, color1.b] : [1, 1, 1],
          powerOffColor: color2 ? [color2.r, color2.g, color2.b] : [0, 0, 0],
          baseTranslucency: (blockData.baseTranslucency as number) ?? 1,
          powerOffTranslucency: (blockData.powerOffTranslucency as number) ?? 0,
          fadeMS: (blockData.fadeMS as number) ?? 1000,
          dimensions: entity.forceFieldData?.dimensions ?? [1, 1, 1],
          framesPerSec: (blockData.framesPerSec as number) ?? 1,
          scrollSpeed: (blockData.scrollSpeed as number) ?? 0,
          umapping: (blockData.umapping as number) ?? 1,
          vmapping: (blockData.vmapping as number) ?? 1,
        };
      }
    }

    // WheeledVehicle per-wheel state. Mutate in-place to avoid allocation
    // on every ghost update (~32Hz).
    if (Array.isArray(data.wheels)) {
      const incoming = data.wheels as Array<{
        avel: number;
        Dy: number;
        Dx: number;
      }>;
      if (!entity.wheels || entity.wheels.length !== incoming.length) {
        entity.wheels = incoming.map((w) => ({
          speed: w.avel,
          lateralSlip: w.Dx,
          longitudinalSlip: w.Dy,
        }));
      } else {
        for (let i = 0; i < incoming.length; i++) {
          entity.wheels[i].speed = incoming[i].avel;
          entity.wheels[i].lateralSlip = incoming[i].Dx;
          entity.wheels[i].longitudinalSlip = incoming[i].Dy;
        }
      }
    }
    if (typeof data.steeringYaw === "number") {
      entity.steeringYaw = data.steeringYaw;
    }
    if (typeof data.frozen === "boolean") {
      entity.frozen = data.frozen;
    }

    // Mounted images (ShapeBase slot 0-3). All ShapeBase subclasses have
    // image slots: Player weapons, Turret barrels, Vehicle turrets, etc.
    {
      const images = data.images as
        | Array<{
            index?: number;
            dataBlockId?: number;
            skinTagIndex?: number;
            skinName?: string;
            triggerDown?: boolean;
            ammo?: boolean;
            loaded?: boolean;
            target?: boolean;
            wet?: boolean;
            fireCount?: number;
          }>
        | undefined;
      if (images && images.length > 0) {
        // Process all 8 image slots uniformly. The mount bone for each
        // image comes from dataBlock->mountPoint (binary-verified), NOT
        // from the slot index.
        for (const img of images) {
          if (img.index == null || img.index < 0 || img.index >= 8) continue;

          if (img.dataBlockId && img.dataBlockId > 0) {
            const blockData = this.getDataBlockData(img.dataBlockId);
            const shapeName = resolveShapeName("ShapeBaseImageData", blockData);
            const mountPoint =
              typeof blockData?.mountPoint === "number"
                ? blockData.mountPoint
                : 0;

            // Resolve skin from net string tag or inline name.
            let skinName: string | undefined;
            if (img.skinTagIndex != null) {
              skinName = this.netStrings.get(img.skinTagIndex);
            } else if (img.skinName) {
              skinName = img.skinName;
            }

            // Every slot carries its image state (a pack's trigger is
            // its activation); the state table is parsed once per datablock.
            const prevSlot = entity.imageSlots?.[img.index];
            const prev = prevSlot?.imageState;
            const imageState = {
              dataBlockId: img.dataBlockId,
              triggerDown: img.triggerDown ?? prev?.triggerDown ?? false,
              ammo: img.ammo ?? prev?.ammo ?? true,
              loaded: img.loaded ?? prev?.loaded ?? true,
              target: img.target ?? prev?.target ?? false,
              wet: img.wet ?? prev?.wet ?? false,
              fireCount: img.fireCount ?? prev?.fireCount ?? 0,
            };
            const imageStates =
              prevSlot?.dataBlockId === img.dataBlockId && prevSlot.imageStates
                ? prevSlot.imageStates
                : blockData
                  ? parseWeaponImageStates(blockData)
                  : undefined;

            if (shapeName) {
              if (!entity.imageSlots) entity.imageSlots = [];
              entity.imageSlots[img.index] = {
                shapeName,
                mountPoint,
                dataBlockId: img.dataBlockId,
                skinName,
                imageState,
                imageStates,
              };
            }

            // Slot 3 on Players: flag — update targetRenderFlags bit 0x2.
            if (img.index === 3 && entity.type === "Player") {
              if (entity.targetId != null && entity.targetId >= 0) {
                const prev = this.targetRenderFlags.get(entity.targetId) ?? 0;
                const updated = prev | 0x2;
                if (updated !== prev) {
                  this.targetRenderFlags.set(entity.targetId, updated);
                  entity.targetRenderFlags = updated;
                }
              }
            }
          } else if (!img.dataBlockId) {
            // Clear slot.
            if (entity.imageSlots) {
              entity.imageSlots[img.index] = undefined;
            }

            // Slot 3 on Players: clear flag render flag.
            if (img.index === 3 && entity.type === "Player") {
              if (entity.targetId != null && entity.targetId >= 0) {
                const prev = this.targetRenderFlags.get(entity.targetId) ?? 0;
                const updated = prev & ~0x2;
                if (updated !== prev) {
                  this.targetRenderFlags.set(entity.targetId, updated);
                  entity.targetRenderFlags = updated;
                }
              }
            }
          }
        }
      }
    }

    // Position
    const position = isValidPosition(data.position as Vec3)
      ? (data.position as Vec3)
      : isValidPosition(data.initialPosition as Vec3)
        ? (data.initialPosition as Vec3)
        : isValidPosition(data.explodePosition as Vec3)
          ? (data.explodePosition as Vec3)
          : isValidPosition(data.endPoint as Vec3)
            ? (data.endPoint as Vec3)
            : isValidPosition(
                  (data.transform as { position?: Vec3 } | undefined)?.position,
                )
              ? ((data.transform as { position: Vec3 }).position as Vec3)
              : undefined;
    if (position) {
      entity.position = [position.x, position.y, position.z];
    }

    // Scale, Torque xyz → Three.js axis order like getScale() for mission
    // objects. ForceFieldBare uses it as its box dimensions instead.
    if (isVec3Like(data.scale)) {
      const s = data.scale;
      if (entity.className === "ForceFieldBare") {
        if (entity.forceFieldData) {
          entity.forceFieldData.dimensions = [s.y, s.z, s.x];
        }
      } else {
        entity.scale = [s.y, s.z, s.x];
      }
    }

    // ForceFieldBare open/close state (see forceFieldState.ts).
    if (
      entity.className === "ForceFieldBare" &&
      typeof data.state === "number"
    ) {
      entity.forceFieldState = data.state;
      entity.forceFieldPosition = forceFieldPositionForState(
        data.state,
        typeof data.position === "number" ? data.position : undefined,
        entity.forceFieldData?.fadeMS ?? 0,
      );
    }

    // Direction
    const direction = isVec3Like(data.direction) ? data.direction : undefined;
    if (direction) {
      entity.direction = [direction.x, direction.y, direction.z];
    }

    // Projectile shooter, from the packet's source object ghost index.
    if (
      entity.type === "Projectile" &&
      typeof data.sourceObject === "number" &&
      data.sourceObject >= 0
    ) {
      entity.sourceGhostIndex = data.sourceObject;
    }

    // Link beams (ELF/repair): shooter and zapped/repaired object, by
    // ghost index — the endpoints are LIVE and re-derived per frame.
    if (
      entity.className === "ELFProjectile" ||
      entity.className === "RepairProjectile" ||
      entity.className === "ShockLanceProjectile"
    ) {
      if (typeof data.sourceObject === "number" && data.sourceObject >= 0) {
        entity.sourceGhostIndex = data.sourceObject;
      }
      const target = (data.targetObject ?? data.repairingObject) as
        number | undefined;
      if (typeof target === "number" && target >= 0) {
        entity.linkTargetGhostIndex = target;
      }
    }

    // ShockLanceProjectile: fixed start/end and whether the bolt pinned
    // to its target (client onAdd FUN_0064ec20 keeps them verbatim).
    if (entity.className === "ShockLanceProjectile") {
      const start = data.start as Vec3 | undefined;
      const end = data.end as Vec3 | undefined;
      if (isValidPosition(start)) {
        entity.beamStart = [start!.x, start!.y, start!.z];
      }
      if (isValidPosition(end)) entity.beamEnd = [end!.x, end!.y, end!.z];
      if (typeof data.hitObject === "boolean") entity.beamHit = data.hitObject;
    }

    // Beam endpoints (SniperProjectile): the ghost carries the muzzle
    // and the impact point; swing updates move the endpoint.
    if (entity.className === "SniperProjectile") {
      const start = data.initialPosition as Vec3 | undefined;
      const end = data.endPos as Vec3 | undefined;
      if (isValidPosition(start)) {
        entity.beamStart = [start!.x, start!.y, start!.z];
      }
      if (isValidPosition(end)) entity.beamEnd = [end!.x, end!.y, end!.z];
    }

    // Rotation
    if (entity.type === "Player" && typeof data.rotationZ === "number") {
      entity.rotation = playerYawToQuaternion(data.rotationZ);
    }

    // Head pitch/yaw
    if (entity.type === "Player") {
      if (typeof data.headX === "number") entity.headPitch = data.headX;
      if (typeof data.headZ === "number") entity.headYaw = data.headZ;
    }

    if (isQuatLike(data.angPosition)) {
      const converted = torqueQuatToThreeJS(data.angPosition);
      if (converted) entity.rotation = converted;
    } else if (
      isQuatLike(
        (data.transform as { rotation?: unknown } | undefined)?.rotation,
      )
    ) {
      const converted = torqueQuatToThreeJS(
        (
          data.transform as {
            rotation: { x: number; y: number; z: number; w: number };
          }
        ).rotation,
      );
      if (converted) entity.rotation = converted;
    } else if (
      Array.isArray(
        (data.transform as { elements?: unknown } | undefined)?.elements,
      )
    ) {
      // MatrixF (16 floats) — decompose rotation from the 3x3 submatrix.
      const converted = matrixFToThreeJSQuat(
        (data.transform as { elements: number[] }).elements,
      );
      if (converted) entity.rotation = converted;
    } else if (
      entity.type === "Item" &&
      typeof (data.rotation as { angle?: unknown } | undefined)?.angle ===
        "number"
    ) {
      const rot = data.rotation as { angle: number; zSign?: number };
      entity.rotation = playerYawToQuaternion((rot.zSign ?? 1) * rot.angle);
    } else if (entity.type === "Projectile") {
      const vec =
        (data.velocity as Vec3 | undefined) ??
        (data.direction as Vec3 | undefined) ??
        (isValidPosition(data.initialPosition as Vec3) &&
        isValidPosition(data.endPos as Vec3)
          ? {
              x: (data.endPos as Vec3).x - (data.initialPosition as Vec3).x,
              y: (data.endPos as Vec3).y - (data.initialPosition as Vec3).y,
              z: (data.endPos as Vec3).z - (data.initialPosition as Vec3).z,
            }
          : undefined);
      if (
        isVec3Like(vec) &&
        !worldAlignedProjectileClassNames.has(entity.className)
      ) {
        entity.rotation =
          orientationAlongDirection([vec.x, vec.y, vec.z]) ?? entity.rotation;
      }
    }

    // Velocity
    if (isVec3Like(data.velocity)) {
      entity.velocity = [data.velocity.x, data.velocity.y, data.velocity.z];
      if (!entity.direction) {
        entity.direction = [data.velocity.x, data.velocity.y, data.velocity.z];
      }
    }

    // Movement state flags (from Player MoveMask ghost data).
    if (typeof data.moveFlag0 === "boolean") entity.falling = data.moveFlag0;
    if (typeof data.moveFlag1 === "boolean") entity.jetting = data.moveFlag1;

    // Item physics state.
    if (entity.type === "Item") {
      // mStatic: sent via InitialUpdateMask. Static items (flags at home)
      // skip all physics in Item::processTick.
      if (typeof data.isStatic === "boolean") {
        entity.isStaticItem = data.isStatic;
        // When server sets mStatic=true, force atRest (matching Item::onAdd).
        if (data.isStatic) {
          entity.itemPhysics = undefined;
        }
      }
      const atRest = data.atRest as boolean | undefined;
      if (
        atRest === false &&
        !entity.isStaticItem &&
        isVec3Like(data.velocity)
      ) {
        const vel = data.velocity as Vec3;
        // Item::setVelocity sets mAtRest=false unconditionally (item.cc:309),
        // so scripted teleports like a CTF flag return — setVelocity("0 0 0")
        // + setTransform(home) — arrive as atRest=false with exactly zero
        // velocity and NoWarpMask (warp=false). The real client simulates
        // anyway: it falls ~2cm for one tick and rests on the flag stand via
        // its collision mask, which includes StaticShapes. Our collision
        // world has no colliders for small statics, so the faithful fall
        // would sink through the stand — pin the scripted-teleport case at
        // the server position instead. DIVERGENCE from the binary,
        // compensating for missing StaticShape collision.
        //
        // Zero velocity WITH the warp flag is engine-originated (a dropped
        // weapon or mine stopped by a player or vehicle collision, e.g. a
        // shocklance dropped onto the killer); Item::unpackUpdate
        // (FUN_00606600) keeps mAtRest=false and processTick resumes
        // updatePos, so the client lets it fall — binary-verified.
        if (vel.x === 0 && vel.y === 0 && vel.z === 0 && data.warp === false) {
          entity.itemPhysics = undefined;
        } else {
          entity.itemPhysics = {
            velocity: [vel.x, vel.y, vel.z],
            atRest: false,
          };
          log.debug(
            "Item %s (%s): atRest=false pos=%s vel=%s",
            entity.id,
            entity.shapeHint ?? entity.dataBlock ?? `db#${entity.dataBlockId}`,
            data.position
              ? `${(data.position as Vec3).x.toFixed(1)},${(data.position as Vec3).y.toFixed(1)},${(data.position as Vec3).z.toFixed(1)}`
              : "none",
            `${vel.x.toFixed(1)},${vel.y.toFixed(1)},${vel.z.toFixed(1)}`,
          );
        }
      } else if (atRest === true) {
        log.debug(
          "Item %s (%s): atRest=true pos=%s",
          entity.id,
          entity.shapeHint ?? entity.dataBlock ?? `db#${entity.dataBlockId}`,
          entity.position
            ? `${entity.position[0].toFixed(1)},${entity.position[1].toFixed(1)},${entity.position[2].toFixed(1)}`
            : "none",
        );
        entity.itemPhysics = undefined;
      }
    }

    // Projectile simulation velocity
    if (entity.projectilePhysics) {
      if (entity.projectilePhysics === "linear") {
        const blockData =
          entity.dataBlockId != null
            ? this.getDataBlockData(entity.dataBlockId)
            : undefined;
        // LinearProjectile::createSegments picks the muzzle speed from
        // whether the FIRE POINT was underwater — dryVelocity or
        // wetVelocity. The gap is large (disc 95 vs 55, chaingun 750 vs
        // 280), so using dry unconditionally sends underwater shots
        // flying at nearly double speed.
        const wetStart =
          entity.position != null &&
          isPointSubmergedSimple(
            entity.position[0],
            entity.position[1],
            entity.position[2],
          );
        const dryVelocity =
          getNumberField(blockData, [
            "dryVelocity",
            "muzzleVelocity",
            "bulletVelocity",
          ]) ?? 80;
        const wetVelocity = getNumberField(blockData, ["wetVelocity"]);
        // The engine treats wetVelocity -1 as "unset".
        const muzzle =
          wetStart && wetVelocity != null && wetVelocity > 0
            ? wetVelocity
            : dryVelocity;
        const dir = entity.direction ?? [0, 1, 0];
        const excessVel = data.excessVel as number | undefined;
        const excessDir = data.excessDir as Vec3 | undefined;
        const hasExcess =
          typeof excessVel === "number" &&
          excessVel > 0 &&
          isVec3Like(excessDir);
        /** `direction * speed + excess`, the way createSegments composes
         *  it. The excess (inherited shooter velocity) is ADDED, so a
         *  wet velocity cannot be obtained by rescaling the dry one. */
        const compose = (speed: number): [number, number, number] => {
          const v: [number, number, number] = [
            dir[0] * speed,
            dir[1] * speed,
            dir[2] * speed,
          ];
          if (hasExcess) {
            v[0] += excessDir.x * excessVel;
            v[1] += excessDir.y * excessVel;
            v[2] += excessDir.z * excessVel;
          }
          return v;
        };
        entity.simulatedVelocity = compose(muzzle);
        // The engine orients the shape along the segment velocity every
        // frame (LinearProjectile::interpolateTick), so the inherited
        // shooter velocity turns the shape with the path, not the aim.
        entity.rotation =
          orientationAlongDirection(entity.simulatedVelocity) ??
          entity.rotation;

        // Precompute the flight segment against the static world, exactly
        // like LinearProjectile::createSegments — one raycast covering the
        // whole lifetime, cut short at the first hit. The demo carries only
        // initial pos/dir; the impact must be predicted client-side.
        if (entity.position && entity.linearSegment == null) {
          // lifetimeMS/explodeOnDeath are binary-verified field names in
          // t2-demo-parser's LinearProjectileData decode (milliseconds,
          // tick-rounded by the engine's onAdd — disc 5024, chaingun 3008).
          entity.linearSegment = buildLinearSegment({
            start: [...entity.position] as [number, number, number],
            vel: [...entity.simulatedVelocity] as [number, number, number],
            lifetimeMS: getNumberField(blockData, ["lifetimeMS"]) ?? 1000,
            explodeOnDeath: isTruthyField(blockData?.explodeOnDeath),
            explodeOnWaterImpact: isTruthyField(
              blockData?.explodeOnWaterImpact,
            ),
            wetStart,
            wetVel:
              wetVelocity != null && wetVelocity > 0
                ? compose(wetVelocity)
                : undefined,
            reflectOnWaterImpactAngle: getNumberField(blockData, [
              "reflectOnWaterImpactAngle",
            ]),
          });
        }
      } else if (isVec3Like(data.velocity)) {
        entity.simulatedVelocity = [
          data.velocity.x,
          data.velocity.y,
          data.velocity.z,
        ];
      }

      // currTick is the projectile's age on the server when it was packed.
      // It seeds the age clock (arming, lifetime) for every projectile, but
      // only a LinearProjectile derives its position from it: its ghost
      // carries the INITIAL state and the client evaluates the precomputed
      // segment at that time. Grenade and seeker ghosts carry the CURRENT
      // position and velocity, which the client adopts as-is
      // (GrenadeProjectile::unpackUpdate FUN_00636050 — no fast-forward).
      const currTick = data.currTick as number | undefined;
      if (typeof currTick === "number" && currTick > 0) {
        entity.projAgeTicks = currTick;
      }
      if (entity.projAgeTicks == null) entity.projAgeTicks = 0;
      if (entity.linearSegment && entity.position) {
        linearSegmentPosition(
          entity.linearSegment,
          entity.projAgeTicks * TICK_DURATION_MS,
          entity.position,
        );
      }
    }

    // Explosion detection
    const explodePos = isValidPosition(data.explodePosition as Vec3)
      ? (data.explodePosition as Vec3)
      : isValidPosition(data.explodePoint as Vec3)
        ? (data.explodePoint as Vec3)
        : undefined;
    if (
      entity.type === "Projectile" &&
      !entity.hasExploded &&
      explodePos &&
      entity.explosionDataBlockId != null
    ) {
      this.spawnExplosion(entity, [explodePos.x, explodePos.y, explodePos.z]);
    }

    // Damage
    if (typeof data.damageLevel === "number") {
      entity.health = clamp(1 - data.damageLevel, 0, 1);
    }
    if (typeof data.damageState === "number") {
      const prevDamageState = entity.damageState;
      entity.damageState = data.damageState;
      // ShapeBase::unpackUpdate (FUN_005ef0e0): an object already in the
      // scene blows up when it becomes Destroyed or the blowApart flag is
      // set — thrown grenades, mines, turrets, stations, deployables.
      if (
        prevDamageState != null &&
        ((prevDamageState !== 2 && data.damageState === 2) ||
          data.blowApart === true)
      ) {
        this.blowUp(entity);
      }
    }
    // CloakMask (binary-verified, shapeBase.cc:3457-3485):
    //   cloaked: mCloaked — drives client-side cloakLevel interpolation
    //   fading: start a fade animation (fadeOut=direction, fadeTime=duration)
    //   fadeVal: direct mFadeVal == 1.0 when not fading
    // CloakMask visibility (binary-verified, shapeBase.cc:3457-3485).
    // fadeVal (mFadeVal == 1.0): true = visible, false = invisible.
    // fading: fade animation (fadeOut=direction, fadeTime=duration).
    // cloaked: mCloaked (stealth/station pad effect — client-side render).
    // setCloakedState (FUN_005f0200): on client, does NOT snap mCloakLevel —
    // only sets mCloaked. advanceTime interpolates at rate dt*2 (0.5s).
    if (typeof data.cloaked === "boolean" && data.cloaked !== entity.cloaked) {
      const wasSet = entity.cloaked != null;
      entity.cloaked = data.cloaked;
      if (!wasSet && data.cloaked) {
        // First create with cloaked=true: start fully cloaked. The engine
        // technically starts at 0 and animates, but the ghost isn't rendered
        // during initial setup so players only ever see the cloaked state.
        entity.cloakLevel = 1;
      }
      // No snap for state changes — client interpolates via advanceFades().
    }
    if (data.fading === true && typeof data.fadeTime === "number") {
      const fadeOut = !!data.fadeOut;
      if (data.fadeTime <= 0) {
        entity.fadeVal = fadeOut ? 0 : 1;
        entity.fadeState = undefined;
      } else {
        entity.fadeVal = fadeOut ? 1 : 0;
        entity.fadeState = {
          fadeOut,
          fadeTime: data.fadeTime,
          elapsed: 0,
        };
      }
    } else if (typeof data.fadeVal === "boolean") {
      entity.fadeVal = data.fadeVal ? 1 : 0;
      entity.fadeState = undefined;
    }
    if (typeof data.action === "number") {
      entity.actionAnim = data.action;
      entity.actionAtEnd = !!data.actionAtEnd;
      entity.actionHoldAtEnd = !!data.actionHoldAtEnd;
      entity.actionSeq = (entity.actionSeq ?? 0) + 1;
    }
    if (typeof data.armAction === "number") {
      entity.armAction = data.armAction;
    }

    // MountedMask: track mount state for position derivation and animation.
    if (typeof data.mountObject === "number") {
      if (data.mountObject >= 0) {
        // Mounting on a vehicle/object.
        entity.mountObjectGhostIndex = data.mountObject;
        entity.mountNode =
          typeof data.mountNode === "number" ? data.mountNode : 0;
      } else {
        // Unmounting — clear mount state and reset action animation.
        // Server resets to RootAnim (table action 0) via onUnmount→
        // setActionThread, but table actions (0-6) are never sent
        // over the wire, so actionAnim would remain stale.
        entity.mountObjectGhostIndex = undefined;
        entity.mountNode = undefined;
        entity.actionAnim = undefined;
        entity.actionAtEnd = undefined;
        entity.actionHoldAtEnd = undefined;
      }
    }

    // Threads
    if (Array.isArray(data.threads)) {
      const incoming = data.threads as ThreadState[];
      if (entity.threads) {
        const merged = [...entity.threads];
        for (const t of incoming) {
          const existingIdx = merged.findIndex((m) => m.index === t.index);
          if (existingIdx >= 0) merged[existingIdx] = t;
          else merged.push(t);
        }
        entity.threads = merged;
      } else {
        entity.threads = incoming;
      }
    }

    if (typeof data.energy === "number") {
      entity.energy = clamp(data.energy, 0, 1);
    }

    // Target system
    if (typeof data.targetId === "number") {
      entity.targetId = data.targetId;
      entity.targetGeneration = this.targetGenerations.get(data.targetId) ?? 0;
      const playerName = this.targetNames.get(data.targetId);
      if (playerName) entity.playerName = playerName;
      const playerRawName = this.targetRawNames.get(data.targetId);
      if (playerRawName) entity.playerRawName = playerRawName;
      const team = this.targetTeams.get(data.targetId);
      if (team != null) {
        entity.sensorGroup = team;
        if (
          entity.ghostIndex === this.latestControl.ghostIndex &&
          this.lastControlType === "player"
        ) {
          this.playerSensorGroup = team;
        }
      }
      const renderFlags = this.targetRenderFlags.get(data.targetId);
      if (renderFlags != null) entity.targetRenderFlags = renderFlags;
      const skin = this.targetSkins.get(data.targetId);
      if (skin) entity.skinName = skin;
      const skinPref = this.targetSkinPrefs.get(data.targetId);
      if (skinPref) entity.skinPrefName = skinPref;
    }

    // ShapeBase sound slots — store on entity for component-level playback.
    const sounds = data.sounds as
      | Array<{ index: number; playing: boolean; profileId?: number }>
      | undefined;
    if (Array.isArray(sounds)) {
      entity.soundSlots = sounds;
    }

    // WayPoint ghost fields
    if (entity.className === "WayPoint") {
      if (typeof data.name === "string") entity.label = data.name;
    }

    // AudioEmitter ghost fields
    if (entity.className === "AudioEmitter") {
      if (typeof data.filename === "string")
        entity.audioFileName = data.filename;
      if (typeof data.volume === "number") entity.audioVolume = data.volume;
      if (typeof data.is3D === "boolean") entity.audioIs3D = data.is3D;
      if (typeof data.isLooping === "boolean")
        entity.audioIsLooping = data.isLooping;
      if (typeof data.minDistance === "number")
        entity.audioMinDistance = data.minDistance;
      if (typeof data.maxDistance === "number")
        entity.audioMaxDistance = data.maxDistance;
      if (typeof data.minLoopGap === "number")
        entity.audioMinLoopGap = data.minLoopGap;
      if (typeof data.maxLoopGap === "number")
        entity.audioMaxLoopGap = data.maxLoopGap;
    }
  }

  // ── Sound slot entities ──

  // ── Explosion spawning ──

  protected resolveExplosionInfo(projDataBlockId: number):
    | {
        shape?: string;
        faceViewer: boolean;
        explosionDataBlockId: number;
      }
    | undefined {
    const projBlock = this.getDataBlockData(projDataBlockId);
    if (!projBlock) return undefined;
    const explosionId = projBlock.explosion as number | undefined;
    if (explosionId == null) return undefined;
    const expBlock = this.getDataBlockData(explosionId);
    if (!expBlock) return undefined;
    const shape = (expBlock.dtsFileName as string | undefined) || undefined;
    return {
      shape,
      faceViewer: expBlock.faceViewer !== false && expBlock.faceViewer !== 0,
      explosionDataBlockId: explosionId,
    };
  }

  protected spawnExplosion(
    projectile: MutableEntity,
    position: [number, number, number],
  ): void {
    projectile.hasExploded = true;
    if (projectile.explosionDataBlockId != null) {
      this.addExplosion(
        projectile.explosionDataBlockId,
        position,
        this.tickCount,
      );
    }

    // Stop the projectile
    projectile.position = undefined;
    projectile.simulatedVelocity = undefined;
  }

  /**
   * Explosion::onAdd at `addTick`: resolve delay and lifetime, then either
   * explode now or queue the explode tick. An explosion whose lifetime runs
   * out while it is still waiting is deleted unseen, as in the engine.
   */
  /**
   * ShapeBase::blowUp (FUN_005eaa90, client): the datablock's explosion —
   * underwaterExplosion when the object is submerged — at the object box
   * centre, i.e. position + (mObjBox.min + max) / 2 with the offset
   * neither rotated nor scaled. mObjBox is the DTS bounds (shapeBounds.ts);
   * a shape whose GLB has not loaded yet explodes at its origin. The
   * engine also throws the datablock's debris, which is not modelled.
   */
  protected blowUp(entity: MutableEntity): void {
    if (!entity.position || entity.dataBlockId == null) return;
    const blockData = this.getDataBlockData(entity.dataBlockId);
    if (!blockData) return;
    let [x, y, z] = entity.position;
    const box = getShapeBounds(entity.dataBlock);
    if (box) {
      x += (box.min[0] + box.max[0]) * 0.5;
      y += (box.min[1] + box.max[1]) * 0.5;
      z += (box.min[2] + box.max[2]) * 0.5;
    }
    const underwater = getNumberField(blockData, ["underwaterExplosion"]);
    const explosionId =
      underwater != null && underwater > 0 && isPointSubmergedSimple(x, y, z)
        ? underwater
        : getNumberField(blockData, ["explosion"]);
    if (explosionId == null || explosionId <= 0) return;
    this.addExplosion(explosionId, [x, y, z], this.tickCount);
  }

  protected addExplosion(
    explosionDataBlockId: number,
    position: [number, number, number],
    addTick: number,
  ): void {
    const block = this.getDataBlockData(explosionDataBlockId);
    if (!block) return;
    const shape = (block.dtsFileName as string | undefined) || undefined;
    const timing = resolveExplosionTiming(
      block,
      getShapeSequenceDurationSec(shape, "ambient"),
    );
    const explodeTicks = explosionExplodeTicks(timing.delayMS);
    if (
      explodeTicks > 0 &&
      explodeTicks >= explosionLifetimeTicks(timing.armedLifetimeMS)
    ) {
      return;
    }
    const pending: PendingExplosion = {
      explodeTick: addTick + explodeTicks,
      addTick,
      explosionDataBlockId,
      shape,
      faceViewer: block.faceViewer !== false && block.faceViewer !== 0,
      position,
      lifetimeMS: timing.lifetimeMS,
    };
    if (pending.explodeTick <= this.tickCount) {
      this.explode(pending);
    } else {
      this.pendingExplosions.push(pending);
    }
  }

  /** Explosion::explode: the entity appears, and sub-explosions are added. */
  protected explode(p: PendingExplosion): void {
    const block = this.getDataBlockData(p.explosionDataBlockId);
    const fxId = `fx_${this.nextExplosionId++}`;
    const fxEntity: MutableEntity = {
      id: fxId,
      ghostIndex: -1,
      className: "Explosion",
      spawnTick: p.explodeTick,
      type: "Explosion",
      dataBlock: p.shape,
      explosionDataBlockId: p.explosionDataBlockId,
      position: p.position,
      rotation: [0, 0, 0, 1],
      isExplosion: true,
      faceViewer: p.faceViewer,
      // Deleted on the processTick where the lifetime clock (running since
      // onAdd) passes mEndingMS — at the earliest the tick after exploding.
      expiryTick: Math.max(
        p.explodeTick + 1,
        p.addTick + explosionLifetimeTicks(p.lifetimeMS),
      ),
      explosionLifetimeMS: p.lifetimeMS,
      explosionStartAgeMS: (p.explodeTick - p.addTick) * TICK_DURATION_MS,
      explosionSpawnSec: this.getTimeSec(),
    };
    this.entities.set(fxId, fxEntity);

    const subExplosions = block?.subExplosions as (number | null)[] | undefined;
    if (!Array.isArray(subExplosions)) return;
    for (const subId of subExplosions) {
      if (subId == null) continue;
      const subBlock = this.getDataBlockData(subId);
      if (!subBlock) continue;
      // The sub's onAdd scatters it by `offset` along a random direction in
      // the hemisphere above the impact (the normal is taken as up here).
      const offset = (subBlock.offset as number | undefined) ?? 0;
      let subPos = p.position;
      if (Math.abs(offset) > 1e-4) {
        const dx = Math.random() * 2 - 1;
        const dy = Math.random() * 2 - 1;
        const dz = Math.random();
        const len = Math.hypot(dx, dy, dz) || 1;
        subPos = [
          p.position[0] + (dx / len) * offset,
          p.position[1] + (dy / len) * offset,
          p.position[2] + (dz / len) * offset,
        ];
      }
      this.addExplosion(subId, subPos, p.explodeTick);
    }
  }

  /** Run explode() for queued explosions whose delay has elapsed. */
  protected explodePendingExplosions(): void {
    if (this.pendingExplosions.length === 0) return;
    const waiting: PendingExplosion[] = [];
    const due: PendingExplosion[] = [];
    for (const p of this.pendingExplosions) {
      (p.explodeTick <= this.tickCount ? due : waiting).push(p);
    }
    this.pendingExplosions = waiting;
    for (const p of due) this.explode(p);
  }

  // ── Per-tick physics simulation ──

  /**
   * Advance projectile positions by one tick, mirroring the original
   * client's prediction: linear projectiles follow their precomputed
   * segment and explode at its (already collision-cut) end; the grenade
   * family integrates with a swept ray, bouncing while unarmed; seekers
   * explode on the first static contact.
   */
  protected advanceProjectiles(): void {
    const dt = TICK_DURATION_MS / 1000;
    for (const entity of this.entities.values()) {
      if (!entity.simulatedVelocity || !entity.position) continue;
      const v = entity.simulatedVelocity;
      const p = entity.position;
      entity.projAgeTicks = (entity.projAgeTicks ?? 0) + 1;

      if (entity.linearSegment) {
        const seg = entity.linearSegment;
        const ms = entity.projAgeTicks * TICK_DURATION_MS;
        if (ms >= seg.msEnd) {
          if (
            seg.explodeAtEnd &&
            !entity.hasExploded &&
            entity.explosionDataBlockId != null
          ) {
            this.spawnExplosion(entity, [...seg.endPoint] as [
              number,
              number,
              number,
            ]);
          } else {
            // Lifetime expired without an explosion (fizzle) — hide.
            entity.position = undefined;
            entity.simulatedVelocity = undefined;
          }
          continue;
        }
        linearSegmentPosition(seg, ms, p);
        // The water leg has its own velocity; the engine re-orients the
        // shape along whichever leg it is on (interpolateTick).
        if (seg.next && ms > seg.msEnd) {
          entity.rotation =
            orientationAlongDirection(seg.next.vel) ?? entity.rotation;
        }
      } else if (
        entity.projectilePhysics === "ballistic" ||
        entity.projectilePhysics === "seeker"
      ) {
        const result = stepBallistic(p, v, {
          // Seekers coast on their transmitted velocity, no gravity.
          gravity:
            entity.projectilePhysics === "ballistic"
              ? this.gravity * (entity.gravityMod ?? 1)
              : 0,
          elasticity: entity.projElasticity ?? 0.999,
          friction: entity.projFriction ?? 0.3,
          armed:
            entity.projArmedTick != null
              ? entity.projAgeTicks > entity.projArmedTick
              : true,
          bounces: entity.projectilePhysics === "ballistic",
        });
        if (result.explodeAt && !entity.hasExploded) {
          if (entity.explosionDataBlockId != null) {
            this.spawnExplosion(entity, [...result.explodeAt.point] as [
              number,
              number,
              number,
            ]);
          } else {
            entity.position = undefined;
            entity.simulatedVelocity = undefined;
          }
          continue;
        }
      } else {
        p[0] += v[0] * dt;
        p[1] += v[1] * dt;
        p[2] += v[2] * dt;
      }

      if (!worldAlignedProjectileClassNames.has(entity.className)) {
        entity.rotation = orientationAlongDirection(v) ?? entity.rotation;
      }
      // The rendered orientation follows the LIVE velocity — the engine's
      // bolt render calls getVelocity() each frame (FUN_00696ed0), so a
      // blaster bolt that mirror-bounces must re-aim its quad along the
      // reflected direction, not the muzzle direction it was ghosted with.
      entity.velocity = [v[0], v[1], v[2]];
      if (entity.direction) entity.direction = entity.velocity;
    }
  }

  /** Advance item positions using server-sent velocity.
   *
   * Verified against Tribes2.exe (build 25034): Item does NOT override
   * GameBase::processTick — the vtable at offset 0x50 points to the
   * inherited FUN_00586050 which does no physics. All item physics
   * (gravity, collision, friction) run SERVER-SIDE only. The client just
   * interpolates using velocity until the next ghost update.
   *
   * As a practical fallback for demo playback (where ghost updates can be
   * sparse), we apply basic gravity after a few ticks without a server
   * update to prevent items from flying upward indefinitely.
   */
  /** Advance fade and cloak animations per tick, matching advanceTime. */
  protected advanceFades(): void {
    const dt = TICK_DURATION_MS / 1000;
    for (const entity of this.entities.values()) {
      // mFadeVal animation.
      const fs = entity.fadeState;
      if (fs) {
        fs.elapsed += dt;
        if (fs.elapsed >= fs.fadeTime) {
          entity.fadeVal = fs.fadeOut ? 0 : 1;
          entity.fadeState = undefined;
        } else {
          const t = fs.elapsed / fs.fadeTime;
          entity.fadeVal = fs.fadeOut ? 1 - t : t;
        }
      }
      // mCloakLevel interpolation (binary-verified: rate = dt * 2, 0.5s).
      if (entity.cloakLevel != null && entity.cloaked != null) {
        if (entity.cloaked) {
          entity.cloakLevel = Math.min(entity.cloakLevel + dt * 2, 1);
        } else {
          entity.cloakLevel = Math.max(entity.cloakLevel - dt * 2, 0);
        }
      }
    }
  }

  /** Walk force field fades one tick (ForceFieldBare::processTick). */
  protected advanceForceFields(): void {
    for (const entity of this.entities.values()) {
      if (entity.forceFieldState == null || !entity.forceFieldData) continue;
      const next = advanceForceField(
        {
          state: entity.forceFieldState,
          position: entity.forceFieldPosition ?? 0,
        },
        entity.forceFieldData.fadeMS,
      );
      entity.forceFieldState = next.state;
      entity.forceFieldPosition = next.position;
    }
  }

  /** Extrapolate the control vehicle's position each tick using velocity.
   *  controlObjectData arrives sparsely (~10 of ~62 packets/sec). Between
   *  updates, we integrate position from the last known velocity. */
  protected advanceControlVehicle(): void {
    if (!this.isPiloting || this.lastPilotGhostIndex == null) return;
    if (!this.lastVehiclePos || !this.lastVehicleVelocity) {
      if (this.tickCount % 100 === 0) {
        console.warn(
          "[advanceControlVehicle] piloting but missing data:",
          "pos:",
          !!this.lastVehiclePos,
          "vel:",
          !!this.lastVehicleVelocity,
          "ghost:",
          this.lastPilotGhostIndex,
        );
      }
      return;
    }

    const vehicleId = this.resolveEntityIdForGhostIndex(
      this.lastPilotGhostIndex,
    );
    const entity = vehicleId ? this.entities.get(vehicleId) : undefined;
    if (!entity) return;

    const dt = TICK_DURATION_MS / 1000;
    const [vx, vy, vz] = this.lastVehicleVelocity;
    this.lastVehiclePos[0] += vx * dt;
    this.lastVehiclePos[1] += vy * dt;
    this.lastVehiclePos[2] += vz * dt;
    entity.position = [...this.lastVehiclePos] as [number, number, number];
  }

  protected advanceItems(): void {
    const dt = TICK_DURATION_MS / 1000;
    for (const entity of this.entities.values()) {
      const phys = entity.itemPhysics;
      // Binary-verified: Item::processTick skips physics when
      // mStatic || mAtRest || isHidden.
      if (
        !phys ||
        phys.atRest ||
        entity.isStaticItem ||
        entity.fadeVal === 0 ||
        !entity.position
      )
        continue;
      const v = phys.velocity;
      const p = entity.position;

      // Gravity: Item::mGravity = -20 (verified from Torque source item.cc:35).
      v[2] += -20 * dt;

      // Swept collision against the static world — terrain, interiors,
      // and force fields — mirroring Item::updatePos's container cast.
      // Items get only sparse server updates (throw + final rest), so
      // this simulates the whole arc, including landings on interiors.
      _itemCastEnd[0] = p[0] + v[0] * dt;
      _itemCastEnd[1] = p[1] + v[1] * dt;
      _itemCastEnd[2] = p[2] + v[2] * dt;
      const hit = castWorldRay(p, _itemCastEnd);
      if (!hit) {
        p[0] += v[0] * dt;
        p[1] += v[1] * dt;
        p[2] += v[2] * dt;
      } else {
        // Item::updatePos collision response (item.cc:539-566): friction
        // scales with approach speed and caps at the tangential speed;
        // the reflected component gains elasticity plus a tiny backoff.
        const n = hit.normal;
        const bd = -(v[0] * n[0] + v[1] * n[1] + v[2] * n[2]);
        if (bd >= 0) {
          const blockData =
            entity.dataBlockId != null
              ? this.getDataBlockData(entity.dataBlockId)
              : undefined;
          const elasticity = getNumberField(blockData, ["elasticity"]) ?? 0.2;
          const friction = getNumberField(blockData, ["friction"]) ?? 0.6;
          const fv: [number, number, number] = [
            v[0] + n[0] * bd,
            v[1] + n[1] * bd,
            v[2] + n[2] * bd,
          ];
          const fvl = Math.sqrt(fv[0] * fv[0] + fv[1] * fv[1] + fv[2] * fv[2]);
          if (fvl > 0) {
            const ff = bd * friction;
            if (ff < fvl) {
              const scale = ff / fvl;
              fv[0] *= scale;
              fv[1] *= scale;
              fv[2] *= scale;
            }
          }
          const bde = bd * (1 + elasticity) + 0.002;
          v[0] += n[0] * bde - fv[0];
          v[1] += n[1] * bde - fv[1];
          v[2] += n[2] * bde - fv[2];
        }
        // Rest at the contact point, nudged off the surface.
        p[0] = hit.point[0] + n[0] * 0.01;
        p[1] = hit.point[1] + n[1] * 0.01;
        p[2] = hit.point[2] + n[2] * 0.01;
        // Rest condition is contact-gated (item.cc:738):
        // sAtRestVelocity = 0.15.
        const speed = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
        if (speed < 0.15) {
          v[0] = v[1] = v[2] = 0;
          phys.atRest = true;
        }
      }

      // Clamp items that fall far below the map.
      if (p[2] < -1000) {
        phys.atRest = true;
      }
    }
  }

  protected removeExpiredExplosions(): void {
    for (const [id, entity] of this.entities) {
      if (
        entity.isExplosion &&
        entity.expiryTick != null &&
        this.tickCount >= entity.expiryTick
      ) {
        this.entities.delete(id);
      }
    }
  }

  // ── Camera and HUD ──

  /**
   * Advance the control player's predicted energy by one tick, mirroring
   * the real client (binary-verified): Player::updateMove drains
   * jetEnergyDrain while jetting (gated on minJetEnergy), then
   * ShapeBase::processTick adds mRechargeRate and clamps to
   * dataBlock->maxEnergy. Server control-sync corrections (energyLevel +
   * rechargeRate in writePacketData) snap the prediction when they arrive.
   */
  protected advanceControlEnergy(): void {
    const controlGhostId = this.controlPlayerGhostId;
    const entity = controlGhostId
      ? this.entities.get(controlGhostId)
      : undefined;
    if (!entity) {
      this.predictedEnergy = null;
      this.predictedHeat = 0;
      return;
    }
    const maxEnergy = entity.maxEnergy ?? 60;

    // Apply a server correction exactly once per control update.
    const data = this.latestControl.data;
    if (data && data !== this.lastEnergyCorrectionData) {
      this.lastEnergyCorrectionData = data;
      if (typeof data.energyLevel === "number") {
        this.predictedEnergy = clamp(data.energyLevel, 0, maxEnergy);
      }
      if (typeof data.rechargeRate === "number") {
        this.controlRechargeRate = data.rechargeRate;
      }
    }

    if (this.predictedEnergy == null) {
      this.predictedEnergy = maxEnergy;
    }

    const blockData =
      entity.dataBlockId != null
        ? this.getDataBlockData(entity.dataBlockId)
        : undefined;
    const jetEnergyDrain = getNumberField(blockData, ["jetEnergyDrain"]) ?? 0.8;
    const minJetEnergy = getNumberField(blockData, ["minJetEnergy"]) ?? 1;

    let energy = this.predictedEnergy;
    if (entity.jetting && energy >= minJetEnergy) {
      energy -= jetEnergyDrain;
    }
    energy += this.controlRechargeRate;
    this.predictedEnergy = clamp(energy, 0, maxEnergy);

    // Heat signature: rises only while jetting, decays only while not
    // (Player::processTick gates decay on the mJetting flag). Rates are
    // per second; retail defaults are 1/3 (3s to full) and 1/4 (4s to
    // clear) from player.cs.
    const tickSec = TICK_DURATION_MS / 1000;
    const heatIncreasePerSec =
      getNumberField(blockData, ["heatIncreasePerSec"]) ?? 1 / 3;
    const heatDecayPerSec =
      getNumberField(blockData, ["heatDecayPerSec"]) ?? 0.25;
    this.predictedHeat = clamp(
      entity.jetting
        ? this.predictedHeat + heatIncreasePerSec * tickSec
        : this.predictedHeat - heatDecayPerSec * tickSec,
      0,
      1,
    );
  }

  protected updateCameraAndHud(): void {
    const control = this.latestControl;
    const timeSec = this.getTimeSec();
    const data = control.data;
    const controlType = this.lastControlType;

    this.explodePendingExplosions();
    this.removeExpiredExplosions();

    if (control.position) {
      let { yaw, pitch } = this.getCameraYawPitch(data);

      // When piloting a vehicle (without freelook), mouse yaw goes to
      // vehicle steering (mRot.z) and the player's head rotation (mHead)
      // decays by 50% per tick — the camera is locked to the vehicle.
      // Use the vehicle's heading directly instead of move-accumulated yaw.
      // Verified against tribes2-engine Player::updateMove and Tribes2.exe.
      if (this.isPiloting) {
        if (data) {
          const nested = data.controlObjectData as ParsedData | undefined;
          const ang = nested?.angPosition as
            { x: number; y: number; z: number; w: number } | undefined;
          if (ang && typeof ang.w === "number") {
            this.lastVehicleHeading = torqueQuatHeading(ang);
            this.lastVehiclePitch = torqueQuatPitch(ang);
            // Compute pullback direction from full quaternion (preserves roll).
            // ShapeBase::getCameraTransform pulls back along the eye's -Y axis.
            // In Torque space, forward is +Y. Transform +Y by the quaternion,
            // convert to Three.js, then negate for pullback.
            const threeQ = torqueQuatToThreeJS(ang);
            if (threeQ) {
              // Rotate Three.js forward (+X, since model default is +X) by the
              // converted quaternion: v' = q * v * q^-1.
              // For unit vector (1,0,0), this simplifies to:
              const [qx, qy, qz, qw] = threeQ;
              const fx = 1 - 2 * (qy * qy + qz * qz);
              const fy = 2 * (qx * qy + qz * qw);
              const fz = 2 * (qx * qz - qy * qw);
              // Pullback = -forward
              this.lastVehicleOrbitDir = [-fx, -fy, -fz];
            }
          }
        }
        yaw = this.lastVehicleHeading;
        pitch = this.lastVehiclePitch;
      }

      // control.position falls back to compressionPoint, which is the vehicle's
      // position when piloting. This updates every packet (~20/s), not just
      // when controlObjectData is present (~1/s).
      const cameraPos: [number, number, number] = [
        control.position.x,
        control.position.y,
        control.position.z,
      ];

      this.camera = {
        time: timeSec,
        position: cameraPos,
        rotation: yawPitchToQuaternion(
          yaw,
          clamp(pitch, -MAX_PITCH, MAX_PITCH),
        ),
        fov: this.latestFov,
        mode: "observer",
        yaw,
        pitch,
      };

      if (controlType === "camera") {
        const cameraMode =
          typeof data?.cameraMode === "number"
            ? data.cameraMode
            : this.lastCameraMode;
        if (cameraMode === CameraMode_OrbitObject) {
          this.camera.mode = "third-person";
          if (typeof this.lastOrbitDistance === "number") {
            this.camera.orbitDistance = this.lastOrbitDistance;
          }
          const orbitIndex =
            typeof data?.orbitObjectGhostIndex === "number"
              ? (data.orbitObjectGhostIndex as number)
              : this.lastOrbitGhostIndex;
          if (typeof orbitIndex === "number" && orbitIndex >= 0) {
            this.camera.orbitTargetId =
              this.resolveEntityIdForGhostIndex(orbitIndex);
          }
        } else {
          this.camera.mode = "observer";
        }
      } else {
        // Player control object.
        if (control.ghostIndex >= 0) {
          this.controlPlayerGhostId = this.resolveEntityIdForGhostIndex(
            control.ghostIndex,
          );
        }
        if (!this.firstPerson) {
          // Third-person: orbit the vehicle (if piloting) or the player.
          this.camera.mode = "third-person";
          if (this.isPiloting && this.lastPilotGhostIndex != null) {
            const vehicleId = this.resolveEntityIdForGhostIndex(
              this.lastPilotGhostIndex,
            );
            this.camera.orbitTargetId = vehicleId;
            // Use vehicle datablock's cameraMaxDist for orbit distance.
            const vEntity = vehicleId
              ? this.entities.get(vehicleId)
              : undefined;
            const vDbData =
              vEntity?.dataBlockId != null
                ? this.getDataBlockData(vEntity.dataBlockId)
                : undefined;
            this.camera.orbitDistance =
              typeof vDbData?.cameraMaxDist === "number"
                ? vDbData.cameraMaxDist
                : 15;
            // Vertical offset from datablock (Torque Z = Three.js Y).
            this.camera.orbitOffset =
              typeof vDbData?.cameraOffset === "number"
                ? vDbData.cameraOffset
                : 0;
            if (this.lastVehicleOrbitDir) {
              this.camera.orbitDirection = this.lastVehicleOrbitDir;
            }
          } else {
            this.camera.orbitTargetId = this.controlPlayerGhostId;
            // Player datablock cameraMaxDist is typically 3.
            this.camera.orbitDistance = 3;
          }
        } else {
          this.camera.mode = "first-person";
        }
        // When piloting, use the vehicle for camera positioning (its Eye
        // node provides the cockpit viewpoint). Otherwise use the player.
        if (this.isPiloting && this.lastPilotGhostIndex != null) {
          this.camera.controlEntityId = this.resolveEntityIdForGhostIndex(
            this.lastPilotGhostIndex,
          );
        } else if (this.controlPlayerGhostId) {
          this.camera.controlEntityId = this.controlPlayerGhostId;
        }
      }

      // Sync control object positions. When piloting, control.position is
      // the compressionPoint (= vehicle position), updated every packet.
      // controlObjectData (with linMomentum, angPosition) arrives more
      // sparsely (~1/s); we use it for velocity and rotation.
      if (controlType === "player" && control.position) {
        if (this.isPiloting && this.lastPilotGhostIndex != null) {
          const vehicleId = this.resolveEntityIdForGhostIndex(
            this.lastPilotGhostIndex,
          );
          const vehicleEntity = vehicleId
            ? this.entities.get(vehicleId)
            : undefined;
          if (vehicleEntity) {
            // compressionPoint provides position on every packet.
            vehicleEntity.position = [
              control.position.x,
              control.position.y,
              control.position.z,
            ];
            this.lastVehiclePos = vehicleEntity.position.slice() as [
              number,
              number,
              number,
            ];

            // Sparse controlObjectData provides velocity and rotation.
            const nested = data?.controlObjectData as ParsedData | undefined;
            if (nested) {
              const mom = nested.linMomentum as
                { x: number; y: number; z: number } | undefined;
              if (mom && isValidPosition(mom)) {
                const dbId = vehicleEntity.dataBlockId;
                const dbData =
                  dbId != null ? this.getDataBlockData(dbId) : undefined;
                const mass = (dbData?.mass as number) ?? 200;
                const invMass = mass > 0 ? 1 / mass : 1 / 200;
                this.lastVehicleVelocity = [
                  mom.x * invMass,
                  mom.y * invMass,
                  mom.z * invMass,
                ];
                vehicleEntity.velocity = this.lastVehicleVelocity;
              }
              const ang = nested.angPosition as
                { x: number; y: number; z: number; w: number } | undefined;
              if (ang && typeof ang.w === "number") {
                const converted = torqueQuatToThreeJS(ang);
                if (converted) vehicleEntity.rotation = converted;
              }
            }
          }
        } else if (this.controlPlayerGhostId) {
          const ghostEntity = this.entities.get(this.controlPlayerGhostId);
          if (ghostEntity) {
            ghostEntity.position = [
              control.position.x,
              control.position.y,
              control.position.z,
            ];
            ghostEntity.rotation = playerYawToQuaternion(yaw);
            ghostEntity.headPitch = this.getControlPlayerHeadPitch(pitch);
            // Sync velocity from controlObjectData. The authoritative
            // falling/jetting flags come from the ghost's MoveMask update
            // (processed earlier in applyGhostData) — don't overwrite them.
            const vel = data?.velocity as
              { x: number; y: number; z: number } | undefined;
            if (isVec3Like(vel)) {
              ghostEntity.velocity = [vel.x, vel.y, vel.z];
            }
          }
        }
      }
    } else if (this.camera) {
      this.camera = {
        ...this.camera,
        time: timeSec,
        fov: this.latestFov,
      };
    }

    // Health/energy/heat status
    const status = { health: 1, energy: 1, heat: 0 };
    if (this.camera?.mode === "first-person") {
      const controlGhostId = this.controlPlayerGhostId;
      const ghostEntity = controlGhostId
        ? this.entities.get(controlGhostId)
        : undefined;
      status.health = ghostEntity?.health ?? 1;
      const maxEnergy = ghostEntity?.maxEnergy ?? 60;
      if (this.predictedEnergy != null && maxEnergy > 0) {
        // Client-predicted energy (see advanceControlEnergy) — smooth
        // between the occasional server corrections, like the real HUD.
        status.energy = clamp(this.predictedEnergy / maxEnergy, 0, 1);
      } else if (typeof data?.energyLevel === "number" && maxEnergy > 0) {
        status.energy = clamp(data.energyLevel / maxEnergy, 0, 1);
      } else {
        status.energy = ghostEntity?.energy ?? 1;
      }
      status.heat = this.predictedHeat;
    } else if (
      this.camera?.mode === "third-person" &&
      this.camera.orbitTargetId
    ) {
      const orbitEntity = this.entities.get(this.camera.orbitTargetId);
      status.health = orbitEntity?.health ?? 1;
      const maxEnergy = orbitEntity?.maxEnergy ?? 60;
      if (
        this.camera.orbitTargetId === this.controlPlayerGhostId &&
        this.predictedEnergy != null &&
        maxEnergy > 0
      ) {
        // Orbiting our own player — the predictions still apply.
        status.energy = clamp(this.predictedEnergy / maxEnergy, 0, 1);
        status.heat = this.predictedHeat;
      } else {
        status.energy = orbitEntity?.energy ?? 1;
      }
    }
    this.lastStatus = status;
  }

  /** Compute headPitch for the control player ghost. Subclasses can override. */
  protected getControlPlayerHeadPitch(pitch: number): number {
    return clamp(pitch / MAX_PITCH, -1, 1);
  }

  protected getAbsoluteRotation(
    data: ParsedData | undefined,
  ): { yaw: number; pitch: number } | null {
    if (!data) return null;
    if (typeof data.rotationZ === "number" && typeof data.headX === "number") {
      return { yaw: data.rotationZ, pitch: data.headX };
    }
    if (typeof data.rotZ === "number" && typeof data.rotX === "number") {
      return { yaw: data.rotZ, pitch: data.rotX };
    }
    return null;
  }

  // ── IFF color ──

  protected resolveIffColor(
    targetSensorGroup: number,
  ): { r: number; g: number; b: number } | undefined {
    if (this.playerSensorGroup === 0) return undefined;
    const colorMap = this.sensorGroupColors.get(this.playerSensorGroup);
    if (colorMap) {
      const color = colorMap.get(targetSensorGroup);
      if (color) return color;
    }
    if (targetSensorGroup === this.playerSensorGroup) return IFF_GREEN;
    if (targetSensorGroup !== 0) return IFF_RED;
    return undefined;
  }

  // ── Chat + HUD ──

  /** Record the raw ServerMessage for self-parsing consumers (the
   *  director's event scanner) — args resolved once, ring-capped. */
  protected pushServerEvent(timeSec: number, args: string[]): void {
    this.serverEvents.push({
      id: ++this.serverEventIdCounter,
      timeSec,
      msgType: this.resolveNetString(args[0]),
      args: args.map((a) => this.resolveNetString(a)),
    });
    if (this.serverEvents.length > MAX_SERVER_EVENTS) {
      this.serverEvents.splice(0, this.serverEvents.length - MAX_SERVER_EVENTS);
    }
    this._serverEventsGen++;
  }

  protected pushChatMessage(msg: Omit<ChatMessage, "id">): void {
    this.chatMessages.push({ ...msg, id: ++this.chatMessageIdCounter });
    if (this.chatMessages.length > 200) {
      this.chatMessages.splice(0, this.chatMessages.length - 200);
    }
    this._chatGen++;
  }

  protected handleServerMessage(args: string[]): void {
    if (args.length < 1) return;
    const msgType = this.resolveNetString(args[0]);

    if (
      (msgType === "MsgTeamScoreIs" || msgType === "MsgTeamScore") &&
      args.length >= 4
    ) {
      const teamId = parseInt(this.resolveNetString(args[2]), 10);
      const newScore = parseInt(this.resolveNetString(args[3]), 10);
      if (!isNaN(teamId) && !isNaN(newScore)) {
        const entry = this.teamScores.find((t) => t.teamId === teamId);
        if (entry) {
          entry.score = newScore;
          this.onTeamScoresChanged();
        }
        this.noteTeamScore(newScore);
      }
    } else if (
      msgType === "MsgCTFAddTeam" ||
      msgType === "MsgCnHAddTeam" ||
      msgType === "MsgHuntAddTeam" ||
      msgType === "MsgSiegeAddTeam"
    ) {
      const d = decodeTeamAdd(msgType, args, (s) => this.resolveNetString(s));
      if (d) {
        // Only CTF's team score notes match-started (non-CTF leaves it).
        if (msgType === "MsgCTFAddTeam" && d.score != null) {
          this.noteTeamScore(d.score);
        }
        if (!isNaN(d.teamId) && d.teamId > 0) {
          const existing = this.teamScores.find((t) => t.teamId === d.teamId);
          if (existing) {
            existing.name = d.name;
            if (d.score != null) existing.score = d.score;
            if (d.flag) {
              existing.flagStatus = d.flag.status;
              existing.flagCarrier = d.flag.carrier;
            }
          } else {
            this.teamScores.push({
              teamId: d.teamId,
              name: d.name,
              score: d.score ?? 0,
              playerCount: 0,
              ...(d.flag && {
                flagStatus: d.flag.status,
                flagCarrier: d.flag.carrier,
              }),
            });
          }
          this.onTeamScoresChanged();
        }
      }
    } else if (
      msgType === "MsgCTFFlagTaken" ||
      msgType === "MsgCTFFlagDropped" ||
      msgType === "MsgCTFFlagReturned" ||
      msgType === "MsgCTFFlagCapped"
    ) {
      const d = decodeFlagEvent(msgType, args, (s) => this.resolveNetString(s));
      if (d) {
        const entry = this.teamScores.find((t) => t.teamId === d.teamId);
        if (entry) {
          entry.flagStatus = d.status;
          entry.flagCarrier = d.carrier;
          this.onTeamScoresChanged();
        }
      }
    } else if (msgType === "MsgClientJoin" && args.length >= 4) {
      // Wire order: args[2]=clientName, args[3]=clientId, args[4]=targetId
      const rawName = this.resolveNetString(args[2]);
      const name = stripTaggedStringMarkup(rawName).trim();
      const clientId = parseInt(this.resolveNetString(args[3]), 10);
      const joinTargetId = parseInt(this.resolveNetString(args[4] ?? ""), 10);
      if (!isNaN(clientId)) {
        // The real client (message.cs handleClientJoin) creates a fresh
        // ScriptObject with score=0, overwriting any previous entry.
        this.playerRoster.set(clientId, {
          name,
          rawName,
          targetId: isNaN(joinTargetId) ? undefined : joinTargetId,
          teamId: 0,
          score: 0,
          ping: 0,
          packetLoss: 0,
        });
        this.onRosterChanged();
      }
      // Detect our own join: the server sends "Welcome to Tribes2" in the
      // format string (args[1]) only for the joining client.  This is the same
      // technique the T2 community's player_support.cs uses.
      if (!this.connectedPlayerName && name) {
        const msgFormat = stripTaggedStringMarkup(
          this.resolveNetString(args[1]),
        );
        if (msgFormat.includes("Welcome to Tribes")) {
          this.connectedPlayerName = name;
          this.connectedClientId = clientId;
          this.onMissionInfoChange?.();
        }
      }
    } else if (msgType === "MsgClientDrop" && args.length >= 4) {
      // Wire order: args[2]=clientName, args[3]=clientId
      const clientId = parseInt(this.resolveNetString(args[3]), 10);
      if (!isNaN(clientId)) {
        this.playerRoster.delete(clientId);
        this.onRosterChanged();
      }
    } else if (msgType === "MsgClientNameChanged" && args.length >= 5) {
      // Community servers let a player add or drop a clan tag — or
      // change the whole name — mid-match. Wire order (verified on the
      // Ski Club server): args[2]=old name, args[3]=new name,
      // args[4]=clientId. The target table follows with its own
      // TargetInfoEvent; both land on the same client here, and the
      // player's entity is renamed at once rather than a packet later.
      const rawName = this.resolveNetString(args[3]);
      const name = stripTaggedStringMarkup(rawName).trim();
      const clientId = parseInt(this.resolveNetString(args[4]), 10);
      const entry = isNaN(clientId)
        ? undefined
        : this.playerRoster.get(clientId);
      if (entry && name) {
        entry.name = name;
        entry.rawName = rawName;
        this.onRosterChanged();
        // The join told us their target on stock servers; rename it now
        // rather than a packet later. Where the join carried no target
        // (TacoServer sends it empty) the TargetInfoEvent alone does it.
        if (entry.targetId != null) {
          this.targetNames.set(entry.targetId, name);
          this.targetRawNames.set(entry.targetId, rawName);
          for (const entity of this.entities.values()) {
            if (entity.targetId === entry.targetId) {
              entity.playerName = name;
              entity.playerRawName = rawName;
            }
          }
        }
      }
    } else if (msgType === "MsgClientJoinTeam" && args.length >= 6) {
      // Wire order: args[2]=clientName, args[3]=teamName, args[4]=clientId, args[5]=teamId
      const clientId = parseInt(this.resolveNetString(args[4]), 10);
      const teamId = parseInt(this.resolveNetString(args[5]), 10);
      if (!isNaN(clientId) && !isNaN(teamId)) {
        const existing = this.playerRoster.get(clientId);
        if (existing) {
          existing.teamId = teamId;
        } else {
          this.playerRoster.set(clientId, {
            name: "",
            rawName: "",
            teamId,
            score: 0,
            ping: 0,
            packetLoss: 0,
          });
        }
        this.onRosterChanged();
      }
    } else if (msgType === "MsgPlayerScore" && args.length >= 5) {
      // Wire order: args[2]=clientId, args[3]=score, args[4]=ping, args[5]=packetLoss
      // Only update existing roster entries — the real client (scoreList.cs
      // handlePlayerScore) warns and ignores scores for unknown clients.
      const clientId = parseInt(this.resolveNetString(args[2]), 10);
      if (!isNaN(clientId)) {
        const existing = this.playerRoster.get(clientId);
        if (existing) {
          const score = parseInt(this.resolveNetString(args[3]), 10);
          const ping = parseInt(this.resolveNetString(args[4]), 10);
          const packetLoss = parseInt(this.resolveNetString(args[5] ?? ""), 10);
          // The live score HUD (SetLineHud) is authoritative on servers
          // (TacoServer) whose MsgPlayerScore reports 0; don't let a 0
          // here clobber a real score already applied from that HUD.
          if (!isNaN(score) && (score !== 0 || existing.score === 0)) {
            existing.score = score;
          }
          if (!isNaN(ping)) existing.ping = ping;
          if (!isNaN(packetLoss)) existing.packetLoss = packetLoss;
          this.onRosterChanged();
        }
      }
    } else if (msgType === "MsgSystemClock" && args.length >= 4) {
      // Wire order: args[2]=timeLimitMinutes, args[3]=timeRemainingMS.
      // Binary-verified (HudClock 0x004fe7e0/0x004fe8a0): the client
      // calls clockHud.setTime(timeRemainingMS / 60000), which stores a
      // single deadline; each frame renders abs(now - deadline) — so
      // 0 counts up from 00:00 (untimed/joiner sync), N counts down and
      // passes through zero into count-up overtime. args[2] is dead
      // data on the client ($Hud::TimeLimit, never read).
      const timeRemainingMS = parseFloat(this.resolveNetString(args[3]));
      this.clockAnchorStreamSec = this.getTimeSec();
      this.clockDurationMs = Number.isFinite(timeRemainingMS)
        ? timeRemainingMS
        : 0;
      // A running match clock (late-join case): warmup joiners get 0,0
      // and pre-start countdown ticks stay under ~30s.
      if (Number.isFinite(timeRemainingMS) && timeRemainingMS > 60_000) {
        this.matchStarted = true;
      }
    } else if (msgType === "MsgMissionStart") {
      // Sent for the pre-start countdown ticks and "Match started!" —
      // idle warmup sends neither.
      this.matchStarted = true;
    } else if (msgType === "MsgMissionDropInfo" && args.length >= 5) {
      // messageClient(%cl, 'MsgMissionDropInfo', ..., $MissionDisplayName, $MissionTypeDisplayName, $ServerName)
      const missionDisplayName = stripTaggedStringMarkup(
        this.resolveNetString(args[2]),
      );
      const missionTypeDisplayName = stripTaggedStringMarkup(
        this.resolveNetString(args[3]),
      );
      const serverDisplayName = stripTaggedStringMarkup(
        this.resolveNetString(args[4]),
      );
      log.info(
        "mission drop info: mission=%s gameType=%s server=%s",
        missionDisplayName,
        missionTypeDisplayName,
        serverDisplayName,
      );
      this.missionDisplayName = missionDisplayName || this.missionDisplayName;
      this.missionTypeDisplayName =
        missionTypeDisplayName || this.missionTypeDisplayName;
      this.serverDisplayName = serverDisplayName || this.serverDisplayName;
      this.onMissionInfoChange?.();
    } else if (msgType === "MsgLoadInfo" && args.length >= 5) {
      // messageClient(%cl, 'MsgLoadInfo', "", $CurrentMission, $MissionDisplayName, $MissionTypeDisplayName)
      const missionDisplayName = stripTaggedStringMarkup(
        this.resolveNetString(args[3]),
      );
      const missionTypeDisplayName = stripTaggedStringMarkup(
        this.resolveNetString(args[4]),
      );
      log.info(
        "load info: mission=%s gameType=%s",
        missionDisplayName,
        missionTypeDisplayName,
      );
      this.missionDisplayName = missionDisplayName || this.missionDisplayName;
      this.missionTypeDisplayName =
        missionTypeDisplayName || this.missionTypeDisplayName;
      this.loadInfo.begin();
      this.onMissionInfoChange?.();
    } else if (LoadInfoCollector.handles(msgType)) {
      this.loadInfo.apply(msgType, args, (s) => this.resolveNetString(s));
    } else if (msgType === "MsgClientReady" && args.length >= 3) {
      // messageClient(%cl, 'MsgClientReady', "", %game.class)
      const gameClassName = this.resolveNetString(args[2]);
      log.info("client ready: gameClass=%s", gameClassName);
      this.gameClassName = gameClassName || this.gameClassName;
      // Dropping into a (new) mission ends any match-over interval.
      this.matchEnded = false;
      this.matchStarted = false;
      this.onMissionInfoChange?.();
    } else if (msgType === "SetLineHud" && args.length >= 7) {
      if (
        applyScoreHudToRoster(
          args,
          (s) => this.resolveNetString(s),
          this.playerRoster,
        )
      ) {
        this.onRosterChanged();
      }
    } else if (msgType === "MsgDebriefAddLine" && args.length >= 5) {
      if (
        applyDebriefRowToRoster(
          args,
          (s) => this.resolveNetString(s),
          this.playerRoster,
        )
      ) {
        this.onRosterChanged();
      }
    } else if (
      msgType === "MsgClearDebrief" ||
      msgType === "MsgDebriefResult"
    ) {
      // The debrief burst is sent once per client from DefaultGame::gameOver
      // (and the Hunters/Siege variants) — the match-over signal. It stays
      // set through mission load until the next MsgClientReady.
      if (!this.matchEnded) log.info("match ended (debrief received)");
      this.matchEnded = true;
    }
  }

  // ── HUD-cache invalidation hooks (bump the generation counters) ──
  protected onTeamScoresChanged(): void {
    this._teamScoresGen++;
  }

  protected onRosterChanged(): void {
    this._rosterGen++;
  }

  protected handleHudRemoteCommand(funcName: string, args: string[]): void {
    if (funcName === "setWeaponsHudItem" && args.length >= 3) {
      const slot = parseInt(args[0], 10);
      const ammo = parseInt(args[1], 10);
      const add = args[2] === "1" || args[2] === "true";
      if (!isNaN(slot)) {
        if (add) this.weaponsHud.slots.set(slot, isNaN(ammo) ? -1 : ammo);
        else this.weaponsHud.slots.delete(slot);
        this.onWeaponsHudChanged();
      }
    } else if (funcName === "setWeaponsHudAmmo" && args.length >= 2) {
      const slot = parseInt(args[0], 10);
      const ammo = parseInt(args[1], 10);
      if (!isNaN(slot)) {
        this.weaponsHud.slots.set(slot, isNaN(ammo) ? -1 : ammo);
        this.onWeaponsHudChanged();
      }
    } else if (funcName === "setWeaponsHudActive" && args.length >= 1) {
      const slot = parseInt(args[0], 10);
      this.weaponsHud.activeIndex = isNaN(slot) ? -1 : slot;
      if (!isNaN(slot) && slot >= 0 && !this.weaponsHud.slots.has(slot)) {
        this.weaponsHud.slots.set(slot, -1);
      }
      this.onWeaponsHudChanged();
    } else if (funcName === "setWeaponsHudClearAll") {
      this.weaponsHud.slots.clear();
      this.weaponsHud.activeIndex = -1;
      this.onWeaponsHudChanged();
    } else if (funcName === "setBackpackHudItem" && args.length >= 2) {
      const num = parseInt(args[0], 10);
      const add = args[1] === "1" || args[1] === "true";
      if (add && !isNaN(num)) {
        this.backpackHud.packIndex = num;
        this.backpackHud.active = false;
        this.backpackHud.text = "";
      } else {
        this.backpackHud.packIndex = -1;
        this.backpackHud.active = false;
        this.backpackHud.text = "";
      }
    } else if (funcName === "setSatchelArmed") {
      this.backpackHud.active = true;
    } else if (
      funcName === "setCloakIconOn" ||
      funcName === "setRepairPackIconOn" ||
      funcName === "setShieldIconOn" ||
      funcName === "setSenJamIconOn"
    ) {
      this.backpackHud.active = true;
    } else if (
      funcName === "setCloakIconOff" ||
      funcName === "setRepairPackIconOff" ||
      funcName === "setShieldIconOff" ||
      funcName === "setSenJamIconOff"
    ) {
      this.backpackHud.active = false;
    } else if (funcName === "updatePackText" && args.length >= 1) {
      this.backpackHud.text = args[0] ?? "";
    } else if (funcName === "setInventoryHudItem" && args.length >= 3) {
      const slot = parseInt(args[0], 10);
      const amount = parseInt(args[1], 10);
      const add = args[2] === "1" || args[2] === "true";
      if (!isNaN(slot)) {
        if (add && !isNaN(amount)) this.inventoryHud.slots.set(slot, amount);
        else this.inventoryHud.slots.delete(slot);
        this.onInventoryHudChanged();
      }
    } else if (funcName === "setInventoryHudAmount" && args.length >= 2) {
      const slot = parseInt(args[0], 10);
      const amount = parseInt(args[1], 10);
      if (!isNaN(slot) && !isNaN(amount)) {
        this.inventoryHud.slots.set(slot, amount);
        this.onInventoryHudChanged();
      }
    } else if (funcName === "setInventoryHudClearAll") {
      this.inventoryHud.slots.clear();
      this.inventoryHud.activeSlot = -1;
      this.onInventoryHudChanged();
    }
  }

  protected onWeaponsHudChanged(): void {
    this._weaponsHudGen++;
  }

  protected onInventoryHudChanged(): void {
    this._inventoryHudGen++;
  }

  // ── Snapshot building ──

  /** Build entity list for snapshot, optionally filtering with a predicate. */
  protected buildEntityList(
    shouldInclude?: (entity: MutableEntity) => boolean,
  ): StreamEntity[] {
    const entities: StreamEntity[] = [];
    for (const entity of this.entities.values()) {
      if (shouldInclude && !shouldInclude(entity)) continue;

      let renderFlags =
        entity.targetId != null && entity.targetId >= 0
          ? (this.targetRenderFlags.get(entity.targetId) ??
            entity.targetRenderFlags)
          : entity.targetRenderFlags;
      if (entity.type === "Player" && !entity.imageSlots?.[3]) {
        renderFlags = renderFlags != null ? renderFlags & ~0x2 : renderFlags;
      }

      entities.push({
        id: entity.id,
        type: entity.type,
        visual: entity.visual,
        direction: entity.direction,
        ghostIndex: entity.ghostIndex,
        sourceGhostIndex: entity.sourceGhostIndex,
        beamStart: entity.beamStart,
        beamEnd: entity.beamEnd,
        beamHit: entity.beamHit,
        linkSourceId:
          entity.sourceGhostIndex != null
            ? this.entityIdByGhostIndex.get(entity.sourceGhostIndex)
            : undefined,
        linkTargetId:
          entity.linkTargetGhostIndex != null
            ? this.entityIdByGhostIndex.get(entity.linkTargetGhostIndex)
            : undefined,
        className: entity.className,
        dataBlockId: entity.dataBlockId,
        shapeHint: entity.shapeHint,
        dataBlock: entity.dataBlock,
        imageSlots: entity.imageSlots,
        lightType: entity.lightType,
        lightColor: entity.lightColor,
        lightTime: entity.lightTime,
        lightRadius: entity.lightRadius,
        lightOnlyStatic: entity.lightOnlyStatic,
        isStaticItem: entity.isStaticItem,
        mountObjectId:
          entity.mountObjectGhostIndex != null
            ? this.entityIdByGhostIndex.get(entity.mountObjectGhostIndex)
            : undefined,
        mountNode: entity.mountNode,
        falling: entity.falling,
        jetting: entity.jetting,
        playerName: entity.playerName,
        playerRawName: entity.playerRawName,
        targetGeneration: entity.targetGeneration,
        skinName: entity.skinName,
        skinPrefName: entity.skinPrefName,
        targetRenderFlags: renderFlags,
        targetId: entity.targetId,
        teamId: entity.sensorGroup,
        iffColor:
          (entity.type === "Player" || ((renderFlags ?? 0) & 0x2) !== 0) &&
          entity.sensorGroup != null
            ? this.resolveIffColor(entity.sensorGroup)
            : undefined,
        position:
          entity.position &&
          (entity.simulatedVelocity ||
            (entity.itemPhysics && !entity.itemPhysics.atRest))
            ? ([...entity.position] as [number, number, number])
            : entity.position,
        rotation: entity.rotation,
        scale: entity.scale,
        velocity: entity.velocity,
        health: entity.health,
        energy: entity.energy,
        actionAnim: entity.actionAnim,
        actionAtEnd: entity.actionAtEnd,
        actionHoldAtEnd: entity.actionHoldAtEnd,
        actionSeq: entity.actionSeq,
        armAction: entity.armAction,
        damageState: entity.damageState,
        // Fade and cloak are independent systems, passed separately so the
        // renderer can apply the correct visual treatment (texture replacement
        // for cloak, opacity-only for fade).
        fadeVal: entity.fadeVal ?? 1,
        cloakLevel: entity.cloakLevel ?? 0,
        faceViewer: entity.faceViewer,
        threads: entity.threads,
        explosionDataBlockId: entity.explosionDataBlockId,
        explosionLifetimeMS: entity.explosionLifetimeMS,
        explosionStartAgeMS: entity.explosionStartAgeMS,
        spawnTimeSec: entity.explosionSpawnSec,
        hasExploded: entity.hasExploded,
        maintainEmitterId: entity.maintainEmitterId,
        headPitch: entity.headPitch,
        headYaw: entity.headYaw,
        label: entity.label,
        audioFileName: entity.audioFileName,
        audioVolume: entity.audioVolume,
        audioIs3D: entity.audioIs3D,
        audioIsLooping: entity.audioIsLooping,
        audioMinDistance: entity.audioMinDistance,
        audioMaxDistance: entity.audioMaxDistance,
        audioMinLoopGap: entity.audioMinLoopGap,
        audioMaxLoopGap: entity.audioMaxLoopGap,
        wheels: entity.wheels,
        steeringYaw: entity.steeringYaw,
        frozen: entity.frozen,
        projectileAgeMS:
          entity.type === "Projectile" && entity.projAgeTicks != null
            ? entity.projAgeTicks * TICK_DURATION_MS
            : undefined,
        projectileActivateDelayMS: entity.projActivateDelayMS,
        maxSteeringAngle: entity.maxSteeringAngle,
        soundSlots: entity.soundSlots,
        sceneData: entity.sceneData,
        forceFieldData: entity.forceFieldData,
        forceFieldState: entity.forceFieldState,
        forceFieldAlpha:
          entity.forceFieldState != null && entity.forceFieldData
            ? forceFieldAlpha(
                {
                  state: entity.forceFieldState,
                  position: entity.forceFieldPosition ?? 0,
                },
                entity.forceFieldData.fadeMS,
              )
            : undefined,
      });
    }
    return entities;
  }

  /**
   * Compute the match clock value in ms, mirroring HudClockCtrl's actualTimeMS.
   * Negative = counting down (remaining), positive = counting up (elapsed).
   * Returns null if no clock has been set.
   */
  protected computeMatchClockMs(timeSec: number): number | null {
    if (this.clockAnchorStreamSec == null) return null;
    const elapsedMs = (timeSec - this.clockAnchorStreamSec) * 1000;
    // actualTimeMS = -clockDurationMs + elapsed
    // duration=0 → positive (count-up), duration>0 → starts negative (count-down)
    return -this.clockDurationMs + elapsedMs;
  }

  /**
   * Attach each team's flag skin from the target table. A flag target is
   * exactly a target with the flag render bit (0x2, set only by CTF flag
   * code) that is NOT a client's target — carriers get the bit on their
   * own target while holding. Client targets are excluded via the roster
   * (MsgClientJoin carries each client's targetId; covers unscoped
   * players in live) unioned with scoped Player entities (covers demos,
   * whose initial roster comes from the PLAYERLIST HUD state without
   * targetIds). The flag target's sensor group IS the flag's team
   * (CTFGame.cs setTargetSensorGroup) and its skin the team skin, and it
   * outlives the flag item ghost while carried — no name matching.
   */
  protected attachTeamFlagSkins(teamScores: TeamScore[]): void {
    const clientTargetIds = new Set<number>();
    for (const entry of this.playerRoster.values()) {
      if (entry.targetId != null) clientTargetIds.add(entry.targetId);
    }
    for (const entity of this.entities.values()) {
      if (entity.type === "Player" && entity.targetId != null) {
        clientTargetIds.add(entity.targetId);
      }
    }
    for (const [targetId, renderFlags] of this.targetRenderFlags) {
      if ((renderFlags & 0x2) === 0) continue;
      if (clientTargetIds.has(targetId)) continue;
      const teamId = this.targetTeams.get(targetId);
      const skin = this.targetSkins.get(targetId);
      if (teamId == null || !skin) continue;
      const ts = teamScores.find((t) => t.teamId === teamId);
      if (ts) ts.skinName = skin.toLowerCase();
    }
  }

  /** Build HUD arrays for snapshot. */
  private buildWeaponsHud(): {
    slots: WeaponsHudSlot[];
    activeIndex: number;
  } {
    return {
      slots: Array.from(this.weaponsHud.slots.entries()).map(
        ([index, ammo]): WeaponsHudSlot => ({ index, ammo }),
      ),
      activeIndex: this.weaponsHud.activeIndex,
    };
  }

  private buildInventoryHud(): {
    slots: InventoryHudSlot[];
    activeSlot: number;
  } {
    return {
      slots: Array.from(this.inventoryHud.slots.entries()).map(
        ([slot, count]): InventoryHudSlot => ({ slot, count }),
      ),
      activeSlot: this.inventoryHud.activeSlot,
    };
  }

  private buildBackpackHud(): BackpackHudState | null {
    return this.backpackHud.packIndex >= 0 ? { ...this.backpackHud } : null;
  }

  private buildTeamScoresAndRoster(): {
    teamScores: TeamScore[];
    playerRoster: PlayerRosterEntry[];
  } {
    const teamScores = this.teamScores.map((ts) => ({ ...ts }));
    this.attachTeamFlagSkins(teamScores);
    const teamCounts = new Map<number, number>();
    for (const { teamId } of this.playerRoster.values()) {
      if (teamId > 0) teamCounts.set(teamId, (teamCounts.get(teamId) ?? 0) + 1);
    }
    for (const ts of teamScores) {
      ts.playerCount = teamCounts.get(ts.teamId) ?? 0;
    }

    const playerRoster: PlayerRosterEntry[] = [];
    for (const [clientId, entry] of this.playerRoster) {
      playerRoster.push({ clientId, ...entry });
    }
    return { teamScores, playerRoster };
  }

  /** Force the next buildCachedHudState() to rebuild every part (e.g. on a
   *  mission change, alongside the outer snapshot cache reset). */
  protected invalidateHudCache(): void {
    this._hudCache = null;
  }

  /**
   * HUD-derived arrays for a snapshot, rebuilding only the parts whose
   * generation counter (or the backpack's identity) changed since the last
   * call — steady playback frames reuse the prior arrays. Shared by both
   * adapters' buildSnapshot().
   */
  protected buildCachedHudState(): {
    weaponsHud: { slots: WeaponsHudSlot[]; activeIndex: number };
    inventoryHud: { slots: InventoryHudSlot[]; activeSlot: number };
    backpackHud: BackpackHudState | null;
    teamScores: TeamScore[];
    playerRoster: PlayerRosterEntry[];
  } {
    const prev = this._hudCache;
    const weaponsHud =
      prev && prev.weaponsHudGen === this._weaponsHudGen
        ? prev.weaponsHud
        : this.buildWeaponsHud();
    const inventoryHud =
      prev && prev.inventoryHudGen === this._inventoryHudGen
        ? prev.inventoryHud
        : this.buildInventoryHud();
    const backpackHud =
      prev &&
      prev.backpackPackIndex === this.backpackHud.packIndex &&
      prev.backpackActive === this.backpackHud.active &&
      prev.backpackText === this.backpackHud.text
        ? prev.backpackHud
        : this.buildBackpackHud();
    let teamScores: TeamScore[];
    let playerRoster: PlayerRosterEntry[];
    if (
      prev &&
      prev.teamScoresGen === this._teamScoresGen &&
      prev.rosterGen === this._rosterGen
    ) {
      teamScores = prev.teamScores;
      playerRoster = prev.playerRoster;
    } else {
      ({ teamScores, playerRoster } = this.buildTeamScoresAndRoster());
    }

    this._hudCache = {
      weaponsHudGen: this._weaponsHudGen,
      inventoryHudGen: this._inventoryHudGen,
      teamScoresGen: this._teamScoresGen,
      rosterGen: this._rosterGen,
      backpackPackIndex: this.backpackHud.packIndex,
      backpackActive: this.backpackHud.active,
      backpackText: this.backpackHud.text,
      weaponsHud,
      inventoryHud,
      backpackHud,
      teamScores,
      playerRoster,
    };
    return { weaponsHud, inventoryHud, backpackHud, teamScores, playerRoster };
  }

  /** Build filtered chat and audio event arrays for the current time. */
  protected buildTimeFilteredEvents(timeSec: number): {
    chatMessages: ChatMessage[];
    serverEvents: ServerMessageEvent[];
    audioEvents: PendingAudioEvent[];
  } {
    if (this._chatSnapshotGen !== this._chatGen) {
      this._chatSnapshot = this.chatMessages.slice();
      this._chatSnapshotGen = this._chatGen;
    }
    if (this._serverEventsSnapshotGen !== this._serverEventsGen) {
      this._serverEventsSnapshot = this.serverEvents.slice();
      this._serverEventsSnapshotGen = this._serverEventsGen;
    }
    const chatMessages = this._chatSnapshot;
    const serverEvents = this._serverEventsSnapshot;
    const audioEvents = this.audioEvents.filter(
      (e) => e.timeSec > timeSec - 0.5 && e.timeSec <= timeSec,
    );
    return { chatMessages, serverEvents, audioEvents };
  }
}
