import { useMemo } from "react";
import { Color } from "three";
import type { TorqueObject } from "../torqueScript";
import { getProperty } from "../mission";

export function Sun({ object }: { object: TorqueObject }) {
  const direction = useMemo(() => {
    const directionStr = getProperty(object, "direction") ?? "0 0 -1";
    // Note: This is a space-separated string, so we split and parse each component.
    const [x, y, z] = directionStr.split(" ").map((s: string) => parseFloat(s));
    // Scale the direction vector to position the light far from the scene
    const scale = 5000;
    return [x * scale, y * scale, z * scale] as [number, number, number];
  }, [object]);

  const color = useMemo(() => {
    const colorStr = getProperty(object, "color") ?? "1 1 1 1";
    // Note: This is a space-separated string, so we split and parse each component.
    const [r, g, b] = colorStr.split(" ").map((s: string) => parseFloat(s));
    return [r, g, b] as [number, number, number];
  }, [object]);

  const ambient = useMemo(() => {
    const ambientStr = getProperty(object, "ambient") ?? "0.5 0.5 0.5 1";
    // Note: This is a space-separated string, so we split and parse each component.
    const [r, g, b] = ambientStr.split(" ").map((s: string) => parseFloat(s));
    return [r, g, b] as [number, number, number];
  }, [object]);

  return (
    <>
      {/* Directional light for the sun */}
      {/* <directionalLight
        position={[500, 500, 500]}
        target-position={direction}
        color={color}
        intensity={2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-2000}
        shadow-camera-right={2000}
        shadow-camera-top={2000}
        shadow-camera-bottom={-2000}
        shadow-camera-near={0.5}
        shadow-camera-far={5000}
        shadow-bias={-0.001}
      /> */}
      {/* Ambient light component */}
      <hemisphereLight args={[new Color(...color), new Color(...ambient), 2]} />
    </>
  );
}
