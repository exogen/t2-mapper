/** Authored units, shared by mission objects and decoded network weather. */
export interface WeatherSound {
  filename: string;
  is3D: boolean;
  isLooping: boolean;
  refDist: number;
  maxDist: number;
  volume: number;
}

export type WeatherPoint = [number, number, number];
export type WeatherColor = [number, number, number, number];

export interface PrecipitationStorm {
  /** World time in seconds, on the source's clock. */
  startTime: number;
  duration: number;
  startPercentage: number;
  endPercentage: number;
}

export interface PrecipitationConfig {
  /** Retail PrecipitationData::type: rain, snow, sand. */
  type: 0 | 1 | 2;
  materialList: string;
  sound?: WeatherSound;
  maxSize: number;
  sizeX: number;
  sizeY: number;
  movingBoxPer: number;
  divHeightVal: number;
  sizeBigBox: number;
  topBoxSpeed: number;
  frontBoxSpeed: number;
  topBoxDrawPer: number;
  bottomDrawHeight: number;
  skipIfPer: number;
  bottomSpeedPer: number;
  frontSpeedPer: number;
  frontRadiusPer: number;
  percentage: number;
  /** Native draw-loop bound, changed by initial/direct percentage updates. */
  drawCount?: number;
  /** Native respawn threshold; storm interpolation updates this separately. */
  spawnCount?: number;
  enabled: boolean;
  colors: WeatherColor[];
  offsetSpeed: number;
  minVelocity: number;
  maxVelocity: number;
  /** Cached onNewDataBlock wind correction (+0x34fcc), before ghost masks. */
  averageSpeed?: number;
  maxDrops: number;
  maxRadius: number;
  storm?: PrecipitationStorm;
}

export type PrecipitationState = Pick<
  PrecipitationConfig,
  "percentage" | "enabled" | "maxDrops" | "drawCount" | "spawnCount" | "storm"
>;

export interface LightningConfig {
  /** Storm center and box dimensions in Torque world coordinates. */
  position: WeatherPoint;
  scale: WeatherPoint;
  strikeWidth: number;
  chanceToHitTarget: number;
  strikeRadius: number;
  boltStartRadius: number;
  color: WeatherColor;
  fadeColor: WeatherColor;
  useFog: boolean;
  strikesPerMinute: number;
  strikeTextures: string[];
  strikeSound?: WeatherSound;
  thunderSounds: WeatherSound[];
}

/** Target pose captured when a strike event is processed. */
export interface LightningTargetTransform {
  shapeName: string;
  /** Source-time position in Torque world coordinates. */
  position: WeatherPoint;
  /** Source-time quaternion and scale in Three.js axes. */
  rotation?: [number, number, number, number];
  scale?: WeatherPoint;
}

/** A recorded/server strike or an explore scheduler's equivalent input. */
export interface LightningStrike {
  id: number;
  time: number;
  stormId: string;
  start: [number, number];
  targetId?: string;
  targetPosition?: WeatherPoint;
  /** Frozen source pose, retained when native DTS bounds are not loaded yet. */
  targetTransform?: LightningTargetTransform;
  config: LightningConfig;
}

/** Explicit native lightning commands issued by an explore mission script. */
export interface LightningRequest {
  sequence: number;
  time: number;
}
