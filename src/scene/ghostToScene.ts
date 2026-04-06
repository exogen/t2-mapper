import type {
  TerrainBlockGhostData,
  InteriorInstanceGhostData,
  TSStaticGhostData,
  SkyGhostData,
  SunGhostData,
  MissionAreaGhostData,
  WaterBlockGhostData,
  ParsedData,
  AffineTransform,
  MatrixF as ParserMatrixF,
} from "t2-demo-parser";
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
import { createLogger } from "../logger";

const log = createLogger("ghostToScene");

const DEFAULT_VEC3: Vec3 = { x: 0, y: 0, z: 0 };
const UNIT_SCALE: Vec3 = { x: 1, y: 1, z: 1 };

function color3Or(v: Color3 | undefined, fallback: Color3): Color3 {
  return v ?? fallback;
}

function color4Or(v: Color4 | undefined, fallback: Color4): Color4 {
  return v ?? fallback;
}

/**
 * Convert a parser transform (MatrixF or AffineTransform) to the scene's
 * MatrixF format. The parser may emit either depending on the ghost class.
 */
function toMatrixF(v: ParserMatrixF | AffineTransform | undefined): MatrixF {
  if (!v) {
    return {
      elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      position: DEFAULT_VEC3,
    };
  }
  // MatrixF: has elements array
  if ("elements" in v) {
    return v;
  }
  // AffineTransform: has position + rotation quaternion
  const { position: pos, rotation: q } = v;
  const xx = q.x * q.x,
    yy = q.y * q.y,
    zz = q.z * q.z;
  const xy = q.x * q.y,
    xz = q.x * q.z,
    yz = q.y * q.z;
  const wx = q.w * q.x,
    wy = q.w * q.y,
    wz = q.w * q.z;
  return {
    elements: [
      1 - 2 * (yy + zz),
      2 * (xy + wz),
      2 * (xz - wy),
      0,
      2 * (xy - wz),
      1 - 2 * (xx + zz),
      2 * (yz + wx),
      0,
      2 * (xz + wy),
      2 * (yz - wx),
      1 - 2 * (xx + yy),
      0,
      pos.x,
      pos.y,
      pos.z,
      1,
    ],
    position: { x: pos.x, y: pos.y, z: pos.z },
  };
}

export function terrainFromGhost(
  ghostIndex: number,
  data: TerrainBlockGhostData,
): SceneTerrainBlock {
  return {
    className: "TerrainBlock",
    ghostIndex,
    terrFileName: data.terrFileName ?? "",
    detailTextureName: data.detailTextureName ?? "",
    squareSize: data.squareSize ?? 8,
    emptySquareRuns: data.emptySquareRuns,
  };
}

export function interiorFromGhost(
  ghostIndex: number,
  data: InteriorInstanceGhostData,
): SceneInteriorInstance {
  return {
    className: "InteriorInstance",
    ghostIndex,
    interiorFile: data.interiorFile ?? "",
    transform: toMatrixF(data.transform),
    scale: data.scale ?? UNIT_SCALE,
    showTerrainInside: data.showTerrainInside ?? false,
    skinBase: data.skinBase ?? "",
    alarmState: data.alarmState ?? false,
  };
}

export function tsStaticFromGhost(
  ghostIndex: number,
  data: TSStaticGhostData,
): SceneTSStatic {
  return {
    className: "TSStatic",
    ghostIndex,
    shapeName: data.shapeName ?? "",
    transform: toMatrixF(data.transform),
    scale: data.scale ?? UNIT_SCALE,
  };
}

export function skyFromGhost(ghostIndex: number, data: SkyGhostData): SceneSky {
  const fogVolumes = data.fogVolumes
    ? data.fogVolumes.map((v) => ({
        visibleDistance: v.visibleDistance ?? 0,
        minHeight: v.minHeight ?? 0,
        maxHeight: v.maxHeight ?? 0,
        color: color3Or(v.color, { r: 0, g: 0, b: 0 }),
      }))
    : [];

  const cloudLayers = data.cloudLayers
    ? data.cloudLayers.map((c) => ({
        texture: c.texture ?? "",
        heightPercent: c.heightPercent ?? 0,
        speed: c.speed ?? 0,
      }))
    : [];

  return {
    className: "Sky",
    ghostIndex,
    materialList: data.materialList ?? "",
    fogColor: color3Or(data.fogColor, { r: 0, g: 0, b: 0 }),
    visibleDistance: data.visibleDistance ?? 1000,
    fogDistance: data.fogDistance ?? 0,
    skySolidColor: color3Or(data.skySolidColor, { r: 0, g: 0, b: 0 }),
    useSkyTextures: data.useSkyTextures ?? true,
    fogVolumes,
    cloudLayers,
    windVelocity: data.windVelocity ?? DEFAULT_VEC3,
  };
}

export function sunFromGhost(ghostIndex: number, data: SunGhostData): SceneSun {
  return {
    className: "Sun",
    ghostIndex,
    direction: data.direction ?? { x: 0.57735, y: 0.57735, z: -0.57735 },
    color: color4Or(data.color, { r: 0.7, g: 0.7, b: 0.7, a: 1 }),
    ambient: color4Or(data.ambient, { r: 0.5, g: 0.5, b: 0.5, a: 1 }),
    textures: data.textures,
  };
}

export function missionAreaFromGhost(
  ghostIndex: number,
  data: MissionAreaGhostData,
): SceneMissionArea {
  return {
    className: "MissionArea",
    ghostIndex,
    area: data.area ?? { x: -512, y: -512, w: 1024, h: 1024 },
    flightCeiling: data.flightCeiling ?? 2000,
    flightCeilingRange: data.flightCeilingRange ?? 50,
  };
}

export function waterBlockFromGhost(
  ghostIndex: number,
  data: WaterBlockGhostData,
): SceneWaterBlock {
  return {
    className: "WaterBlock",
    ghostIndex,
    transform: toMatrixF(data.transform),
    scale: data.scale ?? UNIT_SCALE,
    surfaceName: data.surfaceName ?? "",
    envMapName: data.envMapName ?? "",
    surfaceOpacity: data.surfaceOpacity ?? 0.75,
    waveMagnitude: data.waveMagnitude ?? 1.0,
    envMapIntensity: data.envMapIntensity ?? 1.0,
  };
}

/** Convert a ghost update to a typed scene object, or null if not a scene type. */
export function ghostToSceneObject(
  className: string,
  ghostIndex: number,
  data: ParsedData,
): SceneObject | null {
  switch (className) {
    case "TerrainBlock": {
      const result = terrainFromGhost(
        ghostIndex,
        data as TerrainBlockGhostData,
      );
      log.debug(
        "TerrainBlock #%d: terrFileName=%s",
        ghostIndex,
        result.terrFileName,
      );
      return result;
    }
    case "InteriorInstance": {
      const result = interiorFromGhost(
        ghostIndex,
        data as InteriorInstanceGhostData,
      );
      log.debug(
        "InteriorInstance #%d: interiorFile=%s",
        ghostIndex,
        result.interiorFile,
      );
      return result;
    }
    case "TSStatic":
      return tsStaticFromGhost(ghostIndex, data as TSStaticGhostData);
    case "Sky": {
      const result = skyFromGhost(ghostIndex, data as SkyGhostData);
      log.debug(
        "Sky #%d: materialList=%s fogColor=(%s, %s, %s) visibleDist=%d fogDist=%d useSkyTextures=%s",
        ghostIndex,
        result.materialList,
        result.fogColor.r.toFixed(3),
        result.fogColor.g.toFixed(3),
        result.fogColor.b.toFixed(3),
        result.visibleDistance,
        result.fogDistance,
        result.useSkyTextures,
      );
      return result;
    }
    case "Sun": {
      const result = sunFromGhost(ghostIndex, data as SunGhostData);
      log.debug(
        "Sun #%d: dir=(%s, %s, %s) color=(%s, %s, %s) ambient=(%s, %s, %s)",
        ghostIndex,
        result.direction.x.toFixed(3),
        result.direction.y.toFixed(3),
        result.direction.z.toFixed(3),
        result.color.r.toFixed(3),
        result.color.g.toFixed(3),
        result.color.b.toFixed(3),
        result.ambient.r.toFixed(3),
        result.ambient.g.toFixed(3),
        result.ambient.b.toFixed(3),
      );
      return result;
    }
    case "MissionArea":
      return missionAreaFromGhost(ghostIndex, data as MissionAreaGhostData);
    case "WaterBlock":
      return waterBlockFromGhost(ghostIndex, data as WaterBlockGhostData);
    default:
      return null;
  }
}
