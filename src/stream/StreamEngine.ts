import {
  ConnectionState,
  type ConnectionEventEffect,
} from "../../relay/connectionState";
import { refreshFlagCarriers } from "../../relay/flagState";
import type { PlayerRecord } from "../../relay/playerReference";
import { DebrisHistory, debrisRetention } from "./debrisHistory";
import { LightningHistory } from "./lightningHistory";
import { ProjectileTrailHistory } from "./projectileTrailHistory";
import {
  resolveStreamLightning,
  resolveStreamPrecipitation,
} from "../weather/data";
import { THRUST_BACKWARD, THRUST_DOWN, THRUST_FORWARD } from "./types";
import { GroundEffectHistory, type GroundActor } from "./groundEffectHistory";
import { timelineRandom } from "./timelineRandom";
import { decodeVehicleSteering, wheelRotationAt } from "./vehicleWheels";
import { updateClientAnimation } from "./clientAnimation";
import { PlayerPrediction, type PlayerMove } from "./playerPrediction";
import type {
  PacketData,
  PhysicalZoneGhostData,
  PlayerGhostData,
  PlayerPacketData,
  PlayerDataBlock,
  SeekerProjectileDataBlock,
  SeekerProjectileGhostData,
  TurretPacketData,
} from "t2-demo-parser";
import {
  castWorldRay,
  withCollisionQueryBatch,
  type ForceFieldBox,
  type Vec3 as Point3,
} from "../collision/worldCollision";
import {
  forceFieldCollider,
  streamForceFieldPlacement,
} from "../world/placement";
import {
  PhysicalZoneSweep,
  type PhysicalZone,
} from "../collision/physicalZoneSweep";
import {
  DEFAULT_PLAYER_INTERPOLATION,
  RETAIL_PLAYER_INTERPOLATION,
} from "./playerInterpolation";
import { collisionState } from "../collision/collisionContext";
// Imported from the module rather than the `../scene` barrel: the
// barrel re-exports misToScene, which pulls the entire TorqueScript
// runtime (15 modules and a 0.2MB generated parser) into every
// consumer. The demo/live path takes its scene objects from GHOSTS
// and never interprets a line of TorqueScript.
import { ghostToSceneObject, updateSkyFromGhost } from "../scene/ghostToScene";
import type { SkyWeather } from "../scene/skyWeather";
import { updateInteriorAlarm } from "../scene/interiorAlarm";
import { getImageMountOffset } from "./imageMount";
import {
  buildLinearSegment,
  createLinearLaunchWarp,
  grenadeQuickSplash,
  LINEAR_LAUNCH_WARP_TICKS,
  predictLinearSplash,
  sampleLinearSegment,
  sampleLinearTick,
  stepBallistic,
  type LinearLaunchWarp,
  type LinearSegment,
} from "../collision/projectilePhysics";
import {
  getMountedVehicleIds,
  isProjectileCollisionTarget,
  ProjectileDynamicCollision,
  type ProjectileCollisionTarget,
} from "../collision/projectileDynamicCollision";
import {
  getProjectileShapeAsset,
  getProjectileShapeData,
  prepareProjectileShapes,
  ProjectileShapePoses,
  type ProjectileShapeLoader,
} from "../collision/projectileShapeAssets";
import {
  projectileMuzzlePosition,
  type ProjectileMuzzleFrame,
} from "./projectileMuzzle";
import {
  advanceMissileTargetHeat,
  observeMissileTargetHeat,
  readMissileHeatRates,
  type MissileHeatObservation,
} from "./missileLockHeat";
import {
  isInMissileLockCone,
  readMissileSeekerTuning,
} from "./missileLockGeometry";
import { PACKED_BODY_YAW_STEP, PACKED_HEAD_STEP } from "./quantizedPlayerAim";
import {
  castWaterRay,
  isPointSubmergedSimple,
  projectileWaterAt,
} from "../collision/waterLevel";
import {
  accelerateSeeker,
  advanceSeekerWarp,
  createSeekerWarp,
  seekerCasingFragments,
  seekerTuning,
  steerSeeker,
  type SeekerTarget,
  type SeekerWarp,
} from "./seekerProjectile";
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
} from "./entityClassification";
import { clamp } from "../mathUtils";
import {
  STREAM_TICK_SEC,
  TICK_DURATION_MS,
  MAX_PITCH,
  CameraMode_OrbitObject,
  CameraMode_OrbitPoint,
  observerOrbitDistance,
  yawPitchToQuaternion,
  playerYawToQuaternion,
  torqueQuatToThreeJS,
  torqueQuatHeading,
  torqueQuatPitch,
  isValidPosition,
  isVec3Like,
  isQuatLike,
  resolveShapeName,
  collectEffectShapeNames,
  getNumberField,
  isTruthyField,
  resolveTracerVisual,
  resolveBoltVisual,
  resolveBeamVisual,
  resolveLinkBeamVisual,
  resolveTargetBeamVisual,
  resolveShockLanceVisual,
  resolveSpriteVisual,
  targetBeamWarpDuration,
  targetBeamWarpProgress,
  TARGET_BEAM_PLAYER_WARP_SEC,
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
import { matrixFToQuaternion, torqueToThree } from "../scene/coordinates";
import type { MatrixF } from "../scene/types";
import type { WatchMissileLock } from "../../relay/types";
import type { Vec3 } from "./streamHelpers";
import {
  ForceFieldState,
  advanceForceField,
  forceFieldAlpha,
  forceFieldPositionForState,
} from "./forceFieldState";
import { isServerMessageCommand } from "../../relay/serverMessageDecode";
import { flagReturnDelaySec } from "./flagReturnTimer";
import type {
  ServerLoadInfo,
  BackpackHudState,
  ChatSegment,
  ChatMessage,
  SoundSlot,
  ThreadState,
  StreamCamera,
  StreamEntity,
  StreamSnapshot,
  DirectorEntity,
  StreamOrdnanceImpact,
  DirectorSnapshot,
  StreamingPlayback,
  ProjectileLifecycleEvent,
  PreloadAsset,
  InventoryHudSlot,
  PendingAudioEvent,
  MissileLockState,
  InferredMissileLock,
  PlayerRosterEntry,
  TeamScore,
  FlagTargetInfo,
  WeaponsHudSlot,
  ServerMessageEvent,
  WeaponImageState,
} from "./types";
import {
  explosionExplodeTicks,
  explosionLifetimeTicks,
  resolveExplosionTiming,
} from "./explosionLifetime";
import { getShapeSequenceDurationSec } from "./shapeSequences";
import {
  endActionPickHold,
  parkActionSlot,
  setActionThread,
} from "./actionSlot";
import { updateShapeThread } from "./shapeThreads";
import { ImageAnimation } from "./imageAnimation";
import { getShapeBounds, getShapeCenter } from "./shapeBounds";
import { DEFAULT_WORLD_GRAVITY, worldGravityToMS2 } from "./worldGravity";
import { resolveEmitterData } from "../particles/ParticleSystem";
import type { EmitterDataResolved } from "../particles/types";
import type {
  LightningStrike,
  LightningTargetTransform,
  PrecipitationState,
} from "../weather/types";
import type {
  ParsedData,
  GhostAlwaysObjectEventData,
  RemoteCommandEventData,
  Sim3DAudioEventData,
  Sim2DAudioEventData,
  GhostingMessageEventData,
} from "t2-demo-parser";
import { createLogger } from "../logger";
import { cloneData } from "../cloneData";

const log = createLogger("StreamEngine");

/**
 * Raw ServerMessage ring for self-parsing consumers. Sized for the
 * bursts that land between two snapshots: a catch-up's buffered live
 * packets replayed at once, or a full-roster join sweep.
 */
const MAX_SERVER_EVENTS = 2000;
const NO_MISSILE_LOCK: MissileLockState = {
  selfLocked: false,
  selfHomed: false,
};

/** Scratch segment end for advanceItems' swept casts (not retained). */
const _itemCastEnd: [number, number, number] = [0, 0, 0];
const linearTickStart: Point3 = [0, 0, 0];
const ballisticTickStart: Point3 = [0, 0, 0];
const linearTickEnd: Point3 = [0, 0, 0];

// Projectile::onAdd seeds 7; processTick decrements before collision.
const LINEAR_SOURCE_GRACE_TICKS = 6;

export type { Vec3 };

// ── Internal mutable entity type ──

/**
 * Every field of `T` spelled out, optional ones as possibly undefined: an
 * object literal of this type can't leave a field out.
 */
type EveryField<T> = { [K in keyof Required<T>]: T[K] };

/** Cosmetic ghosts have no role in planning or constructing its world. */
const PRESENTATION_GHOSTS = new Set([
  "AudioEmitter",
  "Explosion",
  "Lightning",
  "ParticleEmissionDummy",
  "Precipitation",
  "Splash",
]);

/** StreamEntity fields that buildEntityList derives rather than copies. */
type DerivedEntityField =
  | "teamId"
  | "iffColor"
  | "linkSourceId"
  | "linkTargetId"
  | "mountObjectId"
  | "spawnTimeSec"
  | "projectileAgeMS"
  | "projectileActivateDelayMS"
  | "forceFieldAlpha";

/** Persistent animation histories and assets use copy-on-write updates. */
type SharedEntityFields = Pick<
  StreamEntity,
  "threads" | "clientAnimation" | "imageSlots" | "sceneData"
>;

function splitEntityData<T extends SharedEntityFields>(entity: T) {
  const { threads, clientAnimation, imageSlots, sceneData, ...mutable } =
    entity;
  return {
    mutable,
    shared: { threads, clientAnimation, imageSlots, sceneData },
  };
}

/**
 * The simulation's entity: the StreamEntity fields it shares with snapshots,
 * plus state the simulation keeps to itself.
 */
export interface MutableEntity extends Omit<
  StreamEntity,
  DerivedEntityField | "ghostIndex" | "className" | "rotation"
> {
  ghostIndex: number;
  className: string;
  rotation: [number, number, number, number];
  /** Move tick when this ghost instance first entered scope. */
  spawnTick: number;
  /** Fire counts belong to ShapeBase slots and survive unmounts. */
  imageFireCounts?: number[];
  maxEnergy?: number;
  /** Retained across checkpoints to rebuild the canonical ambient emitter. */
  particleEmitterDataBlockId?: number;
  /** Normally empty: native sends datablocks before ghosts. Retain source
   * times while a hydrated/partial stream is waiting for its weather data. */
  pendingWeather?: (
    | {
        time: number;
        fields: ParsedData;
        precipitationSeed?: PrecipitationState;
      }
    | { strike: Omit<LightningStrike, "id" | "config"> }
  )[];
  /** pickActionAnimation is held off until then (a ski jump's +0x98c). */
  pickHeldUntilSec?: number;
  playerPrediction?: PlayerPrediction;
  physicalZone?: PhysicalZone;
  /** Demo tick of reconstructedAim's last packet observation. */
  aimObservationTick?: number;
  projectilePhysics?: "linear" | "ballistic" | "seeker";
  simulatedVelocity?: [number, number, number];
  gravityMod?: number;
  /** Ticks since the projectile left the muzzle (seeded from currTick). */
  projAgeTicks?: number;
  /** LinearProjectileData activateDelayMS: the projectile's shape plays
   *  its "activate" sequence once this old, then loops "maintain"
   *  (binary-verified, FUN_0062e010 / FUN_0062ee40). */
  projActivateDelayMS?: number;
  /** Link beams (ELF/repair): the target's ghost index. */
  linkTargetGhostIndex?: number;
  /** Beam endpoint lifetimes resolved from the last network update. */
  beamSourceId?: string | null;
  beamTargetId?: string | null;
  /** Precomputed flight segment for linear projectiles (Torque model:
   *  one static-world raycast at spawn, closed-form position per tick). */
  linearSegment?: LinearSegment;
  /** Packet launch parameters, before the tick's collision world is ready. */
  linearLaunch?: Omit<Parameters<typeof buildLinearSegment>[0], "wetStart">;
  linearLaunchWarp?: LinearLaunchWarp;
  /** Splash rays use the initial velocity and their own clock. */
  linearSplash?: ReturnType<typeof predictLinearSplash> | null;
  /** An initially hidden projectile reconstructs the launch from the impact. */
  hiddenSplashLaunch?: { start: Point3; impactNormal: Point3 };
  /** Initial grenade packet can report a crossing before it entered scope. */
  quickSplash?: { position: Point3; velocity: Point3 };
  splashDataBlockId?: number;
  splashPlayed?: boolean;
  linearDynamicHits?: boolean;
  linearTickStart?: Point3;
  /** Bound at scope-in so a reused ghost slot is never mistaken for the shooter. */
  linearExclusions?: { sourceId?: string; vehicleId?: string };
  seekerFlight?: {
    inherited: Point3;
    launchDirection: Point3;
    earlyScope: boolean;
    target?: { id?: string; position?: Point3 };
    correction?: { position: Point3; velocity: Point3; scopeIn?: true };
    warp?: SeekerWarp;
    initialMuzzle?: boolean;
    muzzleFrame?: ProjectileMuzzleFrame;
  };
  /** Grenade-family bounce parameters resolved from the datablock. */
  projElasticity?: number;
  projFriction?: number;
  projDrag?: number;
  /** Tick after which contact explodes instead of bouncing. */
  projArmedTick?: number;
  explosionShape?: string;
  expiryTick?: number;
  /** Stream time (getTimeSec) at explode(): the renderer's animation origin. */
  explosionSpawnSec?: number;
  /** Explosion datablock's faceViewer, stashed for spawnExplosion — NOT this entity's. */
  explosionFaceViewer?: boolean;
  sensorGroup?: number;
  /** Ghost index of the object this entity is mounted on (vehicle, etc.).
   *  When set, the entity's rendered position is derived from the mount
   *  target's transform, not from its own ghost position. */
  mountObjectGhostIndex?: number;
  /** Bound mount lifetime, independent of the reusable wire ghost slot. */
  mountParentId?: string | null;
  /** The image and control turret aim belonging to this specific shot. */
  linearMuzzle?: ProjectileMuzzleFrame;
  /** Active fade animation state. Set when CloakMask fading=true. */
  fadeState?: { fadeOut: boolean; fadeTime: number; elapsed: number };
  /** Whether the cloak is active (mCloaked). */
  cloaked?: boolean;
  /** Item velocity interpolation state. The client simulates full physics
   *  (gravity, collision, bounce) for non-static, non-at-rest items. */
  itemPhysics?: {
    velocity: [number, number, number];
    atRest: boolean;
  };
  /** ForceFieldBare mCurrPosition, ms along the fade. */
  forceFieldPosition?: number;
}

type RuntimeControlObject = {
  ghostIndex: number;
  data?: ParsedData;
  position?: Vec3;
};

interface MissilePlayerObservation {
  tick: number;
  armorId?: number;
  position: Point3;
  yaw: number;
  headPitch: number;
  headYaw: number;
  heat?: MissileHeatObservation;
}

interface MissileLockDwell {
  targetId: string;
  imageId: number;
  mountedAt?: number;
  ticks: number;
}

const MISSILE_POSE_MAX_AGE_TICKS = 3;

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
  normal: [number, number, number];
}

function snapshotEntityPosition(entity: MutableEntity): Point3 | undefined {
  const { position } = entity;
  return position &&
    (entity.simulatedVelocity ||
      (entity.itemPhysics && !entity.itemPhysics.atRest))
    ? [...position]
    : position;
}

/**
 * Shared engine that processes parsed packet data (events, ghosts, control
 * object state) and maintains all game state. Subclasses provide the data
 * source: DemoParser blocks for demo playback, or PacketParser for live.
 */
export abstract class StreamEngine implements StreamingPlayback {
  readonly groundEffectHistory = new GroundEffectHistory();
  readonly debrisHistory = new DebrisHistory();
  readonly projectileTrailHistory = new ProjectileTrailHistory((id) =>
    this.getDataBlockData(id),
  );
  readonly lightningHistory = new LightningHistory();
  private _worldGeneration = 0;
  private readonly directorImpacts: StreamOrdnanceImpact[] = [];
  protected captureDirectorImpacts = false;
  private readonly projectileListeners = new Set<
    (event: ProjectileLifecycleEvent) => void
  >();
  private projectileShapeLoader?: ProjectileShapeLoader;
  private projectileShapeWait?: Promise<void>;
  private pendingProjectileLaunches: MutableEntity[] = [];
  protected pendingProjectileEvents?: ProjectileLifecycleEvent[];
  private projectileGhostBatch?: {
    finish?: (() => void)[];
    hydrating: boolean;
  };

  /** Render effects must discard the previous world after reset or restore. */
  get worldGeneration(): number {
    return this._worldGeneration;
  }

  private groundLifetimeData = new Map<number, number>();
  private ambientEmitterData = new Map<
    number,
    {
      raw: ParsedData;
      particleIds: number[];
      particles: (ParsedData | undefined)[];
      resolved: EmitterDataResolved | undefined;
    }
  >();
  private weatherData = new WeakMap<MutableEntity, unknown[]>();

  /** Refresh only when a mask or a referenced datablock identity changes. */
  private refreshWeather(entity: MutableEntity): void {
    if (
      (entity.className !== "Precipitation" &&
        entity.className !== "Lightning") ||
      entity.dataBlockId == null
    )
      return;
    const raw = this.getDataBlockData(entity.dataBlockId);
    if (!raw) return;
    const references =
      entity.className === "Precipitation"
        ? [raw.soundProfile]
        : [
            raw.thunderSound,
            ...(Array.isArray(raw.strikeSounds) ? raw.strikeSounds : []),
          ];
    const dependencies: unknown[] = [raw];
    for (const reference of references) {
      const profile =
        typeof reference === "number"
          ? this.getDataBlockData(reference)
          : undefined;
      const description =
        typeof profile?.description === "number"
          ? this.getDataBlockData(profile.description)
          : undefined;
      dependencies.push(reference, profile, description);
    }
    const previous = this.weatherData.get(entity);
    if (
      !entity.pendingWeather?.length &&
      previous?.length === dependencies.length &&
      dependencies.every((value, index) => previous[index] === value)
    )
      return;
    const updates: NonNullable<MutableEntity["pendingWeather"]> = entity
      .pendingWeather?.length
      ? entity.pendingWeather
      : [{ time: this.getTimeSec(), fields: {} }];
    for (const update of updates) {
      if ("strike" in update) {
        if (entity.lightning)
          this.lightningHistory.add({
            ...update.strike,
            config: entity.lightning,
          });
      } else if (entity.className === "Precipitation") {
        const config = resolveStreamPrecipitation(
          raw,
          update.fields,
          (id) => this.getDataBlockData(id),
          update.time,
          entity.precipitation,
        );
        const seed = update.precipitationSeed;
        entity.precipitation = seed
          ? { ...config, ...seed, storm: seed.storm }
          : config;
      } else {
        entity.lightning = resolveStreamLightning(
          raw,
          update.fields,
          (id) => this.getDataBlockData(id),
          entity.lightning,
        );
      }
    }
    entity.pendingWeather = undefined;
    this.weatherData.set(entity, dependencies);
  }

  /** A repeated dummy update must not restart its emission clock. */
  private resolveAmbientEmitterData(
    id: number,
  ): EmitterDataResolved | undefined {
    const raw = this.getDataBlockData(id);
    if (!raw) {
      this.ambientEmitterData.delete(id);
      return undefined;
    }
    const particleIds = Array.isArray(raw.particles)
      ? raw.particles.filter((ref): ref is number => typeof ref === "number")
      : [];
    const particles = particleIds.map((ref) => this.getDataBlockData(ref));
    const cached = this.ambientEmitterData.get(id);
    if (
      cached?.raw === raw &&
      cached.particleIds.length === particleIds.length &&
      particleIds.every((ref, index) => ref === cached.particleIds[index]) &&
      particles.every((particle, index) => particle === cached.particles[index])
    ) {
      return cached.resolved;
    }
    const resolved =
      resolveEmitterData(raw, (ref) => this.getDataBlockData(ref)) ?? undefined;
    this.ambientEmitterData.set(id, { raw, particleIds, particles, resolved });
    return resolved;
  }

  private groundRetentionSec(dataBlockId: number): number {
    const cached = this.groundLifetimeData.get(dataBlockId);
    if (cached !== undefined) return cached;
    const db = this.getDataBlockData(dataBlockId);
    if (!db) return 0;
    let complete = true,
      retention = 0;
    for (const name of [
      "footPuffEmitter",
      "dustEmitter",
      "dustTrailEmitter",
      "tireEmitter",
    ]) {
      const id = db[name];
      if (typeof id !== "number") continue;
      const emitter = this.getDataBlockData(id);
      if (!emitter) {
        complete = false;
        continue;
      }
      for (const particleId of (emitter.particles as
        (number | null)[] | undefined) ?? []) {
        if (particleId == null) continue;
        const particle = this.getDataBlockData(particleId);
        if (!particle) {
          complete = false;
          continue;
        }
        const lifetime =
          (Number(particle.lifetimeMS ?? 0) +
            Number(particle.lifetimeVarianceMS ?? 0)) *
          32;
        if (Number.isFinite(lifetime))
          retention = Math.max(retention, lifetime / 1000 + 1);
      }
    }
    // References may arrive in later packets. Cache the duration, not whether
    // it was applied: restoring a checkpoint can restore a shorter window.
    if (complete) this.groundLifetimeData.set(dataBlockId, retention);
    return retention;
  }

  /** Capture simulation inputs even when models have not loaded yet. */
  protected recordGroundEffects(): void {
    const actors: GroundActor[] = [];
    for (const entity of this.entities.values()) {
      if (
        (entity.type !== "Player" && entity.type !== "Vehicle") ||
        !entity.position ||
        entity.dataBlockId == null
      )
        continue;
      this.groundEffectHistory.retentionSec = Math.max(
        this.groundEffectHistory.retentionSec,
        this.groundRetentionSec(entity.dataBlockId),
      );
      actors.push({
        key: `${entity.ghostIndex}:${entity.spawnTick}`,
        ghostIndex: entity.ghostIndex,
        spawnTick: entity.spawnTick,
        type: entity.type,
        className: entity.className,
        dataBlockId: entity.dataBlockId,
        position: [...entity.position],
        rotation: entity.rotation ? [...entity.rotation] : [0, 0, 0, 1],
        velocity: entity.velocity ? [...entity.velocity] : [0, 0, 0],
        mounted: entity.mountObjectGhostIndex != null,
        jetting: entity.jetting,
        frozen: entity.frozen,
        scale: entity.scale ? [...entity.scale] : undefined,
        threads: entity.threads,
        clientAnimation: entity.clientAnimation,
        actionSlot: entity.actionSlot,
        damageState: entity.damageState,
      });
    }
    this.groundEffectHistory.append({
      timeSec: this.getTimeSec(),
      gravity: this.gravity,
      actors,
    });
  }

  // ── Parser infrastructure (set by subclass constructors) ──
  protected registry!: ParserRegistry;
  protected ghostTracker!: GhostTrackerLike;

  // ── Entities ──
  protected entities = new Map<string, MutableEntity>();
  private readonly playerForceFieldBoxes = new Map<string, ForceFieldBox>();
  private readonly physicalZones = new Map<string, PhysicalZone>();
  private readonly physicalZoneSweep = new PhysicalZoneSweep();
  private imageAnimations = new Map<string, (ImageAnimation | undefined)[]>();
  protected entityIdByGhostIndex = new Map<number, string>();
  /** Incremented on structural entity changes (add/remove/create). */
  protected entityGeneration = 0;
  /** See StreamSnapshot.ghostAlwaysDoneSec. */
  protected ghostAlwaysDoneSec: number | null = null;
  /** See StreamSnapshot.missionReadySec. */
  protected missionReadySec = 0;

  // ── Tick / time ──
  protected tickCount = 0;
  protected groundEffectsEnabled = true;
  /** Headless consumers can skip render-only effects and their histories. */
  protected presentationEffectsEnabled = true;
  protected pendingPlayerMoves: {
    id: number;
    move: PlayerMove;
    /** Replay input retains the view mode needed for its next simulation. */
    firstPerson?: boolean;
  }[] = [];
  protected nextPlayerMoveId = 0;
  protected lastClientMoveId = 0;
  protected playerPredictionEnabled = false;
  protected skippedPlayerPrediction = false;
  protected playerInterpolation = DEFAULT_PLAYER_INTERPOLATION;
  /** False when a demo's input history cannot safely be replayed. */
  protected controlMovesAvailable = true;

  /** Rendering opts in; timeline/director scanners retain recorded packet poses. */
  setPlayerPredictionEnabled(enabled: boolean): void {
    this.playerPredictionEnabled = enabled;
  }

  protected getPlayerLatencyTicks(): number {
    return 0;
  }

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

  // ── Connection state ──
  /**
   * Net strings, targets, sensor colors, roster, scores, flags, clock and
   * mission info: the same ConnectionState the relay keeps for catch-up, so a
   * late joiner matches a client that watched it all.
   */
  protected readonly conn = new ConnectionState({
    now: () => this.getTimeSec(),
    identityScope: "demo",
    playerTargetIds: () => this.playerGhostTargetIds(),
  });

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
  private missileLock?: MissileLockState;
  private missileLockInferenceEnabled = false;
  private missilePlayerObservations = new WeakMap<
    MutableEntity,
    MissilePlayerObservation
  >();
  private missileVehiclePoseTicks = new WeakMap<MutableEntity, number>();
  private missileLockDwell = new Map<string, MissileLockDwell>();
  private inferredMissileLocks?: InferredMissileLock[];
  protected lastControlType: "camera" | "player" = "camera";
  protected isPiloting = false;
  protected lastPilotGhostIndex?: number;
  protected lastVehicleHeading = 0;
  protected lastVehiclePitch = 0;
  protected lastVehicleOrbitDir?: [number, number, number];
  /** Vehicle velocity in Torque space (the ghost's linMomentum; Rigid mass is 1). */
  protected lastVehicleVelocity?: [number, number, number];
  /** Last known vehicle position in Torque space for extrapolation. */
  protected lastVehiclePos?: [number, number, number];
  private lastVehicleControl?: RuntimeControlObject;
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
    backpackPackIndex: number;
    backpackActive: boolean;
    backpackText: string;
    weaponsHud: { slots: WeaponsHudSlot[]; activeIndex: number };
    inventoryHud: { slots: InventoryHudSlot[]; activeSlot: number };
    backpackHud: BackpackHudState | null;
  } | null = null;
  private _matchSnapshotCache: {
    teamScoresGen: number;
    rosterGen: number;
    state: ReturnType<StreamEngine["buildTeamScoresAndRoster"]>;
  } | null = null;

  // ── Mission info (from server messages) ──
  /** Completed server loading-screen info (set on MsgLoadInfoDone). */
  get serverLoadInfo(): ServerLoadInfo | null {
    return this.conn.loadInfo.info;
  }

  /** Mission display name (e.g. "Riverdance"), from MsgMissionDropInfo/MsgLoadInfo. */
  get missionDisplayName(): string | null {
    return this.conn.missionDisplayName;
  }

  set missionDisplayName(name: string | null) {
    this.conn.missionDisplayName = name;
  }

  /** Game type display name (e.g. "Capture the Flag"), from MsgMissionDropInfo/MsgLoadInfo. */
  get missionTypeDisplayName(): string | null {
    return this.conn.missionTypeDisplayName;
  }

  set missionTypeDisplayName(name: string | null) {
    this.conn.missionTypeDisplayName = name;
  }

  /** Game class name (e.g. "CTFGame"), from MsgClientReady. */
  get gameClassName(): string | null {
    return this.conn.gameClassName;
  }

  set gameClassName(name: string | null) {
    this.conn.gameClassName = name;
  }

  /**
   * Server name from MsgMissionDropInfo, or Classic's mod-info MsgLoadInfo.
   */
  get serverDisplayName(): string | null {
    return this.conn.serverDisplayName;
  }

  set serverDisplayName(name: string | null) {
    this.conn.serverDisplayName = name;
  }

  /** Viewer's match-over interval: set by MissionEnd, cleared when
   *  the next mission's MsgClientReady drops the player in. */
  get matchEnded(): boolean {
    return this.conn.matchEnded;
  }

  /** Stream timestamp of the first end notification, retained across seeks. */
  protected get matchEndedAtSec(): number | null {
    return this.conn.matchEndedAtSec;
  }

  private endedEntities: StreamEntity[] | null = null;

  /** Hold the final scene; debrief UI messages can also arrive during play. */
  protected endMatch(): void {
    if (!this.conn.endMatch()) return;
    // Keep receiving protocol/HUD updates, but preserve the final world even
    // if late ghost updates or deletes arrive during the debrief.
    this.freezeMatchEndEntities();
  }

  protected freezeMatchEndEntities(): void {
    // Histories can be thousands of links deep. Share their immutable data,
    // just as checkpoints do, and detach only the mutable scene fields.
    const entities = this.buildEntityList().map(splitEntityData);
    const mutable = cloneData(entities.map((entity) => entity.mutable));
    this.endedEntities = mutable.map((entity, index) => ({
      ...entity,
      ...entities[index].shared,
    }));
  }

  /**
   * The match has been seen running: MsgMissionStart (countdown/start),
   * a running clock > 60 s, or a team with points on the board (late
   * joins — untimed servers never send a running clock). Cleared when
   * the next mission drops us in. Gates the auto score screen so joining
   * an already-ended match doesn't count as witnessing its end.
   */
  get matchStarted(): boolean {
    return this.conn.matchStarted;
  }
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

  getTargetSkinPref(targetId: number): string | undefined {
    return this.conn.targets.skinPrefs.get(targetId) || undefined;
  }

  /** Every datablock received so far, by ID (the packet parser's map). */
  protected abstract getDataBlockDataMap():
    ReadonlyMap<number, ParsedData> | undefined;

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

  /**
   * DTS shape names for weapon effects that should be preloaded, from every
   * datablock received so far (from-connect recordings deliver theirs in
   * packets, not the initial block).
   */
  getEffectShapes(): string[] {
    const dataBlocks = this.getDataBlockDataMap();
    if (!dataBlocks) return [];
    // Resolve by ID so a demo's initial-block copy wins, as it does for
    // every other datablock lookup.
    return collectEffectShapeNames(
      Array.from(dataBlocks.keys(), (id) => this.getDataBlockData(id)),
    );
  }

  /** Category-scoped shape names for getPreloadAssets (per data source). */
  protected abstract getPreloadShapeNames(): string[];

  /**
   * Prioritized prefetch list: the terrain file, interior DIFs, and
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
  subscribeProjectileLifecycle(
    listener: (event: ProjectileLifecycleEvent) => void,
  ): () => void {
    this.projectileListeners.add(listener);
    return () => this.projectileListeners.delete(listener);
  }
  setProjectileShapeLoader(loader: ProjectileShapeLoader | undefined): void {
    this.projectileShapeLoader = loader;
    this.projectileShapeWait = undefined;
  }

  setMissileLockInferenceEnabled(enabled: boolean): void {
    this.missileLockInferenceEnabled = enabled;
    if (!enabled) this.resetMissileLockInference();
  }

  private resetMissileLockInference(): void {
    this.missilePlayerObservations = new WeakMap();
    this.missileVehiclePoseTicks = new WeakMap();
    this.missileLockDwell.clear();
    this.inferredMissileLocks = undefined;
  }

  protected get missileLockWorldReady(): boolean {
    return this.ghostAlwaysDoneSec !== null;
  }

  get projectileAssetWait(): Promise<void> | undefined {
    return this.projectileShapeWait;
  }

  /** Load only the shapes needed to predict flights active in this tick. */
  protected prepareProjectileAssets(): Promise<void> | undefined {
    if (!this.projectileShapeLoader) return;
    const names = new Set<string>();
    const add = (entity: MutableEntity) => {
      const shape = entity.shapeHint ?? entity.dataBlock;
      if (shape) names.add(shape);
    };
    let dynamicHits = false;
    for (const flight of this.entities.values()) {
      if (!flight.position || flight.hasExploded) continue;
      const targetId = flight.seekerFlight?.target?.id;
      const target = targetId ? this.entities.get(targetId) : undefined;
      if (target) {
        if (target.type !== "Player") add(target);
        for (const parent of this.projectileMountParents(target)) add(parent);
      }
      const linear = flight.linearSegment || flight.linearLaunch;
      if (linear) dynamicHits ||= this.usesDynamicProjectileHits(flight);
      const seekerMuzzle = flight.seekerFlight?.initialMuzzle;
      const linearMuzzle =
        (flight.linearLaunch || flight.linearLaunchWarp) &&
        flight.spawnTick === this.tickCount;
      if (!seekerMuzzle && !linearMuzzle) continue;
      const id = seekerMuzzle
        ? flight.seekerLaunch?.sourceId
        : flight.linearExclusions?.sourceId;
      const source = id ? this.entities.get(id) : undefined;
      const muzzleFrame = seekerMuzzle
        ? flight.seekerFlight?.muzzleFrame
        : flight.linearMuzzle;
      const image = muzzleFrame
        ? muzzleFrame.image
        : flight.sourceSlot != null
          ? source?.imageSlots?.[flight.sourceSlot]
          : undefined;
      if (!source || !image) continue;
      names.add(image.shapeName);
      add(source);
      for (const parent of this.projectileMountParents(source)) add(parent);
    }
    if (dynamicHits) {
      for (const entity of this.entities.values()) {
        if (!this.canTakeProjectileHit(entity)) continue;
        if (entity.type !== "Player") add(entity);
        for (const parent of this.projectileMountParents(entity)) add(parent);
      }
    }
    this.projectileShapeWait = prepareProjectileShapes(
      names,
      this.projectileShapeLoader,
    );
    return this.projectileShapeWait;
  }
  abstract stepToTime(
    targetTimeSec: number,
    maxMoveTicks?: number,
    maxTimeMs?: number,
    allowForwardCheckpoint?: boolean,
  ): StreamSnapshot;

  /** Live streams are always at the present; demo playback overrides this
   *  to skip a from-connect recording's black lead-in. */
  findSceneReadyTime(_maxSec?: number): number {
    return 0;
  }

  /** Borrow state references only long enough to inspect its field schema.
   * This is not a restorable checkpoint and never visits entity/player data. */
  protected simulationCheckpointFields() {
    const state = this.buildSimulationCheckpointState(new Map());
    return {
      state: Object.keys(state),
      conn: Object.keys(state.conn),
      targets: Object.keys(state.conn.targets),
    };
  }

  /** One authoritative state-field list for both capture and import validation. */
  private buildSimulationCheckpointState(
    entities: Map<
      string,
      Omit<
        MutableEntity,
        "playerPrediction" | keyof SharedEntityFields | "particleEmitter"
      >
    >,
  ) {
    return {
      entities,
      entityIdByGhostIndex: this.entityIdByGhostIndex,
      ghostAlwaysDoneSec: this.ghostAlwaysDoneSec,
      missionReadySec: this.missionReadySec,
      tickCount: this.tickCount,
      pendingPlayerMoves: this.pendingPlayerMoves,
      nextPlayerMoveId: this.nextPlayerMoveId,
      lastClientMoveId: this.lastClientMoveId,
      controlMovesAvailable: this.controlMovesAvailable,
      skippedPlayerPrediction: this.skippedPlayerPrediction,
      camera: this.camera,
      chatMessages: this.chatMessages,
      serverEvents: this.serverEvents,
      chatMessageIdCounter: this.chatMessageIdCounter,
      audioEvents: this.audioEvents,
      conn: this.conn.save(),
      lastStatus: this.lastStatus,
      predictedEnergy: this.predictedEnergy,
      predictedHeat: this.predictedHeat,
      controlRechargeRate: this.controlRechargeRate,
      lastEnergyCorrectionData: this.lastEnergyCorrectionData,
      latestControl: {
        ...this.latestControl,
        ...(this.missileLock && { missileLock: this.missileLock }),
      },
      controlPlayerGhostId: this.controlPlayerGhostId,
      lastControlType: this.lastControlType,
      isPiloting: this.isPiloting,
      lastPilotGhostIndex: this.lastPilotGhostIndex,
      lastVehicleHeading: this.lastVehicleHeading,
      lastVehiclePitch: this.lastVehiclePitch,
      lastVehicleOrbitDir: this.lastVehicleOrbitDir,
      lastVehicleVelocity: this.lastVehicleVelocity,
      lastVehiclePos: this.lastVehiclePos,
      lastVehicleControl: this.lastVehicleControl,
      firstPerson: this.firstPerson,
      lastCameraMode: this.lastCameraMode,
      lastOrbitGhostIndex: this.lastOrbitGhostIndex,
      lastOrbitDistance: this.lastOrbitDistance,
      latestFov: this.latestFov,
      weaponsHud: this.weaponsHud,
      backpackHud: this.backpackHud,
      inventoryHud: this.inventoryHud,
      connectedPlayerName: this.connectedPlayerName,
      connectedClientId: this.connectedClientId,
      pendingExplosions: this.pendingExplosions,
      worldGravity: this.worldGravity,
    };
  }

  /** Snapshot mutable simulation data, sharing immutable assets and timelines. */
  protected captureSimulationState() {
    const entities = new Map<
      string,
      Omit<
        MutableEntity,
        "playerPrediction" | keyof SharedEntityFields | "particleEmitter"
      >
    >();
    const shared = new Map<string, SharedEntityFields>();
    const players = new Map<
      string,
      ReturnType<PlayerPrediction["saveState"]>
    >();
    for (const [id, entity] of this.entities) {
      const {
        playerPrediction,
        // Derived from particleEmitterDataBlockId on restore, so checkpoints
        // need neither a redundant copy nor stale resolved datablock values.
        particleEmitter: _particleEmitter,
        ...fields
      } = entity;
      const snapshot = splitEntityData(fields);
      entities.set(id, snapshot.mutable);
      shared.set(id, snapshot.shared);
      if (playerPrediction) players.set(id, playerPrediction.saveState());
    }
    return {
      // Persisted checkpoints use the stock budget. Session snapshots can
      // carry a different limit so remaining prediction ticks can be rebased.
      ...(this.playerInterpolation.maxPredictionTicks !==
        RETAIL_PLAYER_INTERPOLATION.maxPredictionTicks && {
        predictionLimit: this.playerInterpolation.maxPredictionTicks,
      }),
      state: structuredClone(this.buildSimulationCheckpointState(entities)),
      shared,
      endedEntities: this.endedEntities,
      players,
      images: new Map(
        Array.from(this.imageAnimations, ([id, images]) => [
          id,
          images.map((image) => image?.saveState()),
        ]),
      ),
      groundEffects: this.groundEffectHistory.save(),
      debris: this.debrisHistory.save(),
      projectileTrails: this.projectileTrailHistory.save(),
      lightning: this.lightningHistory.save(),
    };
  }

  protected restoreSimulationState(
    checkpoint: ReturnType<StreamEngine["captureSimulationState"]>,
  ): void {
    this.resetMissileLockInference();
    this.directorImpacts.length = 0;
    const {
      conn,
      latestControl: { missileLock, ...latestControl },
      ...state
    } = cloneData(checkpoint.state);
    this.groundEffectHistory.restore(checkpoint.groundEffects);
    this.debrisHistory.restore(checkpoint.debris);
    // Every restore creates new render lifetimes. Reusing checkpoint IDs would
    // retain stale mounted models, effects and per-entity renderer caches.
    const ids = new Map<string, string>();
    for (const id of state.entities.keys()) ids.set(id, allocateEntityId());
    for (const id of state.entityIdByGhostIndex.values())
      if (!ids.has(id)) ids.set(id, allocateEntityId());
    for (const entity of checkpoint.endedEntities ?? [])
      if (!ids.has(entity.id)) ids.set(entity.id, allocateEntityId());
    this.projectileTrailHistory.restore(checkpoint.projectileTrails, (id) => {
      let restored = ids.get(id);
      if (restored === undefined) {
        // Detached trails still own an emitter. Their saved IDs can overlap
        // IDs allocated by the client importing the checkpoint.
        restored = allocateEntityId();
        ids.set(id, restored);
      }
      return restored;
    });
    this.lightningHistory.restore(
      checkpoint.lightning,
      (id) => ids.get(id) ?? id,
    );
    Object.assign(this, state, { latestControl });
    this._worldGeneration++;
    this.ambientEmitterData.clear();
    this.conn.restore(conn);
    this.endedEntities =
      checkpoint.endedEntities?.map((entity) => ({
        ...entity,
        id: ids.get(entity.id)!,
        mountObjectId: entity.mountObjectId
          ? ids.get(entity.mountObjectId)
          : undefined,
        linkSourceId: entity.linkSourceId
          ? ids.get(entity.linkSourceId)
          : undefined,
        linkTargetId: entity.linkTargetId
          ? ids.get(entity.linkTargetId)
          : undefined,
      })) ?? null;
    this.entities = new Map();
    this.playerForceFieldBoxes.clear();
    this.physicalZones.clear();
    this.pendingProjectileLaunches.length = 0;
    this.projectileShapeWait = undefined;
    this.imageAnimations = new Map();
    const restoreGhostReference = (
      id: string | null | undefined,
      index: number | undefined,
    ) => {
      const saved =
        id === undefined && index != null
          ? state.entityIdByGhostIndex.get(index)
          : id;
      return saved ? (ids.get(saved) ?? null) : null;
    };
    for (const [oldId, mutable] of state.entities) {
      const entity: MutableEntity = {
        ...mutable,
        ...checkpoint.shared.get(oldId),
        id: ids.get(oldId)!,
      };
      if (
        (entity.type === "Projectile" ||
          entity.className === "SniperProjectile") &&
        entity.dataBlockId != null
      )
        this.readProjectileWaterData(
          entity,
          this.getDataBlockData(entity.dataBlockId),
        );
      if (entity.projectilePhysics === "linear" && entity.hasExploded) {
        entity.position = undefined;
        entity.simulatedVelocity = undefined;
      } else if (
        entity.linearLaunch ||
        (entity.linearLaunchWarp && entity.spawnTick === this.tickCount) ||
        entity.seekerFlight?.initialMuzzle
      ) {
        this.pendingProjectileLaunches.push(entity);
      }
      const linkBeam = entity.visual?.kind === "linkBeam";
      if (entity.targetBeam || linkBeam || entity.beamSourceId !== undefined)
        entity.beamSourceId = restoreGhostReference(
          entity.beamSourceId,
          entity.sourceGhostIndex,
        );
      if (linkBeam || entity.beamTargetId !== undefined)
        entity.beamTargetId = restoreGhostReference(
          entity.beamTargetId,
          entity.linkTargetGhostIndex,
        );
      if (entity.mountObjectGhostIndex != null)
        entity.mountParentId = restoreGhostReference(
          entity.mountParentId,
          entity.mountObjectGhostIndex,
        );
      const exclusions = entity.linearExclusions;
      if (exclusions) {
        entity.linearExclusions = {
          sourceId: exclusions.sourceId
            ? ids.get(exclusions.sourceId)
            : undefined,
          vehicleId: exclusions.vehicleId
            ? ids.get(exclusions.vehicleId)
            : undefined,
        };
      }
      if (entity.seekerLaunch?.sourceId) {
        entity.seekerLaunch = {
          ...entity.seekerLaunch,
          sourceId: ids.get(entity.seekerLaunch.sourceId),
        };
      }
      const seeker = entity.seekerFlight;
      if (seeker?.target?.id) {
        entity.seekerFlight = {
          ...seeker,
          target: { ...seeker.target, id: ids.get(seeker.target.id) },
        };
      }
      entity.pendingWeather = entity.pendingWeather?.map((update) =>
        "strike" in update
          ? {
              strike: {
                ...update.strike,
                stormId:
                  ids.get(update.strike.stormId) ?? update.strike.stormId,
                targetId: update.strike.targetId
                  ? (ids.get(update.strike.targetId) ?? update.strike.targetId)
                  : undefined,
              },
            }
          : update,
      );
      if (entity.particleEmitterDataBlockId != null) {
        entity.particleEmitter = this.resolveAmbientEmitterData(
          entity.particleEmitterDataBlockId,
        );
      }
      this.entities.set(entity.id, entity);
      if (entity.className === "ForceFieldBare")
        this.updatePlayerForceFieldBox(entity);
      if (entity.physicalZone)
        this.physicalZones.set(entity.id, entity.physicalZone);
      const player = checkpoint.players.get(oldId);
      if (player)
        this.ensurePlayerPrediction(entity)?.restoreState(
          player,
          checkpoint.predictionLimit ??
            RETAIL_PLAYER_INTERPOLATION.maxPredictionTicks,
        );
      const images = checkpoint.images.get(oldId);
      if (images)
        this.imageAnimations.set(
          entity.id,
          images.map((saved, i) => {
            const slot = entity.imageSlots?.[i];
            if (!saved || !slot?.imageStates) return undefined;
            // Refresh older checkpoints' cached state tables from the
            // parser's corrected datablock flags.
            let states = slot.imageStates;
            const legacyThreads = states[0]?.shockwave === undefined;
            if (legacyThreads || states[0]?.recoil === undefined) {
              const block = this.getDataBlockData(slot.dataBlockId);
              if (block) states = parseWeaponImageStates(block) ?? states;
            }
            const migrated = states !== slot.imageStates;
            const image = new ImageAnimation(states, saved.timeSec, 0);
            image.restoreState(saved, legacyThreads && migrated);
            if (migrated) {
              entity.imageSlots = [...entity.imageSlots!];
              entity.imageSlots[i] = {
                ...slot,
                imageStates: states,
                animation: image.current,
              };
            }
            return image;
          }),
        );
    }
    this.entityIdByGhostIndex = new Map(
      Array.from(state.entityIdByGhostIndex, ([index, id]) => [
        index,
        ids.get(id)!,
      ]),
    );
    this.controlPlayerGhostId = state.controlPlayerGhostId
      ? ids.get(state.controlPlayerGhostId)
      : undefined;
    const outgoing = missileLock?.outgoing;
    this.missileLock =
      missileLock && outgoing?.kind === "object" && outgoing.targetId
        ? {
            ...missileLock,
            outgoing: { kind: "object", targetId: ids.get(outgoing.targetId) },
          }
        : missileLock;
    if (this.camera?.controlEntityId)
      this.camera.controlEntityId = ids.get(this.camera.controlEntityId);
    if (this.camera?.orbitTargetId)
      this.camera.orbitTargetId = ids.get(this.camera.orbitTargetId);
    const controlled = this.nestedControlEntity();
    if (controlled?.className === "Turret") {
      this.syncControlTurret(controlled);
      if (!this.camera) this.updateCameraPose(controlled);
    }
    for (const event of this.serverEvents)
      event.id = this.serverEventIdCounter++;
    this.entityGeneration++;
    this._chatGen++;
    this._chatSnapshotGen = -1;
    this._chatSnapshot = [];
    this._serverEventsGen++;
    this._serverEventsSnapshotGen = -1;
    this._serverEventsSnapshot = [];
    this.invalidateHudCache();
    this.onMissionInfoChange?.();
  }

  // ── Shared reset logic ──

  /** Clear all entity state (entities, ghost→ID map, generation).
   *  Called on full reset and on GhostingMessageEvent (mission change).
   *  Does NOT reset the ID counter — IDs must never be reused to avoid
   *  stale entity collisions in the render store after seeks. */
  protected clearAllEntities(): void {
    this._worldGeneration++;
    this.directorImpacts.length = 0;
    if (this.projectileGhostBatch) this.projectileGhostBatch.finish = undefined;
    this.conn.flagDroppedAtSec = {};
    this.endedEntities = null;
    this.missileLock = undefined;
    this.resetMissileLockInference();
    // A reset invalidates every ghost, so the world is incomplete again
    // until the server says otherwise.
    this.ghostAlwaysDoneSec = null;
    this.groundEffectHistory.clear();
    this.debrisHistory.clear();
    this.projectileTrailHistory.clear();
    this.lightningHistory.clear();
    this.groundLifetimeData.clear();
    this.ambientEmitterData.clear();
    this.entities.clear();
    this.playerForceFieldBoxes.clear();
    this.physicalZones.clear();
    this.pendingProjectileLaunches.length = 0;
    this.projectileShapeWait = undefined;
    this.imageAnimations.clear();
    this.entityIdByGhostIndex.clear();
    this.entityGeneration++;
    this.onTeamScoresChanged();
  }

  protected resetSharedState(): void {
    this.invalidateHudCache();
    this.conn.reset();
    this.clearAllEntities();
    this.missionReadySec = 0;
    this.tickCount = 0;
    this.pendingPlayerMoves = [];
    this.nextPlayerMoveId = 0;
    this.lastClientMoveId = 0;
    this.controlMovesAvailable = true;
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
    this.lastVehicleControl = undefined;
    this.firstPerson = true;
    this.lastCameraMode = undefined;
    this.lastOrbitGhostIndex = undefined;
    this.lastOrbitDistance = undefined;
    this.latestFov = 90;
    this.weaponsHud = { slots: new Map(), activeIndex: -1 };
    this.backpackHud = { packIndex: -1, active: false, text: "" };
    this.inventoryHud = { slots: new Map(), activeSlot: -1 };
    this.pendingExplosions = [];
    this.worldGravity = DEFAULT_WORLD_GRAVITY;
    // Note: connectedPlayerName and connectedClientId are NOT cleared here —
    // they are connection-level state set once from the "Welcome" MsgClientJoin,
    // and should persist across mission changes.
  }

  // ── Net string resolution ──

  protected resolveNetString(s: string): string {
    return resolveNetStringHelper(s, this.conn.netStrings);
  }

  protected formatRemoteArgs(template: string, args: string[]): string {
    return formatRemoteArgsHelper(template, args, this.conn.netStrings);
  }

  // ── Control object processing ──

  protected processMissileLock(packet: PacketData): void {
    // A dispatched packet with no seeker fields clears the state. Keepalives
    // and suppressed packets have no game payload.
    if (packet.ghostSectionStart === undefined || packet.parseFault) return;
    this.applyMissileLock(packet.gameState);
  }

  protected applyMissileLock(gameState: WatchMissileLock): void {
    const selfLocked = gameState.selfLocked === true;
    const selfHomed = gameState.selfHomed === true;
    let outgoing: MissileLockState["outgoing"];
    if (gameState.seekerMode === 1) {
      // Retail resolves this reference before reading the packet's ghosts.
      // Bind to the same lifetime so a reused ghost slot can't acquire a lock.
      const index = gameState.seekerObjectGhostIndex;
      const targetId =
        index === undefined ? undefined : this.entityIdByGhostIndex.get(index);
      outgoing = { kind: "object", targetId };
    } else {
      const lockedPosition = gameState.seekerMode === 2;
      const point = lockedPosition
        ? gameState.targetPos
        : gameState.seekerTracking
          ? gameState.seekerTrackingPos
          : undefined;
      if (isValidPosition(point))
        outgoing = {
          kind: lockedPosition ? "position" : "tracking",
          position: [point.x, point.y, point.z],
        };
    }
    this.missileLock =
      selfLocked || selfHomed || outgoing
        ? { selfLocked, selfHomed, outgoing }
        : NO_MISSILE_LOCK;
  }

  private snapshotMissileLock(): MissileLockState | undefined {
    if (this.matchEnded) return;
    const state = this.missileLock;
    const target = state?.outgoing;
    return state &&
      target?.kind === "object" &&
      target.targetId &&
      !this.entities.has(target.targetId)
      ? { ...state, outgoing: { kind: "object" } }
      : state;
  }

  private snapshotInferredMissileLocks():
    readonly InferredMissileLock[] | undefined {
    if (this.matchEnded || !this.inferredMissileLocks) return;
    // Live packets can remove a target or interrupt a lock between ticks.
    const current = this.inferredMissileLocks.filter(
      ({ shooterId, targetId }) => {
        const shooter = this.entities.get(shooterId);
        const target = this.entities.get(targetId);
        return (
          this.missileLockDwell.has(shooterId) &&
          shooter &&
          shooter.sensorGroup &&
          !shooter.damageState &&
          shooter.mountObjectGhostIndex == null &&
          target &&
          target.sensorGroup &&
          target.sensorGroup !== shooter.sensorGroup &&
          target.mountObjectGhostIndex == null &&
          !target.destroyedHidden &&
          target.damageState !== 2 &&
          (target.type !== "Player" || !target.damageState)
        );
      },
    );
    if (current.length) return current;
  }

  private observeMissilePlayer(entity: MutableEntity, data: ParsedData): void {
    let previous = this.missilePlayerObservations.get(entity);
    const unavailable =
      entity.damageState || entity.mountObjectGhostIndex != null;
    const changedArmor = previous && previous.armorId !== entity.dataBlockId;
    if (unavailable || changedArmor) {
      this.missilePlayerObservations.delete(entity);
      previous = undefined;
    }
    if (unavailable || changedArmor || data.allowWarp === false) {
      this.missileLockDwell.delete(entity.id);
      for (const [id, dwell] of this.missileLockDwell)
        if (dwell.targetId === entity.id) this.missileLockDwell.delete(id);
    }
    if (unavailable) return;

    const position = data.position as Vec3 | undefined;
    if (
      !isValidPosition(position) ||
      typeof data.moveFlag1 !== "boolean" ||
      typeof data.rotationZ !== "number" ||
      typeof data.headX !== "number" ||
      typeof data.headZ !== "number"
    )
      return;

    const block = this.getDataBlockData(entity.dataBlockId ?? -1);
    const rates = readMissileHeatRates(block);
    this.missilePlayerObservations.set(entity, {
      tick: this.tickCount,
      armorId: entity.dataBlockId,
      position: [position.x, position.y, position.z],
      yaw: Math.min(2 * Math.PI, data.rotationZ + PACKED_BODY_YAW_STEP / 2),
      headPitch:
        Math.abs(data.headX) < 1
          ? Math.min(1, data.headX + PACKED_HEAD_STEP / 2)
          : data.headX,
      headYaw: data.headZ + PACKED_HEAD_STEP / 2,
      heat:
        rates &&
        observeMissileTargetHeat(
          previous?.heat,
          this.tickCount,
          data.moveFlag1,
          rates,
        ),
    });
  }

  private inferMissileLocks(): void {
    const previousDwell = this.missileLockDwell;
    const nextDwell = new Map<string, MissileLockDwell>();
    this.missileLockDwell = nextDwell;
    this.inferredMissileLocks = undefined;
    const load = this.projectileShapeLoader;
    if (!load || !this.missileLockWorldReady) return;

    let poses: ProjectileShapePoses | undefined;
    let blockers: ProjectileDynamicCollision | undefined;
    let dryWorld: boolean | undefined;
    for (const shooter of this.entities.values()) {
      const image = shooter.imageSlots?.[0];
      if (
        shooter.type !== "Player" ||
        shooter.id === this.controlPlayerGhostId ||
        shooter.ghostIndex === this.latestControl.ghostIndex ||
        !shooter.sensorGroup ||
        shooter.damageState ||
        shooter.mountObjectGhostIndex != null ||
        !image?.imageState?.target ||
        image.imageState.wet
      )
        continue;
      const view = this.missilePlayerObservations.get(shooter);
      if (
        !view ||
        this.tickCount - view.tick > MISSILE_POSE_MAX_AGE_TICKS ||
        Math.abs(view.headYaw) > PACKED_HEAD_STEP ||
        isPointSubmergedSimple(...view.position)
      )
        continue;
      const tuning = readMissileSeekerTuning(
        this.getDataBlockData(image.dataBlockId),
        (id) => this.getDataBlockData(id),
      );
      if (!tuning) continue;
      if (!poses) {
        if (!this.playerCollisionReady()) return;
        const vehicleShapes = new Set<string>();
        // Water is always scoped. A dry world avoids guessing a vehicle or
        // turret's liquid coverage from a delayed position.
        dryWorld = collisionState().water.size === 0;
        for (const entity of this.entities.values()) {
          if (entity.className === "WaterBlock") dryWorld = false;
          if (entity.type !== "Vehicle" || !entity.position) continue;
          const shape = entity.shapeHint ?? entity.dataBlock;
          if (!shape) return;
          if (!getProjectileShapeData(shape)) vehicleShapes.add(shape);
        }
        if (vehicleShapes.size) {
          void prepareProjectileShapes(vehicleShapes, load);
          return;
        }
        poses = new ProjectileShapePoses((index, id) =>
          this.projectileSource(index, id),
        );
      }
      const body = shooter.shapeHint ?? shooter.dataBlock;
      if (!body) continue;
      if (
        !getProjectileShapeData(body) ||
        !getProjectileShapeData(image.shapeName)
      ) {
        // Inference can wait for ordinary asset loading without delaying a tick.
        void prepareProjectileShapes([body, image.shapeName], load);
        continue;
      }
      const direction: Point3 = [0, 0, 0];
      const muzzle = this.resolveProjectileMuzzle(
        {
          ...shooter,
          position: view.position,
          rotation: playerYawToQuaternion(view.yaw),
          headPitch: view.headPitch,
          headYaw: view.headYaw,
          playerDelta: undefined,
        },
        0,
        poses,
        undefined,
        direction,
      );
      if (!muzzle) continue;

      let candidate: { id: string; heat: number } | undefined;
      let ambiguous = false;
      for (const target of this.entities.values()) {
        if (
          target.id === shooter.id ||
          target.sensorGroup === shooter.sensorGroup ||
          target.sensorGroup === 0 ||
          target.damageState === 2 ||
          target.destroyedHidden ||
          (target.type !== "Player" &&
            target.type !== "Vehicle" &&
            target.className !== "Turret" &&
            !(target.className === "StaticShape" && target.targetId != null))
        )
          continue;

        const observation = this.missilePlayerObservations.get(target);
        const block = this.getDataBlockData(target.dataBlockId ?? -1);
        const rates = observation && readMissileHeatRates(block);
        const playerHeat =
          observation?.heat && rates
            ? advanceMissileTargetHeat(
                observation.heat.bounds,
                this.tickCount,
                undefined,
                rates,
              )
            : undefined;
        const vehicleTick = this.missileVehiclePoseTicks.get(target);
        const dryShape =
          dryWorld &&
          target.mountObjectGhostIndex == null &&
          ((target.className === "Turret" &&
            block?.neverUpdateControl !== true) ||
            (target.type === "Vehicle" &&
              vehicleTick !== undefined &&
              this.tickCount - vehicleTick <= MISSILE_POSE_MAX_AGE_TICKS));
        // ShapeBaseData defaults to 1 when the packet omits heat. Turrets
        // apply their datablock's heat every dry tick and vehicles start at it.
        const shapeHeat =
          dryShape && block
            ? clamp(getNumberField(block, ["heat"]) ?? 1, 0, 1)
            : undefined;
        const heat =
          playerHeat ??
          (shapeHeat === undefined
            ? undefined
            : { min: shapeHeat, max: shapeHeat });
        if (heat && heat.max < tuning.minHeat) continue;

        const box = block?.boxSize as Vec3 | undefined;
        const height =
          target.type === "Player" && isValidPosition(box) ? box.z : undefined;
        const center =
          observation && height !== undefined
            ? ([
                observation.position[0],
                observation.position[1],
                observation.position[2] + height / 2,
              ] satisfies Point3)
            : poses.getCenter(target, height);
        if (
          !center ||
          !isInMissileLockCone(muzzle, direction, center, tuning, -Math.PI / 90)
        )
          continue;

        if (dryShape) {
          const shape = target.shapeHint ?? target.dataBlock;
          if (!shape) {
            ambiguous = true;
            break;
          }
          if (!getProjectileShapeData(shape)) {
            void prepareProjectileShapes([shape], load);
            ambiguous = true;
            break;
          }
        }

        if (castWorldRay(muzzle, center, { includeForceFields: false }))
          continue;
        blockers ??= new ProjectileDynamicCollision(
          this.projectileCollisionTargets(poses, true),
        );
        if (blockers.cast(muzzle, center, shooter.id, target.id)) continue;

        const freshPlayer =
          observation &&
          height !== undefined &&
          this.tickCount - observation.tick <= MISSILE_POSE_MAX_AGE_TICKS;
        if (
          candidate ||
          !target.sensorGroup ||
          (!freshPlayer && !dryShape) ||
          (target.type === "Player" &&
            (target.damageState || tuning.minHeat >= 1)) ||
          !heat ||
          heat.min < tuning.minHeat ||
          !isInMissileLockCone(muzzle, direction, center, tuning)
        ) {
          ambiguous = true;
          break;
        }
        candidate = { id: target.id, heat: heat.min };
      }
      if (ambiguous || !candidate) continue;

      const previous = previousDwell.get(shooter.id);
      const ticks =
        previous?.targetId === candidate.id &&
        previous.imageId === image.dataBlockId &&
        previous.mountedAt === image.mountedAtSec
          ? previous.ticks + 1
          : 1;
      nextDwell.set(shooter.id, {
        targetId: candidate.id,
        imageId: image.dataBlockId,
        mountedAt: image.mountedAtSec,
        ticks,
      });
      // The retail heat-dependent dwell uses 1/32 second per server tick.
      if (ticks / 32 >= (2 - candidate.heat) * tuning.seekTime)
        (this.inferredMissileLocks ??= []).push({
          shooterId: shooter.id,
          targetId: candidate.id,
          warnTarget: tuning.warnTarget,
        });
    }
  }

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
      // Absent fields mean unchanged, as GameConnection::readPacket only
      // invokes readPacketData for a dirty control object (0x5fb9f0).
      data:
        controlData ??
        (nextGhostIndex === prevControl.ghostIndex
          ? prevControl.data
          : undefined),
      position: controlPosition,
    };

    if (nextGhostIndex !== prevControl.ghostIndex) {
      const entityId = this.entityIdByGhostIndex.get(nextGhostIndex);
      const entity = entityId ? this.entities.get(entityId) : undefined;
      if (entity?.sensorGroup != null && entity.sensorGroup > 0) {
        this.conn.playerSensorGroup = entity.sensorGroup;
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
          if (this.lastPilotGhostIndex !== controlData.controlObjectGhost) {
            this.lastVehicleControl = undefined;
            this.lastVehiclePos = undefined;
            this.lastVehicleVelocity = undefined;
          }
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
        this.controlPlayerGhostId = undefined;
        const mode = controlData.cameraMode;
        if (typeof mode === "number") {
          this.lastCameraMode = mode;
          if (mode !== CameraMode_OrbitObject) {
            this.lastOrbitGhostIndex = undefined;
          } else if (typeof controlData.orbitObjectGhostIndex === "number") {
            this.lastOrbitGhostIndex = controlData.orbitObjectGhostIndex;
          }
          if (
            mode === CameraMode_OrbitObject ||
            mode === CameraMode_OrbitPoint
          ) {
            this.lastOrbitDistance =
              observerOrbitDistance(controlData) ?? this.lastOrbitDistance;
          } else {
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

    // Retail LightningStrikeEvent::process (0x00626ed0) resolves the source
    // storm and optional target ghosts. No strike is invented from its rate
    // during playback: these events are the authoritative strike moments.
    if (type === "LightningStrikeEvent") {
      if (!this.presentationEffectsEnabled) return;
      if (
        typeof data.sourceGhost !== "number" ||
        typeof data.startX !== "number" ||
        typeof data.startY !== "number" ||
        !Number.isFinite(data.startX) ||
        !Number.isFinite(data.startY)
      )
        return;
      const stormId = this.entityIdByGhostIndex.get(data.sourceGhost);
      const storm = stormId ? this.entities.get(stormId) : undefined;
      if (!stormId || !storm || storm.className !== "Lightning") return;
      this.refreshWeather(storm);
      const targetId =
        typeof data.targetGhost === "number"
          ? this.entityIdByGhostIndex.get(data.targetGhost)
          : undefined;
      const target = targetId ? this.entities.get(targetId) : undefined;
      const targetShape = target?.shapeHint ?? target?.dataBlock;
      const targetTransform: LightningTargetTransform | undefined =
        target?.position && targetShape
          ? {
              shapeName: targetShape,
              position: [...target.position],
              rotation: [...target.rotation],
              scale: target.scale ? [...target.scale] : undefined,
            }
          : undefined;
      const strike: Omit<LightningStrike, "id" | "config"> = {
        time: this.getTimeSec(),
        stormId,
        start: [
          Math.max(0, Math.min(1, data.startX)),
          Math.max(0, Math.min(1, data.startY)),
        ],
        targetId,
        targetPosition: targetTransform
          ? getShapeCenter(targetShape, targetTransform)
          : target?.position
            ? [...target.position]
            : undefined,
        targetTransform,
      };
      if (storm.lightning)
        this.lightningHistory.add({ ...strike, config: storm.lightning });
      else (storm.pendingWeather ??= []).push({ strike });
      return;
    }

    // GravityEvent: setGravity() on the server, and the current value on
    // connect. Everything that falls uses it.
    if (type === "GravityEvent") {
      if (typeof data.gravity === "number" && Number.isFinite(data.gravity)) {
        this.worldGravity = data.gravity;
        this.debrisHistory.setGravity(this.getTimeSec(), this.gravity);
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

    const connectionEffect = this.conn.applyEvent(data, eventName);
    if (connectionEffect) {
      this.applyConnectionEffect(connectionEffect);
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

      if (funcName === "BottomPrint" && args.length) {
        this.conn.observeBottomPrint(this.resolveNetString(args[0]));
      } else if (funcName === "MissionEnd") {
        this.endMatch();
      } else if (funcName === "ChatMessage" && args.length >= 4) {
        // Preserve per-segment color: format the template + args WITHOUT
        // stripping color bytes, drop the trailing ~w sound cue, then split
        // into colored segments (mirrors the demo chat path). The sender's
        // clan color and any mid-message colors survive to the UI.
        const colored = extractWavTag(
          formatRemoteArgsColored(args[3], args.slice(4), this.conn.netStrings),
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
      } else if (isServerMessageCommand(funcName) && args.length >= 1) {
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
      this.presentationEffectsEnabled &&
      (type === "Sim3DAudioEvent" ||
        type === "Sim2DAudioEvent" ||
        eventName === "Sim3DAudioEvent" ||
        eventName === "Sim2DAudioEvent")
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

  /** Finish projectile events in ghost order, after same-packet sources exist. */
  protected withProjectileGhostBatch(apply: () => void, hydrating = false) {
    const batch: NonNullable<StreamEngine["projectileGhostBatch"]> = {
      hydrating,
    };
    this.projectileGhostBatch = batch;
    try {
      apply();
    } finally {
      this.projectileGhostBatch = undefined;
    }
    if (batch.finish) for (const finish of batch.finish) finish();
  }

  private completeProjectileEvent(complete: () => void): void {
    if (this.projectileGhostBatch)
      (this.projectileGhostBatch.finish ??= []).push(complete);
    else complete();
  }

  private publishProjectileEvent(event: ProjectileLifecycleEvent): void {
    if (this.pendingProjectileEvents) {
      this.pendingProjectileEvents.push(event);
      return;
    }
    for (const listener of this.projectileListeners) listener(event);
  }

  protected flushProjectileEvents(): void {
    const events = this.pendingProjectileEvents;
    this.pendingProjectileEvents = undefined;
    for (const event of events ?? []) this.publishProjectileEvent(event);
  }

  private projectileSource(
    ghostIndex: number | undefined,
    boundId?: string | null,
  ) {
    if (boundId !== undefined)
      return boundId ? this.entities.get(boundId) : undefined;
    if (ghostIndex == null) return undefined;
    const id = this.entityIdByGhostIndex.get(ghostIndex);
    return id == null ? undefined : this.entities.get(id);
  }

  private bindBeamEndpoint(
    entity: MutableEntity,
    endpoint: "source" | "target",
  ): MutableEntity | undefined {
    const indexKey =
      endpoint === "source" ? "sourceGhostIndex" : "linkTargetGhostIndex";
    const idKey = endpoint === "source" ? "beamSourceId" : "beamTargetId";
    const index = entity[indexKey];
    const source = this.projectileSource(index);
    entity[idKey] = source?.id ?? null;
    if (!source && index != null && this.projectileGhostBatch) {
      // An initial snapshot or packet can list the beam before its endpoint.
      this.completeProjectileEvent(() => {
        if (entity[indexKey] === index && entity[idKey] === null)
          entity[idKey] = this.projectileSource(index)?.id ?? null;
      });
    }
    return source;
  }

  private visibleBeamEndpoint(
    id: string | null | undefined,
    index: number | undefined,
  ): string | undefined {
    if (id !== undefined) return id && this.entities.has(id) ? id : undefined;
    return index == null ? undefined : this.entityIdByGhostIndex.get(index);
  }

  private captureProjectileSourceName(
    projectile: MutableEntity,
    source: MutableEntity,
  ) {
    projectile.projectileSourceName =
      source.playerName ||
      source.label ||
      (source.className === "Turret" ? "Turret" : undefined);
  }

  private captureProjectileMuzzle(
    source: MutableEntity,
    slot: number | undefined,
  ): ProjectileMuzzleFrame {
    if (source.className === "Turret" && this.nestedControlEntity() === source)
      this.syncControlTurret(source);
    return {
      image: slot == null ? undefined : source.imageSlots?.[slot],
      turretAim: source.turretAim,
      recoilStartedAtSec: source.recoilStartedAtSec,
    };
  }

  private noteProjectileSpawn(projectile: MutableEntity, data?: ParsedData) {
    // Catch-up copies previously merged ghosts. Their source slots can have
    // changed occupants since the shot, so they cannot identify a new flight.
    if (this.projectileGhostBatch?.hydrating) return;
    const sourceIndex = projectile.sourceGhostIndex;
    const source = this.projectileSource(sourceIndex);
    const linear = projectile.linearLaunch ?? projectile.linearSegment;
    const seeker = projectile.seekerFlight;
    const vehicleIndex = getNumberField(data, ["vehicleObject"]);
    const vehicle = linear ? this.projectileSource(vehicleIndex) : undefined;
    const muzzle =
      (linear || seeker?.initialMuzzle) && source
        ? this.captureProjectileMuzzle(source, projectile.sourceSlot)
        : undefined;
    if (source) this.captureProjectileSourceName(projectile, source);
    const spawn =
      this.projectileListeners.size > 0 &&
      projectile.position != null &&
      !projectile.hasExploded;
    const pendingSource =
      !source && sourceIndex != null && this.projectileGhostBatch;
    if (!spawn && !pendingSource && !linear && !seeker) return;
    const timeSec = this.getTimeSec();
    const age = data?.currTick;
    const direction =
      linear?.vel ??
      projectile.simulatedVelocity ??
      projectile.velocity ??
      projectile.direction;
    this.completeProjectileEvent(() => {
      const samePacketSource = source ?? this.projectileSource(sourceIndex);
      if (!source && samePacketSource)
        this.captureProjectileSourceName(projectile, samePacketSource);
      if (seeker && samePacketSource && projectile.seekerLaunch) {
        projectile.seekerLaunch = {
          ...projectile.seekerLaunch,
          sourceId: samePacketSource.id,
        };
        if (seeker.initialMuzzle)
          seeker.muzzleFrame =
            muzzle ??
            this.captureProjectileMuzzle(
              samePacketSource,
              projectile.sourceSlot,
            );
      }
      if (
        linear &&
        this.entities.get(projectile.id) === projectile &&
        projectile.position &&
        !projectile.hasExploded
      ) {
        projectile.linearExclusions = {
          sourceId: samePacketSource?.id,
          vehicleId: (vehicle ?? this.projectileSource(vehicleIndex))?.id,
        };
        if (
          samePacketSource &&
          this.entities.has(samePacketSource.id) &&
          projectile.sourceSlot != null &&
          projectile.sourceSlot >= 0
        ) {
          projectile.linearMuzzle =
            muzzle ??
            this.captureProjectileMuzzle(
              samePacketSource,
              projectile.sourceSlot,
            );
        }
      }
      if (spawn)
        this.publishProjectileEvent({
          type: "spawn",
          id: projectile.id,
          timeSec,
          launchTimeSec:
            typeof age === "number" && Number.isFinite(age) && age >= 0
              ? timeSec - (age * TICK_DURATION_MS) / 1000
              : undefined,
          direction: direction && [...direction],
          sourceEntityId: samePacketSource?.id,
          sourceName: projectile.projectileSourceName,
        });
    });
  }

  protected processGhostUpdate(
    ghost: {
      index: number;
      type: "create" | "update" | "delete";
      classId?: number;
      parsedData?: ParsedData;
    },
    weatherSeed?: {
      precipitation?: PrecipitationState;
      skyWeather?: SkyWeather;
    },
  ): void {
    const ghostIndex = ghost.index;
    const prevEntityId = this.entityIdByGhostIndex.get(ghostIndex);
    const prevEntity = prevEntityId
      ? this.entities.get(prevEntityId)
      : undefined;
    const previousFlagPlayerTarget =
      prevEntity?.type === "Player" &&
      prevEntity.targetId != null &&
      ((this.conn.targets.renderFlags.get(prevEntity.targetId) ?? 0) & 0x2) !==
        0
        ? prevEntity.targetId
        : undefined;

    // Scope loss and slot replacement end tracking. Only a flight that
    // already reached its simulated endpoint can produce a local impact.
    if (prevEntity?.type === "Projectile" && ghost.type !== "update") {
      // An aged ghost can be removed before we get its first tick. Preserve
      // its terminal outcome using the collision geometry available now.
      if (prevEntity.projAgeTicks && !prevEntity.hasExploded)
        this.initializeLinearFlight(prevEntity);
      // Initial packets can report a splash that already happened, even if
      // the ghost leaves scope before it gets a simulation tick.
      this.prepareProjectileSplash(prevEntity);
      this.playReadyLinearSplash(prevEntity);
      if (!prevEntity.hasExploded && prevEntity.position) {
        const segment = prevEntity.linearSegment;
        const end = segment?.next ?? segment;
        if (
          end &&
          (prevEntity.projAgeTicks ?? 0) * TICK_DURATION_MS >= end.msEnd
        ) {
          // The server can delete the ghost during its final render interval.
          this.finishLinearFlight(prevEntity, end);
        } else {
          this.endProjectileFlight(prevEntity, prevEntity.position);
        }
      }
    }

    if (ghost.type === "delete") {
      if (prevEntityId) {
        this.imageAnimations.delete(prevEntityId);
        this.entities.delete(prevEntityId);
        if (prevEntity?.className === "ForceFieldBare")
          this.playerForceFieldBoxes.delete(prevEntityId);
        if (prevEntity?.physicalZone) this.physicalZones.delete(prevEntityId);
        this.entityIdByGhostIndex.delete(ghostIndex);
        this.entityGeneration++;
      }
      if (previousFlagPlayerTarget != null) this.onTeamScoresChanged();
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

    // A create is a new lifetime, even when the server reuses an occupied slot.
    // Renderers and mounted-image state must not inherit the previous object.
    const entityId =
      ghost.type === "create"
        ? allocateEntityId()
        : (prevEntityId ?? allocateEntityId());
    if (prevEntityId && prevEntityId !== entityId) {
      this.entities.delete(prevEntityId);
      if (prevEntity?.className === "ForceFieldBare")
        this.playerForceFieldBoxes.delete(prevEntityId);
      if (prevEntity?.physicalZone) this.physicalZones.delete(prevEntityId);
      this.imageAnimations.delete(prevEntityId);
    }

    let entity: MutableEntity;
    const existingEntity = this.entities.get(entityId);
    if (existingEntity) {
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
    this.applyGhostData(
      entity,
      ghost.parsedData,
      weatherSeed?.precipitation,
      !existingEntity,
    );
    if (
      className === "ForceFieldBare" &&
      (ghost.parsedData?.transform ||
        ghost.parsedData?.scale ||
        ghost.parsedData?.dataBlockId != null)
    )
      this.updatePlayerForceFieldBox(entity);
    if (!existingEntity && entity.type === "Projectile")
      this.noteProjectileSpawn(entity, ghost.parsedData);
    if (ghost.type === "create" || ghost.parsedData?.targetId != null) {
      const flagPlayerTarget =
        entity.type === "Player" &&
        entity.targetId != null &&
        ((this.conn.targets.renderFlags.get(entity.targetId) ?? 0) & 0x2) !== 0
          ? entity.targetId
          : undefined;
      // A scoped player excludes its own target from the original flags.
      if (previousFlagPlayerTarget !== flagPlayerTarget) {
        this.onTeamScoresChanged();
      }
    }
    entity.clientAnimation = updateClientAnimation(
      entity.clientAnimation,
      entity,
      this.getTimeSec(),
    );
    // Build full scene data on creates; sparse updates would overwrite the
    // asset/placement with defaults. Apply class-specific sparse changes below.
    if (ghost.type === "create" && ghost.parsedData) {
      const sceneObj = ghostToSceneObject(
        className,
        ghostIndex,
        ghost.parsedData as ParsedData,
        this.getTimeSec(),
      );
      if (sceneObj) {
        if (sceneObj.className === "InteriorInstance") {
          sceneObj.alarmChangedAtSec = this.getTimeSec();
          sceneObj.lightingStartTimeSec = this.getTimeSec();
        } else if (sceneObj.className === "Sky" && weatherSeed?.skyWeather) {
          sceneObj.weather = weatherSeed.skyWeather;
        }
        entity.sceneData = sceneObj;
      }
    } else if (entity.sceneData?.className === "Sky" && ghost.parsedData) {
      entity.sceneData = updateSkyFromGhost(
        entity.sceneData,
        ghost.parsedData,
        this.getTimeSec(),
      );
    } else if (
      entity.sceneData?.className === "InteriorInstance" &&
      typeof ghost.parsedData?.alarmState === "boolean"
    ) {
      entity.sceneData = updateInteriorAlarm(
        entity.sceneData,
        ghost.parsedData.alarmState,
        this.getTimeSec(),
      );
    }
  }

  // ── Apply ghost data ──

  private updatePlayerForceFieldBox(entity: MutableEntity): void {
    // Ack replay can use this geometry as soon as the field's packet arrives.
    const collider =
      entity.position && forceFieldCollider(streamForceFieldPlacement(entity));
    if (!collider) {
      this.playerForceFieldBoxes.delete(entity.id);
      return;
    }
    this.playerForceFieldBoxes.set(entity.id, {
      matrixWorld: collider.matrix,
      box: collider.box,
      worldBox: collider.box.clone().applyMatrix4(collider.matrix),
    });
  }

  protected ensurePlayerPrediction(
    entity: MutableEntity,
  ): PlayerPrediction | undefined {
    if (entity.dataBlockId != null) {
      const data = this.getDataBlockData(entity.dataBlockId) as
        PlayerDataBlock | undefined;
      if (data?.boxSize) {
        if (!entity.playerPrediction)
          entity.playerPrediction = new PlayerPrediction(
            data,
            {
              boxes: this.playerForceFieldBoxes,
              blocks: (id) => {
                const field = this.entities.get(id);
                if (!field || field.forceFieldState === ForceFieldState.Open)
                  return false;
                const fieldData =
                  field.dataBlockId != null
                    ? this.getDataBlockData(field.dataBlockId)
                    : undefined;
                const sameGroup =
                  (field.sensorGroup ?? 0) === (entity.sensorGroup ?? 0);
                return !(sameGroup
                  ? fieldData?.teamPermiable
                  : fieldData?.otherPermiable);
              },
            },
            this.playerInterpolation,
            (position, size, travel, touchesSolidAtDestination) =>
              this.physicalZones.size
                ? this.physicalZoneSweep.getVelocityScale(
                    this.physicalZones.values(),
                    position,
                    size,
                    travel,
                    touchesSolidAtDestination,
                  )
                : 1,
          );
        else if (entity.playerPrediction.data !== data)
          entity.playerPrediction.setDataBlock(data);
      }
    }
    return entity.playerPrediction;
  }

  protected playerCollisionReady(allowFailedAssets = false): boolean {
    // Scene loading is progressive. Never predict a stationary player falling
    // through a terrain/interior whose collision asset has not mounted yet.
    const world = collisionState();
    for (const entity of this.entities.values()) {
      if (allowFailedAssets && world.failedAssets.has(entity.ghostIndex))
        continue;
      if (entity.className === "TerrainBlock" && !world.terrain) return false;
      if (
        entity.className === "InteriorInstance" &&
        !world.interiors.has(`ghost:${entity.ghostIndex}`)
      )
        return false;
    }
    return true;
  }

  protected publishPlayerPrediction(
    entity: MutableEntity,
    prediction: PlayerPrediction,
  ): void {
    if (!prediction.hasPosition || prediction.mounted) {
      entity.playerDelta = undefined;
      return;
    }
    entity.position = prediction.position.toArray();
    entity.velocity = prediction.velocity.toArray();
    entity.rotation = playerYawToQuaternion(prediction.yaw);
    entity.headPitch =
      prediction.headPitch / (prediction.data.maxLookAngle || 1);
    entity.headYaw = prediction.headYaw / (prediction.data.maxLookAngle || 1);
    entity.viewQuantized = !prediction.exactView;
    entity.jetting = prediction.jetting;
    entity.falling = prediction.falling;
    entity.playerDelta = prediction.renderDelta();
  }

  /**
   * A predicted jump sets the player's one action slot, as Player::updateMove
   * (0x5d2d60) does through setActionThread: it replaces any other action,
   * even a held one. A ski jump also holds pickActionAnimation off for its
   * 22 ticks, and a 4–30 m/s hop ends that early.
   */
  protected applyPredictedAction(
    entity: MutableEntity,
    prediction: PlayerPrediction,
  ): void {
    const now = this.getTimeSec();
    const held = entity.pickHeldUntilSec;
    if (prediction.jumpAction === "ski")
      entity.pickHeldUntilSec =
        now + (prediction.skiTicks * TICK_DURATION_MS) / 1000;
    else if (!prediction.skiTicks) entity.pickHeldUntilSec = undefined;
    if (prediction.jumpAction)
      entity.actionSlot = setActionThread(
        entity.actionSlot,
        prediction.jumpAction,
        { timeSec: now, pickHeldUntilSec: entity.pickHeldUntilSec },
      );
    else if (held != null && entity.pickHeldUntilSec == null)
      entity.actionSlot = endActionPickHold(entity.actionSlot, now);
  }

  /** ProcessList::advanceObjects: one 32 ms tick, regardless of packet source. */
  protected processTick(): void {
    if (!this.matchEnded) {
      this.sampleProjectileLaunches();
      if (this.missileLockInferenceEnabled) this.inferMissileLocks();
    }
    this.tickCount++;
    // The viewer holds the final scene at MissionEnd while transport keeps
    // consuming the debrief and next mission. This is a viewer pause policy.
    if (this.matchEnded) return;
    if (this.presentationEffectsEnabled) {
      this.debrisHistory.prune(this.getTimeSec());
      this.projectileTrailHistory.prune(this.tickCount);
      this.lightningHistory.prune(this.getTimeSec());
    }
    this.advanceItems();
    this.advanceControlVehicle();
    this.advancePlayers();
    this.advanceProjectiles();
    this.lastClientMoveId = this.nextPlayerMoveId;
    this.advanceFades();
    this.advanceShapeAnimations();
    this.advanceForceFields();
    this.advanceControlEnergy();
    if (this.presentationEffectsEnabled && this.groundEffectsEnabled)
      this.recordGroundEffects();
    this.updateCameraAndHud();
  }

  /** Newly collected input, never the retransmitted unacknowledged move array. */
  protected collectMove(
    move: PlayerMove,
    id = this.nextPlayerMoveId,
    firstPerson?: boolean,
  ): void {
    if (id < this.nextPlayerMoveId) return;
    this.nextPlayerMoveId = id + 1;
    if (this.matchEnded) {
      this.pendingPlayerMoves.length = 0;
      this.lastClientMoveId = this.nextPlayerMoveId;
      return;
    }
    if (this.playerPredictionEnabled && this.lastControlType === "player")
      this.pendingPlayerMoves.push({
        id,
        move,
        ...(firstPerson === undefined ? {} : { firstPerson }),
      });
    else this.pendingPlayerMoves.length = 0;
    // The control player's ghost skips MoveMask (the server knows the client
    // predicts its own state). Derive jetting from the move's trigger[3],
    // matching Tribes2.exe Player::updateMove: mJetting = trigger[3] &&
    // energy >= minJetEnergy && state == MoveState && !disableMove.
    const triggers = move.trigger;
    if (triggers && this.controlPlayerGhostId) {
      const entity = this.entities.get(this.controlPlayerGhostId);
      if (entity) {
        entity.jetting = !!triggers[3];
      }
    }
    // The piloted vehicle's ghost skips its jet fields the same way
    // (Vehicle/FlyingVehicle::unpackUpdate control gate). Vehicle::
    // updateMove (FUN_0060b110) sets jetting from the same trigger and
    // FlyingVehicle::updateMove (FUN_00610220) picks the thrust direction
    // from move.y. The energy gate on jetting is not modelled.
    if (triggers) {
      const vehicle = this.nestedControlEntity();
      const moveY = move.y;
      if (vehicle?.type === "Vehicle") {
        vehicle.jetting = !!triggers[3];
        if (vehicle.className === "FlyingVehicle" && moveY != null) {
          vehicle.thrustDirection =
            moveY === 0
              ? THRUST_DOWN
              : moveY < 0
                ? THRUST_BACKWARD
                : THRUST_FORWARD;
        }
      }
    }
  }

  protected acknowledgeMoves(ack: number, controlData?: ParsedData): void {
    this.pendingPlayerMoves = this.pendingPlayerMoves.filter(
      ({ id }) => id >= ack,
    );
    this.nextPlayerMoveId = Math.max(this.nextPlayerMoveId, ack);
    if (controlData) {
      if (controlData.position)
        for (const pending of this.pendingPlayerMoves)
          if (pending.firstPerson !== undefined)
            pending.firstPerson = this.firstPerson;
      this.correctControlPlayer(
        controlData as PlayerPacketData,
        this.pendingPlayerMoves,
      );
      if (controlData.position) this.lastClientMoveId = this.nextPlayerMoveId;
    }
  }

  protected correctControlPlayer(
    data: PlayerPacketData,
    moves: readonly { move: PlayerMove; firstPerson?: boolean }[] = [],
  ): void {
    if (
      this.matchEnded ||
      !this.playerPredictionEnabled ||
      this.isPiloting ||
      this.lastControlType !== "player"
    )
      return;
    const id = this.entityIdByGhostIndex.get(this.latestControl.ghostIndex);
    const entity = id ? this.entities.get(id) : undefined;
    if (!entity || !data.position) return;
    const prediction = this.ensurePlayerPrediction(entity);
    if (!prediction) return;
    prediction.damageState = entity.damageState ?? 0;
    prediction.mounted = entity.mountObjectGhostIndex != null;
    prediction.allowFreelook = !this.firstPerson;
    prediction.readPacketData(data);
    // Observer recordings without usable control moves extrapolate from each
    // exact control packet, using the same budget as remote players.
    if (!this.controlMovesAvailable)
      prediction.predictionCount = this.playerInterpolation.maxPredictionTicks;
    if (this.playerCollisionReady())
      withCollisionQueryBatch(() => {
        for (const { move, firstPerson } of moves) {
          prediction.allowFreelook = !(firstPerson ?? this.firstPerson);
          prediction.processTick(
            this.worldGravity,
            move,
            data.rechargeRate ?? this.controlRechargeRate,
          );
          this.applyPredictedAction(entity, prediction);
        }
      });
    this.publishPlayerPrediction(entity, prediction);
  }

  protected advancePlayers(): void {
    if (!this.playerPredictionEnabled) return;
    if (!this.playerCollisionReady()) {
      for (const entity of this.entities.values()) {
        entity.playerDelta = undefined;
        if (entity.playerPrediction) this.skippedPlayerPrediction = true;
      }
      return;
    }
    withCollisionQueryBatch(() => {
      for (const entity of this.entities.values()) {
        const prediction = entity.playerPrediction;
        if (!prediction) continue;
        const isControl =
          this.lastControlType === "player" &&
          entity.ghostIndex === this.latestControl.ghostIndex;
        prediction.damageState = entity.damageState ?? 0;
        prediction.mounted =
          entity.mountObjectGhostIndex != null ||
          (isControl && this.isPiloting);
        prediction.allowFreelook = isControl && !this.firstPerson;
        let processed = !isControl || !this.controlMovesAvailable;
        if (isControl && this.controlMovesAvailable) {
          for (const { id, move, firstPerson } of this.pendingPlayerMoves) {
            if (id < this.lastClientMoveId) continue;
            prediction.allowFreelook = !(firstPerson ?? this.firstPerson);
            prediction.processTick(
              this.worldGravity,
              move,
              this.controlRechargeRate,
            );
            this.applyPredictedAction(entity, prediction);
            processed = true;
          }
        } else {
          prediction.processTick(this.worldGravity);
          this.applyPredictedAction(entity, prediction);
        }
        this.publishPlayerPrediction(entity, prediction);
        // With no newly collected input, reusing the previous tick's backstep
        // would visibly replay that movement even though the position is fixed.
        if (!processed) entity.playerDelta = undefined;
      }
    });
  }

  protected applyGhostData(
    entity: MutableEntity,
    rawData: ParsedData | undefined,
    precipitationSeed?: PrecipitationState,
    initial = false,
  ): void {
    if (!rawData) return;
    if (entity.className === "PhysicalZone") {
      const { transform, scale, points, velocityMod, active } =
        rawData as PhysicalZoneGhostData;
      if (
        transform &&
        scale &&
        points &&
        velocityMod != null &&
        active != null
      ) {
        const zone = { transform, scale, points, velocityMod, active };
        entity.physicalZone = zone;
        this.physicalZones.set(entity.id, zone);
      } else if (entity.physicalZone && active != null) {
        entity.physicalZone.active = active;
      }
    }
    // Retail leaves an exploded linear ghost hidden until it leaves scope,
    // including when its final server update arrives after a predicted hit.
    if (
      (entity.projectilePhysics === "linear" ||
        entity.projectilePhysics === "seeker") &&
      entity.hasExploded
    )
      return;
    const data = rawData;
    if (
      (entity.linearSegment || entity.linearLaunch) &&
      !isValidPosition(data.explodePosition as Vec3) &&
      !isValidPosition(data.explodePoint as Vec3)
    )
      return; // A repeated initial update cannot restart an existing flight.

    const dataBlockId = data.dataBlockId as number | undefined;
    if (dataBlockId != null) {
      if (entity.type === "Player" && entity.dataBlockId !== dataBlockId)
        entity.recoilStartedAtSec = undefined;
      entity.dataBlockId = dataBlockId;
      const blockData = this.getDataBlockData(dataBlockId);
      const shapeName = resolveShapeName(entity.className, blockData);
      entity.visual =
        resolveTracerVisual(entity.className, blockData) ??
        resolveBoltVisual(entity.className, blockData) ??
        resolveBeamVisual(entity.className, blockData) ??
        resolveTargetBeamVisual(entity.className, blockData) ??
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
          // SeekerProjectile::registerLights (FUN_0063d250) withholds the
          // light while a flechette missile is still in its flechette
          // phase: ticks < flechetteDelayMs >> 5.
          const flechetteDelayMs = getNumberField(blockData, [
            "flechetteDelayMs",
          ]);
          entity.lightDelayMS =
            entity.className === "SeekerProjectile" &&
            isTruthyField(blockData?.useFlechette) &&
            flechetteDelayMs != null
              ? (flechetteDelayMs >> 5) * TICK_DURATION_MS
              : undefined;
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
      if (
        entity.type === "Projectile" ||
        entity.className === "SniperProjectile"
      )
        this.readProjectileWaterData(entity, blockData);

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
        entity.className.endsWith("Vehicle") &&
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

    // Preserve wheel phase and snapshot history across sparse speed updates.
    if (Array.isArray(data.wheels)) {
      const now = this.getTimeSec();
      entity.wheels = (
        data.wheels as Array<{ avel: number; dx: number; dy: number }>
      ).map((w, i) => {
        const previous = entity.wheels?.[i];
        const rotation = previous
          ? wheelRotationAt(previous, now, entity.frozen)
          : 0;
        return {
          speed: w.avel,
          lateralSlip: w.dx,
          longitudinalSlip: w.dy,
          rotation,
          timeSec: now,
        };
      });
    } else if (
      entity.wheels &&
      typeof data.frozen === "boolean" &&
      data.frozen !== entity.frozen
    ) {
      // Freeze/resume can arrive without a new wheel speed. Preserve the
      // phase at the transition so frozen time never becomes extra rotation.
      const now = this.getTimeSec();
      entity.wheels = entity.wheels.map((wheel) => ({
        ...wheel,
        rotation: wheelRotationAt(wheel, now, entity.frozen),
        timeSec: now,
      }));
    }
    if (typeof data.steeringYaw === "number") {
      // t2-demo-parser exposes readFloat(9)'s [0, 1] wire value. Convert
      // using the vehicle's datablock before passing radians to animation.
      entity.steeringYaw = decodeVehicleSteering(
        data.steeringYaw,
        entity.maxSteeringAngle,
      );
    }
    if (typeof data.frozen === "boolean") {
      entity.frozen = data.frozen;
    }
    // Vehicle::unpackUpdate jetting flag and the flyer/hover 3-bit thrust
    // direction (Tribes2.exe FlyingVehicle::unpackUpdate), which gate the
    // jet flare threads and nozzle emitters.
    if (typeof data.jetting === "boolean") entity.jetting = data.jetting;
    if (typeof data.thrustDirection === "number") {
      entity.thrustDirection = data.thrustDirection;
    }
    // Vehicle ghosts carry the rigid body's linear momentum, and the
    // client's velocity is momentum × oneOverMass (Rigid::updateVelocity
    // FUN_005c57a0). The Rigid's mass stays at its constructor default of
    // 1 — VehicleData.mass only scales forces — so the momentum is the
    // velocity in m/s, which the jet and contrail emitters inherit.
    const momentum = data.linMomentum as
      { x: number; y: number; z: number } | undefined;
    if (momentum && isValidPosition(momentum)) {
      entity.velocity = [momentum.x, momentum.y, momentum.z];
    }

    // Turret aim (Tribes2.exe Turret::unpackUpdate FUN_00655f60): phi is a
    // 10-bit fraction of a turn, theta a 10-bit fraction of the datablock's
    // [thetaMin, thetaMax] range, activation 8 bits. TurretData::onAdd
    // (FUN_00653ed0) defaults and clamps the limits to [0,90] / [90,180].
    if (
      typeof data.phi === "number" &&
      typeof data.theta === "number" &&
      typeof data.activationLevel === "number"
    ) {
      const block =
        entity.dataBlockId != null
          ? this.getDataBlockData(entity.dataBlockId)
          : undefined;
      const thetaMin = clamp(
        typeof block?.thetaMin === "number" ? block.thetaMin : 45,
        0,
        90,
      );
      const thetaMax = clamp(
        typeof block?.thetaMax === "number" ? block.thetaMax : 135,
        90,
        180,
      );
      entity.turretAim = {
        phi: data.phi * 360,
        theta: thetaMin + (thetaMax - thetaMin) * data.theta,
        activation: data.activationLevel,
      };
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
            imageExtraFlag?: boolean;
          }>
        | undefined;
      if (images && images.length > 0) {
        // Process all 8 image slots uniformly. The mount bone for each
        // image comes from dataBlock->mountPoint (binary-verified), NOT
        // from the slot index.
        for (const img of images) {
          if (img.index == null || img.index < 0 || img.index >= 8) continue;
          const prevSlot = entity.imageSlots?.[img.index];
          if (
            this.missileLockInferenceEnabled &&
            img.index === 0 &&
            this.missileLockDwell.has(entity.id) &&
            (img.target === false ||
              img.wet === true ||
              prevSlot?.dataBlockId !== img.dataBlockId)
          )
            this.missileLockDwell.delete(entity.id);
          const prev = prevSlot?.imageState;
          const previousFireCount =
            entity.imageFireCounts?.[img.index] ?? prev?.fireCount ?? 0;
          const fireCount = img.fireCount ?? previousFireCount;
          // Native initial packets only seed mounted slots. A live catch-up
          // create can include a later update to an empty slot without the
          // initial firing bit; keep that slot's count too.
          if (
            img.fireCount != null &&
            (!initial || img.dataBlockId || img.imageExtraFlag === undefined)
          )
            (entity.imageFireCounts ??= [])[img.index] = fireCount;

          if (img.dataBlockId && img.dataBlockId > 0) {
            const blockData = this.getDataBlockData(img.dataBlockId);
            const shapeName = resolveShapeName("ShapeBaseImageData", blockData);
            const mountPoint =
              typeof blockData?.mountPoint === "number"
                ? blockData.mountPoint
                : 0;

            // Resolve skin from net string tag or inline name.
            const skinName =
              (img.skinTagIndex != null
                ? this.conn.netStrings.get(img.skinTagIndex)
                : img.skinName) || undefined;

            // Every slot carries its image state (a pack's trigger is
            // its activation); the state table is parsed once per datablock.
            const imageState = {
              dataBlockId: img.dataBlockId,
              triggerDown: img.triggerDown ?? prev?.triggerDown ?? false,
              ammo: img.ammo ?? prev?.ammo ?? true,
              loaded: img.loaded ?? prev?.loaded ?? true,
              target: img.target ?? prev?.target ?? false,
              wet: img.wet ?? prev?.wet ?? false,
              fireCount,
            };
            const imageStates =
              prevSlot?.dataBlockId === img.dataBlockId && prevSlot.imageStates
                ? prevSlot.imageStates
                : blockData
                  ? parseWeaponImageStates(blockData)
                  : undefined;

            if (shapeName) {
              // ShapeBase::setImage preserves state on a skin-only update.
              // ImageMounts still uses the skin when choosing the visual.
              const newImage =
                !prevSlot ||
                prevSlot.dataBlockId !== img.dataBlockId ||
                prevSlot.shapeName !== shapeName;
              let animations = this.imageAnimations.get(entity.id);
              if (!animations)
                this.imageAnimations.set(entity.id, (animations = []));
              const time = this.getTimeSec();
              if (newImage)
                animations[img.index] = imageStates?.length
                  ? new ImageAnimation(
                      imageStates,
                      time,
                      entity.ghostIndex * 65537 +
                        entity.spawnTick * 31 +
                        img.index,
                      imageState,
                    )
                  : undefined;
              // unpackUpdate runs updateImageState(i, 0) after each packet;
              // fire notifications must not be lost between simulation ticks.
              const animation = this.advanceMountedImage(
                entity,
                animations[img.index],
                time,
                imageState,
                newImage &&
                  (initial
                    ? img.imageExtraFlag === true
                    : fireCount !== previousFireCount),
                newImage,
              );
              // Published snapshots retain their image flags at that tick.
              entity.imageSlots = [...(entity.imageSlots ?? [])];
              entity.imageSlots[img.index] = {
                shapeName,
                mountPoint,
                mountOffset: getImageMountOffset(blockData),
                dataBlockId: img.dataBlockId,
                skinName,
                imageState,
                imageStates,
                animation,
                mountedAtSec: newImage ? time : prevSlot.mountedAtSec,
              };
            }
          } else if (!img.dataBlockId) {
            const animations = this.imageAnimations.get(entity.id);
            if (animations) animations[img.index] = undefined;
            // Clear slot.
            if (entity.imageSlots?.[img.index]) {
              entity.imageSlots = [...entity.imageSlots];
              entity.imageSlots[img.index] = undefined;
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
      // Seeker state updates warp from the previous simulated position.
      // Use the transmitted position directly only at scope-in.
      if (entity.projectilePhysics !== "seeker" || !entity.position)
        entity.position = [position.x, position.y, position.z];
      if (entity.className === "Splash")
        this.spawnSplash(entity, entity.position, entity.dataBlockId);
    } else {
      // ParticleEmissionDummy carries a row-major MatrixF rather than the
      // AffineTransform used by most positioned ghosts.
      const elements = (data.transform as MatrixF | undefined)?.elements;
      if (Array.isArray(elements)) {
        const translation = { x: elements[3], y: elements[7], z: elements[11] };
        if (isValidPosition(translation)) {
          entity.position = [translation.x, translation.y, translation.z];
        }
      }
    }

    // Scale, Torque xyz → Three.js axis order like getScale() for mission
    // objects. ForceFieldBare uses it as its box dimensions instead.
    if (isVec3Like(data.scale)) {
      const s = data.scale;
      if (entity.className === "ForceFieldBare") {
        if (entity.forceFieldData) {
          entity.forceFieldData.dimensions = torqueToThree(s);
        }
      } else {
        entity.scale = torqueToThree(s);
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
    if (typeof data.sourceSlot === "number")
      entity.sourceSlot = data.sourceSlot;
    if (
      entity.type === "Projectile" &&
      typeof data.sourceObject === "number" &&
      data.sourceObject >= 0
    )
      entity.sourceGhostIndex = data.sourceObject;

    // Link beams (ELF/repair): shooter and zapped/repaired object, by
    // ghost index — the endpoints are LIVE and re-derived per frame.
    const isLinkBeam =
      entity.className === "ELFProjectile" ||
      entity.className === "RepairProjectile";
    if (isLinkBeam || entity.className === "ShockLanceProjectile") {
      if (typeof data.sourceObject === "number") {
        entity.sourceGhostIndex =
          data.sourceObject >= 0 ? data.sourceObject : undefined;
        if (data.sourceObject < 0) entity.sourceSlot = undefined;
        if (isLinkBeam) this.bindBeamEndpoint(entity, "source");
      }
      const target = (data.targetObject ?? data.repairingObject) as
        number | undefined;
      if (typeof target === "number") {
        entity.linkTargetGhostIndex = target >= 0 ? target : undefined;
        if (isLinkBeam) this.bindBeamEndpoint(entity, "target");
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

    // Both beam ghosts carry the muzzle and end point. A swing with a scoped
    // shooter gives us the image slot in place of the muzzle position.
    if (
      entity.className === "SniperProjectile" ||
      entity.className === "TargetProjectile"
    ) {
      const start = data.initialPosition as Vec3 | undefined;
      const end = data.endPos as Vec3 | undefined;
      const targeting = entity.className === "TargetProjectile";
      if (isValidPosition(start)) {
        entity.beamStart = [start!.x, start!.y, start!.z];
      }
      if (targeting) {
        // Older checkpoints saved the muzzle as the ghost position and have
        // no visual. Recover the effect when the next swing supplies its end.
        entity.beamStart ??= entity.position;
        entity.position = undefined;
        if (entity.dataBlockId != null) {
          entity.visual ??= resolveTargetBeamVisual(
            entity.className,
            this.getDataBlockData(entity.dataBlockId),
          );
        }
      }
      if (isValidPosition(end)) {
        const previous = entity.beamEnd;
        entity.beamEnd = [end!.x, end!.y, end!.z];
        // A beam update either identifies the scoped shooter or supplies
        // the muzzle position instead. Rebind only on a beam update.
        if (typeof data.sourceObject === "number" && data.sourceObject >= 0) {
          entity.sourceGhostIndex = data.sourceObject;
        } else {
          entity.sourceGhostIndex = undefined;
          entity.sourceSlot = undefined;
        }
        const source = this.bindBeamEndpoint(entity, "source");
        if (!targeting && data.hitWater === true)
          this.spawnSplash(entity, entity.beamEnd);
        if (targeting) {
          const clientOwned = data.clientOwned === true;
          const priorWarp = entity.targetBeam?.warp;
          const startedAtSec = this.getTimeSec();
          let from = previous;
          if (!clientOwned && previous && priorWarp) {
            const t = targetBeamWarpProgress(
              priorWarp.startedAtSec,
              startedAtSec,
              priorWarp.durationSec,
            );
            const old = priorWarp.from;
            from = [
              old[0] + (previous[0] - old[0]) * t,
              old[1] + (previous[1] - old[1]) * t,
              old[2] + (previous[2] - old[2]) * t,
            ];
          }
          entity.targetBeam = {
            clientOwned,
            warp:
              !clientOwned && from
                ? {
                    from,
                    startedAtSec,
                    durationSec:
                      source?.type === "Player"
                        ? TARGET_BEAM_PLAYER_WARP_SEC
                        : targetBeamWarpDuration(
                            from,
                            entity.beamEnd,
                            entity.beamStart,
                          ),
                  }
                : undefined,
          };
        }
      }
    }

    // Rotation
    if (entity.type === "Player" && typeof data.rotationZ === "number") {
      entity.rotation = playerYawToQuaternion(data.rotationZ);
      entity.viewQuantized = true;
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
      // A MatrixF ghost transform (VehicleBlocker, PhysicalZone, the
      // particle emission dummy): the one shared decoder of Torque's
      // row-major mObjToWorld.
      entity.rotation = matrixFToQuaternion(
        data.transform as MatrixF,
      ).toArray() as [number, number, number, number];
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
    const hiddenLinearGhost =
      entity.projectilePhysics === "linear" && data.hidden === true;
    if (entity.projectilePhysics === "seeker") {
      this.readSeekerUpdate(entity, data as SeekerProjectileGhostData);
    } else if (entity.projectilePhysics && !hiddenLinearGhost) {
      if (
        entity.projectilePhysics === "linear" &&
        entity.position &&
        entity.linearSegment == null
      ) {
        const blockData =
          entity.dataBlockId != null
            ? this.getDataBlockData(entity.dataBlockId)
            : undefined;
        const dryVelocity =
          getNumberField(blockData, [
            "dryVelocity",
            "muzzleVelocity",
            "bulletVelocity",
          ]) ?? 80;
        const wetVelocity = getNumberField(blockData, ["wetVelocity"]);
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
        entity.linearLaunch = {
          start: entity.position,
          vel: compose(dryVelocity),
          lifetimeMS: getNumberField(blockData, ["lifetimeMS"]) ?? 1000,
          explodeOnDeath: isTruthyField(blockData?.explodeOnDeath),
          explodeOnWaterImpact: isTruthyField(blockData?.explodeOnWaterImpact),
          wetVel:
            wetVelocity != null && wetVelocity > 0
              ? compose(wetVelocity)
              : undefined,
          reflectOnWaterImpactAngle: getNumberField(blockData, [
            "reflectOnWaterImpactAngle",
          ]),
        };
        this.pendingProjectileLaunches.push(entity);
      } else if (
        entity.projectilePhysics !== "linear" &&
        isVec3Like(data.velocity)
      ) {
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
      // segment at that time. Grenade ghosts carry the CURRENT position
      // and velocity, which the client adopts as-is
      // (GrenadeProjectile::unpackUpdate FUN_00636050 — no fast-forward).
      const currTick = data.currTick as number | undefined;
      if (typeof currTick === "number" && currTick > 0) {
        entity.projAgeTicks = currTick;
      }
      if (entity.projAgeTicks == null) entity.projAgeTicks = 0;
    }

    if (
      entity.splashDataBlockId != null &&
      entity.projectilePhysics === "ballistic" &&
      data.quickSplash === true &&
      entity.position &&
      entity.simulatedVelocity
    )
      entity.quickSplash = {
        position: [...entity.position],
        velocity: [...entity.simulatedVelocity],
      };

    if (entity.type === "Projectile" && !entity.hasExploded) {
      // Non-initial bomb packets use endPoint/endNormal for detonation,
      // which can arrive alongside an ordinary position update.
      const bombEnd =
        entity.className === "BombProjectile" &&
        isValidPosition(data.endPoint as Vec3)
          ? (data.endPoint as Vec3)
          : undefined;
      const explodePos = isValidPosition(data.explodePosition as Vec3)
        ? (data.explodePosition as Vec3)
        : isValidPosition(data.explodePoint as Vec3)
          ? (data.explodePoint as Vec3)
          : bombEnd;
      if (explodePos) {
        const normal = (
          explodePos === bombEnd ? data.endNormal : data.explodeNormal
        ) as Vec3 | undefined;
        if (
          hiddenLinearGhost &&
          entity.splashDataBlockId != null &&
          isValidPosition(normal)
        )
          entity.hiddenSplashLaunch = {
            start: [
              explodePos.x + normal.x,
              explodePos.y + normal.y,
              explodePos.z + normal.z,
            ],
            impactNormal: [normal.x, normal.y, normal.z],
          };
        this.spawnExplosion(
          entity,
          [explodePos.x, explodePos.y, explodePos.z],
          isValidPosition(normal) ? [normal.x, normal.y, normal.z] : undefined,
          hiddenLinearGhost,
        );
      }
    }

    // Damage
    if (typeof data.damageLevel === "number") {
      entity.health = clamp(1 - data.damageLevel, 0, 1);
    }
    if (typeof data.damageState === "number") {
      const prevDamageState = entity.damageState;
      entity.damageState = data.damageState;
      // A dead player's pickActionAnimation keeps its action.
      if (data.damageState >= 1 && (prevDamageState ?? 0) < 1)
        entity.actionSlot = parkActionSlot(
          entity.actionSlot,
          this.getTimeSec(),
          "death",
        );
      const shapeData =
        entity.dataBlockId == null
          ? undefined
          : this.getDataBlockData(entity.dataBlockId);
      entity.destroyedHidden =
        (data.damageState === 2 && shapeData?.renderWhenDestroyed === false) ||
        (entity.type === "Player" && data.blowApart === true);
      // ShapeBase::unpackUpdate (FUN_005ef0e0): an object already in the
      // scene blows up when it becomes Destroyed or the blowApart flag is
      // set — thrown grenades, mines, turrets, stations, deployables.
      if (
        prevDamageState != null &&
        ((prevDamageState !== 2 && data.damageState === 2) ||
          data.blowApart === true)
      ) {
        const normal = isValidPosition(data.damageDir as Vec3)
          ? (data.damageDir as Vec3)
          : undefined;
        this.blowUp(
          entity,
          normal ? [normal.x, normal.y, normal.z] : [0, 0, 1],
        );
      }
    }
    // CloakMask visibility (binary-verified, shapeBase.cc:3457-3485).
    // fadeVal (mFadeVal == 1.0): true = visible, false = invisible.
    // fading: fade animation (fadeOut=direction, fadeTime=duration).
    // cloaked: mCloaked (stealth/station pad effect — client-side render).
    // setCloakedState (FUN_005f0200): initial ghosts snap mCloakLevel;
    // subsequent updates interpolate via advanceTime at dt*2 (0.5s).
    if (typeof data.cloaked === "boolean" && data.cloaked !== entity.cloaked) {
      const wasSet = entity.cloaked != null;
      entity.cloaked = data.cloaked;
      if (!wasSet) {
        // Initialize both states so an initially visible player can later cloak.
        entity.cloakLevel = data.cloaked ? 1 : 0;
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
    // MountedMask: track mount state for position derivation and animation.
    if (typeof data.mountObject === "number") {
      if (data.mountObject >= 0) {
        // Mounting on a vehicle/object; a mounted player's
        // pickActionAnimation keeps a non-table action.
        entity.mountObjectGhostIndex = data.mountObject;
        const parentIndex = data.mountObject;
        entity.mountParentId = this.projectileSource(parentIndex)?.id ?? null;
        if (entity.mountParentId === null && this.projectileGhostBatch) {
          this.completeProjectileEvent(() => {
            if (
              entity.mountObjectGhostIndex === parentIndex &&
              entity.mountParentId === null
            )
              entity.mountParentId =
                this.projectileSource(parentIndex)?.id ?? null;
          });
        }
        entity.mountNode =
          typeof data.mountNode === "number" ? data.mountNode : 0;
        entity.actionSlot = parkActionSlot(
          entity.actionSlot,
          this.getTimeSec(),
          "mount",
        );
      } else {
        // Player::onUnmount (0x5d6450) sets RootAnim, a table action the
        // server never sends: the client's movement pick owns the slot.
        entity.mountObjectGhostIndex = undefined;
        entity.mountParentId = undefined;
        entity.mountNode = undefined;
        entity.actionSlot = undefined;
      }
    }

    // Player::unpackUpdate (0x5db2d0) applies its action after ShapeBase's
    // mount update. A simultaneous unmount must not erase a new death/pose.
    if (typeof data.action === "number") {
      const now = this.getTimeSec();
      entity.actionSlot = setActionThread(entity.actionSlot, data.action, {
        timeSec: now,
        hold: !!data.actionHoldAtEnd,
        atEnd: !!data.actionAtEnd,
        ...(data.actionFirstPerson === true && { firstPerson: true }),
        startPos:
          typeof data.actionAnimPos === "number"
            ? data.actionAnimPos
            : undefined,
        parked:
          entity.mountObjectGhostIndex != null ||
          (entity.damageState ?? 0) >= 1,
        pickHeldUntilSec:
          (entity.pickHeldUntilSec ?? -Infinity) > now
            ? entity.pickHeldUntilSec
            : undefined,
      });
    }
    if (typeof data.armAction === "number") {
      entity.armAction = data.armAction;
    }

    // Threads
    if (Array.isArray(data.threads)) {
      const incoming = data.threads as ThreadState[];
      const merged = [...(entity.threads ?? [])];
      for (const t of incoming) {
        const index = merged.findIndex((m) => m.index === t.index);
        const next = updateShapeThread(merged[index], t, this.getTimeSec());
        if (index >= 0) merged[index] = next;
        else merged.push(next);
      }
      entity.threads = merged;
    }

    if (typeof data.energy === "number") {
      entity.energy = clamp(data.energy, 0, 1);
    }

    // Target system
    if (typeof data.targetId === "number") {
      entity.targetId = data.targetId;
      entity.targetGeneration =
        this.conn.targets.generations.get(data.targetId) ?? 0;
      this.applyEntityTargetInfo(entity);
      if (
        entity.sensorGroup != null &&
        entity.ghostIndex === this.latestControl.ghostIndex &&
        this.lastControlType === "player"
      ) {
        this.conn.playerSensorGroup = entity.sensorGroup;
      }
    }

    // SoundMask updates are sparse, and an identical play is a new command.
    const sounds = data.sounds as
      | Array<{ index: number; playing: boolean; profileId?: number }>
      | undefined;
    if (Array.isArray(sounds) && sounds.length) {
      const slots = entity.soundSlots?.slice() ?? [];
      for (const sound of sounds) {
        const index = slots.findIndex((slot) => slot.index === sound.index);
        const updated: SoundSlot = {
          ...sound,
          revision: (index < 0 ? 0 : slots[index].revision) + 1,
          changedAtSec: this.getTimeSec(),
        };
        if (index < 0) slots.push(updated);
        else slots[index] = updated;
      }
      entity.soundSlots = slots;
    }

    // WayPoint ghost fields
    if (entity.className === "WayPoint") {
      if (typeof data.name === "string") entity.label = data.name;
    }

    // Persistent map emitters carry their emitter datablock separately from
    // the GameBase datablock, which only controls the emission clock.
    if (
      this.presentationEffectsEnabled &&
      entity.className === "ParticleEmissionDummy"
    ) {
      if (dataBlockId != null) {
        const multiple = this.getDataBlockData(dataBlockId)?.timeMultiple;
        entity.timeMultiple =
          typeof multiple === "number" && Number.isFinite(multiple)
            ? multiple
            : 1;
      }
      if (typeof data.emitterDatablockId === "number") {
        entity.particleEmitterDataBlockId = data.emitterDatablockId;
        entity.particleEmitter = this.resolveAmbientEmitterData(
          data.emitterDatablockId,
        );
      }
      // The dummy's scalar mVelocity is not networked; native clients use
      // their constructor default even if the server's mission value differs.
      entity.emissionVelocity ??= 1;
      entity.timeMultiple ??= 1;
    }

    if (
      this.presentationEffectsEnabled &&
      (entity.className === "Precipitation" || entity.className === "Lightning")
    ) {
      (entity.pendingWeather ??= []).push({
        time: this.getTimeSec(),
        fields: data,
        precipitationSeed,
      });
      this.refreshWeather(entity);
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
    if (this.missileLockInferenceEnabled) {
      if (entity.type === "Player") this.observeMissilePlayer(entity, data);
      if (entity.type === "Vehicle" && isValidPosition(data.position as Vec3))
        this.missileVehiclePoseTicks.set(entity, this.tickCount);
    }
    if (entity.type === "Player" && this.playerPredictionEnabled) {
      const prediction = this.ensurePlayerPrediction(entity);
      if (prediction) {
        prediction.damageState = entity.damageState ?? 0;
        prediction.mounted = entity.mountObjectGhostIndex != null;
        const latencyTicks =
          data.position && data.allowWarp && !prediction.mounted
            ? this.getPlayerLatencyTicks()
            : 0;
        prediction.unpackUpdate(
          data as PlayerGhostData,
          false,
          latencyTicks,
          this.worldGravity,
        );
        this.publishPlayerPrediction(entity, prediction);
      }
    }
  }

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

  private readProjectileWaterData(
    entity: MutableEntity,
    block: ParsedData | undefined,
  ): void {
    if (!block) return;
    const splash = getNumberField(block, ["splash"]);
    if (splash && splash > 0) entity.splashDataBlockId = splash;
    if (entity.projectilePhysics !== "ballistic") return;
    const bubbles = getNumberField(block, ["bubbleEmitter"]);
    if (bubbles && bubbles > 0) entity.bubbleEmitterId = bubbles;
    entity.projDrag = getNumberField(block, ["drag"]) ?? 0;
    const light = block.underwaterLightColor as
      { r: number; g: number; b: number } | undefined;
    if (light) entity.underwaterLightColor = [light.r, light.g, light.b, 1];
  }

  private spawnSplash(
    source: MutableEntity,
    position: Point3,
    dataBlockId = source.splashDataBlockId,
  ): void {
    if (source.splashPlayed || dataBlockId == null) return;
    const block = this.getDataBlockData(dataBlockId);
    if (!block) return;
    source.splashPlayed = true;
    if (!this.presentationEffectsEnabled) return;
    // Splash::advanceTime emits immediately. Splash::processTick rounds
    // the sampled lifetime to the next tick before stopping new rings.
    const random = timelineRandom(dataBlockId, this.tickCount, ...position);
    const variance = Math.max(
      0,
      getNumberField(block, ["lifetimeVariance"]) ?? 0,
    );
    const lifetime =
      (getNumberField(block, ["lifetimeMS"]) ?? 1000) +
      Math.floor(random() * (2 * variance + 1)) -
      variance;
    const lifetimeTicks = Math.max(1, Math.ceil(lifetime / TICK_DURATION_MS));
    const ringLifetime = Math.max(
      0,
      getNumberField(block, ["ringLifetime"]) ?? 1,
    );
    const id = allocateEntityId();
    this.entities.set(id, {
      id,
      type: "Splash",
      className: "Splash",
      ghostIndex: -1,
      dataBlockId,
      position: [...position],
      rotation: [0, 0, 0, 1],
      spawnTick: this.tickCount,
      splashEmitterLifetimeMS: lifetimeTicks * TICK_DURATION_MS,
      expiryTick:
        this.tickCount +
        lifetimeTicks +
        Math.ceil((ringLifetime * 1000) / TICK_DURATION_MS),
    });
    const explosion = getNumberField(block, ["explosion"]);
    if (explosion && explosion > 0)
      this.addExplosion(explosion, position, this.tickCount);
  }

  protected spawnExplosion(
    projectile: MutableEntity,
    position: [number, number, number],
    normal: [number, number, number] = [0, 0, 1],
    hiddenLinearGhost = false,
  ): void {
    if (this.captureDirectorImpacts)
      this.recordDirectorImpact(projectile, position);
    projectile.hasExploded = true;
    if (!this.presentationEffectsEnabled) {
      this.endProjectileFlight(projectile, position);
      return;
    }
    let explosionId = projectile.explosionDataBlockId;
    // An already-exploded initial ghost uses the regular effect via
    // LinearProjectile::onAdd (Tribes2.exe 0x62d630).
    if (
      !hiddenLinearGhost &&
      (projectile.projectilePhysics === "linear" ||
        projectile.projectilePhysics === "ballistic") &&
      projectile.dataBlockId != null
    ) {
      const block = this.getDataBlockData(projectile.dataBlockId);
      const underwater = getNumberField(block, ["underwaterExplosion"]);
      if (underwater != null && underwater > 0) {
        // LinearProjectile and GrenadeProjectile compare against the same
        // depthTolerance measured from the still surface.
        const water = projectileWaterAt(...position);
        const depthTolerance = getNumberField(block, ["depthTolerance"]) ?? 5;
        if (water && water.surfaceZ - position[2] >= depthTolerance) {
          explosionId = underwater;
        }
      }
    }
    if (explosionId != null) {
      this.addExplosion(explosionId, position, this.tickCount, normal);
    }

    this.endProjectileFlight(projectile, position);
  }

  private recordDirectorImpact(projectile: MutableEntity, pos: Point3): void {
    if (projectile.hasExploded || this.projectileGhostBatch?.hydrating) return;
    const kind = /mortar_projectile/i.test(projectile.dataBlock ?? "")
      ? "mortar"
      : /missile_projectile/i.test(projectile.dataBlock ?? "")
        ? "missile"
        : null;
    if (!kind) return;
    const timeSec = this.getTimeSec();
    const source = this.projectileSource(
      projectile.sourceGhostIndex,
      projectile.seekerLaunch?.sourceId ??
        projectile.linearExclusions?.sourceId,
    );
    const impacts = this.directorImpacts;
    while (impacts.length && impacts[0].timeSec < timeSec - 2) impacts.shift();
    impacts.push({
      id: projectile.id,
      kind,
      pos: [...pos],
      timeSec,
      teamId: source?.sensorGroup,
    });
  }

  private endProjectileFlight(
    projectile: MutableEntity,
    position: [number, number, number],
  ) {
    projectile.position = undefined;
    projectile.simulatedVelocity = undefined;
    projectile.linearTickStart = undefined;
    projectile.linearLaunch = undefined;
    projectile.linearMuzzle = undefined;
    if (!this.projectileListeners.size || this.projectileGhostBatch?.hydrating)
      return;
    const event: ProjectileLifecycleEvent = {
      type: "end",
      id: projectile.id,
      position: [...position],
      timeSec: this.getTimeSec(),
    };
    this.completeProjectileEvent(() => this.publishProjectileEvent(event));
  }

  /**
   * ShapeBase::blowUp (FUN_005eaa90, client): the datablock's explosion —
   * underwaterExplosion when the object is submerged — at the object box
   * centre, i.e. position + (mObjBox.min + max) / 2 with the offset
   * neither rotated nor scaled. mObjBox is the DTS bounds (shapeBounds.ts);
   * a shape whose DTS has not loaded yet explodes at its origin. The
   * debris input is retained separately from ghost lifetime.
   */
  protected blowUp(
    entity: MutableEntity,
    normal: [number, number, number] = [0, 0, 1],
  ): void {
    if (
      !this.presentationEffectsEnabled ||
      !entity.position ||
      entity.dataBlockId == null
    )
      return;
    const blockData = this.getDataBlockData(entity.dataBlockId);
    if (!blockData) return;
    let [x, y, z] = entity.position;
    const box = getShapeBounds(entity.dataBlock);
    if (box) {
      x += (box.min[0] + box.max[0]) * 0.5;
      y += (box.min[1] + box.max[1]) * 0.5;
      z += (box.min[2] + box.max[2]) * 0.5;
    }
    const debris = getNumberField(blockData, ["debris"]);
    if (
      typeof blockData.debrisShapeName === "string" &&
      blockData.debrisShapeName
    ) {
      const time = this.getTimeSec();
      this.debrisHistory.add({
        kind: "shape",
        dataBlockId: debris ?? -1,
        shape: blockData.debrisShapeName,
        time,
        expires:
          time +
          (debris == null
            ? 4
            : debrisRetention(debris, this.getDataBlockData.bind(this))),
        position: [x, y, z],
        rotation: entity.rotation ? [...entity.rotation] : [0, 0, 0, 1],
        normal: [...normal],
        gravity: this.gravity,
      });
    }
    const underwater = getNumberField(blockData, ["underwaterExplosion"]);
    const explosionId =
      underwater != null && underwater > 0 && isPointSubmergedSimple(x, y, z)
        ? underwater
        : getNumberField(blockData, ["explosion"]);
    if (explosionId == null || explosionId <= 0) return;
    this.addExplosion(explosionId, [x, y, z], this.tickCount, normal);
  }

  /**
   * Explosion::onAdd at `addTick`: resolve delay and lifetime, then either
   * explode now or queue the explode tick. An explosion whose lifetime runs
   * out while it is still waiting is deleted unseen, as in the engine.
   */
  protected addExplosion(
    explosionDataBlockId: number,
    position: [number, number, number],
    addTick: number,
    normal: [number, number, number] = [0, 0, 1],
  ): void {
    if (!this.presentationEffectsEnabled) return;
    const block = this.getDataBlockData(explosionDataBlockId);
    if (!block) return;
    const shape = (block.dtsFileName as string | undefined) || undefined;
    const timing = resolveExplosionTiming(
      block,
      getShapeSequenceDurationSec(shape, "ambient"),
      timelineRandom(explosionDataBlockId, addTick, ...position),
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
      normal,
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
    if (typeof block?.debris === "number") {
      const time = this.getTimeSec();
      this.debrisHistory.add({
        kind: "explosion",
        dataBlockId: p.explosionDataBlockId,
        time,
        expires:
          time +
          debrisRetention(block.debris, this.getDataBlockData.bind(this)),
        position: [...p.position],
        rotation: [0, 0, 0, 1],
        normal: [...p.normal],
        gravity: this.gravity,
      });
    }
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
    const random = timelineRandom(
      p.explosionDataBlockId,
      p.explodeTick,
      ...p.position,
    );
    for (const subId of subExplosions) {
      if (subId == null) continue;
      const subBlock = this.getDataBlockData(subId);
      if (!subBlock) continue;
      // The sub's onAdd scatters it by `offset` along a random direction in
      // the hemisphere above the impact (the normal is taken as up here).
      const offset = (subBlock.offset as number | undefined) ?? 0;
      let subPos = p.position;
      if (Math.abs(offset) > 1e-4) {
        const dx = random() * 2 - 1;
        const dy = random() * 2 - 1;
        const dz = random();
        const len = Math.hypot(dx, dy, dz) || 1;
        subPos = [
          p.position[0] + (dx / len) * offset,
          p.position[1] + (dy / len) * offset,
          p.position[2] + (dz / len) * offset,
        ];
      }
      this.addExplosion(subId, subPos, p.explodeTick, p.normal);
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

  private seekerData(entity: MutableEntity): SeekerProjectileDataBlock {
    return ((entity.dataBlockId == null
      ? undefined
      : this.getDataBlockData(entity.dataBlockId)) ??
      {}) as SeekerProjectileDataBlock;
  }

  private readSeekerUpdate(
    entity: MutableEntity,
    data: SeekerProjectileGhostData,
  ): void {
    if (!isValidPosition(data.position) || !isValidPosition(data.velocity))
      return;
    const position: Point3 = [
      data.position.x,
      data.position.y,
      data.position.z,
    ];
    const velocity: Point3 = [
      data.velocity.x,
      data.velocity.y,
      data.velocity.z,
    ];
    let flight = entity.seekerFlight;
    if (flight) {
      flight.correction = { position, velocity };
    } else {
      const block = this.seekerData(entity);
      const tuning = seekerTuning(block);
      const hydrated = this.projectileGhostBatch?.hydrating === true;
      const onAdd = entity.simulatedVelocity === undefined && !hydrated;
      const earlyScope = onAdd && data.timeoutReset === true;
      // The parser's legacy name "orientation" is the shooter velocity
      // inherited at launch (retail's mPlayerVel).
      const orientation = data.orientation;
      const inherited: Point3 = isValidPosition(orientation)
        ? [orientation.x, orientation.y, orientation.z]
        : [0, 0, 0];
      flight = entity.seekerFlight = {
        inherited,
        launchDirection: [
          velocity[0] - inherited[0],
          velocity[1] - inherited[1],
          velocity[2] - inherited[2],
        ],
        earlyScope,
        initialMuzzle: onAdd && data.timeoutReset !== undefined,
        correction: { position, velocity, scopeIn: onAdd ? true : undefined },
      };
      if (flight.initialMuzzle) this.pendingProjectileLaunches.push(entity);
      const age = entity.projAgeTicks;
      // An older checkpoint may retain its local age without seeker state.
      // Only assume ignition when the age is unknown or the wire says so.
      const mature =
        hydrated || data.timeoutReset === false || (!onAdd && age == null);
      entity.projAgeTicks = mature
        ? Math.max(age ?? 0, tuning.ignitionTick)
        : (age ?? 0);
      entity.seekerCasing = tuning.flechette && earlyScope;
      entity.simulatedVelocity ??= velocity;
      const scopeSec =
        this.getTimeSec() - entity.projAgeTicks * STREAM_TICK_SEC;
      const exhaustTicks = Math.floor(
        (block.exhaustTimeMs ?? 0) / TICK_DURATION_MS,
      );
      const trailStartsAtSec =
        scopeSec +
        (tuning.flechette ? tuning.ignitionTick : 0) * STREAM_TICK_SEC;
      const delayStartsAtTick = Math.max(
        tuning.flechette ? tuning.ignitionTick : 0,
        Math.trunc((block.emitterDelay ?? 0) / TICK_DURATION_MS) + 1,
      );
      entity.seekerLaunch = {
        sourceVelocity: flight.inherited,
        exhaustEmitterId: block.exhaustEmitter ?? undefined,
        exhaustNodeName: block.exhaustNodeName,
        // The client increments age before emitting a full tick of exhaust
        // at ages 1 through exhaustTicks - 1.
        exhaustUntilSec:
          earlyScope && exhaustTicks > 1
            ? this.getTimeSec() + (exhaustTicks - 1) * STREAM_TICK_SEC
            : undefined,
        trailStartsAtSec,
        delayEmitterId: block.delayEmitter ?? undefined,
        delayEmitterStartsAtSec: scopeSec + delayStartsAtTick * STREAM_TICK_SEC,
      };
      this.updateProjectileVelocity(
        entity,
        entity.simulatedVelocity,
        entity.seekerCasing ? flight.launchDirection : undefined,
      );
    }

    const point = data.targetDirection;
    if (data.targetMode === 1 && isValidPosition(point)) {
      flight.target = { position: [point.x, point.y, point.z] };
    } else if (data.targetMode === 0 && data.targetGhost != null) {
      const targetGhost = data.targetGhost;
      const source = this.projectileSource(targetGhost);
      const target = (flight.target = {
        id: source?.id,
        position: source?.position && ([...source.position] as Point3),
      });
      if (!source)
        this.completeProjectileEvent(() => {
          // Resolve an endpoint declared later in the same packet, but
          // never follow a subsequent occupant of the wire ghost slot.
          const resolved = this.projectileSource(targetGhost);
          target.id = resolved?.id;
          target.position = resolved?.position && [...resolved.position];
        });
    } else {
      flight.target = undefined;
    }
  }

  private seekerTarget(
    flight: NonNullable<MutableEntity["seekerFlight"]>,
    poses: ProjectileShapePoses | undefined,
  ): SeekerTarget | undefined {
    const target = flight.target;
    if (!target) return;
    const entity = target.id ? this.entities.get(target.id) : undefined;
    if (!entity) {
      target.id = undefined;
      return target.position ? { position: target.position } : undefined;
    }
    const block =
      entity.dataBlockId == null
        ? undefined
        : this.getDataBlockData(entity.dataBlockId);
    const box = block?.boxSize as Vec3 | undefined;
    const height =
      entity.type === "Player" && isValidPosition(box) ? box.z : undefined;
    target.position = poses?.getCenter(entity, height) ?? target.position;
    if (target.position)
      return {
        position: target.position,
        heat: getNumberField(block, ["heat"]) ?? 1,
      };
  }

  private splitSeekerCasing(
    entity: MutableEntity,
    position: Point3,
    next: Point3,
    block: SeekerProjectileDataBlock,
    direction: Point3,
  ): void {
    entity.seekerCasing = false;
    const time = this.getTimeSec();
    const puffEmitterId = block.puffEmitter ?? undefined;
    entity.seekerLaunch = {
      ...entity.seekerLaunch,
      casingSplitAtSec: time,
      puffEmitterId,
      puffPosition: puffEmitterId != null ? position : undefined,
    };
    const casing = block.casingDebris;
    if (
      !this.presentationEffectsEnabled ||
      casing == null ||
      !this.getDataBlockData(casing)
    )
      return;
    const random = timelineRandom(casing, this.tickCount, ...next);
    const expires =
      time + debrisRetention(casing, (id) => this.getDataBlockData(id));
    for (const fragment of seekerCasingFragments(direction, random)) {
      this.debrisHistory.add({
        ...fragment,
        kind: "shell",
        time,
        expires,
        dataBlockId: casing,
        position: next,
        normal: [0, 0, 1],
        gravity: this.gravity,
      });
    }
  }

  private advanceSeeker(
    entity: MutableEntity,
    flight: NonNullable<MutableEntity["seekerFlight"]>,
    position: Point3,
    velocity: Point3,
    dt: number,
    age: number,
    poses: ProjectileShapePoses | undefined,
  ): void {
    const block = this.seekerData(entity);
    const tuning = seekerTuning(block);
    const target = this.seekerTarget(flight, poses);
    const pending = flight.correction;
    if (pending) {
      // An initial packet with no available muzzle already seeds the
      // flight at its authoritative position. Later packets always warp.
      if (!pending.scopeIn) {
        const correction = createSeekerWarp(
          position,
          pending.position,
          pending.velocity,
          target,
          tuning,
        );
        flight.warp = correction.warp;
        if (correction.passedTarget) flight.target = undefined;
      }
      flight.correction = undefined;
    }

    let next: Point3;
    if (flight.warp) {
      const sample = advanceSeekerWarp(flight.warp);
      next = sample.position;
      velocity = sample.velocity;
      if (!flight.warp.ticksLeft) flight.warp = undefined;
    } else {
      velocity = accelerateSeeker(velocity, flight.inherited, tuning, age);
      if (target && flight.target) {
        const guidance = steerSeeker(position, velocity, target, tuning);
        velocity = guidance.velocity;
        if (guidance.passedTarget) flight.target = undefined;
      }
      next = [
        position[0] + velocity[0] * dt,
        position[1] + velocity[1] * dt,
        position[2] + velocity[2] * dt,
      ];
    }

    if (entity.seekerCasing && age >= tuning.casingSplitTick)
      this.splitSeekerCasing(
        entity,
        position,
        next,
        block,
        flight.launchDirection,
      );
    const hit = castWorldRay(position, next, {
      includeStatics: true,
      excludeStaticColliders: entity.seekerLaunch?.sourceId,
    });
    const water = tuning.explodeOnWaterImpact
      ? castWaterRay(position, next)
      : null;
    const impact = water && (!hit || water.t < hit.t) ? water : hit;
    if (impact) {
      if (flight.earlyScope && age >= tuning.casingSplitTick) {
        this.spawnExplosion(entity, impact.point, impact.normal);
      } else {
        entity.hasExploded = true;
        this.endProjectileFlight(entity, impact.point);
      }
      return;
    }
    entity.position = next;
    entity.simulatedVelocity = velocity;
    this.updateProjectileVelocity(
      entity,
      velocity,
      entity.seekerCasing ? flight.launchDirection : undefined,
    );
  }

  private updateProjectileVelocity(
    entity: MutableEntity,
    velocity: Point3,
    direction = velocity,
  ) {
    if (!worldAlignedProjectileClassNames.has(entity.className)) {
      entity.rotation = orientationAlongDirection(direction) ?? entity.rotation;
    }
    entity.velocity = [...velocity];
    // TracerProjectile draws its ribbon along mInitialDirection (0x6406c0).
    if (entity.direction && entity.className !== "TracerProjectile")
      entity.direction = entity.velocity;
  }

  private finishLinearFlight(entity: MutableEntity, end: LinearSegment): void {
    if (end.explodeAtEnd && !entity.hasExploded) {
      this.spawnExplosion(entity, [...end.endPoint], [...end.endNormal]);
    } else {
      this.endProjectileFlight(entity, end.endPoint);
    }
  }

  protected resolveMountParent(entity: MutableEntity) {
    return this.projectileSource(
      entity.mountObjectGhostIndex,
      entity.mountParentId,
    );
  }

  private *projectileMountParents(entity: MutableEntity) {
    const seen = new Set([entity.id]);
    for (
      let parent = this.resolveMountParent(entity);
      parent && !seen.has(parent.id);
      parent = this.resolveMountParent(parent)
    ) {
      seen.add(parent.id);
      yield parent;
    }
  }

  private usesDynamicProjectileHits(entity: MutableEntity): boolean {
    return (entity.linearDynamicHits ??=
      entity.dataBlockId != null &&
      this.getDataBlockData(entity.dataBlockId)?.doDynamicClientHits === true);
  }

  private canTakeProjectileHit(
    entity: MutableEntity,
    data = entity.dataBlockId == null
      ? undefined
      : this.getDataBlockData(entity.dataBlockId),
  ): boolean {
    return (
      !entity.destroyedHidden &&
      isProjectileCollisionTarget(
        entity.className,
        getNumberField(data, ["dynamicTypeField"]),
        entity.damageState,
      )
    );
  }

  private *projectileCollisionTargets(
    poses: ProjectileShapePoses,
    playersAndVehiclesOnly = false,
  ): Iterable<ProjectileCollisionTarget> {
    for (const entity of this.entities.values()) {
      if (
        playersAndVehiclesOnly &&
        entity.type !== "Player" &&
        entity.type !== "Vehicle"
      )
        continue;
      const data =
        entity.dataBlockId == null
          ? undefined
          : this.getDataBlockData(entity.dataBlockId);
      if (!this.canTakeProjectileHit(entity, data)) continue;
      const boxSize = data?.boxSize as Vec3 | undefined;
      const shape =
        entity.type === "Player"
          ? undefined
          : getProjectileShapeAsset(entity.shapeHint ?? entity.dataBlock);
      const volume = shape
        ? { kind: "shape" as const, shape }
        : entity.type === "Player" &&
          isValidPosition(boxSize) && { kind: "player" as const, boxSize };
      if (!volume) continue;
      const matrixWorld = poses.get(entity);
      if (matrixWorld)
        yield {
          ...volume,
          id: entity.id,
          matrixWorld,
          mountedVehicleIds: getMountedVehicleIds(entity, (mounted) =>
            this.resolveMountParent(mounted),
          ),
        };
    }
  }

  protected resolveProjectileMuzzle(
    source: MutableEntity,
    slot: number,
    poses: ProjectileShapePoses,
    launch?: ProjectileMuzzleFrame,
    directionOut?: Point3,
  ): Point3 | undefined {
    const block =
      source.dataBlockId == null
        ? undefined
        : this.getDataBlockData(source.dataBlockId);
    const shapeName = source.shapeHint ?? source.dataBlock;
    return projectileMuzzlePosition(
      source,
      slot,
      poses,
      (this.tickCount * TICK_DURATION_MS) / 1000,
      getNumberField(block, ["maxLookAngle"]),
      source.type === "Player" && shapeName
        ? this.getShapeConstructorSequences(shapeName)
        : undefined,
      launch,
      directionOut,
    );
  }

  private sampleProjectileLaunches(): void {
    let poses: ProjectileShapePoses | undefined;
    for (const flight of this.pendingProjectileLaunches) {
      if (!flight.position || this.entities.get(flight.id) !== flight) continue;
      const seeker = flight.seekerFlight;
      if (seeker?.initialMuzzle) {
        const sourceId = flight.seekerLaunch?.sourceId;
        const source = sourceId ? this.entities.get(sourceId) : undefined;
        if (source && flight.sourceSlot != null && flight.sourceSlot >= 0) {
          poses ??= new ProjectileShapePoses((index, id) =>
            this.projectileSource(index, id),
          );
          const muzzle = this.resolveProjectileMuzzle(
            source,
            flight.sourceSlot,
            poses,
            seeker.muzzleFrame,
            seeker.launchDirection,
          );
          if (muzzle) {
            flight.position = muzzle;
            if (seeker.correction) seeker.correction.scopeIn = undefined;
          }
        }
        seeker.initialMuzzle = undefined;
        seeker.muzzleFrame = undefined;
        continue;
      }
      this.initializeLinearFlight(flight);
      const firingMuzzle = flight.linearMuzzle;
      flight.linearMuzzle = undefined;
      const sourceId = flight.linearExclusions?.sourceId;
      const source = sourceId ? this.entities.get(sourceId) : undefined;
      if (!source || !flight.linearLaunchWarp || flight.sourceSlot == null)
        continue;
      poses ??= new ProjectileShapePoses((index, id) =>
        this.projectileSource(index, id),
      );
      const muzzle = this.resolveProjectileMuzzle(
        source,
        flight.sourceSlot,
        poses,
        firingMuzzle,
      );
      if (muzzle) flight.linearLaunchWarp.start = muzzle;
    }
    this.pendingProjectileLaunches.length = 0;
  }

  private initializeLinearFlight(flight: MutableEntity): void {
    const launch = flight.linearLaunch;
    if (!launch || !flight.position) return;
    flight.linearLaunch = undefined;
    // Resolve the whole flight against the prepared world. Before this tick
    // a newly scoped terrain, interior or water plane may still be loading.
    const wetStart = isPointSubmergedSimple(...launch.start);
    const velocity = wetStart ? (launch.wetVel ?? launch.vel) : launch.vel;
    if (flight.splashDataBlockId != null)
      flight.linearSplash =
        predictLinearSplash(launch.start, velocity, launch.lifetimeMS) ?? null;
    const segment = (flight.linearSegment = buildLinearSegment({
      ...launch,
      wetStart,
      vel: velocity,
    }));
    const age = flight.projAgeTicks ?? 0;
    flight.simulatedVelocity = sampleLinearSegment(
      segment,
      age * TICK_DURATION_MS,
      flight.position,
    );
    this.updateProjectileVelocity(flight, flight.simulatedVelocity);
    if (
      flight.linearExclusions?.sourceId &&
      flight.sourceSlot != null &&
      flight.sourceSlot >= 0
    ) {
      flight.linearLaunchWarp = createLinearLaunchWarp(
        segment,
        age,
        segment.start,
      );
      flight.position = [...segment.start];
    }
  }

  private prepareProjectileSplash(entity: MutableEntity): void {
    const quickSplash = entity.quickSplash;
    if (quickSplash) {
      entity.quickSplash = undefined;
      const position = grenadeQuickSplash(
        quickSplash.position,
        quickSplash.velocity,
      );
      if (position) this.spawnSplash(entity, position);
    }
    const hidden = entity.hiddenSplashLaunch;
    const segment = entity.linearSegment;
    if (
      entity.splashDataBlockId == null ||
      entity.linearSplash !== undefined ||
      (!hidden && (!segment || entity.hasExploded))
    )
      return;
    const block =
      entity.dataBlockId == null
        ? undefined
        : this.getDataBlockData(entity.dataBlockId);
    const lifetimeMS = getNumberField(block, ["lifetimeMS"]) ?? 1000;
    if (hidden) {
      entity.hiddenSplashLaunch = undefined;
      const wet = isPointSubmergedSimple(...hidden.start);
      const speed =
        getNumberField(block, [wet ? "wetVelocity" : "dryVelocity"]) ?? 80;
      entity.linearSplash =
        predictLinearSplash(
          hidden.start,
          [
            -hidden.impactNormal[0] * speed,
            -hidden.impactNormal[1] * speed,
            -hidden.impactNormal[2] * speed,
          ],
          lifetimeMS,
        ) ?? null;
    } else if (segment) {
      // Backfilled sidecars from before splash support can reconstruct
      // crossings still ahead of a saved linear shot.
      const trace = predictLinearSplash(segment.start, segment.vel, lifetimeMS);
      entity.linearSplash =
        trace && trace.ageTick >= (entity.projAgeTicks ?? 0) ? trace : null;
    }
  }

  private playReadyLinearSplash(entity: MutableEntity): void {
    const splash = entity.linearSplash;
    if (splash && (entity.projAgeTicks ?? 0) >= splash.ageTick) {
      this.spawnSplash(entity, splash.position);
      entity.linearSplash = null;
    }
  }

  private recordProjectileTrailTick(
    entity: MutableEntity,
    from: Point3,
    to: Point3,
    velocity: Point3,
  ): void {
    if (!this.presentationEffectsEnabled) return;
    const block =
      entity.dataBlockId == null
        ? undefined
        : this.getDataBlockData(entity.dataBlockId);
    const base = entity.maintainEmitterId;
    const delayedEmitter = block?.delayEmitter;
    const delayed =
      typeof delayedEmitter === "number" &&
      delayedEmitter > 0 &&
      (entity.projAgeTicks ?? 0) >
        Math.trunc(
          (getNumberField(block, ["emitterDelay"]) ?? -1) / TICK_DURATION_MS,
        )
        ? delayedEmitter
        : undefined;
    if (!base && !delayed) return;
    const interval = {
      projectileId: entity.id,
      tick: this.tickCount,
      from: [...from] as Point3,
      to: [...to] as Point3,
      velocity: [...velocity] as Point3,
    };
    if (base)
      this.projectileTrailHistory.add({
        ...interval,
        emitterId: base,
        slot: "base",
      });
    if (delayed)
      this.projectileTrailHistory.add({
        ...interval,
        emitterId: delayed,
        slot: "delayed",
      });
  }

  /**
   * Advance projectile positions by one tick, mirroring the original
   * client's prediction: linear projectiles follow their precomputed
   * segments and explode at the final (already collision-cut) end; the grenade
   * family integrates with a swept ray, bouncing while unarmed; seekers
   * explode on the first static contact.
   */
  protected advanceProjectiles(): void {
    const dt = TICK_DURATION_MS / 1000;
    let dynamicCollision: ProjectileDynamicCollision | undefined;
    let poses: ProjectileShapePoses | undefined;
    for (const entity of this.entities.values()) {
      if (entity.type !== "Projectile") continue;
      this.prepareProjectileSplash(entity);
      const v = entity.simulatedVelocity;
      const p = entity.position;
      if ((!v || !p) && !entity.linearSplash) continue;
      entity.projAgeTicks = (entity.projAgeTicks ?? 0) + 1;
      this.playReadyLinearSplash(entity);
      if (!v || !p) continue;

      if (entity.linearSegment) {
        const seg = entity.linearSegment;
        const end = seg.next ?? seg;
        const ms = entity.projAgeTicks * TICK_DURATION_MS;
        // Retail processTick (0x62e010) waits for the start of the next
        // interval to finish, so interpolation can reach the terminal point.
        if (ms - TICK_DURATION_MS >= end.msEnd) {
          this.finishLinearFlight(entity, end);
        } else {
          const scopeTick = this.tickCount - entity.spawnTick;
          const warp = entity.linearLaunchWarp;
          const exclusions = entity.linearExclusions;
          const velocity = sampleLinearTick(
            seg,
            entity.projAgeTicks,
            scopeTick,
            warp,
            linearTickStart,
            linearTickEnd,
          );
          if (warp && scopeTick >= LINEAR_LAUNCH_WARP_TICKS)
            entity.linearLaunchWarp = undefined;
          // LinearProjectile emits its tick segment before the dynamic ray.
          this.recordProjectileTrailTick(
            entity,
            linearTickStart,
            linearTickEnd,
            velocity,
          );
          // Retail tests the tick's actual path, including the initial warp.
          const ignoreSource = scopeTick <= LINEAR_SOURCE_GRACE_TICKS;
          // Old checkpoints and merged catch-up state have no trustworthy
          // birth-time references. Wait out the grace period in that case.
          if (
            (!ignoreSource || exclusions) &&
            this.usesDynamicProjectileHits(entity)
          ) {
            if (!dynamicCollision) {
              poses ??= new ProjectileShapePoses((index, id) =>
                this.projectileSource(index, id),
              );
              dynamicCollision = new ProjectileDynamicCollision(
                this.projectileCollisionTargets(poses),
              );
            }
            const hit = dynamicCollision.cast(
              linearTickStart,
              linearTickEnd,
              ignoreSource ? exclusions?.sourceId : undefined,
              ignoreSource ? exclusions?.vehicleId : undefined,
            );
            if (hit) {
              this.spawnExplosion(entity, hit.point, hit.normal);
              continue;
            }
          }
          // Keep both endpoints of this tick for native interpolateTick
          // (0x62eb20). The render history may lack the prior projectile.
          entity.linearTickStart = [...linearTickStart];
          [p[0], p[1], p[2]] = linearTickEnd;
          if (velocity !== v) {
            entity.simulatedVelocity = velocity;
            this.updateProjectileVelocity(entity, velocity);
          }
        }
        continue;
      }
      if (entity.seekerFlight) {
        if (entity.seekerFlight.target?.id)
          poses ??= new ProjectileShapePoses((index, id) =>
            this.projectileSource(index, id),
          );
        this.advanceSeeker(
          entity,
          entity.seekerFlight,
          p,
          v,
          dt,
          entity.projAgeTicks,
          poses,
        );
        continue;
      }
      if (
        entity.projectilePhysics === "ballistic" ||
        entity.projectilePhysics === "seeker"
      ) {
        const ballistic = entity.projectilePhysics === "ballistic";
        if (ballistic)
          entity.projectileInWater = projectileWaterAt(...p) !== null;
        // EnergyProjectile draws a motion blur in its own processTick and
        // does not call Projectile::emitParticles for the flight path.
        const emitsTrail =
          ballistic &&
          !entity.projectileInWater &&
          entity.className !== "EnergyProjectile";
        if (emitsTrail)
          [
            ballisticTickStart[0],
            ballisticTickStart[1],
            ballisticTickStart[2],
          ] = p;
        const result = stepBallistic(p, v, {
          // Seekers coast on their transmitted velocity, no gravity.
          gravity: ballistic ? this.gravity * (entity.gravityMod ?? 1) : 0,
          elasticity: entity.projElasticity ?? 0.999,
          friction: entity.projFriction ?? 0.3,
          armed:
            entity.projArmedTick != null
              ? entity.projAgeTicks > entity.projArmedTick
              : true,
          submergedDrag: entity.projectileInWater ? entity.projDrag : undefined,
          detectSplash:
            ballistic && !!entity.splashDataBlockId && !entity.splashPlayed,
          bounces: ballistic,
        });
        if (result.splash) this.spawnSplash(entity, result.splash);
        if (result.explodeAt && !entity.hasExploded) {
          if (entity.explosionDataBlockId != null) {
            this.spawnExplosion(
              entity,
              [...result.explodeAt.point],
              [...result.explodeAt.normal],
            );
          } else {
            this.endProjectileFlight(entity, result.explodeAt.point);
          }
          continue;
        }
        if (emitsTrail)
          this.recordProjectileTrailTick(entity, ballisticTickStart, p, v);
      } else {
        p[0] += v[0] * dt;
        p[1] += v[1] * dt;
        p[2] += v[2] * dt;
      }

      this.updateProjectileVelocity(entity, v);
    }
  }

  private advanceMountedImage(
    entity: MutableEntity,
    animation: ImageAnimation | undefined,
    time: number,
    flags: WeaponImageState,
    forceFire = false,
    mounted = false,
  ) {
    if (!animation) return;
    const previous = animation.current;
    const state = animation.advance(time, flags, forceFire);
    if (
      entity.type === "Player" &&
      ((mounted && previous.state.recoil) ||
        (state !== previous && state.state.recoil))
    )
      entity.recoilStartedAtSec = time;
    return state;
  }

  /** Advance client animations even while their render assets are absent. */
  protected advanceShapeAnimations(): void {
    const time = this.getTimeSec();
    for (const entity of this.entities.values()) {
      entity.clientAnimation = updateClientAnimation(
        entity.clientAnimation,
        entity,
        time,
      );
    }
    for (const [id, animations] of this.imageAnimations) {
      const entity = this.entities.get(id);
      if (!entity?.imageSlots) continue;
      let changed = false;
      for (let i = 0; i < animations.length; i++) {
        const animation = animations[i],
          slot = entity.imageSlots[i];
        if (!animation || !slot?.imageState) continue;
        const state = this.advanceMountedImage(
          entity,
          animation,
          time,
          slot.imageState,
        );
        if (state === slot.animation) continue;
        if (!changed) entity.imageSlots = [...entity.imageSlots];
        changed = true;
        entity.imageSlots[i] = { ...slot, animation: state };
      }
    }
  }

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

  private nestedControlEntity(): MutableEntity | undefined {
    if (!this.isPiloting || this.lastPilotGhostIndex == null) return undefined;
    const id = this.entityIdByGhostIndex.get(this.lastPilotGhostIndex);
    return id ? this.entities.get(id) : undefined;
  }

  /** Retail takes the first-person restriction from the object supplying the Eye. */
  protected controlCameraFirstPerson(): boolean {
    if (this.firstPerson) return true;
    const nestedId = this.nestedControlEntity()?.dataBlockId;
    if (nestedId !== undefined) {
      const data = this.getDataBlockData(nestedId);
      if (data?.useEyePoint === true) return data.firstPersonOnly === true;
    }
    const id = this.entityIdByGhostIndex.get(this.latestControl.ghostIndex);
    const dataBlockId =
      id === undefined ? undefined : this.entities.get(id)?.dataBlockId;
    return (
      dataBlockId !== undefined &&
      this.getDataBlockData(dataBlockId)?.firstPersonOnly === true
    );
  }

  private syncControlTurret(turret: MutableEntity): void {
    const packet = this.latestControl.data?.controlObjectData as
      Partial<TurretPacketData> | undefined;
    const values = packet?.rotationValues;
    if (
      !Array.isArray(values) ||
      values.length !== 3 ||
      !values.every(Number.isFinite)
    )
      return;
    // Turret::readPacketData (0x655d70) uses degree angles and full activation.
    // The turret's regular ghost update omits those fields for its controller.
    const [activation, phi, theta] = values;
    const aim = turret.turretAim;
    if (
      aim?.activation !== activation ||
      aim.phi !== phi ||
      aim.theta !== theta
    )
      turret.turretAim = { activation, phi, theta };
  }

  private controlTurretPosition(
    turret: MutableEntity | undefined,
  ): Vec3 | undefined {
    if (!turret) return undefined;
    const mount = this.resolveMountParent(turret);
    const position = mount?.position ?? turret.position;
    if (!position) return undefined;
    const [x, y, z] = position;
    return { x, y, z };
  }

  /** Apply a control packet once; camera updates must not undo tick prediction. */
  private syncControlVehicle(vehicle: MutableEntity): void {
    const control = this.latestControl;
    if (!control.position || control === this.lastVehicleControl) return;
    // An unrelated packet retains the same position reference. Only a new
    // position corrects extrapolation; sparse velocity/orientation updates persist.
    if (
      control.position !== this.lastVehicleControl?.position ||
      !this.lastVehiclePos
    ) {
      this.lastVehiclePos = [
        control.position.x,
        control.position.y,
        control.position.z,
      ];
      vehicle.position = [...this.lastVehiclePos];
    }
    const data = control.data;
    if (data !== this.lastVehicleControl?.data) {
      const nested = data?.controlObjectData as ParsedData | undefined;
      const momentum = nested?.linMomentum as Vec3 | undefined;
      if (isValidPosition(momentum)) {
        // Client Rigid mass is 1, so packed momentum is velocity.
        this.lastVehicleVelocity = [momentum.x, momentum.y, momentum.z];
        vehicle.velocity = this.lastVehicleVelocity;
      }
      const rotation = nested?.angPosition as
        { x: number; y: number; z: number; w: number } | undefined;
      if (rotation && typeof rotation.w === "number") {
        this.lastVehicleHeading = torqueQuatHeading(rotation);
        this.lastVehiclePitch = torqueQuatPitch(rotation);
        const converted = torqueQuatToThreeJS(rotation);
        if (converted) {
          vehicle.rotation = converted;
          // ShapeBase::getCameraTransform pulls back along the eye's -Y
          // in Torque space (Three.js -X). Use the full quaternion for roll.
          const [qx, qy, qz, qw] = converted;
          this.lastVehicleOrbitDir = [
            -(1 - 2 * (qy * qy + qz * qz)),
            -2 * (qx * qy + qz * qw),
            -2 * (qx * qz - qy * qw),
          ];
        }
      }
    }
    this.lastVehicleControl = control;
  }

  /** Extrapolate the control vehicle's position each tick using velocity.
   *  controlObjectData arrives sparsely (~10 of ~62 packets/sec). Between
   *  updates, we integrate position from the last known velocity. */
  protected advanceControlVehicle(): void {
    const vehicle = this.nestedControlEntity();
    if (vehicle?.type !== "Vehicle") return;
    this.syncControlVehicle(vehicle);
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

    const dt = TICK_DURATION_MS / 1000;
    const [vx, vy, vz] = this.lastVehicleVelocity;
    this.lastVehiclePos[0] += vx * dt;
    this.lastVehiclePos[1] += vy * dt;
    this.lastVehiclePos[2] += vz * dt;
    vehicle.position = [...this.lastVehiclePos];
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

  private removeExpiredEffects(): void {
    for (const [id, entity] of this.entities) {
      if (entity.expiryTick != null && this.tickCount >= entity.expiryTick) {
        this.entities.delete(id);
      }
    }
  }

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

  // ── Camera and HUD ──

  /** Resolve an observer Camera's orbit from its last control packet. */
  protected applyObserverCameraMode(camera: StreamCamera): void {
    const data = this.latestControl.data;
    const mode = data?.cameraMode ?? this.lastCameraMode;
    if (mode !== CameraMode_OrbitObject && mode !== CameraMode_OrbitPoint)
      return;

    camera.mode = "third-person";
    const distance = observerOrbitDistance(data) ?? this.lastOrbitDistance;
    if (distance !== undefined) camera.orbitDistance = distance;
    if (mode === CameraMode_OrbitObject) {
      const index = data?.orbitObjectGhostIndex ?? this.lastOrbitGhostIndex;
      if (typeof index === "number" && index >= 0)
        camera.orbitTargetId = this.resolveEntityIdForGhostIndex(index);
    } else {
      const point = data?.orbitPoint as Vec3 | undefined;
      if (isValidPosition(point))
        camera.orbitPoint = [point.x, point.y, point.z];
    }
  }

  private updateCameraPose(
    controlledTurret: MutableEntity | undefined,
  ): { yaw: number; pitch: number } | undefined {
    const control = this.latestControl;
    const timeSec = this.getTimeSec();
    const data = control.data;
    const controlType = this.lastControlType;

    // Mounted turret control packets lack an initial player position. The
    // host vehicle anchors the view until its animated turret Eye is ready.
    const position =
      control.position ?? this.controlTurretPosition(controlledTurret);
    if (position) {
      const angles = this.getCameraYawPitch(data);

      // When piloting a vehicle (without freelook), mouse yaw goes to
      // vehicle steering (mRot.z) and the player's head rotation (mHead)
      // decays by 50% per tick — the camera is locked to the vehicle.
      // Use the vehicle's heading directly instead of move-accumulated yaw.
      // Verified against tribes2-engine Player::updateMove and Tribes2.exe.
      if (this.isPiloting && !controlledTurret) {
        angles.yaw = this.lastVehicleHeading;
        angles.pitch = this.lastVehiclePitch;
      }

      // Follow the simulated vehicle position between server corrections.
      const cameraPos: [number, number, number] =
        this.isPiloting && !controlledTurret && this.lastVehiclePos
          ? [...this.lastVehiclePos]
          : [position.x, position.y, position.z];

      const predictedControlId = this.entityIdByGhostIndex.get(
        control.ghostIndex,
      );
      const predictedControl = predictedControlId
        ? this.entities.get(predictedControlId)?.playerPrediction
        : undefined;
      if (
        predictedControl?.hasPosition &&
        !predictedControl.mounted &&
        !this.isPiloting
      ) {
        predictedControl.position.toArray(cameraPos);
        angles.yaw = predictedControl.yaw + predictedControl.headYaw;
        angles.pitch = predictedControl.headPitch;
      }

      const { yaw, pitch } = angles;
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
        this.applyObserverCameraMode(this.camera);
      } else {
        // Player control object.
        if (control.ghostIndex >= 0) {
          this.controlPlayerGhostId = this.resolveEntityIdForGhostIndex(
            control.ghostIndex,
          );
        }
        if (!this.controlCameraFirstPerson()) {
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
        // Preserve the nested control object so Original view can select its
        // Eye when the datablock opts in (for example, a vehicle turret).
        if (this.isPiloting && this.lastPilotGhostIndex != null) {
          this.camera.controlEntityId = this.resolveEntityIdForGhostIndex(
            this.lastPilotGhostIndex,
          );
        } else if (this.controlPlayerGhostId) {
          this.camera.controlEntityId = this.controlPlayerGhostId;
        }
      }

      return angles;
    } else if (this.camera) {
      this.camera = {
        ...this.camera,
        time: timeSec,
        fov: this.latestFov,
      };
    }
    return undefined;
  }

  protected updateCameraAndHud(): void {
    const nested = this.nestedControlEntity();
    const controlledTurret =
      nested?.className === "Turret" ? nested : undefined;
    if (controlledTurret) this.syncControlTurret(controlledTurret);
    else if (nested?.type === "Vehicle") this.syncControlVehicle(nested);

    this.explodePendingExplosions();
    this.removeExpiredEffects();

    const cameraPose = this.updateCameraPose(controlledTurret);
    const control = this.latestControl;
    const data = control.data;
    // Mounted placement owns the pilot's body; unpredicted players retain
    // their packet poses (for example, headless timeline scans).
    if (cameraPose && this.lastControlType === "player" && control.position) {
      const { yaw, pitch } = cameraPose;
      if (this.isPiloting && this.lastPilotGhostIndex != null) {
        // The recorder's own body sits in the seat with the yaw the
        // server zeroed on mount (Armor::onMount setTransform), which
        // reaches the control client through its packet data.
        const pilotEntity = this.controlPlayerGhostId
          ? this.entities.get(this.controlPlayerGhostId)
          : undefined;
        if (
          pilotEntity?.mountObjectGhostIndex != null &&
          pilotEntity.mountNode === 0
        ) {
          pilotEntity.rotation = playerYawToQuaternion(0);
        }
      } else if (this.controlPlayerGhostId) {
        const ghostEntity = this.entities.get(this.controlPlayerGhostId);
        if (ghostEntity && !ghostEntity.playerPrediction?.hasPosition) {
          ghostEntity.position = [
            control.position.x,
            control.position.y,
            control.position.z,
          ];
          ghostEntity.rotation = playerYawToQuaternion(yaw);
          ghostEntity.headPitch = this.getControlPlayerHeadPitch(pitch);
          ghostEntity.viewQuantized = false;
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
    const playerSensorGroup = this.conn.playerSensorGroup;
    if (playerSensorGroup === 0) return undefined;
    const colorMap = this.conn.sensorGroupColors.get(playerSensorGroup);
    if (colorMap) {
      const color = colorMap.get(targetSensorGroup);
      if (color) return color;
    }
    if (targetSensorGroup === playerSensorGroup) return IFF_GREEN;
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

  protected updateServerDisplayName(name: string): void {
    if (name) this.serverDisplayName = name;
  }

  protected updateConnectedPlayerName(name: string, clientId: number): void {
    this.connectedPlayerName = name;
    this.connectedClientId = clientId;
  }

  protected handleServerMessage(args: string[]): void {
    const effects = this.conn.applyServerMessage(args);
    if (!effects) return;
    if (effects.teamScoresChanged || effects.flagsChanged)
      this.onTeamScoresChanged();
    if (effects.rosterChanged) this.onRosterChanged();
    // Update every body sharing this client's target immediately; the
    // matching TargetInfoEvent can arrive a packet later.
    if (effects.renamedTargetId != null)
      this.syncTargetEntities(effects.renamedTargetId);
    if (effects.joinedClientId != null && !this.connectedPlayerName) {
      const name = this.conn.playerRoster.get(effects.joinedClientId)!.name;
      const msgFormat = stripTaggedStringMarkup(this.resolveNetString(args[1]));
      // Own-join detection is connection-specific; silent roster sync
      // joins must not identify the connected player.
      if (name && msgFormat.includes("Welcome to Tribes")) {
        this.updateConnectedPlayerName(name, effects.joinedClientId);
        this.onMissionInfoChange?.();
      }
    }
    if (effects.serverName) this.updateServerDisplayName(effects.serverName);
    if (effects.missionDropReady) {
      this.missionReadySec = this.getTimeSec();
      this.onTeamScoresChanged();
      this.endedEntities = null;
    }
    if (effects.missionInfoChanged)
      log.info(
        "%s: mission=%s gameType=%s gameClass=%s server=%s",
        this.resolveNetString(args[0]),
        this.missionDisplayName,
        this.missionTypeDisplayName,
        this.gameClassName,
        this.serverDisplayName,
      );
    if (effects.missionInfoChanged || effects.loadInfoChanged)
      this.onMissionInfoChange?.();
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

  private applyEntityTargetInfo(entity: MutableEntity): void {
    const targetId = entity.targetId ?? -1;
    const targets = this.conn.targets;
    const rawName = targets.rawNames.get(targetId);
    entity.playerRawName = rawName;
    entity.playerName =
      rawName == null ? undefined : stripTaggedStringMarkup(rawName).trim();
    entity.targetTypeName = targets.types.get(targetId);
    entity.sensorGroup = targets.teams.get(targetId);
    entity.targetRenderFlags = targets.renderFlags.get(targetId);
    entity.skinName = targets.skins.get(targetId) || undefined;
    entity.skinPrefName = targets.skinPrefs.get(targetId) || undefined;
  }

  /**
   * Entity and HUD-cache reactions to a shared target-system event.
   */
  private applyConnectionEffect(effect: ConnectionEventEffect): void {
    switch (effect.kind) {
      case "netString":
        for (const targetId of effect.resolvedTargets) {
          this.onRosterChanged();
          this.syncTargetEntities(targetId);
          if (((this.conn.targets.renderFlags.get(targetId) ?? 0) & 0x2) !== 0)
            this.onTeamScoresChanged();
        }
        break;
      case "targetInfo":
        this.onRosterChanged();
        if (effect.hudChanged) this.onTeamScoresChanged();
        this.syncTargetEntities(effect.targetId);
        break;
      case "targetFree":
        this.onRosterChanged();
        if (effect.hadFlagBit) this.onTeamScoresChanged();
        // TargetFreeEvent (0x00673180) calls GameBase::onTargetInfoChanged
        // (0x005e3790), which detaches the ghost from this target slot.
        for (const entity of this.entities.values()) {
          if (entity.targetId !== effect.targetId) continue;
          entity.targetId = -1;
          entity.targetGeneration = undefined;
          this.applyEntityTargetInfo(entity);
        }
        break;
    }
  }

  private syncTargetEntities(targetId: number): void {
    for (const entity of this.entities.values()) {
      if (entity.targetId === targetId) this.applyEntityTargetInfo(entity);
    }
  }

  // ── Snapshot building ──

  /**
   * The current state as a snapshot. Adapters cache it on their own keys;
   * `exhausted` is true once a demo has played to the end of its data.
   */
  protected buildSnapshot(exhausted: boolean): StreamSnapshot {
    const inboundMissileTargetIds = new Set<string>();
    const entities = this.buildEntityList(inboundMissileTargetIds);
    const timeSec = this.getTimeSec();

    const { chatMessages, serverEvents, audioEvents } =
      this.buildTimeFilteredEvents(timeSec);

    const {
      weaponsHud,
      inventoryHud,
      backpackHud,
      teamScores,
      flagTargets,
      playerTargets,
      playerRoster,
    } = this.buildCachedHudState();

    return {
      timeSec,
      ordnanceImpacts: this.snapshotDirectorImpacts(timeSec),
      gravity: this.gravity,
      ghostAlwaysDoneSec: this.ghostAlwaysDoneSec,
      missionReadySec: this.missionReadySec,
      exhausted,
      camera: this.camera,
      entities,
      flagTargets,
      playerTargets,
      playerIdentityScope: this.conn.playerIdentity.scope,
      flags: Array.from(this.conn.flags.values()),
      controlPlayerGhostId: this.controlPlayerGhostId,
      missileLock: this.snapshotMissileLock(),
      inferredMissileLocks: this.snapshotInferredMissileLocks(),
      ...(inboundMissileTargetIds.size > 0 && {
        inboundMissileTargetIds: [...inboundMissileTargetIds],
      }),
      flagDroppedAtSec: this.conn.flagDroppedAtSec,
      flagReturnDelaySec: flagReturnDelaySec(
        this.gameClassName,
        this.missionTypeDisplayName,
      ),
      playerSensorGroup: this.conn.playerSensorGroup,
      status: this.lastStatus,
      chatMessages,
      serverEvents,
      audioEvents,
      weaponsHud,
      backpackHud,
      inventoryHud,
      teamScores,
      playerRoster,
      connectedClientId: this.connectedClientId,
      matchClockMs: this.computeMatchClockMs(timeSec),
      matchPhase: this.conn.matchPhase,
      matchEnded: this.matchEnded,
      matchEndedAtSec: this.matchEndedAtSec,
      matchStarted: this.matchStarted,
      loadInfo: this.serverLoadInfo,
    };
  }

  /** Project only the fields read by the director and headless collision world. */
  protected buildDirectorEntities(): DirectorEntity[] {
    const entities: DirectorEntity[] = [];
    for (const entity of this.entities.values()) {
      if (PRESENTATION_GHOSTS.has(entity.className)) continue;
      entities.push({
        id: entity.id,
        type: entity.type,
        className: entity.className,
        dataBlock: entity.dataBlock,
        shapeHint: entity.shapeHint,
        ghostIndex: entity.ghostIndex,
        sourceGhostIndex: entity.sourceGhostIndex,
        mountObjectId: this.resolveMountParent(entity)?.id,
        position: snapshotEntityPosition(entity),
        rotation: entity.rotation,
        scale: entity.scale,
        targetId: entity.targetId,
        targetGeneration: entity.targetGeneration,
        targetRenderFlags: entity.targetRenderFlags,
        teamId: entity.sensorGroup,
        playerName: entity.playerName,
        playerRawName: entity.playerRawName,
        skinName: entity.skinName,
        skinPrefName: entity.skinPrefName,
        health: entity.health,
        damageState: entity.damageState,
        sceneData: entity.sceneData,
        forceFieldData: entity.forceFieldData && {
          dimensions: entity.forceFieldData.dimensions,
        },
        forceFieldState: entity.forceFieldState,
        imageSlots: entity.imageSlots?.map(
          (slot) =>
            slot && { shapeName: slot.shapeName, skinName: slot.skinName },
        ),
        threads: entity.threads?.map(({ index, state, atEnd }) => ({
          index,
          state,
          atEnd,
        })),
      });
    }
    return entities;
  }

  protected buildDirectorSnapshot(
    entities = this.buildDirectorEntities(),
  ): DirectorSnapshot {
    const timeSec = this.getTimeSec();
    const { playerRoster, teamScores } = this.buildCachedMatchState();
    return {
      ...this.snapshotMessages(),
      entities,
      timeSec,
      ordnanceImpacts: this.snapshotDirectorImpacts(timeSec),
      ghostAlwaysDoneSec: this.ghostAlwaysDoneSec,
      playerRoster,
      teamScores,
      matchClockMs: this.computeMatchClockMs(timeSec),
      matchPhase: this.conn.matchPhase,
      matchStarted: this.matchStarted,
      matchEnded: this.matchEnded,
    };
  }

  private snapshotDirectorImpacts(timeSec: number) {
    if (this.directorImpacts.length === 0) return undefined;
    const recent = this.directorImpacts.filter(
      (impact) => impact.timeSec >= timeSec - 2 && impact.timeSec <= timeSec,
    );
    return recent.length ? recent : undefined;
  }

  /** Build entity list, holding the final world throughout the debrief. */
  protected buildEntityList(
    inboundMissileTargetIds?: Set<string>,
  ): StreamEntity[] {
    if (this.endedEntities) return this.endedEntities;
    const entities: StreamEntity[] = [];
    for (const entity of this.entities.values()) {
      const missileTargetId = entity.seekerFlight?.target?.id;
      if (
        inboundMissileTargetIds &&
        missileTargetId &&
        !entity.hasExploded &&
        this.entities.has(missileTargetId)
      )
        inboundMissileTargetIds.add(missileTargetId);
      this.refreshWeather(entity);
      const renderFlags = entity.targetRenderFlags;
      const snapshot: EveryField<StreamEntity> = {
        id: entity.id,
        type: entity.type,
        visual: entity.visual,
        direction: entity.direction,
        ghostIndex: entity.ghostIndex,
        sourceGhostIndex: entity.sourceGhostIndex,
        projectileSourceName: entity.projectileSourceName,
        sourceSlot: entity.sourceSlot,
        beamStart: entity.beamStart,
        beamEnd: entity.beamEnd,
        targetBeam: entity.targetBeam,
        beamHit: entity.beamHit,
        linkSourceId: this.visibleBeamEndpoint(
          entity.beamSourceId,
          entity.sourceGhostIndex,
        ),
        linkTargetId: this.visibleBeamEndpoint(
          entity.beamTargetId,
          entity.linkTargetGhostIndex,
        ),
        className: entity.className,
        dataBlockId: entity.dataBlockId,
        shapeHint: entity.shapeHint,
        dataBlock: entity.dataBlock,
        imageSlots: entity.imageSlots,
        lightType: entity.lightType,
        lightColor: entity.lightColor,
        underwaterLightColor: entity.underwaterLightColor,
        lightTime: entity.lightTime,
        lightRadius: entity.lightRadius,
        lightDelayMS: entity.lightDelayMS,
        lightOnlyStatic: entity.lightOnlyStatic,
        lightAnchor: entity.lightAnchor,
        isStaticItem: entity.isStaticItem,
        mountObjectId: this.resolveMountParent(entity)?.id,
        mountNode: entity.mountNode,
        falling: entity.falling,
        jetting: entity.jetting,
        thrustDirection: entity.thrustDirection,
        playerName: entity.playerName,
        playerRawName: entity.playerRawName,
        targetTypeName: entity.targetTypeName,
        targetGeneration: entity.targetGeneration,
        skinName: entity.skinName,
        skinPrefName: entity.skinPrefName,
        targetRenderFlags: entity.targetRenderFlags,
        targetId: entity.targetId,
        teamId: entity.sensorGroup,
        iffColor:
          (entity.type === "Player" || ((renderFlags ?? 0) & 0x2) !== 0) &&
          entity.sensorGroup != null
            ? this.resolveIffColor(entity.sensorGroup)
            : undefined,
        position: snapshotEntityPosition(entity),
        rotation: entity.rotation,
        playerDelta: entity.playerDelta,
        linearTickStart: entity.linearTickStart,
        scale: entity.scale,
        velocity: entity.velocity,
        particleEmitter: entity.particleEmitter,
        precipitation: entity.precipitation,
        lightning: entity.lightning,
        emissionVelocity: entity.emissionVelocity,
        timeMultiple: entity.timeMultiple,
        health: entity.health,
        energy: entity.energy,
        actionSlot: entity.actionSlot,
        recoilStartedAtSec: entity.recoilStartedAtSec,
        armAction: entity.armAction,
        damageState: entity.damageState,
        destroyedHidden: entity.destroyedHidden,
        turretAim: entity.turretAim,
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
        spawnTimeSec:
          entity.explosionSpawnSec ??
          entity.spawnTick * (TICK_DURATION_MS / 1000),
        hasExploded: entity.hasExploded,
        maintainEmitterId: entity.maintainEmitterId,
        projectileTrailMode:
          entity.projectilePhysics === "seeker"
            ? "seeker"
            : entity.projectilePhysics
              ? "tick"
              : undefined,
        projectileInWater: entity.projectileInWater,
        bubbleEmitterId: entity.bubbleEmitterId,
        splashEmitterLifetimeMS: entity.splashEmitterLifetimeMS,
        headPitch: entity.headPitch,
        headYaw: entity.headYaw,
        viewQuantized: entity.viewQuantized,
        reconstructedAim: entity.reconstructedAim,
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
        clientAnimation: entity.clientAnimation,
        steeringYaw: entity.steeringYaw,
        frozen: entity.frozen,
        projectileAgeMS:
          entity.type === "Projectile" && entity.projAgeTicks != null
            ? entity.projAgeTicks * TICK_DURATION_MS
            : undefined,
        projectileActivateDelayMS: entity.projActivateDelayMS,
        seekerCasing: entity.seekerCasing,
        seekerLaunch: entity.seekerLaunch,
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
      };
      entities.push(snapshot);
    }
    return entities;
  }

  /**
   * Compute the match clock value in ms, mirroring HudClockCtrl's actualTimeMS.
   * Negative = counting down (remaining), positive = counting up (elapsed).
   * Returns null if no clock has been set.
   */
  protected computeMatchClockMs(timeSec: number): number | null {
    const clock = this.conn.clock;
    if (!clock) return null;
    const elapsedMs =
      ((this.conn.matchEndedAtSec ?? timeSec) - clock.anchorSec) * 1000;
    // actualTimeMS = -durationMs + elapsed
    // duration=0 → positive (count-up), duration>0 → starts negative (count-down)
    return -clock.durationMs + elapsedMs;
  }

  /**
   * Original flag targets survive their item ghosts being hidden on pickup.
   * Carriers also get render bit 0x2; exclude their client targets using
   * target type, roster IDs and scoped Player entities (demo PLAYERLIST
   * entries can lack target IDs). Rebuilt only when HUD metadata changes.
   */
  private buildFlagTargets(): FlagTargetInfo[] {
    const clientTargetIds = new Set<number>();
    for (const entry of this.conn.playerRoster.values()) {
      if (entry.targetId != null) clientTargetIds.add(entry.targetId);
    }
    for (const targetId of this.playerGhostTargetIds())
      clientTargetIds.add(targetId);
    const targets = this.conn.targets;
    const flags: FlagTargetInfo[] = [];
    for (const [targetId, renderFlags] of targets.renderFlags) {
      if ((renderFlags & 0x2) === 0) continue;
      if (clientTargetIds.has(targetId)) continue;
      if (targets.types.get(targetId) === "_ClientConnection") continue;
      flags.push({
        targetId,
        name: targets.rawNames.get(targetId),
        typeName: targets.types.get(targetId),
        teamId: targets.teams.get(targetId),
        skinName: targets.skins.get(targetId)?.toLowerCase(),
      });
    }
    return flags;
  }

  /**
   * Targets of scoped Player ghosts; demo PLAYERLIST entries can lack them.
   */
  private *playerGhostTargetIds(): Iterable<number> {
    for (const entity of this.entities.values())
      if (entity.type === "Player" && entity.targetId != null)
        yield entity.targetId;
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
    flagTargets: FlagTargetInfo[];
    playerTargets: PlayerRecord[];
    playerRoster: PlayerRosterEntry[];
  } {
    const playerTargets = this.conn.playerTargets();
    refreshFlagCarriers(
      this.conn.flags,
      this.conn.resolvePlayers(playerTargets),
    );
    const teamCounts = new Map<number, number>();
    for (const { teamId } of this.conn.playerRoster.values()) {
      if (teamId > 0) teamCounts.set(teamId, (teamCounts.get(teamId) ?? 0) + 1);
    }
    const teamScores: TeamScore[] = this.conn.teamScores.map((ts) => ({
      ...ts,
      playerCount: teamCounts.get(ts.teamId) ?? 0,
      flag: this.conn.flags.get(ts.teamId),
    }));
    const flagTargets = this.buildFlagTargets();
    for (const flag of flagTargets) {
      if (flag.teamId == null || !flag.skinName) continue;
      const team = teamScores.find((t) => t.teamId === flag.teamId);
      if (team) team.skinName = flag.skinName;
    }

    const playerRoster: PlayerRosterEntry[] = [];
    for (const [clientId, entry] of this.conn.playerRoster) {
      playerRoster.push({ clientId, ...entry });
    }
    return { teamScores, flagTargets, playerTargets, playerRoster };
  }

  /** Force the next buildCachedHudState() to rebuild every part (e.g. on a
   *  mission change, alongside the outer snapshot cache reset). */
  protected invalidateHudCache(): void {
    this._hudCache = null;
    this._matchSnapshotCache = null;
  }

  private buildCachedMatchState(): ReturnType<
    StreamEngine["buildTeamScoresAndRoster"]
  > {
    const prev = this._matchSnapshotCache;
    if (
      prev &&
      prev.teamScoresGen === this._teamScoresGen &&
      prev.rosterGen === this._rosterGen
    )
      return prev.state;
    const state = this.buildTeamScoresAndRoster();
    this._matchSnapshotCache = {
      teamScoresGen: this._teamScoresGen,
      rosterGen: this._rosterGen,
      state,
    };
    return state;
  }

  /**
   * HUD-derived arrays for a snapshot, rebuilding only the parts whose
   * generation counter (or the backpack's identity) changed since the last
   * call — steady playback frames reuse the prior arrays.
   */
  protected buildCachedHudState(): {
    weaponsHud: { slots: WeaponsHudSlot[]; activeIndex: number };
    inventoryHud: { slots: InventoryHudSlot[]; activeSlot: number };
    backpackHud: BackpackHudState | null;
    teamScores: TeamScore[];
    flagTargets: FlagTargetInfo[];
    playerTargets: PlayerRecord[];
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
    this._hudCache = {
      weaponsHudGen: this._weaponsHudGen,
      inventoryHudGen: this._inventoryHudGen,
      backpackPackIndex: this.backpackHud.packIndex,
      backpackActive: this.backpackHud.active,
      backpackText: this.backpackHud.text,
      weaponsHud,
      inventoryHud,
      backpackHud,
    };
    return {
      weaponsHud,
      inventoryHud,
      backpackHud,
      ...this.buildCachedMatchState(),
    };
  }

  private snapshotMessages() {
    if (this._chatSnapshotGen !== this._chatGen) {
      this._chatSnapshot = this.chatMessages.slice();
      this._chatSnapshotGen = this._chatGen;
    }
    if (this._serverEventsSnapshotGen !== this._serverEventsGen) {
      this._serverEventsSnapshot = this.serverEvents.slice();
      this._serverEventsSnapshotGen = this._serverEventsGen;
    }
    return {
      chatMessages: this._chatSnapshot,
      serverEvents: this._serverEventsSnapshot,
    };
  }

  /** Build event arrays for playback, including one-shot audio for this frame. */
  protected buildTimeFilteredEvents(timeSec: number): {
    chatMessages: ChatMessage[];
    serverEvents: ServerMessageEvent[];
    audioEvents: PendingAudioEvent[];
  } {
    const audioEvents = this.audioEvents.filter(
      (e) => e.timeSec > timeSec - 0.5 && e.timeSec <= timeSec,
    );
    return { ...this.snapshotMessages(), audioEvents };
  }
}
