import type { TorqueObject, TorqueRuntime } from "../torqueScript";
import type {
  GameEntity,
  ShapeEntity,
  ForceFieldBareEntity,
  AudioEmitterEntity,
  CameraEntity,
  WayPointEntity,
} from "../state/gameEntityTypes";
import type { ImageSlot } from "./types";
import { getPosition, getProperty, getScale } from "../mission";
import { misRotationToThreeQuat } from "../torqueScript/vecMath";
import { DEFAULT_FLAG_SKINS } from "../stringUtils";
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

/**
 * ShapeBase-derived classes the bridge builds: only these are hidden by
 * the engine's mission-type filtering (ShapeBase::cleanNonType calls
 * hide(true); SimObject::cleanNonType is a no-op, so interiors, TSStatics
 * and other scene objects always render regardless of missionTypesList).
 */
const SHAPE_BASE_CLASSES = new Set([
  "staticshape",
  "item",
  "turret",
  "camera",
  "waypoint",
]);

/**
 * Build a GameEntity from a mission TorqueObject. Returns null if the
 * object's className is not a renderable entity type.
 */
export function buildGameEntityFromMission(
  object: TorqueObject,
  runtime: TorqueRuntime,
  teamId?: number,
  missionType?: string,
): GameEntity | null {
  const className = object._className;
  const id = String(object._id);
  const position = getPosition(object);
  const scale = getScale(object);
  const rotStr = object.rotation ?? "1 0 0 0";
  const rotation = misRotationToThreeQuat(String(rotStr));
  const datablockName = getProperty(object, "dataBlock") ?? "";
  const datablock = resolveDatablock(runtime, datablockName);
  const missionTypesList = getProperty(object, "missionTypesList");

  // Script truth (ShapeBase::hide via setProp "hidden") wins; when the
  // field is absent (dispatch failed or scripts didn't run), fall back to
  // computing what cleanNonType would have done — identical outcome, only
  // for the classes the engine actually hides. isTruthy handles direct
  // script/mis field writes ("1", 1) alongside hide()'s boolean.
  const hidden =
    object.hidden !== undefined
      ? isTruthy(object.hidden)
      : SHAPE_BASE_CLASSES.has(className.toLowerCase()) &&
        !matchesMissionType(missionTypesList, missionType);

  const base = {
    id,
    className,
    runtimeObject: object,
    missionTypesList,
    ...(hidden ? { hidden } : null),
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
    teamId,
  };

  if (className === "Item") {
    entity.rotate = isTruthy(
      getProperty(object, "rotate") ?? getProperty(datablock, "rotate"),
    );
    // Flag Items get a team skin (e.g. "beagle" for Blood Eagle). The
    // faithful skin from setTargetSkin is recorded as object._targetSkin
    // (musicTrack-derived); we intentionally prefer the classic defaults.
    if (datablockName.toLowerCase() === "flag" && teamId != null) {
      entity.skinName = DEFAULT_FLAG_SKINS[teamId];
    }
  }

  // Item/ShapeBase built-in dynamic light from datablock.
  const lightTypeStr = getProperty(datablock, "lightType");
  if (lightTypeStr) {
    const ltMap: Record<string, number> = {
      constantlight: 1,
      pulsinglight: 2,
    };
    const lt = ltMap[lightTypeStr.toLowerCase()];
    if (lt) {
      entity.lightType = lt;
      const lcStr = getProperty(datablock, "lightColor");
      if (lcStr) {
        const parts = lcStr.split(/\s+/).map(Number);
        entity.lightColor = [
          parts[0] ?? 1,
          parts[1] ?? 1,
          parts[2] ?? 1,
          parts[3] ?? 1,
        ];
      } else {
        entity.lightColor = [1, 1, 1, 1];
      }
      entity.lightTime = Number(getProperty(datablock, "lightTime")) || 1000;
      entity.lightRadius = Number(getProperty(datablock, "lightRadius")) || 10;
      entity.lightOnlyStatic = isTruthy(
        getProperty(datablock, "lightOnlyStatic"),
      );
      // In mission mode, statically placed items are always "static".
      entity.isStaticItem = className === "Item";
    }
  }

  // Script-mounted images (ShapeBase::mountImage, e.g. turret barrels
  // mounted by TurretData::onAdd). Falls back to the static initialBarrel
  // field when scripts didn't record any mounts.
  const mounted = object._mountedImages as
    Record<number, { image: string; skin?: string }> | undefined;
  if (mounted && Object.keys(mounted).length > 0) {
    const slots: (ImageSlot | undefined)[] = [];
    for (const [slotStr, entry] of Object.entries(mounted)) {
      const imageDb = resolveDatablock(runtime, entry.image);
      const imageShapeName = getProperty(imageDb, "shapeFile");
      if (!imageShapeName) continue;
      slots[Number(slotStr)] = {
        shapeName: imageShapeName,
        mountPoint: Number(getProperty(imageDb, "mountPoint")) || 0,
        dataBlockId: 0,
        skinName: entry.skin,
      };
    }
    if (slots.some(Boolean)) entity.imageSlots = slots;
  } else if (className === "Turret") {
    const barrelName = getProperty(object, "initialBarrel");
    if (barrelName) {
      const barrelDb = resolveDatablock(runtime, barrelName);
      const turretShapeName = getProperty(barrelDb, "shapeFile");
      if (turretShapeName) {
        const mountPoint = Number(getProperty(barrelDb, "mountPoint")) || 0;
        entity.imageSlots = [
          { shapeName: turretShapeName, mountPoint, dataBlockId: 0 },
        ];
      }
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
  const powerOffColorStr = getProperty(datablock, "powerOffColor");
  const powerOffColor = powerOffColorStr
    ? parseColorTuple(powerOffColorStr)
    : ([0, 0, 0] as [number, number, number]);
  const powerOffTranslucency =
    parseFloat(getProperty(datablock, "powerOffTranslucency")) || 0;
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
    fieldOpen: object._fieldopen === true || undefined,
    forceFieldData: {
      textures,
      color,
      powerOffColor,
      baseTranslucency,
      powerOffTranslucency,
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
 * Resolve an object's team from its SimGroup ancestry (nearest ancestor
 * group named "teamN"). The object's own `team` field, when present, is
 * preferred by buildGameEntityFromMission and wins over this.
 */
export function resolveTeamForObject(object: TorqueObject): number | undefined {
  for (let group = object._parent; group; group = group._parent) {
    const match = group._name?.match(/^team(\d+)$/i);
    if (match) return parseInt(match[1], 10);
  }
  return undefined;
}

/**
 * Walk a TorqueObject tree and extract all GameEntities.
 * Respects team assignment from SimGroup hierarchy.
 * Mission-type mismatches no longer exclude entities: the engine only
 * hides ShapeBase objects (via cleanNonType → hide), which the bridge
 * reflects in the `hidden` flag; everything else always renders.
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
  const entity = buildGameEntityFromMission(
    root,
    runtime,
    currentTeam,
    missionType,
  );
  if (entity) {
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
