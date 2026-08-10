import type { GameEntity, ShapeEntity } from "../state/gameEntityTypes";
import type { TorqueObject } from "../torqueScript/types";
import type { CaseInsensitiveMap } from "../torqueScript/utils";
import { getGameName } from "../stringUtils";

export interface TourTarget {
  entityId: string;
  label: string;
  position: [number, number, number];
  teamId?: number;
}

export interface TourCategory {
  name: string;
  targets: TourTarget[];
}

/** Map from lowercase dataBlock name → category display name. */
const DATABLOCK_TO_CATEGORY = new Map<string, string>([
  // Flags
  ["flag", "Flags"],
  ["huntersflag1", "Flags"],
  ["huntersflag2", "Flags"],
  ["huntersflag4", "Flags"],
  ["huntersflag8", "Flags"],
  // Stations
  ["stationinventory", "Inventory Stations"],
  ["stationammo", "Inventory Stations"],
  ["mobileinvstation", "Inventory Stations"],
  // Vehicle pads
  ["stationvehiclepad", "Vehicle Pads"],
  ["stationvehicle", "Vehicle Pads"],
  // Generators
  ["generatorlarge", "Generators"],
  ["solarpanel", "Generators"],
  // Sensors
  ["sensorlargepulse", "Sensors"],
  ["sensormediumpulse", "Sensors"],
  // Turrets
  ["turretbaselarge", "Turrets"],
  ["sentryturret", "Turrets"],
  // Repair & support items
  ["repairpatch", "Health"],
  ["repairkit", "Health"],
  // Packs
  ["ammopack", "Packs"],
  ["energypack", "Packs"],
  ["shieldpack", "Packs"],
  ["repairpack", "Packs"],
  ["cloakingpack", "Packs"],
  ["sensorjammerpack", "Packs"],
  // Turret barrel packs
  ["aabarrelpack", "Packs"],
  ["elfbarrelpack", "Packs"],
  ["missilebarrelpack", "Packs"],
  ["mortarbarrelpack", "Packs"],
  ["plasmabarrelpack", "Packs"],
  // Deployable packs
  ["inventorydeployable", "Packs"],
  ["motionsensordeployable", "Packs"],
  ["pulsesensordeployable", "Packs"],
  ["turretoutdoordeployable", "Packs"],
  ["turretindoordeployable", "Packs"],
  ["satchelcharge", "Weapons"],
  // Weapons
  ["blaster", "Weapons"],
  ["chaingun", "Weapons"],
  ["disc", "Weapons"],
  ["grenadelauncher", "Weapons"],
  ["elfgun", "Weapons"],
  ["missilelauncher", "Weapons"],
  ["mortar", "Weapons"],
  ["plasma", "Weapons"],
  ["shocklance", "Weapons"],
  ["sniperrifle", "Weapons"],
  ["targetinglaser", "Weapons"],
  // Ammo
  ["chaingunammo", "Ammo"],
  ["discammo", "Ammo"],
  ["grenadelauncherammo", "Ammo"],
  ["missilelauncherammo", "Ammo"],
  ["mortarammo", "Ammo"],
  ["plasmaammo", "Ammo"],
  ["bombammo", "Ammo"],
  ["assaultmortarammo", "Ammo"],
  // Throwables & mines
  ["grenade", "Ammo"],
  ["concussiongrenade", "Ammo"],
  ["flashgrenade", "Ammo"],
  ["flaregrenade", "Ammo"],
  ["cameragrenade", "Ammo"],
  ["mine", "Ammo"],
  ["beacon", "Ammo"],
  // Switches
  ["flipflop", "Switches"],
  // Nexus
  ["nexus", "Nexus"],
  ["nexusbase", "Nexus"],
  ["nexuscap", "Nexus"],
]);

/** Display order for categories. */
const CATEGORY_ORDER = [
  "Flags",
  "Inventory Stations",
  "Generators",
  "Vehicle Pads",
  "Turrets",
  "Sensors",
  "Nexus",
  "Switches",
  "Packs",
  "Health",
  "Weapons",
  "Ammo",
];

function isShapeWithDataBlock(entity: GameEntity): entity is ShapeEntity & {
  dataBlock: string;
  position: [number, number, number];
} {
  return (
    entity.renderType === "Shape" &&
    typeof (entity as ShapeEntity).dataBlock === "string" &&
    (entity as ShapeEntity).dataBlock !== "" &&
    Array.isArray((entity as ShapeEntity).position)
  );
}

export function categorizeEntities(
  entities: Map<string, GameEntity>,
  datablocks?: CaseInsensitiveMap<TorqueObject>,
): TourCategory[] {
  const groups = new Map<string, TourTarget[]>();

  for (const entity of entities.values()) {
    if (entity.hidden || entity.debugHidden) continue;
    if (!isShapeWithDataBlock(entity)) continue;
    const category = DATABLOCK_TO_CATEGORY.get(entity.dataBlock.toLowerCase());
    if (!category) continue;

    let label = entity.dataBlock;
    if (datablocks && entity.runtimeObject) {
      const gameName = getGameName(
        entity.runtimeObject as TorqueObject,
        datablocks,
      );
      if (gameName) label = gameName;
    }

    let targets = groups.get(category);
    if (!targets) {
      targets = [];
      groups.set(category, targets);
    }

    targets.push({
      entityId: entity.id,
      label,
      position: entity.position,
      teamId: entity.teamId,
    });
  }

  // Return in display order, only non-empty categories.
  const result: TourCategory[] = [];
  for (const name of CATEGORY_ORDER) {
    const targets = groups.get(name);
    if (targets && targets.length > 0) {
      targets.sort((a, b) => {
        const cmp = (a.teamId ?? 0) - (b.teamId ?? 0);
        if (cmp !== 0) return cmp;
        return a.label.localeCompare(b.label);
      });
      result.push({ name, targets });
    }
  }
  return result;
}
