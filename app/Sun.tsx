import { ConsoleObject, getProperty } from "@/src/mission";
import { useMemo } from "react";
import { Color } from "three";

export function Sun({ object }: { object: ConsoleObject }) {
  const direction = useMemo(() => {
    const directionStr = getProperty(object, "direction")?.value ?? "0 0 -1";
    const [x, y, z] = directionStr.split(" ").map((s) => parseFloat(s));
    // Scale the direction vector to position the light far from the scene
    const scale = 5000;
    return [x * scale, y * scale, z * scale] as [number, number, number];
  }, [object]);

  const color = useMemo(() => {
    const colorStr = getProperty(object, "color")?.value ?? "1 1 1 1";
    const [r, g, b] = colorStr.split(" ").map((s) => parseFloat(s));
    return [r, g, b] as [number, number, number];
  }, [object]);

  const ambient = useMemo(() => {
    const ambientStr = getProperty(object, "ambient")?.value ?? "0.5 0.5 0.5 1";
    const [r, g, b] = ambientStr.split(" ").map((s) => parseFloat(s));
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
