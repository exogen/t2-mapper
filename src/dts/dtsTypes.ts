/** Native DTS/DSQ data. Numeric arrays retain the file's Torque coordinates. */
export type DTSVec3 = [number, number, number];
export type DTSQuat = [number, number, number, number];
export type DTSBounds = { min: DTSVec3; max: DTSVec3 };

export const DTSMaterialFlags = {
  SWrap: 1,
  TWrap: 2,
  Translucent: 4,
  Additive: 8,
  Subtractive: 16,
  SelfIlluminating: 32,
  NeverEnvMap: 64,
  NoMipMap: 128,
  MipMapZeroBorder: 256,
  IflMaterial: 0x08000000,
  IflFrame: 0x10000000,
  DetailMapOnly: 0x20000000,
  BumpMapOnly: 0x40000000,
  ReflectanceMapOnly: 0x80000000,
} as const;
export const DTSSequenceFlags = {
  UniformScale: 1,
  AlignedScale: 2,
  ArbitraryScale: 4,
  Blend: 8,
  Cyclic: 16,
  MakePath: 32,
  HasTranslucency: 64,
} as const;
export const DTSMeshType = {
  Standard: 0,
  Skin: 1,
  Decal: 2,
  Sorted: 3,
  Null: 4,
} as const;
export const DTSPrimitiveFlags = {
  Strip: 0x40000000,
  Fan: 0x80000000,
  Indexed: 0x20000000,
  NoMaterial: 0x10000000,
  MaterialMask: 0x0fffffff,
} as const;

export interface DTSNodeData {
  nameIndex: number;
  parentIndex: number;
}
export interface DTSObjectData {
  nameIndex: number;
  numMeshes: number;
  startMeshIndex: number;
  nodeIndex: number;
}
export interface DTSDecalData {
  nameIndex: number;
  numMeshes: number;
  startMeshIndex: number;
  objectIndex: number;
}
export interface DTSObjectState {
  visibility: number;
  frame: number;
  materialFrame: number;
}
export interface DTSSubShape {
  firstNode: number;
  numNodes: number;
  firstObject: number;
  numObjects: number;
  firstDecal: number;
  numDecals: number;
}
export interface DTSIflMaterial {
  nameIndex: number;
  materialSlot: number;
  firstFrame: number;
  firstFrameOffTimeIndex: number;
  numFrames: number;
}
export interface DTSMaterialData {
  name: string;
  flags: number;
  reflectanceMap: number;
  bumpMap: number;
  detailMap: number;
  detailScale: number;
  reflectionAmount: number;
}
export interface DTSDetail {
  nameIndex: number;
  subShape: number;
  objectDetail: number;
  size: number;
  averageError: number;
  maxError: number;
  polyCount: number;
  billboard?: {
    dimension: number;
    detailLevel: number;
    equatorSteps: number;
    polarSteps: number;
    polarAngle: number;
    includePoles: boolean;
  };
}
export interface DTSPrimitive {
  start: number;
  count: number;
  material: number;
}
export interface DTSCluster {
  startPrimitive: number;
  endPrimitive: number;
  normal: DTSVec3;
  k: number;
  frontCluster: number;
  backCluster: number;
}
export interface DTSSkinData {
  initialVertices: Float32Array;
  initialNormals: Float32Array;
  encodedNormals: Uint8Array;
  inverseBindMatrices: Float32Array;
  vertexIndices: Int32Array;
  boneIndices: Int32Array;
  weights: Float32Array;
  nodeIndices: Int32Array;
}
export interface DTSSortedData {
  clusters: DTSCluster[];
  startCluster: Int32Array;
  firstVerts: Int32Array;
  numVerts: Int32Array;
  firstTVerts: Int32Array;
  alwaysWriteDepth: boolean;
}
export interface DTSDecalMeshData {
  startPrimitive: Int32Array;
  texgenS: Float32Array;
  texgenT: Float32Array;
  materialIndex: number;
}
export interface DTSMeshData {
  type: number;
  flags: number;
  parentMesh: number;
  numFrames: number;
  numMaterialFrames: number;
  verticesPerFrame: number;
  bounds: DTSBounds;
  center: DTSVec3;
  radius: number;
  vertices: Float32Array;
  normals: Float32Array;
  encodedNormals: Uint8Array;
  uv: Float32Array;
  uv2: Float32Array;
  colors: Uint32Array;
  primitives: DTSPrimitive[];
  indices: Uint16Array | Uint32Array;
  mergeIndices: Uint16Array;
  skin?: DTSSkinData;
  sorted?: DTSSortedData;
  decal?: DTSDecalMeshData;
}
export interface DTSSequence {
  nameIndex: number;
  flags: number;
  numKeyframes: number;
  duration: number;
  priority: number;
  firstGroundFrame: number;
  numGroundFrames: number;
  /** DTS 22/23 can name ground frames but do not serialize their samples. */
  groundFramesAvailable?: boolean;
  baseRotation: number;
  baseTranslation: number;
  baseScale: number;
  baseObjectState: number;
  baseDecalState: number;
  firstTrigger: number;
  numTriggers: number;
  toolBegin: number;
  /** Sorted indices of members; independent node and object sets. */
  rotationMatters: number[];
  translationMatters: number[];
  scaleMatters: number[];
  decalMatters: number[];
  iflMatters: number[];
  visibilityMatters: number[];
  frameMatters: number[];
  materialFrameMatters: number[];
  /** Only present while normalizing DTS 15/16 keyframes. */
  oldStartKeyframe?: number;
}
export interface DTSTrigger {
  state: number;
  position: number;
}
export interface DTSShapeData {
  version: number;
  exporterVersion: number;
  radius: number;
  tubeRadius: number;
  center: DTSVec3;
  bounds: DTSBounds;
  smallestVisibleSize: number;
  smallestVisibleDetail: number;
  nodes: DTSNodeData[];
  objects: DTSObjectData[];
  decals: DTSDecalData[];
  iflMaterials: DTSIflMaterial[];
  subShapes: DTSSubShape[];
  defaultRotations: Int16Array;
  defaultTranslations: Float32Array;
  rotations: Int16Array;
  translations: Float32Array;
  uniformScales: Float32Array;
  alignedScales: Float32Array;
  arbitraryScaleFactors: Float32Array;
  arbitraryScaleRotations: Int16Array;
  groundTranslations: Float32Array;
  groundRotations: Int16Array;
  objectStates: DTSObjectState[];
  decalStates: Int32Array;
  triggers: DTSTrigger[];
  details: DTSDetail[];
  meshes: DTSMeshData[];
  names: string[];
  materials: DTSMaterialData[];
  /** DTS <23 stores skins separately; indices address the appended meshes. */
  skinDetails: { first: number; count: number }[];
  sequences: DTSSequence[];
}
