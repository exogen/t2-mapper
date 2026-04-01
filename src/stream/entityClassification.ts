/**
 * GhostingMessageEvent message types (from NetConnection::GhostMSG enum).
 * Sent by the server to control ghost scope lifecycle.
 */
export const GhostMessage = {
  /** Server finished sending GhostAlways objects. Client must ack. */
  GhostAlwaysDone: 0,
  /** Client acknowledgment of GhostAlwaysDone. */
  GhostAlwaysAck: 1,
  /** EndGhosting — server called resetGhosting, clear all ghosts. */
  EndGhosting: 2,
  /** Server activated ghosting (begins sending scoped ghosts). */
  GhostingActive: 3,
} as const;

/** Class names for vehicle ghosts. */
export const vehicleClassNames = new Set([
  "FlyingVehicle",
  "HoverVehicle",
  "WheeledVehicle",
]);

/** All projectile class names. */
export const projectileClassNames = new Set([
  "BombProjectile",
  "EnergyProjectile",
  "FlareProjectile",
  "GrenadeProjectile",
  "LinearFlareProjectile",
  "LinearProjectile",
  "Projectile",
  "SeekerProjectile",
  "TracerProjectile",
]);

/** Projectile classes with linear (constant-velocity) physics. */
export const linearProjectileClassNames = new Set([
  "LinearProjectile",
  "TracerProjectile",
  "LinearFlareProjectile",
  "Projectile",
]);

/** Projectile classes with ballistic (gravity-affected) physics. */
export const ballisticProjectileClassNames = new Set([
  "GrenadeProjectile",
  "EnergyProjectile",
  "FlareProjectile",
  "BombProjectile",
]);

/** Projectile classes that use seeking (homing) physics. */
export const seekerProjectileClassNames = new Set(["SeekerProjectile"]);

/** Deployable/placed object class names. */
export const deployableClassNames = new Set([
  "StaticShape",
  "ScopeAlwaysShape",
  "Turret",
  "BeaconObject",
  "ForceFieldBare",
]);

/** Map a ghost class name to a high-level entity type string. */
export function toEntityType(className: string): string {
  if (className === "Player") return "Player";
  if (vehicleClassNames.has(className)) return "Vehicle";
  if (className === "Item") return "Item";
  if (projectileClassNames.has(className)) return "Projectile";
  if (deployableClassNames.has(className)) return "Deployable";
  return "Ghost";
}

/** First dynamic object ID, matching Torque's SimObjectId allocation.
 *  IDs 3-1026 are reserved for datablocks (DataBlockObjectIdFirst=3, 1024 slots). */
const FIRST_DYNAMIC_ID = 1027;

let _nextEntityId = FIRST_DYNAMIC_ID;

/** Reset the entity ID counter (e.g. on mission/recording change). */
export function resetEntityIdCounter(): void {
  _nextEntityId = FIRST_DYNAMIC_ID;
}

/** Allocate the next sequential entity ID, mimicking Torque's registerObject. */
export function allocateEntityId(): string {
  return String(_nextEntityId++);
}

/** Tribes 2 default IFF colors (sRGB 0-255). */
export const IFF_GREEN = Object.freeze({ r: 0, g: 255, b: 0 });
export const IFF_RED = Object.freeze({ r: 255, g: 0, b: 0 });

/** Torque engine tick duration in milliseconds. */
export const TICK_DURATION_MS = 32;
