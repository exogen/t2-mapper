/**
 * Convert .mis TorqueObject data (string properties) into typed scene objects.
 * This is the adapter layer that makes .mis data look like ghost parsedData.
 */

import type { TorqueObject } from "../torqueScript";
import { parseColor3, parseColor4 } from "../colorUtils";
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
  SceneSkyFogVolume,
  SceneSkyCloudLayer,
} from "./types";

// ── String parsing helpers ──

function prop(obj: TorqueObject, name: string): string | undefined {
  return obj[name.toLowerCase()];
}

function propFloat(obj: TorqueObject, name: string): number | undefined {
  const v = prop(obj, name);
  if (v == null) return undefined;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

function propInt(obj: TorqueObject, name: string): number | undefined {
  const v = prop(obj, name);
  if (v == null) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseVec3(
  s: string | undefined,
  fallback: Vec3 = { x: 0, y: 0, z: 0 },
): Vec3 {
  if (!s) return fallback;
  const parts = s.split(" ").map(Number);
  return {
    x: parts[0] ?? fallback.x,
    y: parts[1] ?? fallback.y,
    z: parts[2] ?? fallback.z,
  };
}

/**
 * Build a MatrixF from .mis position ("x y z") and rotation ("ax ay az angleDeg").
 * Torque stores rotation as axis-angle in degrees.
 */
function buildMatrixF(
  positionStr: string | undefined,
  rotationStr: string | undefined,
): MatrixF {
  const pos = parseVec3(positionStr);
  const rotParts = (rotationStr ?? "1 0 0 0").split(" ").map(Number);
  const ax = rotParts[0] ?? 1;
  const ay = rotParts[1] ?? 0;
  const az = rotParts[2] ?? 0;
  const angleDeg = rotParts[3] ?? 0;
  const angleRad = angleDeg * (Math.PI / 180);

  // Normalize axis
  const len = Math.sqrt(ax * ax + ay * ay + az * az);
  let nx = 0,
    ny = 0,
    nz = 1;
  if (len > 1e-8) {
    nx = ax / len;
    ny = ay / len;
    nz = az / len;
  }

  // Axis-angle to rotation matrix (Rodrigues)
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const t = 1 - c;

  // Row-major MatrixF: idx(row, col) = row + col * 4
  const elements = new Array<number>(16).fill(0);
  elements[0] = t * nx * nx + c;
  elements[1] = t * nx * ny + s * nz;
  elements[2] = t * nx * nz - s * ny;
  elements[4] = t * nx * ny - s * nz;
  elements[5] = t * ny * ny + c;
  elements[6] = t * ny * nz + s * nx;
  elements[8] = t * nx * nz + s * ny;
  elements[9] = t * ny * nz - s * nx;
  elements[10] = t * nz * nz + c;
  elements[12] = pos.x;
  elements[13] = pos.y;
  elements[14] = pos.z;
  elements[15] = 1;

  return { elements, position: pos };
}

function parseEmptySquares(s: string | undefined): number[] | undefined {
  if (!s) return undefined;
  const runs = s.split(/\s+/).map(Number).filter(Number.isFinite);
  return runs.length > 0 ? runs : undefined;
}

function parseFogVolume(s: string | undefined): SceneSkyFogVolume | null {
  if (!s) return null;
  const parts = s.split(/\s+/).map(Number);
  const visDist = parts[0] ?? 0;
  const minH = parts[1] ?? 0;
  const maxH = parts[2] ?? 0;
  if (visDist === 0 && minH === 0 && maxH === 0) return null;
  return {
    visibleDistance: visDist,
    minHeight: minH,
    maxHeight: maxH,
    color: { r: 0.5, g: 0.5, b: 0.5 }, // fogVolumeColor is cosmetic only in T2
  };
}

// ── Conversion functions ──

export function terrainFromMis(obj: TorqueObject): SceneTerrainBlock {
  return {
    className: "TerrainBlock",
    ghostIndex: obj._id,
    terrFileName: prop(obj, "terrainFile") ?? "",
    detailTextureName: prop(obj, "detailTexture") ?? "",
    squareSize: propInt(obj, "squareSize") ?? 8,
    emptySquareRuns: parseEmptySquares(prop(obj, "emptySquares")),
  };
}

export function interiorFromMis(obj: TorqueObject): SceneInteriorInstance {
  return {
    className: "InteriorInstance",
    ghostIndex: obj._id,
    interiorFile: prop(obj, "interiorFile") ?? "",
    transform: buildMatrixF(prop(obj, "position"), prop(obj, "rotation")),
    scale: parseVec3(prop(obj, "scale"), { x: 1, y: 1, z: 1 }),
    showTerrainInside: prop(obj, "showTerrainInside") === "1",
    skinBase: prop(obj, "skinBase") ?? "",
    alarmState: false,
  };
}

export function tsStaticFromMis(obj: TorqueObject): SceneTSStatic {
  return {
    className: "TSStatic",
    ghostIndex: obj._id,
    shapeName: prop(obj, "shapeName") ?? "",
    transform: buildMatrixF(prop(obj, "position"), prop(obj, "rotation")),
    scale: parseVec3(prop(obj, "scale"), { x: 1, y: 1, z: 1 }),
  };
}

export function skyFromMis(obj: TorqueObject): SceneSky {
  const fogVolumes: SceneSkyFogVolume[] = [];
  for (let i = 1; i <= 3; i++) {
    const vol = parseFogVolume(prop(obj, `fogVolume${i}`));
    if (vol) fogVolumes.push(vol);
  }

  const cloudLayers: SceneSkyCloudLayer[] = [];
  for (let i = 0; i < 3; i++) {
    const texture = prop(obj, `cloudText${i + 1}`) ?? "";
    const heightPercent =
      propFloat(obj, `cloudHeightPer[${i}]`) ??
      propFloat(obj, `cloudheightper${i}`) ??
      [0.35, 0.25, 0.2][i];
    const speed =
      propFloat(obj, `cloudSpeed${i + 1}`) ?? [0.0001, 0.0002, 0.0003][i];
    cloudLayers.push({ texture, heightPercent, speed });
  }

  return {
    className: "Sky",
    ghostIndex: obj._id,
    materialList: prop(obj, "materialList") ?? "",
    fogColor: parseColor3(prop(obj, "fogColor")),
    visibleDistance: propFloat(obj, "visibleDistance") ?? 1000,
    fogDistance: propFloat(obj, "fogDistance") ?? 0,
    skySolidColor: parseColor3(prop(obj, "SkySolidColor")),
    useSkyTextures: (propInt(obj, "useSkyTextures") ?? 1) !== 0,
    fogVolumes,
    cloudLayers,
    windVelocity: parseVec3(prop(obj, "windVelocity")),
  };
}

export function sunFromMis(obj: TorqueObject): SceneSun {
  return {
    className: "Sun",
    ghostIndex: obj._id,
    direction: parseVec3(prop(obj, "direction"), {
      x: 0.57735,
      y: 0.57735,
      z: -0.57735,
    }),
    color: parseColor4(prop(obj, "color"), { r: 0.7, g: 0.7, b: 0.7, a: 1 }),
    ambient: parseColor4(prop(obj, "ambient"), {
      r: 0.5,
      g: 0.5,
      b: 0.5,
      a: 1,
    }),
  };
}

export function missionAreaFromMis(obj: TorqueObject): SceneMissionArea {
  const areaStr = prop(obj, "area");
  let area = { x: -512, y: -512, w: 1024, h: 1024 };
  if (areaStr) {
    const parts = areaStr.split(/\s+/).map(Number);
    area = {
      x: parts[0] ?? area.x,
      y: parts[1] ?? area.y,
      w: parts[2] ?? area.w,
      h: parts[3] ?? area.h,
    };
  }
  return {
    className: "MissionArea",
    ghostIndex: obj._id,
    area,
    flightCeiling: propFloat(obj, "flightCeiling") ?? 2000,
    flightCeilingRange: propFloat(obj, "flightCeilingRange") ?? 50,
  };
}

export function waterBlockFromMis(obj: TorqueObject): SceneWaterBlock {
  return {
    className: "WaterBlock",
    ghostIndex: obj._id,
    transform: buildMatrixF(prop(obj, "position"), prop(obj, "rotation")),
    scale: parseVec3(prop(obj, "scale"), { x: 1, y: 1, z: 1 }),
    surfaceName: prop(obj, "surfaceTexture") ?? "",
    envMapName: prop(obj, "envMapTexture") ?? "",
    surfaceOpacity: propFloat(obj, "surfaceOpacity") ?? 0.75,
    waveMagnitude: propFloat(obj, "waveMagnitude") ?? 1.0,
    envMapIntensity: propFloat(obj, "envMapIntensity") ?? 1.0,
  };
}

/** Convert a .mis TorqueObject to a typed scene object based on className. */
export function misToSceneObject(obj: TorqueObject): SceneObject | null {
  switch (obj._className) {
    case "TerrainBlock":
      return terrainFromMis(obj);
    case "InteriorInstance":
      return interiorFromMis(obj);
    case "TSStatic":
      return tsStaticFromMis(obj);
    case "Sky":
      return skyFromMis(obj);
    case "Sun":
      return sunFromMis(obj);
    case "MissionArea":
      return missionAreaFromMis(obj);
    case "WaterBlock":
      return waterBlockFromMis(obj);
    default:
      return null;
  }
}
