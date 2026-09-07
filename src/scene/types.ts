/** 3D vector in Torque coordinate space (X-right, Y-forward, Z-up). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Color3 {
  r: number;
  g: number;
  b: number;
}

export interface Color4 {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * A Torque MatrixF (mObjToWorld): 16 floats in Torque's row-major order,
 * idx(row, col) = row * 4 + col, applied as M·v. The wire carries it as
 * is (translation at 3, 7, 11); the mission builder writes the same
 * bytes from a .mis axis-angle. `position` is the translation regardless
 * of which produced it. scene/coordinates.ts owns the conversion to
 * Three.js; never decode `elements` by hand.
 */
export interface MatrixF {
  elements: number[];
  position: Vec3;
}

/** Identity MatrixF. */
export const IDENTITY_MATRIX: MatrixF = {
  elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  position: { x: 0, y: 0, z: 0 },
};

// ── Mission scene object types ──
// These match the ghost parsedData structures from t2-demo-parser.

export interface SceneTerrainBlock {
  className: "TerrainBlock";
  ghostIndex: number;
  terrFileName: string;
  detailTextureName: string;
  squareSize: number;
  emptySquareRuns?: number[];
}

export interface SceneInteriorInstance {
  className: "InteriorInstance";
  ghostIndex: number;
  interiorFile: string;
  transform: MatrixF;
  scale: Vec3;
  showTerrainInside: boolean;
  skinBase: string;
  alarmState: boolean;
}

export interface SceneTSStatic {
  className: "TSStatic";
  ghostIndex: number;
  shapeName: string;
  transform: MatrixF;
  scale: Vec3;
}

export interface SceneSkyFogVolume {
  visibleDistance: number;
  minHeight: number;
  maxHeight: number;
  color: Color3;
}

export interface SceneSkyCloudLayer {
  texture: string;
  heightPercent: number;
  speed: number;
}

export interface SceneSky {
  className: "Sky";
  ghostIndex: number;
  materialList: string;
  fogColor: Color3;
  visibleDistance: number;
  fogDistance: number;
  skySolidColor: Color3;
  useSkyTextures: boolean;
  fogVolumes: SceneSkyFogVolume[];
  cloudLayers: SceneSkyCloudLayer[];
  windVelocity: Vec3;
}

export interface SceneSun {
  className: "Sun";
  ghostIndex: number;
  direction: Vec3;
  color: Color4;
  ambient: Color4;
  textures?: string[];
}

export interface SceneMissionArea {
  className: "MissionArea";
  ghostIndex: number;
  area: { x: number; y: number; w: number; h: number };
  flightCeiling: number;
  flightCeilingRange: number;
}

export interface SceneWaterBlock {
  className: "WaterBlock";
  ghostIndex: number;
  transform: MatrixF;
  scale: Vec3;
  surfaceName: string;
  envMapName: string;
  surfaceOpacity: number;
  waveMagnitude: number;
  envMapIntensity: number;
  /** WaterBlock::EWaterType — 0-3 water, 4-6 lava, 7 quicksand. */
  liquidType: number;
}

export type SceneObject =
  | SceneTerrainBlock
  | SceneInteriorInstance
  | SceneTSStatic
  | SceneSky
  | SceneSun
  | SceneMissionArea
  | SceneWaterBlock;
