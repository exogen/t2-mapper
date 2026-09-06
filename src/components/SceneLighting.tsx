import { useEffect, useMemo } from "react";
import { Color, Vector3 } from "three";
import { createLogger } from "../logger";
import { useSceneSun } from "../state/gameEntityStore";
import { torqueToThree } from "../scene/coordinates";
import { updateGlobalSunUniforms } from "../globalSunUniforms";
import { setShapeSun } from "../shapeLighting";
import { invalidateShadows } from "./shadowControl";

const log = createLogger("SceneLighting");

/**
 * Renders scene-global lights (directional sun + ambient) derived from the
 * Sun entity in the game entity store. Rendered outside EntityScene so that
 * lights are siblings of the scene graph root rather than buried inside a
 * group — works around r3f reconciliation issues where lights added inside
 * dynamically-populated groups sometimes fail to illuminate existing meshes.
 */
export function SceneLighting() {
  const sunData = useSceneSun();

  useEffect(() => {
    if (sunData) {
      log.debug(
        "sunData: dir=(%s, %s, %s) color=(%s, %s, %s) ambient=(%s, %s, %s)",
        sunData.direction.x.toFixed(3),
        sunData.direction.y.toFixed(3),
        sunData.direction.z.toFixed(3),
        sunData.color.r.toFixed(3),
        sunData.color.g.toFixed(3),
        sunData.color.b.toFixed(3),
        sunData.ambient.r.toFixed(3),
        sunData.ambient.g.toFixed(3),
        sunData.ambient.b.toFixed(3),
      );
    } else {
      log.debug("No sunData — using fallback ambient #888");
    }
  }, [sunData]);

  if (!sunData) {
    // Fallback lighting when no Sun entity exists yet
    return <ambientLight color="#888888" intensity={1.0} />;
  }

  return <SunLighting sunData={sunData} />;
}

function SunLighting({
  sunData,
}: {
  sunData: NonNullable<ReturnType<typeof useSceneSun>>;
}) {
  const direction = useMemo(() => {
    const [x, y, z] = torqueToThree(sunData.direction);
    const len = Math.sqrt(x * x + y * y + z * z);
    return new Vector3(x / len, y / len, z / len);
  }, [sunData.direction]);

  const lightPosition = useMemo(() => {
    const distance = 5000;
    return new Vector3(
      -direction.x * distance,
      -direction.y * distance,
      -direction.z * distance,
    );
  }, [direction]);

  const color = useMemo(
    () => new Color(sunData.color.r, sunData.color.g, sunData.color.b),
    [sunData.color],
  );

  const ambient = useMemo(
    () => new Color(sunData.ambient.r, sunData.ambient.g, sunData.ambient.b),
    [sunData.ambient],
  );

  const sunLightPointsDown = direction.y < 0;

  useEffect(() => {
    updateGlobalSunUniforms(sunLightPointsDown);
  }, [sunLightPointsDown]);

  // Shapes light themselves from the sun's colour, ambient and direction
  // (toward the light) rather than from Three's directional light.
  useEffect(() => {
    setShapeSun(color, ambient, lightPosition);
  }, [color, ambient, lightPosition]);

  // The shadow map is frozen (see shadowControl.ts); re-render it when the
  // light itself changes.
  useEffect(() => {
    invalidateShadows();
  }, [lightPosition]);

  const shadowCameraSize = 4096;

  return (
    <>
      <directionalLight
        position={lightPosition}
        color={color}
        intensity={1.0}
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
      <ambientLight color={ambient} intensity={1.0} />
    </>
  );
}
