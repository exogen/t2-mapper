import { CaseInsensitiveMap } from "./utils";

/**
 * The engine-side (C++) class graph the game scripts dispatch against.
 * TorqueScript method lookup walks object name → datablock name → datablock
 * className field → this hierarchy; without it, handlers like
 * `ShapeBaseData::onAdd` or `SimObject::schedule` are unreachable from
 * mission objects. Type masks mirror the engine's object type bits: scripts
 * only ever test them via `$TypeMasks::*` globals (never literals), so the
 * values need only be internally consistent; where known they follow the
 * T2 SDK bit positions.
 */

function BIT(n: number): number {
  return (1 << n) >>> 0;
}

/**
 * Object type bits, seeded into `$TypeMasks::*` globals by
 * registerEngineStubs. Bits 0-6 and 8 follow the Torque SDK; T2-specific
 * bits (Sensor/Station/Moveable/Turret) use free positions.
 */
export const TYPE_MASKS: Record<string, number> = {
  StaticObjectType: BIT(0),
  EnvironmentObjectType: BIT(1),
  TerrainObjectType: BIT(2),
  InteriorObjectType: BIT(3),
  WaterObjectType: BIT(4),
  TriggerObjectType: BIT(5),
  MarkerObjectType: BIT(6),
  ForceFieldObjectType: BIT(8),
  GameBaseObjectType: BIT(10),
  ShapeBaseObjectType: BIT(11),
  CameraObjectType: BIT(12),
  StaticShapeObjectType: BIT(13),
  PlayerObjectType: BIT(14),
  ItemObjectType: BIT(15),
  VehicleObjectType: BIT(16),
  VehicleBlockerObjectType: BIT(17),
  ProjectileObjectType: BIT(18),
  ExplosionObjectType: BIT(19),
  CorpseObjectType: BIT(20),
  SensorObjectType: BIT(21),
  DebrisObjectType: BIT(22),
  PhysicalZoneObjectType: BIT(23),
  TSStaticShapeObjectType: BIT(24),
  StationObjectType: BIT(25),
  MoveableObjectType: BIT(26),
  DamagableItemObjectType: BIT(27),
  TurretObjectType: BIT(28),
};

const M = TYPE_MASKS;

export type OnAddStyle = "datablock" | "object" | "none";

export interface EngineClassInfo {
  /** C++ namespace parent, e.g. StaticShape → ShapeBase. */
  parent: string | null;
  /** Type bits contributed by this class itself (ancestors are ORed in). */
  typeMask: number;
  /**
   * How the engine fires script onAdd for instances of this class:
   * through the datablock's namespace with (%data, %obj), through the
   * object's own namespace with (%obj), or not at all.
   */
  onAdd: OnAddStyle;
  /** Container semantics: groups own their children, sets don't. */
  kind?: "group" | "set";
}

function cls(
  parent: string | null,
  typeMask = 0,
  onAdd: OnAddStyle = "none",
  kind?: "group" | "set",
): EngineClassInfo {
  return { parent, typeMask, onAdd, kind };
}

export const ENGINE_CLASSES = new CaseInsensitiveMap<EngineClassInfo>([
  // ── Core sim classes ──
  ["SimObject", cls(null)],
  ["SimSet", cls("SimObject", 0, "none", "set")],
  ["SimGroup", cls("SimSet", 0, "none", "group")],
  ["ScriptObject", cls("SimObject", 0, "object")],
  ["ScriptGroup", cls("SimGroup", 0, "object", "group")],

  // ── Scene / game objects ──
  ["SceneObject", cls("SimObject")],
  ["GameBase", cls("SceneObject", M.GameBaseObjectType)],
  ["ShapeBase", cls("GameBase", M.ShapeBaseObjectType)],
  [
    "StaticShape",
    cls("ShapeBase", M.StaticShapeObjectType | M.StaticObjectType, "datablock"),
  ],
  ["Item", cls("ShapeBase", M.ItemObjectType, "datablock")],
  ["Player", cls("ShapeBase", M.PlayerObjectType, "datablock")],
  ["Camera", cls("ShapeBase", M.CameraObjectType)],
  ["Turret", cls("StaticShape", M.TurretObjectType, "datablock")],
  ["Vehicle", cls("ShapeBase", M.VehicleObjectType, "datablock")],
  ["WheeledVehicle", cls("Vehicle", 0, "datablock")],
  ["HoverVehicle", cls("Vehicle", 0, "datablock")],
  ["FlyingVehicle", cls("Vehicle", 0, "datablock")],
  ["Trigger", cls("GameBase", M.TriggerObjectType, "datablock")],
  ["PhysicalZone", cls("SceneObject", M.PhysicalZoneObjectType)],
  ["ForceFieldBare", cls("GameBase", M.ForceFieldObjectType, "datablock")],
  // CTFGame.cs notes "there is no MissionMarker::onAdd script call".
  ["MissionMarker", cls("ShapeBase", M.MarkerObjectType | M.StaticObjectType)],
  ["WayPoint", cls("MissionMarker")],
  ["SpawnSphere", cls("MissionMarker")],
  ["VehicleBlocker", cls("SceneObject", M.VehicleBlockerObjectType)],
  [
    "InteriorInstance",
    cls("SceneObject", M.InteriorObjectType | M.StaticObjectType),
  ],
  [
    "TerrainBlock",
    cls("SceneObject", M.TerrainObjectType | M.StaticObjectType),
  ],
  [
    "TSStatic",
    cls("SceneObject", M.TSStaticShapeObjectType | M.StaticObjectType),
  ],
  ["WaterBlock", cls("SceneObject", M.WaterObjectType)],
  ["Sky", cls("SceneObject", M.EnvironmentObjectType)],
  ["Sun", cls("SceneObject", M.EnvironmentObjectType)],
  ["Lightning", cls("SceneObject", M.EnvironmentObjectType)],
  ["Precipitation", cls("SceneObject", M.EnvironmentObjectType)],
  ["AudioEmitter", cls("SceneObject", M.EnvironmentObjectType)],
  ["fxSunLight", cls("SceneObject", M.EnvironmentObjectType)],
  ["ParticleEmissionDummy", cls("SceneObject", M.EnvironmentObjectType)],
  ["MissionArea", cls("SimObject")],
  ["Path", cls("SimGroup", 0, "none", "group")],
  ["Marker", cls("SceneObject")],

  // ── Datablock (data) classes ──
  ["SimDataBlock", cls("SimObject")],
  ["GameBaseData", cls("SimDataBlock")],
  ["ShapeBaseData", cls("GameBaseData")],
  ["StaticShapeData", cls("ShapeBaseData")],
  ["ItemData", cls("ShapeBaseData")],
  ["PlayerData", cls("ShapeBaseData")],
  ["CameraData", cls("ShapeBaseData")],
  ["VehicleData", cls("ShapeBaseData")],
  ["WheeledVehicleData", cls("VehicleData")],
  ["HoverVehicleData", cls("VehicleData")],
  ["FlyingVehicleData", cls("VehicleData")],
  ["TurretData", cls("StaticShapeData")],
  ["MissionMarkerData", cls("ShapeBaseData")],
  ["TriggerData", cls("GameBaseData")],
  ["ForceFieldBareData", cls("GameBaseData")],
  ["PhysicalZoneData", cls("GameBaseData")],
  ["ShapeBaseImageData", cls("GameBaseData")],
  ["ItemImageData", cls("ShapeBaseImageData")],
  ["AudioProfile", cls("SimDataBlock")],
  ["AudioDescription", cls("SimDataBlock")],
  ["EffectProfile", cls("SimDataBlock")],
  ["ParticleData", cls("SimDataBlock")],
  ["ParticleEmitterData", cls("GameBaseData")],
  ["ExplosionData", cls("GameBaseData")],
  ["DebrisData", cls("GameBaseData")],
  ["ProjectileData", cls("GameBaseData")],
  ["TSShapeConstructor", cls("SimDataBlock")],
]);

/**
 * Engine parent for a class name, with fallbacks for unknown (map-pack)
 * classes: datablock-looking names chain to SimDataBlock, everything else
 * to SimObject, so exotic classes stay dispatchable.
 */
export function getEngineParent(name: string): string | null {
  const info = ENGINE_CLASSES.get(name);
  if (info) return info.parent;
  if (/(data|profile|description)$/i.test(name)) return "SimDataBlock";
  return "SimObject";
}

const cumulativeMaskCache = new CaseInsensitiveMap<number>();

/**
 * Full getType() mask for a class: its own bits plus every ancestor's,
 * mirroring how engine constructors accumulate mTypeMask.
 */
export function getClassTypeMask(className: string): number {
  const cached = cumulativeMaskCache.get(className);
  if (cached != null) return cached;
  let mask = 0;
  let current: string | null = className;
  const seen = new Set<string>();
  while (current && !seen.has(current.toLowerCase())) {
    seen.add(current.toLowerCase());
    const info: EngineClassInfo | undefined = ENGINE_CLASSES.get(current);
    if (info) mask = (mask | info.typeMask) >>> 0;
    current = info ? info.parent : null;
  }
  cumulativeMaskCache.set(className, mask);
  return mask;
}

/**
 * How onAdd should fire for an instance of the class. Unknown classes fall
 * back by datablock presence: with a datablock, assume engine GameBase-like
 * semantics; without, ScriptObject-like.
 */
export function getOnAddStyle(
  className: string,
  hasDatablock: boolean,
): OnAddStyle {
  const info = ENGINE_CLASSES.get(className);
  if (info) return info.onAdd;
  return hasDatablock ? "datablock" : "object";
}

/** Whether instances of the class own their children (SimGroup-like). */
export function isGroupClass(className: string): boolean {
  let current: string | null = className;
  const seen = new Set<string>();
  while (current && !seen.has(current.toLowerCase())) {
    seen.add(current.toLowerCase());
    const info: EngineClassInfo | undefined = ENGINE_CLASSES.get(current);
    if (info?.kind) return info.kind === "group";
    current = info ? info.parent : getEngineParent(current);
    if (!info) break;
  }
  return false;
}

/** Whether instances are containers at all (SimSet or SimGroup lineage). */
export function isSetClass(className: string): boolean {
  let current: string | null = className;
  const seen = new Set<string>();
  while (current && !seen.has(current.toLowerCase())) {
    seen.add(current.toLowerCase());
    const info: EngineClassInfo | undefined = ENGINE_CLASSES.get(current);
    if (!info) return false;
    if (info.kind) return true;
    current = info.parent;
  }
  return false;
}
