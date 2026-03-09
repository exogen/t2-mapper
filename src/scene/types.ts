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
 * Row-major 4×4 transform matrix as used by Torque's MatrixF.
 * Index formula: idx(row, col) = row + col * 4.
 * Position is at elements[12], elements[13], elements[14].
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
}

export type SceneObject =
  | SceneTerrainBlock
  | SceneInteriorInstance
  | SceneTSStatic
  | SceneSky
  | SceneSun
  | SceneMissionArea
  | SceneWaterBlock;
