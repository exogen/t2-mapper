/**
 * Sun occlusion of the terrain by buildings, for the terrain lightmap bake.
 *
 * Tribes2.exe does exactly this at mission load: SceneLighting's
 * TerrainProxy::light (FUN_0057bb90) collects every InteriorObjectType in
 * the scene into a shadow volume and sweeps the sun across the heightfield,
 * writing the result into the terrain lightmap. Baking it means there is no
 * depth comparison at runtime, so building shadows on the ground cannot
 * show acne and need no bias to push them off the surface.
 */
import { Box3, Ray, Vector3 } from "three";
import {
  castInteriorRay,
  interiorWorldBounds,
} from "./collision/worldCollision";

/** Three (x, y, z) → Torque (z, x, y), matching torqueToThree's inverse. */
function toTorque(x: number, y: number, z: number): [number, number, number] {
  return [z, x, y];
}

/**
 * A test for "does a building stand between this terrain point and the
 * sun?", in Three-space coordinates, or null when nothing can cast: no
 * interiors registered, or a sun at or below the horizon.
 *
 * Rays are only cast for points whose sun ray meets the interiors' union
 * box, so the great majority of a map's texels cost one box test.
 */
export function createInteriorSunOccluder(
  lightDir: Vector3,
): ((x: number, y: number, z: number) => boolean) | null {
  const bounds = interiorWorldBounds(new Box3());
  if (!bounds || lightDir.y <= 0) return null;
  const ray = new Ray(new Vector3(), lightDir.clone().normalize());
  const dir = ray.direction;
  return (x: number, y: number, z: number): boolean => {
    // Above every roof: nothing can be between this point and the sun.
    if (y > bounds.max.y) return false;
    ray.origin.set(x, y, z);
    if (!ray.intersectsBox(bounds)) return false;
    // Stop the segment once it has climbed past the tallest interior.
    const dist = (bounds.max.y - y) / dir.y + 1;
    return (
      castInteriorRay(
        toTorque(x, y, z),
        toTorque(x + dir.x * dist, y + dir.y * dist, z + dir.z * dist),
      ) !== null
    );
  };
}
