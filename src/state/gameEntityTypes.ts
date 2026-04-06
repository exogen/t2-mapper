import type {
  ImageSlot,
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
  /** Hidden via the debug entity list. */
  debugHidden?: boolean;
  /** Entity ID of the object this entity is mounted on (vehicle, etc.). */
  mountObjectId?: string;
  /** Mount point node index on the mount target (0 = pilot). */
  mountNode?: number;
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
  /** Mounted image slots (0-7). Mount bone from dataBlock->mountPoint. */
  imageSlots?: (ImageSlot | undefined)[];
}

// ── Gameplay entities ──

/** Generic DTS-rendered entity (StaticShape, Turret, Item, TSStatic, etc.). */
export interface ShapeEntity extends PositionedBase {
  renderType: "Shape";
  shapeName?: string;
  shapeType?: string;
  dataBlock?: string;
  /** Skin name from TargetManager (e.g. "beagle" for flags, team skins). */
  skinName?: string;
  threads?: ThreadState[];
  /** Torque DamageState: 0=Enabled, 1=Disabled, 2=Destroyed. */
  damageState?: number;
  rotate?: boolean;
  teamId?: number;
  targetRenderFlags?: number;
  iffColor?: { r: number; g: number; b: number };
  /** Arm blend animation action index from Player ghost (networked). */
  armAction?: number;
  /** WheeledVehicle per-wheel state (speed, slip). */
  wheels?: Array<{
    speed: number;
    lateralSlip: number;
    longitudinalSlip: number;
  }>;
  /** Vehicle steering angle (radians). */
  steeringYaw?: number;
  /** Vehicle frozen state (deployed). */
  frozen?: boolean;
  /** Vehicle max steering angle (radians), from datablock. */
  maxSteeringAngle?: number;
  /** ShapeBase sound slots (from ghost SoundMask). */
  soundSlots?: Array<{ index: number; playing: boolean; profileId?: number }>;
  /** ShapeBase fade value (0=invisible, 1=fully visible). Matches mFadeVal. */
  fadeVal?: number;
  /** Cloak level (0=visible, 1=fully cloaked). Used for cloak texture effect. */
  cloakLevel?: number;
}

export interface PlayerEntity extends PositionedBase {
  renderType: "Player";
  shapeName?: string;
  dataBlock?: string;
  /** Arm blend animation action index from Player ghost (networked). */
  armAction?: number;
  falling?: boolean;
  jetting?: boolean;
  playerName?: string;
  /** Player skin (team skin like "base", "baseb"). */
  skinName?: string;
  /** Player preferred skin (chosen skin like "RandySavage"). */
  skinPrefName?: string;
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
  /** ShapeBase sound slots (from ghost SoundMask). */
  soundSlots?: Array<{ index: number; playing: boolean; profileId?: number }>;
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
