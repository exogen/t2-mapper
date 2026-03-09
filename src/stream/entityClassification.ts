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

/** Generate a stable entity ID from ghost class name and index. */
export function toEntityId(className: string, ghostIndex: number): string {
  return `${className}_${ghostIndex}`;
}

/** Tribes 2 default IFF colors (sRGB 0-255). */
export const IFF_GREEN = Object.freeze({ r: 0, g: 255, b: 0 });
export const IFF_RED = Object.freeze({ r: 255, g: 0, b: 0 });

/** Torque engine tick duration in milliseconds. */
export const TICK_DURATION_MS = 32;
