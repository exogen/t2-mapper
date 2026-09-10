import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { Color, Vector3 } from "three";
import type { DirectionalLight } from "three";
import { createLogger } from "../logger";
import { useSceneSun } from "../state/gameEntityStore";
import { torqueToThree } from "../scene/coordinates";
import { updateGlobalSunUniforms } from "../globalSunUniforms";
import { setShapeSun } from "../shapeLighting";
import { invalidateShadows } from "./shadowControl";
import { onShadowBoundsChanged, shadowCasterSphere } from "../shadowBounds";

const log = createLogger("SceneLighting");

/**
 * Only interiors receive this shadow map now — the ground's shadows are
 * baked into the terrain lightmap (see terrainLightmap.ts) — but terrain
 * still casts into it, so a hill can shade a building.
 */
const SHADOW_MAP_SIZE = 4096;

/** Frustum radius used until a caster registers its bounds. */
const FALLBACK_SHADOW_RADIUS = 4096;

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

  // Re-fits whenever a caster's bounds change (the terrain block loading).
  const sphere = useSyncExternalStore(
    onShadowBoundsChanged,
    shadowCasterSphere,
    shadowCasterSphere,
  );

  // What the shadow frustum has to cover. Before any caster has registered
  // (the terrain is still loading) this falls back to the old fixed box, so
  // the light is always somewhere sensible.
  const shadowFit = useMemo(() => {
    const center = sphere ? sphere.center : new Vector3(0, 0, 0);
    const radius = sphere ? sphere.radius : FALLBACK_SHADOW_RADIUS;
    return { center, radius, distance: Math.max(radius * 2, 1000) };
  }, [sphere]);

  // The light sits back along the sun direction from the centre of what it
  // has to cover, which is what makes the ortho frustum below symmetric.
  const lightPosition = useMemo(
    () =>
      new Vector3(
        shadowFit.center.x - direction.x * shadowFit.distance,
        shadowFit.center.y - direction.y * shadowFit.distance,
        shadowFit.center.z - direction.z * shadowFit.distance,
      ),
    [direction, shadowFit],
  );

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
    setShapeSun(color, ambient, direction.clone().negate());
  }, [color, ambient, direction]);

  // The shadow map is frozen (see shadowControl.ts); re-render it when the
  // light itself changes.
  useEffect(() => {
    invalidateShadows();
  }, [lightPosition]);

  const lightRef = useRef<DirectionalLight>(null);

  // Fit the ortho shadow frustum to what actually casts. A fixed box wasted
  // most of the map's texels on empty space, and the resulting coarse texels
  // are what force a large normalBias, which is in turn what detaches a
  // shadow from the thing casting it.
  //
  // The light's own position is a prop (above), so this only sets what r3f
  // cannot: the target and the shadow camera. `target` is not part of the
  // scene graph, so its world matrix has to be updated by hand; it never
  // moves again afterwards.
  useEffect(() => {
    const light = lightRef.current;
    if (!light) return;
    const { center, radius, distance } = shadowFit;
    light.target.position.copy(center);
    light.target.updateMatrixWorld();
    const camera = light.shadow.camera;
    camera.left = -radius;
    camera.right = radius;
    camera.top = radius;
    camera.bottom = -radius;
    camera.near = Math.max(distance - radius, 1);
    camera.far = distance + radius;
    camera.updateProjectionMatrix();
    // Bias scales with texel size: it exists to push the comparison past a
    // texel's worth of depth error, and it is what detaches a shadow from
    // its caster, so a tighter frustum has to spend less of it. The old
    // fixed 0.4 was a fifth of the old 2 m texel; keep that ratio.
    const texelSize = (radius * 2) / SHADOW_MAP_SIZE;
    light.shadow.normalBias = Math.max(texelSize * 0.2, 0.02);
    invalidateShadows();
    log.debug(
      "shadow camera fitted: radius %d m, texel %s m, normalBias %s",
      Math.round(radius),
      texelSize.toFixed(2),
      light.shadow.normalBias.toFixed(3),
    );
  }, [shadowFit]);

  return (
    <>
      <directionalLight
        ref={lightRef}
        position={lightPosition}
        color={color}
        intensity={1.0}
        castShadow
        shadow-mapSize-width={SHADOW_MAP_SIZE}
        shadow-mapSize-height={SHADOW_MAP_SIZE}
        shadow-bias={-0.00001}
        shadow-radius={1}
      />
      <ambientLight color={ambient} intensity={1.0} />
    </>
  );
}
