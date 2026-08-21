import { ghostToSceneObject } from "../scene";
import type { SceneObject } from "../scene/types";
import {
  buildLinearSegment,
  linearSegmentPosition,
  stepBallistic,
  type LinearSegment,
} from "../collision/projectilePhysics";
import { castWorldRay } from "../collision/worldCollision";
import {
  linearProjectileClassNames,
  ballisticProjectileClassNames,
  seekerProjectileClassNames,
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
  resolveSpriteVisual,
  parseWeaponImageStates,
  stripTaggedStringMarkup,
  detectColorCode,
  extractWavTag,
  detectControlObjectType,
} from "./streamHelpers";
import type { Vec3 } from "./streamHelpers";
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
  WeaponImageState,
  WeaponImageDataBlockState,
} from "./types";
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
  armAction?: number;
  damageState?: number;
  targetId?: number;
  projectilePhysics?: "linear" | "ballistic" | "seeker";
  simulatedVelocity?: [number, number, number];
  gravityMod?: number;
  /** Ticks since the projectile left the muzzle (seeded from currTick). */
  projAgeTicks?: number;
  /** Precomputed flight segment for linear projectiles (Torque model:
   *  one static-world raycast at spawn, closed-form position per tick). */
  linearSegment?: LinearSegment;
  /** Grenade-family bounce parameters resolved from the datablock. */
  projElasticity?: number;
  projFriction?: number;
  /** Tick after which contact explodes instead of bouncing. */
  projArmedTick?: number;
  explosionShape?: string;
  explosionLifetimeTicks?: number;
  hasExploded?: boolean;
  isExplosion?: boolean;
  expiryTick?: number;
  faceViewer?: boolean;
  explosionDataBlockId?: number;
  maintainEmitterId?: number;
  sensorGroup?: number;
  threads?: ThreadState[];
  weaponImageState?: WeaponImageState;
  weaponImageStates?: WeaponImageDataBlockState[];
  weaponImageStatesDbId?: number;
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
  /** Force field visual data extracted from ForceFieldBareData datablock. */
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

export type RuntimeControlObject = {
  ghostIndex: number;
  data?: ParsedData;
  position?: Vec3;
};

/** Minimal interface for the parser registry (ghost/event class lookup). */
export interface ParserRegistry {
  getGhostParser(classId: number): { name: string } | undefined;
  getEventParser(classId: number): { name: string } | undefined;
}

/** Minimal interface for ghost tracking (class name by ghost index). */
export interface GhostTrackerLike {
  getGhost(ghostIndex: number): { className: string } | undefined;
  clear?(): void;
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
  protected chatMessageIdCounter = 0;
  private _chatGen = 0;
  private _chatSnapshotGen = -1;
  private _chatSnapshot: ChatMessage[] = [];
  protected audioEvents: PendingAudioEvent[] = [];

  // ── Net strings ──
  protected netStrings = new Map<number, string>();

  // ── Target system ──
  protected targetNames = new Map<number, string>();
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
  /** Time (sec) of last vehicle position update from controlObjectData. */
  protected lastVehiclePosTime = 0;
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
  protected teamScores: TeamScore[] = [];
  protected playerRoster = new Map<
    number,
    {
      name: string;
      targetId?: number;
      teamId: number;
      score: number;
      ping: number;
      packetLoss: number;
    }
  >();
  /** Stream time (seconds) when the clock was last set. */
  protected clockAnchorStreamSec: number | null = null;
  /** Duration in ms passed to setTime (0 = count-up, >0 = count-down). */
  protected clockDurationMs: number = 0;

  // ── Mission info (from server messages) ──
  /** Completed server loading-screen info (set on MsgLoadInfoDone). */
  serverLoadInfo: ServerLoadInfo | null = null;
  /** Lines accumulating between MsgLoadInfo and MsgLoadInfoDone. */
  private pendingLoadInfo: ServerLoadInfo | null = null;

  /** Mission display name (e.g. "Riverdance"), from MsgMissionDropInfo/MsgLoadInfo. */
  missionDisplayName: string | null = null;
  /** Game type display name (e.g. "Capture the Flag"), from MsgMissionDropInfo/MsgLoadInfo. */
  missionTypeDisplayName: string | null = null;
  /** Game class name (e.g. "CTFGame"), from MsgClientReady. */
  gameClassName: string | null = null;
  /** Match-over interval: set by the gameOver debrief burst, cleared when
   *  the next mission's MsgClientReady drops the player in. */
  matchEnded = false;
  /** Server name from MsgMissionDropInfo. */
  serverDisplayName: string | null = null;
  /** Server-assigned name of the connected/recording player. */
  connectedPlayerName: string | null = null;
  /** Client ID of the connected player (from MsgClientJoin "Welcome" message). */
  connectedClientId: number | null = null;
  /** Called when mission info changes (mission name, game type, etc.). */
  onMissionInfoChange?: () => void;

  // ── Explosions ──
  protected nextExplosionId = 0;

  // ── Abstract methods ──

  /** Resolve datablock data by numeric ID. */
  abstract getDataBlockData(id: number): ParsedData | undefined;

  /** Get TSShapeConstructor sequence entries for a shape name. */
  abstract getShapeConstructorSequences(
    shapeName: string,
  ): string[] | undefined;

  /** Get the current playback time in seconds. */
  protected abstract getTimeSec(): number;

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

  // ── Shared reset logic ──

  /** Clear all entity state (entities, ghost→ID map, generation).
   *  Called on full reset and on GhostingMessageEvent (mission change).
   *  Does NOT reset the ID counter — IDs must never be reused to avoid
   *  stale entity collisions in the render store after seeks. */
  protected clearAllEntities(): void {
    this.entities.clear();
    this.entityIdByGhostIndex.clear();
    this.entityGeneration++;
  }

  protected resetSharedState(): void {
    this.serverLoadInfo = null;
    this.pendingLoadInfo = null;
    this.clearAllEntities();
    this.tickCount = 0;
    this.camera = null;
    this.chatMessages = [];
    this.chatMessageIdCounter = 0;
    this._chatGen = 0;
    this._chatSnapshotGen = -1;
    this._chatSnapshot = [];
    this.audioEvents = [];
    this.netStrings.clear();
    this.targetNames.clear();
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
    this.lastVehiclePosTime = 0;
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
    this.nextExplosionId = 0;
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
    if (s.length >= 2 && s.charCodeAt(0) === 1) {
      const id = parseInt(s.slice(1), 10);
      if (Number.isFinite(id)) return this.netStrings.get(id) ?? s;
    }
    return s;
  }

  protected formatRemoteArgs(template: string, args: string[]): string {
    let resolved = this.resolveNetString(template);
    for (let i = 0; i < args.length; i++) {
      const placeholder = `%${i + 1}`;
      if (resolved.includes(placeholder)) {
        resolved = resolved.replaceAll(
          placeholder,
          stripTaggedStringMarkup(this.resolveNetString(args[i])),
        );
      }
    }
    resolved = resolved.replace(/%\d+/g, "");
    return stripTaggedStringMarkup(resolved);
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
          this.lastVehiclePosTime = 0;
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

    // GhostAlwaysObjectEvent — scope-always objects (terrain, sky, interiors).
    // These arrive as events, not ghost updates, but contain full ghost data.
    // Create entities from them so scene infrastructure renders.
    if (type === "GhostAlwaysObjectEvent") {
      const evt = data as GhostAlwaysObjectEventData;
      const ghostIndex = evt.ghostIndex;
      const classId = evt.classId;
      const objectData = evt.objectData;
      const hasData = evt._hasObjectData;
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
          for (const entity of this.entities.values()) {
            if (entity.targetId === pendingTargetId) {
              entity.playerName = name;
            }
          }
        }
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
        const team = this.targetTeams.get(targetId);
        const rf = this.targetRenderFlags.get(targetId);
        const skin = this.targetSkins.get(targetId);
        const skinPref = this.targetSkinPrefs.get(targetId);
        for (const entity of this.entities.values()) {
          if (entity.targetId === targetId) {
            if (name) entity.playerName = name;
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
      }
      return;
    }

    if (type === "RemoteCommandEvent" || eventName === "RemoteCommandEvent") {
      const evt = data as RemoteCommandEventData;
      const funcName = this.resolveNetString(evt.funcName);
      const args = evt.args;
      const timeSec = this.getTimeSec();

      if (funcName === "ChatMessage" && args.length >= 4) {
        const rawTemplate = this.resolveNetString(args[3]);
        const colorCode = detectColorCode(rawTemplate);
        const sender = args[4]
          ? stripTaggedStringMarkup(this.resolveNetString(args[4]))
          : "";
        const rawText = this.formatRemoteArgs(args[3], args.slice(4));
        if (rawText) {
          const colonIdx = rawText.indexOf(": ");
          const text = colonIdx >= 0 ? rawText.slice(colonIdx + 2) : rawText;
          const { text: displayText, wavPath } = extractWavTag(text);
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
          const cc = colorCode ?? 0;
          this.pushChatMessage({
            timeSec,
            sender,
            text: displayText,
            kind: "chat",
            colorCode: cc,
            segments: [
              {
                text: sender ? `${sender}: ${displayText}` : displayText,
                colorCode: cc,
              },
            ],
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
    entity.explosionLifetimeTicks = undefined;
    entity.faceViewer = undefined;
    entity.simulatedVelocity = undefined;
    entity.projectilePhysics = undefined;
    entity.gravityMod = undefined;
    entity.projAgeTicks = undefined;
    entity.linearSegment = undefined;
    entity.projElasticity = undefined;
    entity.projFriction = undefined;
    entity.projArmedTick = undefined;
    entity.direction = undefined;
    entity.velocity = undefined;
    entity.position = undefined;
    entity.dataBlock = undefined;
    entity.dataBlockId = undefined;
    entity.shapeHint = undefined;
    entity.visual = undefined;
    entity.targetId = undefined;
    entity.targetRenderFlags = undefined;
    entity.sensorGroup = undefined;
    entity.playerName = undefined;
    entity.imageSlots = undefined;
    entity.mountObjectGhostIndex = undefined;
    entity.mountNode = undefined;
    entity.skinName = undefined;
    entity.skinPrefName = undefined;
    entity.falling = undefined;
    entity.jetting = undefined;
    entity.weaponImageState = undefined;
    entity.weaponImageStates = undefined;
    entity.weaponImageStatesDbId = undefined;
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
    entity.armAction = undefined;
    entity.explosionDataBlockId = undefined;
    entity.maintainEmitterId = undefined;
    entity.soundSlots = undefined;
    entity.isStaticItem = undefined;
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
      }

      // Classify projectile physics
      if (entity.type === "Projectile") {
        if (linearProjectileClassNames.has(entity.className)) {
          entity.projectilePhysics = "linear";
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
          entity.faceViewer = info.faceViewer;
          entity.explosionLifetimeTicks = info.lifetimeTicks;
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

      // Force field visual data from ForceFieldBareData datablock.
      if (entity.className === "ForceFieldBare" && blockData) {
        const color1 = blockData.color1 as
          { r: number; g: number; b: number } | undefined;
        const textures: string[] = [];
        for (let i = 0; i < 5; i++) {
          const tex = blockData[`texture${i}`] as string | undefined;
          if (tex) textures.push(tex);
        }
        // Use scale from ghost data as box dimensions (same as mission bridge).
        const scale = data.scale as
          { x: number; y: number; z: number } | undefined;
        entity.forceFieldData = {
          textures,
          color: color1 ? [color1.r, color1.g, color1.b] : [1, 1, 1],
          baseTranslucency: (blockData.baseTranslucency as number) ?? 1,
          dimensions: scale ? [scale.y, scale.z, scale.x] : [1, 1, 1],
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

            if (shapeName) {
              if (!entity.imageSlots) entity.imageSlots = [];
              entity.imageSlots[img.index] = {
                shapeName,
                mountPoint,
                dataBlockId: img.dataBlockId,
                skinName,
              };
            }

            // Slot 0: weapon state machine (triggerDown, ammo, etc.)
            if (img.index === 0) {
              const prev = entity.weaponImageState;
              entity.weaponImageState = {
                dataBlockId: img.dataBlockId,
                triggerDown: img.triggerDown ?? prev?.triggerDown ?? false,
                ammo: img.ammo ?? prev?.ammo ?? true,
                loaded: img.loaded ?? prev?.loaded ?? true,
                target: img.target ?? prev?.target ?? false,
                wet: img.wet ?? prev?.wet ?? false,
                fireCount: img.fireCount ?? prev?.fireCount ?? 0,
              };
              if (
                blockData &&
                entity.weaponImageStatesDbId !== img.dataBlockId
              ) {
                entity.weaponImageStates = parseWeaponImageStates(blockData);
                entity.weaponImageStatesDbId = img.dataBlockId;
              }
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

            // Slot 0: clear weapon state.
            if (img.index === 0) {
              entity.weaponImageState = undefined;
              entity.weaponImageStates = undefined;
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

    // Direction
    const direction = isVec3Like(data.direction) ? data.direction : undefined;
    if (direction) {
      entity.direction = [direction.x, direction.y, direction.z];
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
      if (isVec3Like(vec) && (vec.x !== 0 || vec.y !== 0)) {
        entity.rotation = playerYawToQuaternion(Math.atan2(vec.x, vec.y));
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
        // velocity (physics-driven updates always carry nonzero velocity).
        // The real client simulates anyway: it falls ~2cm for one tick and
        // rests on the flag stand via its collision mask, which includes
        // StaticShapes (item.cc:37). Our collision world has no shape
        // colliders, so the faithful fall would sink through the stand —
        // pin the scripted-teleport case at the server position instead.
        // DIVERGENCE from the binary, compensating for missing StaticShape
        // collision.
        if (vel.x === 0 && vel.y === 0 && vel.z === 0) {
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
        const dryVelocity =
          getNumberField(blockData, [
            "dryVelocity",
            "muzzleVelocity",
            "bulletVelocity",
          ]) ?? 80;
        const dir = entity.direction ?? [0, 1, 0];
        let vx = dir[0] * dryVelocity;
        let vy = dir[1] * dryVelocity;
        let vz = dir[2] * dryVelocity;
        const excessVel = data.excessVel as number | undefined;
        const excessDir = data.excessDir as Vec3 | undefined;
        if (
          typeof excessVel === "number" &&
          excessVel > 0 &&
          isVec3Like(excessDir)
        ) {
          vx += excessDir.x * excessVel;
          vy += excessDir.y * excessVel;
          vz += excessDir.z * excessVel;
        }
        entity.simulatedVelocity = [vx, vy, vz];

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
            vel: [vx, vy, vz],
            lifetimeMS: getNumberField(blockData, ["lifetimeMS"]) ?? 1000,
            explodeOnDeath: isTruthyField(blockData?.explodeOnDeath),
            explodeOnWaterImpact: isTruthyField(
              blockData?.explodeOnWaterImpact,
            ),
          });
        }
      } else if (isVec3Like(data.velocity)) {
        entity.simulatedVelocity = [
          data.velocity.x,
          data.velocity.y,
          data.velocity.z,
        ];
      }

      // Fast-forward by currTick. Linear projectiles evaluate their
      // precomputed segment; others integrate collision-free (the server
      // already validated that span).
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
      } else if (
        typeof currTick === "number" &&
        currTick > 0 &&
        entity.simulatedVelocity &&
        entity.position
      ) {
        const dt = (TICK_DURATION_MS / 1000) * currTick;
        const v = entity.simulatedVelocity;
        entity.position[0] += v[0] * dt;
        entity.position[1] += v[1] * dt;
        entity.position[2] += v[2] * dt;
        if (entity.projectilePhysics === "ballistic") {
          const g = -9.81 * (entity.gravityMod ?? 1);
          entity.position[2] += 0.5 * g * dt * dt;
          v[2] += g * dt;
        }
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
      entity.damageState = data.damageState;
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
      const playerName = this.targetNames.get(data.targetId);
      if (playerName) entity.playerName = playerName;
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
        lifetimeTicks: number;
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
    const lifetimeTicks = (expBlock.lifetimeMS as number | undefined) ?? 31;
    return {
      shape,
      faceViewer: expBlock.faceViewer !== false && expBlock.faceViewer !== 0,
      lifetimeTicks,
      explosionDataBlockId: explosionId,
    };
  }

  protected spawnExplosion(
    projectile: MutableEntity,
    position: [number, number, number],
  ): void {
    projectile.hasExploded = true;
    const lifetimeTicks = projectile.explosionLifetimeTicks ?? 31;

    const fxId = `fx_${this.nextExplosionId++}`;
    const fxEntity: MutableEntity = {
      id: fxId,
      ghostIndex: -1,
      className: "Explosion",
      spawnTick: this.tickCount,
      type: "Explosion",
      dataBlock: projectile.explosionShape,
      explosionDataBlockId: projectile.explosionDataBlockId,
      position,
      rotation: [0, 0, 0, 1],
      isExplosion: true,
      faceViewer: projectile.faceViewer !== false,
      expiryTick: this.tickCount + lifetimeTicks,
    };
    this.entities.set(fxId, fxEntity);

    // Spawn sub-explosion entities
    if (projectile.explosionDataBlockId != null) {
      const expBlock = this.getDataBlockData(projectile.explosionDataBlockId);
      const subExplosions = expBlock?.subExplosions as
        (number | null)[] | undefined;
      if (Array.isArray(subExplosions)) {
        for (const subId of subExplosions) {
          if (subId == null) continue;
          const subBlock = this.getDataBlockData(subId);
          if (!subBlock) continue;
          const subShape =
            (subBlock.dtsFileName as string | undefined) || undefined;
          const subLifetimeTicks =
            (subBlock.lifetimeMS as number | undefined) ?? 31;
          const offset = (subBlock.offset as number | undefined) ?? 0;
          const angle = Math.random() * Math.PI * 2;
          const subPos: [number, number, number] = [
            position[0] + Math.cos(angle) * offset,
            position[1] + Math.sin(angle) * offset,
            position[2],
          ];
          const subFxId = `fx_${this.nextExplosionId++}`;
          const subFxEntity: MutableEntity = {
            id: subFxId,
            ghostIndex: -1,
            className: "Explosion",
            spawnTick: this.tickCount,
            type: "Explosion",
            dataBlock: subShape,
            explosionDataBlockId: subId,
            position: subPos,
            rotation: [0, 0, 0, 1],
            isExplosion: true,
            faceViewer:
              subBlock.faceViewer !== false && subBlock.faceViewer !== 0,
            expiryTick: this.tickCount + subLifetimeTicks,
          };
          this.entities.set(subFxId, subFxEntity);
        }
      }
    }

    // Stop the projectile
    projectile.position = undefined;
    projectile.simulatedVelocity = undefined;
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
      } else if (
        entity.projectilePhysics === "ballistic" ||
        entity.projectilePhysics === "seeker"
      ) {
        const result = stepBallistic(p, v, {
          // Seekers coast on their transmitted velocity, no gravity.
          gravityMod:
            entity.projectilePhysics === "ballistic"
              ? (entity.gravityMod ?? 1)
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

      if (v[0] !== 0 || v[1] !== 0) {
        entity.rotation = playerYawToQuaternion(Math.atan2(v[0], v[1]));
      }
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
      }
    } else if (msgType === "MsgCTFAddTeam" && args.length >= 6) {
      // Wire order: args[2]=teamId (1-based), args[3]=teamName,
      // args[4]=flagStatus, args[5]=teamScore
      const teamId = parseInt(this.resolveNetString(args[2]), 10);
      const teamName = stripTaggedStringMarkup(this.resolveNetString(args[3]));
      // $flagStatus[team]: "<At Base>", "<In the Field>", or carrier name.
      const statusText = stripTaggedStringMarkup(
        this.resolveNetString(args[4]),
      );
      const flagStatus = statusText.startsWith("<At Base")
        ? ("home" as const)
        : statusText.startsWith("<In the Field")
          ? ("field" as const)
          : statusText
            ? ("held" as const)
            : ("home" as const);
      const score = parseInt(this.resolveNetString(args[5]), 10);
      const flagCarrier =
        flagStatus === "held" ? statusText.trim() || undefined : undefined;
      if (!isNaN(teamId) && teamId > 0) {
        const existing = this.teamScores.find((t) => t.teamId === teamId);
        if (existing) {
          existing.name = teamName;
          existing.score = isNaN(score) ? existing.score : score;
          existing.flagStatus = flagStatus;
          existing.flagCarrier = flagCarrier;
        } else {
          this.teamScores.push({
            teamId,
            name: teamName,
            score: isNaN(score) ? 0 : score,
            playerCount: 0,
            flagStatus,
            flagCarrier,
          });
        }
        this.onTeamScoresChanged();
      }
    } else if (
      (msgType === "MsgCnHAddTeam" ||
        msgType === "MsgHuntAddTeam" ||
        msgType === "MsgSiegeAddTeam") &&
      args.length >= 4
    ) {
      // Non-CTF team games declare teams with the same leading wire
      // order: args[2]=teamId (1-based), args[3]=teamName. CnH and
      // TeamHunters also send args[4]=teamScore; Siege sends
      // args[4]=isOffense (its scoring is time-based) so its score is
      // left alone.
      const teamId = parseInt(this.resolveNetString(args[2]), 10);
      const teamName = stripTaggedStringMarkup(this.resolveNetString(args[3]));
      const score =
        msgType === "MsgSiegeAddTeam"
          ? NaN
          : parseInt(this.resolveNetString(args[4] ?? ""), 10);
      if (!isNaN(teamId) && teamId > 0) {
        const existing = this.teamScores.find((t) => t.teamId === teamId);
        if (existing) {
          existing.name = teamName;
          existing.score = isNaN(score) ? existing.score : score;
        } else {
          this.teamScores.push({
            teamId,
            name: teamName,
            score: isNaN(score) ? 0 : score,
            playerCount: 0,
          });
        }
        this.onTeamScoresChanged();
      }
    } else if (
      (msgType === "MsgCTFFlagTaken" ||
        msgType === "MsgCTFFlagDropped" ||
        msgType === "MsgCTFFlagReturned" ||
        msgType === "MsgCTFFlagCapped") &&
      args.length >= 5
    ) {
      // CTFGame.cs sends %flag.team as %3 for all four flag events.
      const teamId = parseInt(this.resolveNetString(args[4]), 10);
      const entry = this.teamScores.find((t) => t.teamId === teamId);
      if (entry) {
        entry.flagStatus =
          msgType === "MsgCTFFlagTaken"
            ? "held"
            : msgType === "MsgCTFFlagDropped"
              ? "field"
              : "home";
        // %1 is the acting client's name in every MsgCTFFlagTaken variant
        // (only drop/cap self-directed variants pass 0, and those clear
        // the carrier anyway).
        const actor = stripTaggedStringMarkup(
          this.resolveNetString(args[2]),
        ).trim();
        entry.flagCarrier =
          entry.flagStatus === "held" && actor ? actor : undefined;
        this.onTeamScoresChanged();
      }
    } else if (msgType === "MsgClientJoin" && args.length >= 4) {
      // Wire order: args[2]=clientName, args[3]=clientId, args[4]=targetId
      const name = stripTaggedStringMarkup(
        this.resolveNetString(args[2]),
      ).trim();
      const clientId = parseInt(this.resolveNetString(args[3]), 10);
      const joinTargetId = parseInt(this.resolveNetString(args[4] ?? ""), 10);
      if (!isNaN(clientId)) {
        // The real client (message.cs handleClientJoin) creates a fresh
        // ScriptObject with score=0, overwriting any previous entry.
        this.playerRoster.set(clientId, {
          name,
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
          if (!isNaN(score)) existing.score = score;
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
      // Loading-screen text for this mission follows (quote, objectives,
      // rules), terminated by MsgLoadInfoDone.
      this.pendingLoadInfo = {
        quoteLines: [],
        objectiveLines: [],
        rulesLines: [],
      };
      this.onMissionInfoChange?.();
    } else if (msgType === "MsgLoadQuoteLine" && args.length >= 3) {
      this.pendingLoadInfo?.quoteLines.push(this.resolveNetString(args[2]));
    } else if (msgType === "MsgLoadObjectiveLine" && args.length >= 3) {
      this.pendingLoadInfo?.objectiveLines.push(this.resolveNetString(args[2]));
    } else if (msgType === "MsgLoadRulesLine" && args.length >= 3) {
      this.pendingLoadInfo?.rulesLines.push(this.resolveNetString(args[2]));
    } else if (msgType === "MsgLoadInfoDone") {
      if (this.pendingLoadInfo) {
        const { quoteLines, objectiveLines, rulesLines } = this.pendingLoadInfo;
        this.serverLoadInfo =
          quoteLines.length || objectiveLines.length || rulesLines.length
            ? this.pendingLoadInfo
            : null;
        this.pendingLoadInfo = null;
        this.onMissionInfoChange?.();
      }
    } else if (msgType === "MsgClientReady" && args.length >= 3) {
      // messageClient(%cl, 'MsgClientReady', "", %game.class)
      const gameClassName = this.resolveNetString(args[2]);
      log.info("client ready: gameClass=%s", gameClassName);
      this.gameClassName = gameClassName || this.gameClassName;
      // Dropping into a (new) mission ends any match-over interval.
      this.matchEnded = false;
      this.onMissionInfoChange?.();
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

  /** Hook for subclasses to react to team score changes (e.g. generation counters). */
  protected onTeamScoresChanged(): void {}

  /** Hook for subclasses to react to roster changes (e.g. generation counters). */
  protected onRosterChanged(): void {}

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

  /** Hook for subclasses to react to weapons HUD changes (e.g. generation counters). */
  protected onWeaponsHudChanged(): void {}

  /** Hook for subclasses to react to inventory HUD changes (e.g. generation counters). */
  protected onInventoryHudChanged(): void {}

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
        velocity: entity.velocity,
        health: entity.health,
        energy: entity.energy,
        actionAnim: entity.actionAnim,
        actionAtEnd: entity.actionAtEnd,
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
        maintainEmitterId: entity.maintainEmitterId,
        weaponImageState: entity.weaponImageState,
        weaponImageStates: entity.weaponImageStates,
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
        maxSteeringAngle: entity.maxSteeringAngle,
        soundSlots: entity.soundSlots,
        sceneData: entity.sceneData,
        forceFieldData: entity.forceFieldData,
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
  protected buildHudState(): {
    weaponsHud: { slots: WeaponsHudSlot[]; activeIndex: number };
    inventoryHud: { slots: InventoryHudSlot[]; activeSlot: number };
    backpackHud: BackpackHudState | null;
    teamScores: TeamScore[];
    playerRoster: PlayerRosterEntry[];
  } {
    const weaponsHud = {
      slots: Array.from(this.weaponsHud.slots.entries()).map(
        ([index, ammo]): WeaponsHudSlot => ({ index, ammo }),
      ),
      activeIndex: this.weaponsHud.activeIndex,
    };

    const inventoryHud = {
      slots: Array.from(this.inventoryHud.slots.entries()).map(
        ([slot, count]): InventoryHudSlot => ({ slot, count }),
      ),
      activeSlot: this.inventoryHud.activeSlot,
    };

    const backpackHud: BackpackHudState | null =
      this.backpackHud.packIndex >= 0 ? { ...this.backpackHud } : null;

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

    return { weaponsHud, inventoryHud, backpackHud, teamScores, playerRoster };
  }

  /** Build filtered chat and audio event arrays for the current time. */
  protected buildTimeFilteredEvents(timeSec: number): {
    chatMessages: ChatMessage[];
    audioEvents: PendingAudioEvent[];
  } {
    if (this._chatSnapshotGen !== this._chatGen) {
      this._chatSnapshot = this.chatMessages.slice();
      this._chatSnapshotGen = this._chatGen;
    }
    const chatMessages = this._chatSnapshot;
    const audioEvents = this.audioEvents.filter(
      (e) => e.timeSec > timeSec - 0.5 && e.timeSec <= timeSec,
    );
    return { chatMessages, audioEvents };
  }
}
