import type { TorqueObject, TorqueRuntime } from "../torqueScript";
import type {
  GameEntity,
  ShapeEntity,
  ForceFieldBareEntity,
  AudioEmitterEntity,
  CameraEntity,
  WayPointEntity,
} from "../state/gameEntityTypes";
import { getPosition, getProperty, getScale } from "../mission";
import { parseColorTuple } from "../colorUtils";
import {
  terrainFromMis,
  interiorFromMis,
  skyFromMis,
  sunFromMis,
  missionAreaFromMis,
  waterBlockFromMis,
} from "../scene/misToScene";

/** Resolve a named datablock from the runtime. */
function resolveDatablock(
  runtime: TorqueRuntime,
  name: string | undefined,
): TorqueObject | undefined {
  if (!name) return undefined;
  return runtime.state.datablocks.get(name);
}

/** Handles TorqueScript's various truthy representations. */
function isTruthy(value: unknown): boolean {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    return lower !== "0" && lower !== "false" && lower !== "";
  }
  return !!value;
}

function parseRotationToQuat(
  rotationStr: string,
): [number, number, number, number] {
  const [ax, ay, az, angleDeg] = rotationStr.split(" ").map(parseFloat);
  // Convert Torque axis-angle to Three.js quaternion (with coordinate swap
  // and angle negation matching getRotation() in mission.ts).
  const halfRad = (-(angleDeg || 0) * Math.PI) / 360;
  const s = Math.sin(halfRad);
  const c = Math.cos(halfRad);
  const len = Math.sqrt(
    (ay || 0) * (ay || 0) + (az || 0) * (az || 0) + (ax || 0) * (ax || 0),
  );
  if (len < 1e-8) return [0, 0, 0, 1];
  // Three.js quaternion [x, y, z, w] with Torque→Three axis swap (x→y, y→z, z→x)
  return [
    ((ay || 0) / len) * s,
    ((az || 0) / len) * s,
    ((ax || 0) / len) * s,
    c,
  ];
}

/**
 * Build a GameEntity from a mission TorqueObject. Returns null if the
 * object's className is not a renderable entity type.
 */
export function buildGameEntityFromMission(
  object: TorqueObject,
  runtime: TorqueRuntime,
  teamId?: number,
): GameEntity | null {
  const className = object._className;
  const id = `mission_${object._id}`;
  const position = getPosition(object);
  const scale = getScale(object);
  const rotStr = object.rotation ?? "1 0 0 0";
  const rotation = parseRotationToQuat(rotStr);
  const datablockName = getProperty(object, "dataBlock") ?? "";
  const datablock = resolveDatablock(runtime, datablockName);
  const missionTypesList = getProperty(object, "missionTypesList");

  const base = {
    id,
    className,
    runtimeObject: object,
    missionTypesList,
  };
  const posBase = { ...base, position, rotation, scale };

  switch (className) {
    // Scene infrastructure
    case "TerrainBlock":
      return {
        ...base,
        renderType: "TerrainBlock",
        terrainData: terrainFromMis(object),
      };
    case "InteriorInstance":
      return {
        ...base,
        renderType: "InteriorInstance",
        interiorData: interiorFromMis(object),
      };
    case "Sky":
      return { ...base, renderType: "Sky", skyData: skyFromMis(object) };
    case "Sun":
      return { ...base, renderType: "Sun", sunData: sunFromMis(object) };
    case "WaterBlock":
      return {
        ...base,
        renderType: "WaterBlock",
        waterData: waterBlockFromMis(object),
      };
    case "MissionArea":
      return {
        ...base,
        renderType: "MissionArea",
        missionAreaData: missionAreaFromMis(object),
      };

    // Shapes
    case "StaticShape":
    case "Item":
    case "Turret":
    case "TSStatic": {
      // Prefer the runtime `team` field (set by SimGroup::setTeam during
      // game init) over the hierarchy-inferred teamId.
      const objTeam = getProperty(object, "team");
      const resolvedTeam =
        objTeam != null && objTeam !== "" ? parseInt(objTeam, 10) : teamId;
      return buildShapeEntity(
        posBase,
        object,
        datablock,
        runtime,
        className,
        resolvedTeam,
        datablockName,
      );
    }

    // Force field
    case "ForceFieldBare":
      return buildForceFieldEntity(posBase, object, datablock, scale);

    // Audio
    case "AudioEmitter":
      return {
        ...posBase,
        renderType: "AudioEmitter",
        audioFileName: getProperty(object, "fileName") ?? undefined,
        audioVolume: parseFloat(getProperty(object, "volume")) || 1,
        audioIs3D: (getProperty(object, "is3D") ?? "0") !== "0",
        audioIsLooping: (getProperty(object, "isLooping") ?? "0") !== "0",
        audioMinDistance: parseFloat(getProperty(object, "minDistance")) || 1,
        audioMaxDistance: parseFloat(getProperty(object, "maxDistance")) || 1,
        audioMinLoopGap: parseFloat(getProperty(object, "minLoopGap")) || 0,
        audioMaxLoopGap: parseFloat(getProperty(object, "maxLoopGap")) || 0,
      } satisfies AudioEmitterEntity;

    case "Camera":
      return {
        ...posBase,
        renderType: "Camera",
        cameraDataBlock: datablockName || undefined,
      } satisfies CameraEntity;

    case "WayPoint":
      return {
        ...posBase,
        renderType: "WayPoint",
        label: getProperty(object, "name") || undefined,
      } satisfies WayPointEntity;

    default:
      return null;
  }
}

function buildShapeEntity(
  posBase: {
    id: string;
    className: string;
    runtimeObject: unknown;
    missionTypesList?: string;
    position?: [number, number, number];
    rotation?: [number, number, number, number];
    scale?: [number, number, number];
  },
  object: TorqueObject,
  datablock: TorqueObject | undefined,
  runtime: TorqueRuntime,
  className: string,
  teamId: number | undefined,
  datablockName: string,
): ShapeEntity {
  const shapeName =
    className === "TSStatic"
      ? getProperty(object, "shapeName")
      : getProperty(datablock, "shapeFile");
  const shapeType =
    className === "Turret"
      ? "Turret"
      : className === "Item"
        ? "Item"
        : className === "TSStatic"
          ? "TSStatic"
          : "StaticShape";

  const entity: ShapeEntity = {
    ...posBase,
    renderType: "Shape",
    shapeName,
    shapeType,
    dataBlock: datablockName || undefined,
    emap:
      getProperty(datablock, "emap") != null
        ? isTruthy(getProperty(datablock, "emap"))
        : undefined,
    teamId,
  };

  if (className === "Item") {
    entity.rotate = isTruthy(
      getProperty(object, "rotate") ?? getProperty(datablock, "rotate"),
    );
  }

  if (className === "Turret") {
    const barrelName = getProperty(object, "initialBarrel");
    if (barrelName) {
      const barrelDb = resolveDatablock(runtime, barrelName);
      entity.barrelShapeName = getProperty(barrelDb, "shapeFile");
    }
  }

  return entity;
}

function buildForceFieldEntity(
  posBase: {
    id: string;
    className: string;
    runtimeObject: unknown;
    missionTypesList?: string;
    position?: [number, number, number];
    rotation?: [number, number, number, number];
    scale?: [number, number, number];
  },
  object: TorqueObject,
  datablock: TorqueObject | undefined,
  rawScale: [number, number, number] | undefined,
): ForceFieldBareEntity {
  const colorStr = getProperty(datablock, "color");
  const color = colorStr
    ? parseColorTuple(colorStr)
    : ([1, 1, 1] as [number, number, number]);
  const baseTranslucency =
    parseFloat(getProperty(datablock, "baseTranslucency")) || 1;
  const numFrames = parseInt(getProperty(datablock, "numFrames"), 10) || 1;
  const framesPerSec = parseFloat(getProperty(datablock, "framesPerSec")) || 1;
  const scrollSpeed = parseFloat(getProperty(datablock, "scrollSpeed")) || 0;
  const umapping = parseFloat(getProperty(datablock, "umapping")) || 1;
  const vmapping = parseFloat(getProperty(datablock, "vmapping")) || 1;

  const textures: string[] = [];
  for (let i = 0; i < numFrames; i++) {
    const texturePath = getProperty(datablock, `texture${i}`);
    if (texturePath) {
      textures.push(texturePath);
    }
  }

  // ForceFieldBare uses "scale" as box dimensions, not as a transform scale.
  const dimensions = rawScale ?? [1, 1, 1];

  return {
    ...posBase,
    scale: undefined, // Don't apply scale as a group transform
    renderType: "ForceFieldBare",
    forceFieldData: {
      textures,
      color,
      baseTranslucency,
      numFrames,
      framesPerSec,
      scrollSpeed,
      umapping,
      vmapping,
      dimensions,
    },
  };
}

/** Check if an entity's missionTypesList includes the given mission type. */
function matchesMissionType(
  missionTypesList: string | undefined,
  missionType: string | undefined,
): boolean {
  if (!missionType || !missionTypesList) return true;
  const types = missionTypesList.toLowerCase().split(/\s+/).filter(Boolean);
  return types.length === 0 || types.includes(missionType.toLowerCase());
}

/**
 * Walk a TorqueObject tree and extract all GameEntities.
 * Respects team assignment from SimGroup hierarchy.
 * When missionType is provided, entities whose missionTypesList doesn't
 * include that type are excluded.
 */
export function walkMissionTree(
  root: TorqueObject,
  runtime: TorqueRuntime,
  missionType?: string,
  teamId?: number,
): GameEntity[] {
  const entities: GameEntity[] = [];

  // Determine team from SimGroup hierarchy
  let currentTeam = teamId;
  if (root._className === "SimGroup") {
    if (root._name?.toLowerCase() === "teams") {
      currentTeam = undefined;
    } else if (currentTeam === undefined && root._name) {
      const match = root._name.match(/^team(\d+)$/i);
      if (match) {
        currentTeam = parseInt(match[1], 10);
      }
    }
  }

  // Try to build entity for this object
  const entity = buildGameEntityFromMission(root, runtime, currentTeam);
  if (entity && matchesMissionType(entity.missionTypesList, missionType)) {
    entities.push(entity);
  }

  // Recurse into children
  if (root._children) {
    for (const child of root._children) {
      entities.push(
        ...walkMissionTree(child, runtime, missionType, currentTeam),
      );
    }
  }

  return entities;
}
