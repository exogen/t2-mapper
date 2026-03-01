import {
  BlockTypeInfo,
  BlockTypeMove,
  BlockTypePacket,
  DemoParser,
} from "t2-demo-parser";
import { Matrix4, Quaternion } from "three";
import type {
  DemoVisual,
  DemoRecording,
  DemoStreamCamera,
  DemoStreamEntity,
  DemoStreamSnapshot,
  DemoStreamingPlayback,
} from "./types";

type Vec3 = { x: number; y: number; z: number };

type RuntimeControlObject = {
  ghostIndex: number;
  data?: Record<string, unknown>;
  position?: Vec3;
};

type ControlObjectType = "camera" | "player";

interface MutableStreamEntity {
  id: string;
  ghostIndex: number;
  className: string;
  /** Move tick when this ghost instance first entered scope. */
  spawnTick: number;
  type: string;
  dataBlockId?: number;
  shapeHint?: string;
  dataBlock?: string;
  visual?: DemoVisual;
  direction?: [number, number, number];
  weaponShape?: string;
  playerName?: string;
  position?: [number, number, number];
  rotation: [number, number, number, number];
  velocity?: [number, number, number];
  health?: number;
  energy?: number;
  maxEnergy?: number;
  targetId?: number;
  /** Physics type for per-tick simulation. */
  projectilePhysics?: "linear" | "ballistic" | "seeker";
  /** Computed velocity vector for simulation (Torque space). */
  simulatedVelocity?: [number, number, number];
  /** Datablock gravity modifier (ballistic only, default 1.0). */
  gravityMod?: number;
  /** Resolved explosion DTS shape name (e.g. "disc_explosion.dts"). */
  explosionShape?: string;
  /** Explosion lifetime in ticks from ExplosionData. */
  explosionLifetimeTicks?: number;
  /** Prevents duplicate explosion spawning. */
  hasExploded?: boolean;
  /** Marks ephemeral explosion entities. */
  isExplosion?: boolean;
  /** Auto-removal tick for explosion entities. */
  expiryTick?: number;
  /** Billboard toward camera (Torque's faceViewer). */
  faceViewer?: boolean;
  /** Target's sensor group (team number). */
  sensorGroup?: number;
}

interface StreamState {
  moveTicks: number;
  moveYawAccum: number;
  movePitchAccum: number;
  yawOffset: number;
  pitchOffset: number;
  lastAbsYaw: number;
  lastAbsPitch: number;
  lastControlType: ControlObjectType;
  isPiloting: boolean;
  lastCameraMode?: number;
  lastOrbitGhostIndex?: number;
  lastOrbitDistance?: number;
  exhausted: boolean;
  latestFov: number;
  latestControl: RuntimeControlObject;
  controlPlayerGhostId?: string;
  camera: DemoStreamCamera | null;
  entitiesById: Map<string, MutableStreamEntity>;
  entityIdByGhostIndex: Map<number, string>;
  lastStatus: { health: number; energy: number };
  nextExplosionId: number;
  /** The recording player's own sensor group (team). */
  playerSensorGroup: number;
}

const TICK_DURATION_MS = 32;

/** Tribes 2 default IFF colors (sRGB 0-255). */
const IFF_GREEN = Object.freeze({ r: 0, g: 255, b: 0 });
const IFF_RED = Object.freeze({ r: 255, g: 0, b: 0 });

const vehicleClassNames = new Set([
  "FlyingVehicle",
  "HoverVehicle",
  "WheeledVehicle",
]);

const projectileClassNames = new Set([
  "BombProjectile",
  "EnergyProjectile",
  "FlareProjectile",
  "GrenadeProjectile",
  "LinearFlareProjectile",
  "LinearProjectile",
  "Projectile",
  "SeekerProjectile",
  "TracerProjectile",
]);

const linearProjectileClassNames = new Set([
  "LinearProjectile",
  "TracerProjectile",
  "LinearFlareProjectile",
  "Projectile",
]);

const ballisticProjectileClassNames = new Set([
  "GrenadeProjectile",
  "EnergyProjectile",
  "FlareProjectile",
  "BombProjectile",
]);

const seekerProjectileClassNames = new Set(["SeekerProjectile"]);

const deployableClassNames = new Set([
  "StaticShape",
  "ScopeAlwaysShape",
  "Turret",
  "BeaconObject",
  "ForceFieldBare",
]);

/**
 * Mission keeps authority for these classes during demo playback because we do
 * not yet render them from ghost data with full fidelity.
 */
const missionOwnedGhostClassNames = new Set([
  "TSStatic",
  "InteriorInstance",
  "TerrainBlock",
  "Sky",
  "Sun",
  "MissionArea",
  "PhysicalZone",
  "MissionMarker",
  "SpawnSphere",
  "VehicleBlocker",
  "Camera",
]);

const CameraMode_OrbitObject = 3;
const MAX_PITCH = Math.PI * 0.494;

const _rotMat = new Matrix4();
const _rotQuat = new Quaternion();

function extractMissionInfo(demoValues: string[]): {
  missionName: string | null;
  gameType: string | null;
} {
  let missionName: string | null = null;
  let gameType: string | null = null;

  for (let i = 0; i < demoValues.length; i++) {
    if (demoValues[i] !== "readplayerinfo") continue;
    const value = demoValues[i + 1];
    if (!value) continue;

    if (value.startsWith("2\t")) {
      const fields = value.split("\t");
      if (fields[4]) {
        missionName = fields[4];
      }
      continue;
    }

    if (value.startsWith("3\t")) {
      const fields = value.split("\t");
      if (fields[2]) {
        gameType = fields[2];
      }
    }
  }

  return { missionName, gameType };
}

function isValidPosition(
  pos: { x: number; y: number; z: number } | undefined | null,
): pos is { x: number; y: number; z: number } {
  return (
    pos != null &&
    Number.isFinite(pos.x) &&
    Number.isFinite(pos.y) &&
    Number.isFinite(pos.z)
  );
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function yawPitchToQuaternion(
  yaw: number,
  pitch: number,
): [number, number, number, number] {
  const sx = Math.sin(pitch);
  const cx = Math.cos(pitch);
  const sz = Math.sin(yaw);
  const cz = Math.cos(yaw);

  _rotMat.set(
    -sz,
    cz * sx,
    -cz * cx,
    0,
    0,
    cx,
    sx,
    0,
    cz,
    sz * sx,
    -sz * cx,
    0,
    0,
    0,
    0,
    1,
  );

  _rotQuat.setFromRotationMatrix(_rotMat);
  return [_rotQuat.x, _rotQuat.y, _rotQuat.z, _rotQuat.w];
}

function playerYawToQuaternion(rotZ: number): [number, number, number, number] {
  const halfAngle = -rotZ / 2;
  return [0, Math.sin(halfAngle), 0, Math.cos(halfAngle)];
}

function torqueQuatToThreeJS(q: {
  x: number;
  y: number;
  z: number;
  w: number;
}): [number, number, number, number] | null {
  if (
    !Number.isFinite(q.x) ||
    !Number.isFinite(q.y) ||
    !Number.isFinite(q.z) ||
    !Number.isFinite(q.w)
  ) {
    return null;
  }

  // Match mission axis-angle conversion: axis swizzle (x,y,z)->(y,z,x)
  // and inverted rotation direction (negated imaginary components).
  const x = -q.y;
  const y = -q.z;
  const z = -q.x;
  const w = q.w;

  const lenSq = x * x + y * y + z * z + w * w;
  if (lenSq <= 1e-12) {
    return null;
  }

  const invLen = 1 / Math.sqrt(lenSq);
  return [x * invLen, y * invLen, z * invLen, w * invLen];
}

function shouldRenderGhostEntity(entity: MutableStreamEntity): boolean {
  if (entity.spawnTick > 0) return true;
  return !missionOwnedGhostClassNames.has(entity.className);
}

function stripTaggedStringMarkup(s: string): string {
  let stripped = "";
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) >= 0x20) {
      stripped += s[i];
    }
  }
  return stripped;
}

function toEntityType(className: string): string {
  if (className === "Player") return "Player";
  if (vehicleClassNames.has(className)) return "Vehicle";
  if (className === "Item") return "Item";
  if (projectileClassNames.has(className)) return "Projectile";
  if (deployableClassNames.has(className)) return "Deployable";
  return "Ghost";
}

function toEntityId(className: string, ghostIndex: number): string {
  if (className === "Player") return `player_${ghostIndex}`;
  if (vehicleClassNames.has(className)) return `vehicle_${ghostIndex}`;
  if (className === "Item") return `item_${ghostIndex}`;
  if (projectileClassNames.has(className)) return `projectile_${ghostIndex}`;
  if (deployableClassNames.has(className)) return `deployable_${ghostIndex}`;
  return `ghost_${ghostIndex}`;
}

function isQuatLike(value: unknown): value is {
  x: number;
  y: number;
  z: number;
  w: number;
} {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { x?: unknown }).x === "number" &&
    typeof (value as { y?: unknown }).y === "number" &&
    typeof (value as { z?: unknown }).z === "number" &&
    typeof (value as { w?: unknown }).w === "number"
  );
}

function isVec3Like(value: unknown): value is { x: number; y: number; z: number } {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { x?: unknown }).x === "number" &&
    typeof (value as { y?: unknown }).y === "number" &&
    typeof (value as { z?: unknown }).z === "number"
  );
}

function toShapeNameFromDataBlock(
  data: Record<string, unknown> | undefined,
): string | undefined {
  if (!data) return undefined;
  const candidates = [
    data.shapeName,
    data.projectileShapeName,
    data.shapeFileName,
    data.shapeFile,
    data.model,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }
  return undefined;
}

function getNumberField(
  data: Record<string, unknown> | undefined,
  keys: readonly string[],
): number | undefined {
  if (!data) return undefined;
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function getStringField(
  data: Record<string, unknown> | undefined,
  keys: readonly string[],
): string | undefined {
  if (!data) return undefined;
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function getBooleanField(
  data: Record<string, unknown> | undefined,
  keys: readonly string[],
): boolean | undefined {
  if (!data) return undefined;
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return undefined;
}

function resolveTracerVisual(
  className: string,
  data: Record<string, unknown> | undefined,
): DemoVisual | undefined {
  if (!data) return undefined;

  const texture =
    getStringField(data, ["tracerTex0", "textureName0", "texture0"]) ?? "";
  const hasTracerHints =
    className === "TracerProjectile" ||
    (texture.length > 0 &&
      getNumberField(data, ["tracerLength"]) != null);
  if (!hasTracerHints || !texture) return undefined;

  const crossTexture = getStringField(data, [
    "tracerTex1",
    "textureName1",
    "texture1",
  ]);

  // t2-demo-parser vends TracerProjectileData fields with some legacy names.
  // Accept both canonical script names and parser-specific aliases.
  const tracerLength = getNumberField(data, ["tracerLength"]) ?? 10;
  const canonicalTracerWidth = getNumberField(data, ["tracerWidth"]);
  const aliasTracerWidth = getNumberField(data, ["tracerAlpha"]);
  const tracerWidth =
    canonicalTracerWidth != null &&
    (getNumberField(data, ["crossViewAng"]) != null ||
      canonicalTracerWidth <= 0.7)
      ? canonicalTracerWidth
      : (aliasTracerWidth ?? canonicalTracerWidth ?? 0.5);
  const crossViewAng =
    getNumberField(data, ["crossViewAng", "crossViewFraction"]) ??
    // Parser alias fallback: "tracerWidth" may actually contain crossViewAng.
    (typeof data.tracerWidth === "number" && data.tracerWidth > 0.7
      ? data.tracerWidth
      : 0.98);
  const crossSize =
    getNumberField(data, ["crossSize", "muzzleVelocity"]) ?? 0.45;
  const renderCross =
    getBooleanField(data, ["renderCross", "proximityRadius"]) ?? true;

  return {
    kind: "tracer",
    texture,
    crossTexture,
    tracerLength,
    tracerWidth,
    crossViewAng,
    crossSize,
    renderCross,
  };
}

/**
 * Resolve a billboard-sprite visual for flare-style projectiles
 * (LinearFlareProjectile, FlareProjectile). These render as camera-facing
 * quads in the engine rather than 3D models.
 */
function resolveSpriteVisual(
  className: string,
  data: Record<string, unknown> | undefined,
): DemoVisual | undefined {
  if (!data) return undefined;

  if (className === "LinearFlareProjectile") {
    // Parser fields: flareTexture (flareModTexture in script),
    // smokeTexture (flareBaseTexture in script — the circular glow).
    const texture = getStringField(data, ["smokeTexture", "flareTexture"]);
    if (!texture) return undefined;
    const color = data.flareColor as
      | { r: number; g: number; b: number }
      | undefined;
    const size = getNumberField(data, ["size"]) ?? 0.5;
    return {
      kind: "sprite",
      texture,
      color: color ? { r: color.r, g: color.g, b: color.b } : { r: 1, g: 1, b: 1 },
      size,
    };
  }

  if (className === "FlareProjectile") {
    const texture = getStringField(data, ["flareTexture"]);
    if (!texture) return undefined;
    const size = getNumberField(data, ["size"]) ?? 4.0;
    return {
      kind: "sprite",
      texture,
      color: { r: 1, g: 0.9, b: 0.5 },
      size,
    };
  }

  return undefined;
}

function detectControlObjectType(
  data: Record<string, unknown> | undefined,
): ControlObjectType | null {
  if (!data) return null;
  if (typeof data.cameraMode === "number") return "camera";
  if (typeof data.rotationZ === "number") return "player";
  return null;
}

class StreamingPlayback implements DemoStreamingPlayback {
  private readonly parser: DemoParser;
  private readonly initialBlock: {
    dataBlocks: Map<number, { className: string; data: Record<string, unknown> }>;
    initialGhosts: Array<{
      index: number;
      type: "create" | "update" | "delete";
      classId?: number;
      parsedData?: Record<string, unknown>;
    }>;
    controlObjectGhostIndex: number;
    controlObjectData?: Record<string, unknown>;
    targetEntries: Array<{ targetId: number; name?: string; sensorGroup: number }>;
    sensorGroupColors: Array<{
      group: number;
      targetGroup: number;
      r: number;
      g: number;
      b: number;
    }>;
    taggedStrings: Map<number, string>;
  };
  private readonly registry;
  private readonly netStrings = new Map<number, string>();
  private readonly targetNames = new Map<number, string>();
  private readonly targetTeams = new Map<number, number>();
  /** IFF color map: for the viewer's sensorGroup, map target sensorGroup → RGB. */
  private readonly sensorGroupColors = new Map<
    number,
    Map<number, { r: number; g: number; b: number }>
  >();
  private state: StreamState;

  constructor(parser: DemoParser) {
    this.parser = parser;
    this.registry = parser.getRegistry();
    const initial = parser.initialBlock;
    this.initialBlock = {
      dataBlocks: initial.dataBlocks,
      initialGhosts: initial.initialGhosts,
      controlObjectGhostIndex: initial.controlObjectGhostIndex,
      controlObjectData: initial.controlObjectData,
      targetEntries: initial.targetEntries,
      sensorGroupColors: initial.sensorGroupColors,
      taggedStrings: initial.taggedStrings,
    };

    this.state = {
      moveTicks: 0,
      moveYawAccum: 0,
      movePitchAccum: 0,
      yawOffset: 0,
      pitchOffset: 0,
      lastAbsYaw: 0,
      lastAbsPitch: 0,
      lastControlType: "player",
      isPiloting: false,
      lastOrbitDistance: undefined,
      exhausted: false,
      latestFov: 100,
      latestControl: {
        ghostIndex: initial.controlObjectGhostIndex,
        data: initial.controlObjectData,
        position: isValidPosition(initial.controlObjectData?.position as Vec3)
          ? (initial.controlObjectData?.position as Vec3)
          : undefined,
      },
      camera: null,
      entitiesById: new Map(),
      entityIdByGhostIndex: new Map(),
      lastStatus: { health: 1, energy: 1 },
      nextExplosionId: 0,
      playerSensorGroup: 0,
    };

    this.reset();
  }

  reset(): void {
    this.parser.reset();

    this.netStrings.clear();
    this.targetNames.clear();
    this.targetTeams.clear();
    this.sensorGroupColors.clear();
    this.state.entitiesById.clear();
    this.state.entityIdByGhostIndex.clear();

    for (const [id, value] of this.initialBlock.taggedStrings) {
      this.netStrings.set(id, value);
    }
    for (const entry of this.initialBlock.targetEntries) {
      if (entry.name) {
        this.targetNames.set(entry.targetId, stripTaggedStringMarkup(entry.name));
      }
      this.targetTeams.set(entry.targetId, entry.sensorGroup);
    }
    // Seed IFF color table from the initial block.
    for (const c of this.initialBlock.sensorGroupColors) {
      let map = this.sensorGroupColors.get(c.group);
      if (!map) {
        map = new Map();
        this.sensorGroupColors.set(c.group, map);
      }
      map.set(c.targetGroup, { r: c.r, g: c.g, b: c.b });
    }

    this.state.playerSensorGroup = 0;
    this.state.moveTicks = 0;
    this.state.moveYawAccum = 0;
    this.state.movePitchAccum = 0;
    this.state.yawOffset = 0;
    this.state.pitchOffset = 0;
    this.state.lastAbsYaw = 0;
    this.state.lastAbsPitch = 0;
    this.state.lastControlType =
      detectControlObjectType(this.initialBlock.controlObjectData) ?? "player";
    this.state.isPiloting =
      this.state.lastControlType === "player"
        ? !!(
            this.initialBlock.controlObjectData?.pilot ||
            this.initialBlock.controlObjectData?.controlObjectGhost != null
          )
        : false;
    this.state.lastCameraMode =
      this.state.lastControlType === "camera" &&
      typeof this.initialBlock.controlObjectData?.cameraMode === "number"
        ? this.initialBlock.controlObjectData.cameraMode
        : undefined;
    this.state.lastOrbitGhostIndex =
      this.state.lastControlType === "camera" &&
      typeof this.initialBlock.controlObjectData?.orbitObjectGhostIndex ===
        "number"
        ? this.initialBlock.controlObjectData.orbitObjectGhostIndex
        : undefined;
    if (this.state.lastControlType === "camera") {
      const minOrbit = this.initialBlock.controlObjectData?.minOrbitDist as
        | number
        | undefined;
      const maxOrbit = this.initialBlock.controlObjectData?.maxOrbitDist as
        | number
        | undefined;
      const curOrbit = this.initialBlock.controlObjectData?.curOrbitDist as
        | number
        | undefined;
      if (
        typeof minOrbit === "number" &&
        typeof maxOrbit === "number" &&
        Number.isFinite(minOrbit) &&
        Number.isFinite(maxOrbit)
      ) {
        this.state.lastOrbitDistance = Math.max(0, maxOrbit - minOrbit);
      } else if (typeof curOrbit === "number" && Number.isFinite(curOrbit)) {
        this.state.lastOrbitDistance = Math.max(0, curOrbit);
      } else {
        this.state.lastOrbitDistance = undefined;
      }
    } else {
      this.state.lastOrbitDistance = undefined;
    }
    const initialAbsRot = this.getAbsoluteRotation(this.initialBlock.controlObjectData);
    if (initialAbsRot) {
      this.state.lastAbsYaw = initialAbsRot.yaw;
      this.state.lastAbsPitch = initialAbsRot.pitch;
      this.state.yawOffset = initialAbsRot.yaw;
      this.state.pitchOffset = initialAbsRot.pitch;
    }
    this.state.exhausted = false;
    this.state.latestFov = 100;
    this.state.latestControl = {
      ghostIndex: this.initialBlock.controlObjectGhostIndex,
      data: this.initialBlock.controlObjectData,
      position: isValidPosition(this.initialBlock.controlObjectData?.position as Vec3)
        ? (this.initialBlock.controlObjectData?.position as Vec3)
        : undefined,
    };
    this.state.controlPlayerGhostId =
      this.state.lastControlType === "player" &&
      this.initialBlock.controlObjectGhostIndex >= 0
        ? `player_${this.initialBlock.controlObjectGhostIndex}`
        : undefined;
    this.state.camera = null;
    this.state.lastStatus = { health: 1, energy: 1 };
    this.state.nextExplosionId = 0;

    for (const ghost of this.initialBlock.initialGhosts) {
      if (ghost.type !== "create" || ghost.classId == null) continue;
      const className =
        this.registry.getGhostParser(ghost.classId)?.name ?? `ghost_${ghost.classId}`;
      const id = toEntityId(className, ghost.index);
      const entity: MutableStreamEntity = {
        id,
        ghostIndex: ghost.index,
        className,
        spawnTick: 0,
        type: toEntityType(className),
        rotation: [0, 0, 0, 1],
      };
      this.applyGhostData(entity, ghost.parsedData);
      this.state.entitiesById.set(id, entity);
      this.state.entityIdByGhostIndex.set(ghost.index, id);
    }
    this.updateCameraAndHud();
  }

  getSnapshot(): DemoStreamSnapshot {
    return this.buildSnapshot();
  }

  getEffectShapes(): string[] {
    const shapes = new Set<string>();
    for (const [, block] of this.initialBlock.dataBlocks) {
      const explosionId = block.data?.explosion as number | undefined;
      if (explosionId == null) continue;
      const expBlock = this.getDataBlockData(explosionId);
      const shape = expBlock?.dtsFileName as string | undefined;
      if (shape) shapes.add(shape);
    }
    return [...shapes];
  }

  stepToTime(targetTimeSec: number, maxMoveTicks = Number.POSITIVE_INFINITY): DemoStreamSnapshot {
    const safeTargetSec = Number.isFinite(targetTimeSec)
      ? Math.max(0, targetTimeSec)
      : 0;
    const targetTicks = Math.floor((safeTargetSec * 1000) / TICK_DURATION_MS);

    if (targetTicks < this.state.moveTicks) {
      this.reset();
    }

    let movesProcessed = 0;
    while (
      !this.state.exhausted &&
      this.state.moveTicks < targetTicks &&
      movesProcessed < maxMoveTicks
    ) {
      if (!this.stepOneMoveTick()) {
        break;
      }
      movesProcessed += 1;
    }

    return this.buildSnapshot();
  }

  private stepOneMoveTick(): boolean {
    while (true) {
      const block = this.parser.nextBlock();
      if (!block) {
        this.state.exhausted = true;
        return false;
      }

      this.handleBlock(block);

      if (block.type === BlockTypeMove) {
        this.state.moveTicks += 1;
        this.advanceProjectiles();
        this.removeExpiredExplosions();
        this.updateCameraAndHud();
        return true;
      }
    }
  }

  private handleBlock(block: {
    type: number;
    parsed?: unknown;
  }): void {
    if (block.type === BlockTypePacket && this.isPacketData(block.parsed)) {
      const packet = block.parsed;
      const controlData = packet.gameState.controlObjectData;
      const prevControl = this.state.latestControl;
      const nextGhostIndex =
        typeof packet.gameState.controlObjectGhostIndex === "number"
          ? packet.gameState.controlObjectGhostIndex
          : prevControl.ghostIndex;
      const compressionPoint = packet.gameState.compressionPoint;
      const controlPosition = isValidPosition(controlData?.position as Vec3)
        ? (controlData?.position as Vec3)
        : isValidPosition(compressionPoint)
          ? compressionPoint
          : prevControl.position;

      this.state.latestControl = {
        ghostIndex: nextGhostIndex,
        data: controlData,
        position: controlPosition,
      };

      // When the control object changes, try to derive playerSensorGroup
      // from the new ghost's already-known sensorGroup.
      if (nextGhostIndex !== prevControl.ghostIndex) {
        const entityId = this.state.entityIdByGhostIndex.get(nextGhostIndex);
        const entity = entityId
          ? this.state.entitiesById.get(entityId)
          : undefined;
        if (entity?.sensorGroup != null && entity.sensorGroup > 0) {
          this.state.playerSensorGroup = entity.sensorGroup;
        }
      }

      if (controlData) {
        const detected = detectControlObjectType(controlData);
        if (detected) {
          this.state.lastControlType = detected;
        }

        if (this.state.lastControlType === "player") {
          this.state.isPiloting = !!(
            controlData.pilot || controlData.controlObjectGhost != null
          );
        } else {
          this.state.isPiloting = false;
          if (typeof controlData.cameraMode === "number") {
            this.state.lastCameraMode = controlData.cameraMode;
            if (controlData.cameraMode === CameraMode_OrbitObject) {
              if (typeof controlData.orbitObjectGhostIndex === "number") {
                this.state.lastOrbitGhostIndex = controlData.orbitObjectGhostIndex;
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
                this.state.lastOrbitDistance = Math.max(0, maxOrbit - minOrbit);
              } else if (
                typeof curOrbit === "number" &&
                Number.isFinite(curOrbit)
              ) {
                this.state.lastOrbitDistance = Math.max(0, curOrbit);
              }
            } else {
              this.state.lastOrbitGhostIndex = undefined;
              this.state.lastOrbitDistance = undefined;
            }
          }
        }
      }

      for (const evt of packet.events) {
        const eventName = this.registry.getEventParser(evt.classId)?.name;
        if (eventName === "NetStringEvent" && evt.parsedData) {
          const id = evt.parsedData.id as number | undefined;
          const value = evt.parsedData.value as string | undefined;
          if (id != null && typeof value === "string") {
            this.netStrings.set(id, value);
          }
          continue;
        }

        if (eventName === "TargetInfoEvent" && evt.parsedData) {
          const targetId = evt.parsedData.targetId as number | undefined;
          const nameTag = evt.parsedData.nameTag as number | undefined;
          if (targetId != null && nameTag != null) {
            const resolved = this.netStrings.get(nameTag);
            if (resolved) {
              this.targetNames.set(targetId, stripTaggedStringMarkup(resolved));
            }
          }
          const sensorGroup = evt.parsedData.sensorGroup as number | undefined;
          if (targetId != null && sensorGroup != null) {
            this.targetTeams.set(targetId, sensorGroup);
          }
        } else if (eventName === "SetSensorGroupEvent" && evt.parsedData) {
          const sg = evt.parsedData.sensorGroup as number | undefined;
          if (sg != null) this.state.playerSensorGroup = sg;
        } else if (eventName === "SensorGroupColorEvent" && evt.parsedData) {
          const sg = evt.parsedData.sensorGroup as number;
          const colors = evt.parsedData.colors as
            | Array<{
                index: number;
                r?: number;
                g?: number;
                b?: number;
                default?: boolean;
              }>
            | undefined;
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
                map.set(c.index, {
                  r: c.r ?? 0,
                  g: c.g ?? 0,
                  b: c.b ?? 0,
                });
              }
            }
          }
        }
      }

      for (const ghost of packet.ghosts) {
        this.applyPacketGhost(ghost);
      }

      return;
    }

    if (block.type === BlockTypeInfo && this.isInfoData(block.parsed)) {
      if (Number.isFinite(block.parsed.value2)) {
        this.state.latestFov = block.parsed.value2;
      }
      return;
    }

    if (block.type === BlockTypeMove && this.isMoveData(block.parsed)) {
      this.state.moveYawAccum += block.parsed.yaw ?? 0;
      this.state.movePitchAccum += block.parsed.pitch ?? 0;
    }
  }

  private applyPacketGhost(ghost: {
    index: number;
    type: "create" | "update" | "delete";
    classId?: number;
    parsedData?: Record<string, unknown>;
  }): void {
    const ghostIndex = ghost.index;
    const prevEntityId = this.state.entityIdByGhostIndex.get(ghostIndex);

    if (ghost.type === "delete") {
      if (prevEntityId) {
        this.state.entitiesById.delete(prevEntityId);
        this.state.entityIdByGhostIndex.delete(ghostIndex);
      }
      return;
    }

    const className = this.resolveGhostClassName(ghostIndex, ghost.classId);
    if (!className) {
      return;
    }

    const entityId = toEntityId(className, ghostIndex);
    if (prevEntityId && prevEntityId !== entityId) {
      this.state.entitiesById.delete(prevEntityId);
    }

    let entity = this.state.entitiesById.get(entityId);
    if (!entity) {
      entity = {
        id: entityId,
        ghostIndex,
        className,
        spawnTick: this.state.moveTicks,
        type: toEntityType(className),
        rotation: [0, 0, 0, 1],
      };
      this.state.entitiesById.set(entityId, entity);
    }

    entity.ghostIndex = ghostIndex;
    entity.className = className;
    entity.type = toEntityType(className);
    this.state.entityIdByGhostIndex.set(ghostIndex, entityId);
    this.applyGhostData(entity, ghost.parsedData);
  }

  private resolveGhostClassName(
    ghostIndex: number,
    classId: number | undefined,
  ): string | undefined {
    if (typeof classId === "number") {
      const fromClassId = this.registry.getGhostParser(classId)?.name;
      if (fromClassId) {
        return fromClassId;
      }
    }

    const entityId = this.state.entityIdByGhostIndex.get(ghostIndex);
    if (entityId) {
      const entity = this.state.entitiesById.get(entityId);
      if (entity?.className) {
        return entity.className;
      }
    }

    const trackerGhost = this.parser.getGhostTracker().getGhost(ghostIndex);
    if (trackerGhost?.className) {
      return trackerGhost.className;
    }

    return undefined;
  }

  private resolveEntityIdForGhostIndex(ghostIndex: number): string | undefined {
    const byMap = this.state.entityIdByGhostIndex.get(ghostIndex);
    if (byMap) {
      return byMap;
    }
    const trackerGhost = this.parser.getGhostTracker().getGhost(ghostIndex);
    if (trackerGhost) {
      return toEntityId(trackerGhost.className, ghostIndex);
    }
    return undefined;
  }

  private getDataBlockData(
    dataBlockId: number,
  ): Record<string, unknown> | undefined {
    const initialBlock = this.initialBlock.dataBlocks.get(dataBlockId);
    if (initialBlock?.data) {
      return initialBlock.data;
    }

    const packetParser = this.parser.getPacketParser() as unknown as {
      dataBlockDataMap?: Map<number, Record<string, unknown>>;
    };
    return packetParser.dataBlockDataMap?.get(dataBlockId);
  }

  private resolveExplosionInfo(projDataBlockId: number): {
    shape: string;
    faceViewer: boolean;
    lifetimeTicks: number;
  } | undefined {
    const projBlock = this.getDataBlockData(projDataBlockId);
    const explosionId = projBlock?.explosion as number | undefined;
    if (explosionId == null) return undefined;
    const expBlock = this.getDataBlockData(explosionId);
    if (!expBlock) return undefined;
    const shape = expBlock.dtsFileName as string | undefined;
    if (!shape) return undefined;
    // The parser's lifetimeMS field is actually in ticks (32ms each), not ms.
    const lifetimeTicks = (expBlock.lifetimeMS as number | undefined) ?? 31;
    return {
      shape,
      faceViewer: expBlock.faceViewer !== false && expBlock.faceViewer !== 0,
      lifetimeTicks,
    };
  }

  private applyGhostData(
    entity: MutableStreamEntity,
    rawData: Record<string, unknown> | undefined,
  ): void {
    if (!rawData) return;

    const data = rawData;

    const dataBlockId = data.dataBlockId as number | undefined;
    if (dataBlockId != null) {
      entity.dataBlockId = dataBlockId;
      const blockData = this.getDataBlockData(dataBlockId);
      const shapeName = toShapeNameFromDataBlock(blockData);
      entity.visual =
        resolveTracerVisual(entity.className, blockData) ??
        resolveSpriteVisual(entity.className, blockData);
      if (typeof shapeName === "string") {
        entity.shapeHint = shapeName;
        entity.dataBlock = shapeName;
      }
      if (entity.type === "Player" && typeof blockData?.maxEnergy === "number") {
        entity.maxEnergy = blockData.maxEnergy;
      }

      // Classify projectile physics and extract simulation parameters.
      if (entity.type === "Projectile") {
        if (linearProjectileClassNames.has(entity.className)) {
          entity.projectilePhysics = "linear";
        } else if (ballisticProjectileClassNames.has(entity.className)) {
          entity.projectilePhysics = "ballistic";
          entity.gravityMod =
            getNumberField(blockData, ["gravityMod"]) ?? 1.0;
        } else if (seekerProjectileClassNames.has(entity.className)) {
          entity.projectilePhysics = "seeker";
        }
      }

      // Resolve explosion shape info for projectiles (once per entity).
      if (entity.type === "Projectile" && !entity.explosionShape) {
        const info = this.resolveExplosionInfo(dataBlockId);
        if (info) {
          entity.explosionShape = info.shape;
          entity.faceViewer = info.faceViewer;
          entity.explosionLifetimeTicks = info.lifetimeTicks;
        }
      }
    }

    if (entity.type === "Player") {
      const images = data.images as Array<{ dataBlockId?: number }> | undefined;
      if (Array.isArray(images) && images.length > 0) {
        const weaponImage = images[0];
        if (weaponImage?.dataBlockId && weaponImage.dataBlockId > 0) {
          const blockData = this.getDataBlockData(weaponImage.dataBlockId);
          const weaponShape = toShapeNameFromDataBlock(blockData);
          if (weaponShape) {
            const mountPoint = blockData?.mountPoint as number | undefined;
            if ((mountPoint == null || mountPoint <= 0) && !/pack_/i.test(weaponShape)) {
              entity.weaponShape = weaponShape;
            }
          }
        }
      }
    }

    const position = isValidPosition(data.position as Vec3)
      ? (data.position as Vec3)
      : isValidPosition(data.initialPosition as Vec3)
        ? (data.initialPosition as Vec3)
        : isValidPosition(data.explodePosition as Vec3)
          ? (data.explodePosition as Vec3)
          : isValidPosition(data.endPoint as Vec3)
            ? (data.endPoint as Vec3)
      : isValidPosition((data.transform as { position?: Vec3 } | undefined)?.position)
        ? ((data.transform as { position: Vec3 }).position as Vec3)
        : undefined;
    if (position) {
      entity.position = [position.x, position.y, position.z];
    }

    const direction = isVec3Like(data.direction) ? data.direction : undefined;
    if (direction) {
      entity.direction = [direction.x, direction.y, direction.z];
    }

    if (entity.type === "Player" && typeof data.rotationZ === "number") {
      entity.rotation = playerYawToQuaternion(data.rotationZ);
    } else if (isQuatLike(data.angPosition)) {
      const converted = torqueQuatToThreeJS(data.angPosition);
      if (converted) {
        entity.rotation = converted;
      }
    } else if (
      isQuatLike((data.transform as { rotation?: unknown } | undefined)?.rotation)
    ) {
      const converted = torqueQuatToThreeJS(
        (data.transform as { rotation: { x: number; y: number; z: number; w: number } })
          .rotation,
      );
      if (converted) {
        entity.rotation = converted;
      }
    } else if (
      entity.type === "Item" &&
      typeof (data.rotation as { angle?: unknown } | undefined)?.angle === "number"
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
              x:
                (data.endPos as Vec3).x -
                (data.initialPosition as Vec3).x,
              y:
                (data.endPos as Vec3).y -
                (data.initialPosition as Vec3).y,
              z:
                (data.endPos as Vec3).z -
                (data.initialPosition as Vec3).z,
            }
          : undefined);
      if (isVec3Like(vec) && (vec.x !== 0 || vec.y !== 0)) {
        entity.rotation = playerYawToQuaternion(Math.atan2(vec.x, vec.y));
      }
    }

    if (isVec3Like(data.velocity)) {
      entity.velocity = [data.velocity.x, data.velocity.y, data.velocity.z];
      if (!entity.direction) {
        entity.direction = [data.velocity.x, data.velocity.y, data.velocity.z];
      }
    }

    // Compute simulatedVelocity for projectile physics.
    if (entity.projectilePhysics) {
      if (entity.projectilePhysics === "linear") {
        // Linear projectiles transmit direction + dryVelocity from datablock,
        // plus optional inherited velocity (excessDir * excessVel).
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
        // Add inherited velocity from firing object.
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
      } else if (entity.velocity) {
        // Ballistic and seeker: use the transmitted velocity directly.
        entity.simulatedVelocity = [
          entity.velocity[0],
          entity.velocity[1],
          entity.velocity[2],
        ];
      }

      // Fast-forward by currTick: the initial position is the firing point
      // and currTick tells us how many ticks have already elapsed.
      const currTick = data.currTick as number | undefined;
      if (
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
        // For ballistic projectiles, also apply gravity during fast-forward.
        if (entity.projectilePhysics === "ballistic") {
          const g = 9.81 * (entity.gravityMod ?? 1);
          // v.z changes linearly, position.z changes quadratically.
          entity.position[2] -= 0.5 * g * dt * dt;
          v[2] -= g * dt;
        }
      }
    }

    // Detect projectile explosion. LinearProjectile/SeekerProjectile send
    // `explodePosition`; GrenadeProjectile/BombProjectile send `explodePoint`.
    // LinearProjectile initial creates of already-exploded projectiles also
    // set `hidden: true` alongside `explodePosition`.
    const explodePos = isValidPosition(data.explodePosition as Vec3)
      ? (data.explodePosition as Vec3)
      : isValidPosition(data.explodePoint as Vec3)
        ? (data.explodePoint as Vec3)
        : undefined;
    if (
      entity.type === "Projectile" &&
      !entity.hasExploded &&
      explodePos &&
      entity.explosionShape
    ) {
      entity.hasExploded = true;
      const fxId = `fx_${this.state.nextExplosionId++}`;
      const lifetimeTicks = entity.explosionLifetimeTicks ?? 31;
      const fxEntity: MutableStreamEntity = {
        id: fxId,
        ghostIndex: -1,
        className: "Explosion",
        spawnTick: this.state.moveTicks,
        type: "Explosion",
        dataBlock: entity.explosionShape,
        position: [explodePos.x, explodePos.y, explodePos.z],
        rotation: [0, 0, 0, 1],
        isExplosion: true,
        faceViewer: entity.faceViewer !== false,
        expiryTick: this.state.moveTicks + lifetimeTicks,
      };
      this.state.entitiesById.set(fxId, fxEntity);
      // Stop the projectile — the explosion takes over visually.
      entity.position = undefined;
      entity.simulatedVelocity = undefined;
    }

    if (typeof data.damageLevel === "number") {
      entity.health = clamp(1 - data.damageLevel, 0, 1);
    }

    if (typeof data.energy === "number") {
      entity.energy = clamp(data.energy, 0, 1);
    }

    if (typeof data.targetId === "number") {
      entity.targetId = data.targetId;
      const playerName = this.targetNames.get(data.targetId);
      if (playerName) {
        entity.playerName = playerName;
      }
      const team = this.targetTeams.get(data.targetId);
      if (team != null) {
        entity.sensorGroup = team;
        // If this is the control player, update the viewer's sensor group.
        if (
          entity.ghostIndex === this.state.latestControl.ghostIndex &&
          this.state.lastControlType === "player"
        ) {
          this.state.playerSensorGroup = team;
        }
      }
    }
  }

  private advanceProjectiles(): void {
    const dt = TICK_DURATION_MS / 1000;
    for (const entity of this.state.entitiesById.values()) {
      if (!entity.simulatedVelocity || !entity.position) continue;
      const v = entity.simulatedVelocity;
      const p = entity.position;

      if (entity.projectilePhysics === "ballistic") {
        const g = 9.81 * (entity.gravityMod ?? 1);
        v[2] -= g * dt;
      }

      p[0] += v[0] * dt;
      p[1] += v[1] * dt;
      p[2] += v[2] * dt;

      // Update rotation to face velocity direction.
      if (v[0] !== 0 || v[1] !== 0) {
        entity.rotation = playerYawToQuaternion(Math.atan2(v[0], v[1]));
      }
    }
  }

  private removeExpiredExplosions(): void {
    for (const [id, entity] of this.state.entitiesById) {
      if (
        entity.isExplosion &&
        entity.expiryTick != null &&
        this.state.moveTicks >= entity.expiryTick
      ) {
        this.state.entitiesById.delete(id);
      }
    }
  }

  private updateCameraAndHud(): void {
    const control = this.state.latestControl;
    const timeSec = this.state.moveTicks * (TICK_DURATION_MS / 1000);
    const data = control.data;
    const controlType = this.state.lastControlType;

    if (control.position) {
      const absRotation = this.getAbsoluteRotation(data);
      const hasMoves = !this.state.isPiloting && controlType === "player";
      const moveYaw = hasMoves
        ? this.state.moveYawAccum + this.state.yawOffset
        : this.state.lastAbsYaw;
      const movePitch = hasMoves
        ? this.state.movePitchAccum + this.state.pitchOffset
        : this.state.lastAbsPitch;
      let yaw = moveYaw;
      let pitch = movePitch;

      if (absRotation) {
        yaw = absRotation.yaw;
        pitch = absRotation.pitch;
        this.state.lastAbsYaw = yaw;
        this.state.lastAbsPitch = pitch;
        this.state.yawOffset = yaw - this.state.moveYawAccum;
        this.state.pitchOffset = pitch - this.state.movePitchAccum;
      } else if (hasMoves) {
        this.state.lastAbsYaw = yaw;
        this.state.lastAbsPitch = pitch;
      } else {
        yaw = this.state.lastAbsYaw;
        pitch = this.state.lastAbsPitch;
      }

      this.state.camera = {
        time: timeSec,
        position: [control.position.x, control.position.y, control.position.z],
        rotation: yawPitchToQuaternion(yaw, clamp(pitch, -MAX_PITCH, MAX_PITCH)),
        fov: this.state.latestFov,
        mode: "observer",
        yaw,
        pitch,
      };

      if (controlType === "camera") {
        const cameraMode =
          typeof data?.cameraMode === "number"
            ? data.cameraMode
            : this.state.lastCameraMode;
        if (cameraMode === CameraMode_OrbitObject) {
          this.state.camera.mode = "third-person";
          if (typeof this.state.lastOrbitDistance === "number") {
            this.state.camera.orbitDistance = this.state.lastOrbitDistance;
          }
          const orbitIndex =
            typeof data?.orbitObjectGhostIndex === "number"
              ? (data.orbitObjectGhostIndex as number)
              : this.state.lastOrbitGhostIndex;
          if (typeof orbitIndex === "number" && orbitIndex >= 0) {
            this.state.camera.orbitTargetId =
              this.resolveEntityIdForGhostIndex(orbitIndex);
          }
        } else {
          this.state.camera.mode = "observer";
        }
      } else {
        this.state.camera.mode = "first-person";
        if (control.ghostIndex >= 0) {
          this.state.controlPlayerGhostId = `player_${control.ghostIndex}`;
        }
        if (this.state.controlPlayerGhostId) {
          this.state.camera.controlEntityId = this.state.controlPlayerGhostId;
        }
      }

      // Sync the control player ghost entity's position from the control
      // object data. During demo playback, the control object's state is
      // transmitted through a dedicated channel separate from ghost updates,
      // so the ghost entity's position would otherwise remain stale.
      if (
        controlType === "player" &&
        !this.state.isPiloting &&
        this.state.controlPlayerGhostId &&
        control.position
      ) {
        const ghostEntity = this.state.entitiesById.get(
          this.state.controlPlayerGhostId,
        );
        if (ghostEntity) {
          ghostEntity.position = [
            control.position.x,
            control.position.y,
            control.position.z,
          ];
          ghostEntity.rotation = playerYawToQuaternion(yaw);
        }
      }
    } else if (this.state.camera) {
      this.state.camera = {
        ...this.state.camera,
        time: timeSec,
        fov: this.state.latestFov,
      };
    }

    const status = { health: 1, energy: 1 };
    if (this.state.camera?.mode === "first-person") {
      const controlGhostId = this.state.controlPlayerGhostId;
      const ghostEntity = controlGhostId
        ? this.state.entitiesById.get(controlGhostId)
        : undefined;
      status.health = ghostEntity?.health ?? 1;

      const coEnergyLevel = data?.energyLevel;
      if (typeof coEnergyLevel === "number") {
        const maxEnergy = ghostEntity?.maxEnergy ?? 60;
        if (maxEnergy > 0) {
          status.energy = clamp(coEnergyLevel / maxEnergy, 0, 1);
        }
      } else {
        status.energy = ghostEntity?.energy ?? 1;
      }
    } else if (
      this.state.camera?.mode === "third-person" &&
      this.state.camera.orbitTargetId
    ) {
      const orbitEntity = this.state.entitiesById.get(this.state.camera.orbitTargetId);
      status.health = orbitEntity?.health ?? 1;
      status.energy = orbitEntity?.energy ?? 1;
    }

    this.state.lastStatus = status;
  }

  private buildSnapshot(): DemoStreamSnapshot {
    const entities: DemoStreamEntity[] = [];
    for (const entity of this.state.entitiesById.values()) {
      if (!shouldRenderGhostEntity(entity)) {
        continue;
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
        weaponShape: entity.weaponShape,
        playerName: entity.playerName,
        iffColor:
          entity.type === "Player" && entity.sensorGroup != null
            ? this.resolveIffColor(entity.sensorGroup)
            : undefined,
        // Clone mutable arrays so each snapshot is an immutable record of
        // tick-time state.  advanceProjectiles() mutates entity.position
        // in-place, which would otherwise corrupt previous snapshots and
        // break inter-tick interpolation in the renderer.
        position: entity.position
          ? ([...entity.position] as [number, number, number])
          : undefined,
        rotation: entity.rotation
          ? ([...entity.rotation] as [number, number, number, number])
          : undefined,
        velocity: entity.velocity,
        health: entity.health,
        energy: entity.energy,
        faceViewer: entity.faceViewer,
      });
    }

    return {
      timeSec: this.state.moveTicks * (TICK_DURATION_MS / 1000),
      exhausted: this.state.exhausted,
      camera: this.state.camera,
      entities,
      controlPlayerGhostId: this.state.controlPlayerGhostId,
      status: this.state.lastStatus,
    };
  }

  private resolveIffColor(
    targetSensorGroup: number,
  ): { r: number; g: number; b: number } | undefined {
    if (this.state.playerSensorGroup === 0) return undefined;
    const colorMap = this.sensorGroupColors.get(this.state.playerSensorGroup);
    if (colorMap) {
      const color = colorMap.get(targetSensorGroup);
      if (color) return color;
    }
    // Tribes 2 defaults: same team = green, different team = red.
    if (targetSensorGroup === this.state.playerSensorGroup) return IFF_GREEN;
    if (targetSensorGroup !== 0) return IFF_RED;
    return undefined;
  }

  private getAbsoluteRotation(
    data: Record<string, unknown> | undefined,
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

  private isPacketData(parsed: unknown): parsed is {
    gameState: {
      controlObjectGhostIndex?: number;
      controlObjectData?: Record<string, unknown>;
      compressionPoint?: Vec3;
    };
    events: Array<{
      classId: number;
      parsedData?: Record<string, unknown>;
    }>;
    ghosts: Array<{
      index: number;
      type: "create" | "update" | "delete";
      classId?: number;
      parsedData?: Record<string, unknown>;
    }>;
  } {
    return (
      !!parsed &&
      typeof parsed === "object" &&
      "gameState" in parsed &&
      "events" in parsed &&
      "ghosts" in parsed
    );
  }

  private isMoveData(parsed: unknown): parsed is { yaw?: number; pitch?: number } {
    return !!parsed && typeof parsed === "object" && "yaw" in parsed;
  }

  private isInfoData(parsed: unknown): parsed is { value2: number } {
    return (
      !!parsed &&
      typeof parsed === "object" &&
      "value2" in parsed &&
      typeof (parsed as { value2?: unknown }).value2 === "number"
    );
  }
}

export async function createDemoStreamingRecording(
  data: ArrayBuffer,
): Promise<DemoRecording> {
  const parser = new DemoParser(new Uint8Array(data));
  const { header, initialBlock } = await parser.load();
  const { missionName: infoMissionName, gameType } = extractMissionInfo(
    initialBlock.demoValues,
  );

  return {
    duration: header.demoLengthMs / 1000,
    missionName: infoMissionName ?? initialBlock.missionName ?? null,
    gameType,
    entities: [],
    cameraModes: [],
    isMetadataOnly: true,
    isPartial: true,
    streamingPlayback: new StreamingPlayback(parser),
  };
}
