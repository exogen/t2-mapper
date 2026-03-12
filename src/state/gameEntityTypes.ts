import type {
  Keyframe,
  ThreadState,
  TracerVisual,
  SpriteVisual,
  WeaponImageState,
  WeaponImageDataBlockState,
} from "../stream/types";
import type {
  SceneTerrainBlock,
  SceneInteriorInstance,
  SceneSky,
  SceneSun,
  SceneWaterBlock,
  SceneMissionArea,
} from "../scene/types";

/**
 * Determines which renderer handles this entity. Uses engine class names
 * where there's a 1:1 mapping; functional names for cross-class renderers.
 */
export type RenderType =
  // Scene infrastructure (handle own positioning)
  | "TerrainBlock"
  | "InteriorInstance"
  | "Sky"
  | "Sun"
  | "WaterBlock"
  | "MissionArea"
  // Gameplay entities (positioned by interpolation loop)
  | "Shape"
  | "Player"
  | "ForceFieldBare"
  | "Explosion"
  | "Tracer"
  | "Sprite"
  | "AudioEmitter"
  | "Camera"
  | "WayPoint"
  | "None";

// ── Common base ──

interface EntityBase {
  id: string;
  className: string;
  renderType: RenderType;
  ghostIndex?: number;
  dataBlockId?: number;
  shapeHint?: string;
  spawnTime?: number;
  runtimeObject?: unknown;
  missionTypesList?: string;
}

// ── Scene infrastructure entities ──

export interface TerrainBlockEntity extends EntityBase {
  renderType: "TerrainBlock";
  terrainData: SceneTerrainBlock;
}

export interface InteriorInstanceEntity extends EntityBase {
  renderType: "InteriorInstance";
  interiorData: SceneInteriorInstance;
}

export interface SkyEntity extends EntityBase {
  renderType: "Sky";
  skyData: SceneSky;
}

export interface SunEntity extends EntityBase {
  renderType: "Sun";
  sunData: SceneSun;
}

export interface WaterBlockEntity extends EntityBase {
  renderType: "WaterBlock";
  waterData: SceneWaterBlock;
}

export interface MissionAreaEntity extends EntityBase {
  renderType: "MissionArea";
  missionAreaData: SceneMissionArea;
}

export type SceneEntity =
  | TerrainBlockEntity
  | InteriorInstanceEntity
  | SkyEntity
  | SunEntity
  | WaterBlockEntity
  | MissionAreaEntity;

export function isSceneEntity(entity: GameEntity): entity is SceneEntity {
  switch (entity.renderType) {
    case "TerrainBlock":
    case "InteriorInstance":
    case "Sky":
    case "Sun":
    case "WaterBlock":
    case "MissionArea":
      return true;
    default:
      return false;
  }
}

// ── Positioned entity base ──

interface PositionedBase extends EntityBase {
  position?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  velocity?: [number, number, number];
  keyframes?: Keyframe[];
}

// ── Gameplay entities ──

/** Generic DTS-rendered entity (StaticShape, Turret, Item, TSStatic, etc.). */
export interface ShapeEntity extends PositionedBase {
  renderType: "Shape";
  shapeName?: string;
  shapeType?: string;
  dataBlock?: string;
  threads?: ThreadState[];
  rotate?: boolean;
  teamId?: number;
  barrelShapeName?: string;
  targetRenderFlags?: number;
  iffColor?: { r: number; g: number; b: number };
  weaponShape?: string;
}

export interface PlayerEntity extends PositionedBase {
  renderType: "Player";
  shapeName?: string;
  dataBlock?: string;
  weaponShape?: string;
  packShape?: string;
  /** DTS shape name for the carried flag (slot 3, Mount2 bone). */
  flagShape?: string;
  falling?: boolean;
  jetting?: boolean;
  playerName?: string;
  iffColor?: { r: number; g: number; b: number };
  threads?: ThreadState[];
  weaponImageState?: WeaponImageState;
  weaponImageStates?: WeaponImageDataBlockState[];
  headPitch?: number;
  headYaw?: number;
  health?: number;
  energy?: number;
  actionAnim?: number;
  actionAtEnd?: boolean;
  damageState?: number;
  targetRenderFlags?: number;
}

export interface ForceFieldBareEntity extends PositionedBase {
  renderType: "ForceFieldBare";
  forceFieldData?: ForceFieldData;
}

export interface ExplosionEntity extends PositionedBase {
  renderType: "Explosion";
  shapeName?: string;
  dataBlock?: string;
  explosionDataBlockId?: number;
  faceViewer?: boolean;
}

export interface TracerEntity extends PositionedBase {
  renderType: "Tracer";
  visual: TracerVisual;
  dataBlock?: string;
  direction?: [number, number, number];
}

export interface SpriteEntity extends PositionedBase {
  renderType: "Sprite";
  visual: SpriteVisual;
}

export interface AudioEmitterEntity extends PositionedBase {
  renderType: "AudioEmitter";
  audioFileName?: string;
  audioIs3D?: boolean;
  audioIsLooping?: boolean;
  audioMaxDistance?: number;
  audioMaxLoopGap?: number;
  audioMinDistance?: number;
  audioMinLoopGap?: number;
  audioVolume?: number;
}

export interface CameraEntity extends PositionedBase {
  renderType: "Camera";
  cameraDataBlock?: string;
}

export interface WayPointEntity extends PositionedBase {
  renderType: "WayPoint";
  label?: string;
}

export interface NoneEntity extends EntityBase {
  renderType: "None";
}

export type PositionedEntity = Exclude<GameEntity, SceneEntity | NoneEntity>;

// ── Union type ──

export type GameEntity =
  | TerrainBlockEntity
  | InteriorInstanceEntity
  | SkyEntity
  | SunEntity
  | WaterBlockEntity
  | MissionAreaEntity
  | ShapeEntity
  | PlayerEntity
  | ForceFieldBareEntity
  | ExplosionEntity
  | TracerEntity
  | SpriteEntity
  | AudioEmitterEntity
  | CameraEntity
  | WayPointEntity
  | NoneEntity;

export interface ForceFieldData {
  textures: string[];
  color: [number, number, number];
  baseTranslucency: number;
  numFrames: number;
  framesPerSec: number;
  scrollSpeed: number;
  umapping: number;
  vmapping: number;
  /** Box dimensions in Three.js space [x, y, z]. NOT a transform scale. */
  dimensions: [number, number, number];
}
