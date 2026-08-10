import { useEffect, useMemo } from "react";
import { Color, Vector3 } from "three";
import type { SceneSun } from "../scene/types";
import { torqueToThree } from "../scene/coordinates";
import { updateGlobalSunUniforms } from "../globalSunUniforms";
import { invalidateShadows } from "./shadowControl";

export function Sun({ scene }: { scene: SceneSun }) {
  // Sun direction - points FROM sun TO scene
  // Convert Torque (X-right, Y-forward, Z-up) to Three.js (X-right, Y-up, Z-backward)
  const direction = useMemo(() => {
    const [x, y, z] = torqueToThree(scene.direction);
    const len = Math.sqrt(x * x + y * y + z * z);
    return new Vector3(x / len, y / len, z / len);
  }, [scene.direction]);

  // Position light far away, opposite to direction (light shines FROM position)
  const lightPosition = useMemo(() => {
    const distance = 5000;
    return new Vector3(
      -direction.x * distance,
      -direction.y * distance,
      -direction.z * distance,
    );
  }, [direction]);

  const color = useMemo(
    () => new Color(scene.color.r, scene.color.g, scene.color.b),
    [scene.color],
  );

  const ambient = useMemo(
    () => new Color(scene.ambient.r, scene.ambient.g, scene.ambient.b),
    [scene.ambient],
  );

  // Torque lighting check (terrLighting.cc): if light direction points up,
  // terrain surfaces with upward normals receive only ambient light.
  // direction.y < 0 means light pointing down (toward ground)
  const sunLightPointsDown = direction.y < 0;

  // Update global uniform so terrain shader knows the light direction
  useEffect(() => {
    updateGlobalSunUniforms(sunLightPointsDown);
  }, [sunLightPointsDown]);

  // The shadow map is frozen (see shadowControl.ts); re-render it when the
  // light itself changes.
  useEffect(() => {
    invalidateShadows();
  }, [lightPosition]);

  // Base lighting intensities - neutral baseline, each object type applies its own multipliers
  // See lightingConfig.ts for per-object-type adjustments
  const directionalIntensity = 1.0;
  const ambientIntensity = 1.0;

  // Shadow camera covers the entire terrain (Tribes 2 terrains are typically 2048+ units)
  const shadowCameraSize = 4096;

  return (
    <>
      {/* Directional sun light - illuminates surfaces facing the sun */}
      <directionalLight
        position={lightPosition}
        color={color}
        intensity={directionalIntensity}
        castShadow
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-left={-shadowCameraSize}
        shadow-camera-right={shadowCameraSize}
        shadow-camera-top={shadowCameraSize}
        shadow-camera-bottom={-shadowCameraSize}
        shadow-camera-near={100}
        shadow-camera-far={12000}
        shadow-bias={-0.00001}
        shadow-normalBias={0.4}
        shadow-radius={2}
      />
      {/* Ambient fill light - prevents pure black shadows */}
      <ambientLight color={ambient} intensity={ambientIntensity} />
    </>
  );
}
