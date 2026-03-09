import type {
  SceneTerrainBlock,
  SceneInteriorInstance,
  SceneTSStatic,
  SceneSky,
  SceneSun,
  SceneMissionArea,
  SceneWaterBlock,
  SceneObject,
  MatrixF,
  Vec3,
  Color3,
  Color4,
} from "./types";

type GhostData = Record<string, unknown>;

function vec3(v: unknown, fallback: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  if (v && typeof v === "object" && "x" in v) return v as Vec3;
  return fallback;
}

function color3(v: unknown, fallback: Color3 = { r: 0, g: 0, b: 0 }): Color3 {
  if (v && typeof v === "object" && "r" in v) return v as Color3;
  return fallback;
}

function color4(
  v: unknown,
  fallback: Color4 = { r: 0.5, g: 0.5, b: 0.5, a: 1 },
): Color4 {
  if (v && typeof v === "object" && "r" in v) return v as Color4;
  return fallback;
}

function matrixF(v: unknown): MatrixF {
  if (
    v &&
    typeof v === "object" &&
    "elements" in v &&
    Array.isArray((v as any).elements)
  ) {
    return v as MatrixF;
  }
  // readAffineTransform() returns {position, rotation} — convert to MatrixF.
  if (
    v &&
    typeof v === "object" &&
    "position" in v &&
    "rotation" in v
  ) {
    const { position: pos, rotation: q } = v as {
      position: { x: number; y: number; z: number };
      rotation: { x: number; y: number; z: number; w: number };
    };
    // Quaternion to column-major 4×4 matrix (idx = row + col*4).
    const xx = q.x * q.x, yy = q.y * q.y, zz = q.z * q.z;
    const xy = q.x * q.y, xz = q.x * q.z, yz = q.y * q.z;
    const wx = q.w * q.x, wy = q.w * q.y, wz = q.w * q.z;
    return {
      elements: [
        1 - 2 * (yy + zz), 2 * (xy + wz),     2 * (xz - wy),     0,
        2 * (xy - wz),      1 - 2 * (xx + zz), 2 * (yz + wx),     0,
        2 * (xz + wy),      2 * (yz - wx),     1 - 2 * (xx + yy), 0,
        pos.x,              pos.y,              pos.z,              1,
      ],
      position: { x: pos.x, y: pos.y, z: pos.z },
    };
  }
  return {
    elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    position: { x: 0, y: 0, z: 0 },
  };
}

export function terrainFromGhost(
  ghostIndex: number,
  data: GhostData,
): SceneTerrainBlock {
  return {
    className: "TerrainBlock",
    ghostIndex,
    terrFileName: (data.terrFileName as string) ?? "",
    detailTextureName: (data.detailTextureName as string) ?? "",
    squareSize: (data.squareSize as number) ?? 8,
    emptySquareRuns: data.emptySquareRuns as number[] | undefined,
  };
}

export function interiorFromGhost(
  ghostIndex: number,
  data: GhostData,
): SceneInteriorInstance {
  return {
    className: "InteriorInstance",
    ghostIndex,
    interiorFile: (data.interiorFile as string) ?? "",
    transform: matrixF(data.transform),
    scale: vec3(data.scale, { x: 1, y: 1, z: 1 }),
    showTerrainInside: (data.showTerrainInside as boolean) ?? false,
    skinBase: (data.skinBase as string) ?? "",
    alarmState: (data.alarmState as boolean) ?? false,
  };
}

export function tsStaticFromGhost(
  ghostIndex: number,
  data: GhostData,
): SceneTSStatic {
  return {
    className: "TSStatic",
    ghostIndex,
    shapeName: (data.shapeName as string) ?? "",
    transform: matrixF(data.transform),
    scale: vec3(data.scale, { x: 1, y: 1, z: 1 }),
  };
}

export function skyFromGhost(ghostIndex: number, data: GhostData): SceneSky {
  const fogVolumes = Array.isArray(data.fogVolumes)
    ? (data.fogVolumes as Array<{
        visibleDistance?: number;
        minHeight?: number;
        maxHeight?: number;
        color?: Color3;
      }>).map((v) => ({
        visibleDistance: v.visibleDistance ?? 0,
        minHeight: v.minHeight ?? 0,
        maxHeight: v.maxHeight ?? 0,
        color: color3(v.color),
      }))
    : [];

  const cloudLayers = Array.isArray(data.cloudLayers)
    ? (data.cloudLayers as Array<{
        texture?: string;
        heightPercent?: number;
        speed?: number;
      }>).map((c) => ({
        texture: c.texture ?? "",
        heightPercent: c.heightPercent ?? 0,
        speed: c.speed ?? 0,
      }))
    : [];

  return {
    className: "Sky",
    ghostIndex,
    materialList: (data.materialList as string) ?? "",
    fogColor: color3(data.fogColor),
    visibleDistance: (data.visibleDistance as number) ?? 1000,
    fogDistance: (data.fogDistance as number) ?? 0,
    skySolidColor: color3(data.skySolidColor),
    useSkyTextures: (data.useSkyTextures as boolean) ?? true,
    fogVolumes,
    cloudLayers,
    windVelocity: vec3(data.windVelocity),
  };
}

export function sunFromGhost(ghostIndex: number, data: GhostData): SceneSun {
  return {
    className: "Sun",
    ghostIndex,
    direction: vec3(data.direction, { x: 0.57735, y: 0.57735, z: -0.57735 }),
    color: color4(data.color, { r: 0.7, g: 0.7, b: 0.7, a: 1 }),
    ambient: color4(data.ambient, { r: 0.5, g: 0.5, b: 0.5, a: 1 }),
    textures: Array.isArray(data.textures)
      ? (data.textures as string[])
      : undefined,
  };
}

export function missionAreaFromGhost(
  ghostIndex: number,
  data: GhostData,
): SceneMissionArea {
  const area = data.area as
    | { x: number; y: number; w: number; h: number }
    | undefined;
  return {
    className: "MissionArea",
    ghostIndex,
    area: area ?? { x: -512, y: -512, w: 1024, h: 1024 },
    flightCeiling: (data.flightCeiling as number) ?? 2000,
    flightCeilingRange: (data.flightCeilingRange as number) ?? 50,
  };
}

export function waterBlockFromGhost(
  ghostIndex: number,
  data: GhostData,
): SceneWaterBlock {
  return {
    className: "WaterBlock",
    ghostIndex,
    transform: matrixF(data.transform),
    scale: vec3(data.scale, { x: 1, y: 1, z: 1 }),
    surfaceName: (data.surfaceName as string) ?? "",
    envMapName: (data.envMapName as string) ?? "",
    surfaceOpacity: (data.surfaceOpacity as number) ?? 0.75,
    waveMagnitude: (data.waveMagnitude as number) ?? 1.0,
    envMapIntensity: (data.envMapIntensity as number) ?? 1.0,
  };
}

/** Convert a ghost update to a typed scene object, or null if not a scene type. */
export function ghostToSceneObject(
  className: string,
  ghostIndex: number,
  data: GhostData,
): SceneObject | null {
  switch (className) {
    case "TerrainBlock":
      return terrainFromGhost(ghostIndex, data);
    case "InteriorInstance":
      return interiorFromGhost(ghostIndex, data);
    case "TSStatic":
      return tsStaticFromGhost(ghostIndex, data);
    case "Sky":
      return skyFromGhost(ghostIndex, data);
    case "Sun":
      return sunFromGhost(ghostIndex, data);
    case "MissionArea":
      return missionAreaFromGhost(ghostIndex, data);
    case "WaterBlock":
      return waterBlockFromGhost(ghostIndex, data);
    default:
      return null;
  }
}
