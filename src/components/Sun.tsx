import { useMemo } from "react";
import { Color, Vector3 } from "three";
import type { TorqueObject } from "../torqueScript";
import { getProperty } from "../mission";

export function Sun({ object }: { object: TorqueObject }) {
  // Parse sun direction - points FROM sun TO scene
  // Torque uses Z-up, Three.js uses Y-up
  const direction = useMemo(() => {
    const directionStr =
      getProperty(object, "direction") ?? "0.57735 0.57735 -0.57735";
    const [tx, ty, tz] = directionStr
      .split(" ")
      .map((s: string) => parseFloat(s));
    // Convert Torque (X, Y, Z) to Three.js:
    // Swap Y/Z for coordinate system: (tx, ty, tz) -> (tx, tz, ty)
    const x = tx;
    const y = tz;
    const z = ty;
    const len = Math.sqrt(x * x + y * y + z * z);
    return new Vector3(x / len, y / len, z / len);
  }, [object]);

  // Position light far away, opposite to direction (light shines FROM position)
  const lightPosition = useMemo(() => {
    const distance = 5000;
    return new Vector3(
      -direction.x * distance,
      -direction.y * distance,
      -direction.z * distance,
    );
  }, [direction]);

  const color = useMemo(() => {
    const colorStr = getProperty(object, "color") ?? "0.7 0.7 0.7 1";
    const [r, g, b] = colorStr.split(" ").map((s: string) => parseFloat(s));
    return new Color(r, g, b);
  }, [object]);

  const ambient = useMemo(() => {
    const ambientStr = getProperty(object, "ambient") ?? "0.5 0.5 0.5 1";
    const [r, g, b] = ambientStr.split(" ").map((s: string) => parseFloat(s));
    return new Color(r, g, b);
  }, [object]);

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
        shadow-mapSize-width={8192}
        shadow-mapSize-height={8192}
        shadow-camera-left={-shadowCameraSize}
        shadow-camera-right={shadowCameraSize}
        shadow-camera-top={shadowCameraSize}
        shadow-camera-bottom={-shadowCameraSize}
        shadow-camera-near={100}
        shadow-camera-far={12000}
        shadow-bias={-0.0003}
        shadow-normalBias={0.5}
      />
      {/* Ambient fill light - prevents pure black shadows */}
      <ambientLight color={ambient} intensity={ambientIntensity} />
    </>
  );
}
