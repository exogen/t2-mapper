import { AmbientLight, Color, DirectionalLight, Vector3 } from "three";
import { createLogger } from "../logger";
import { gameEntityStore, selectSunData } from "../state/gameEntityStore";
import type { SceneSun } from "../scene/types";
import { torqueToThree } from "../scene/coordinates";
import { updateGlobalSunUniforms } from "../globalSunUniforms";
import { setShapeSun } from "../shapeLighting";
import { onShadowBoundsChanged, shadowCasterSphere } from "../shadowBounds";
import { invalidateShadows } from "./shadowControl";
import { combineCleanups, reaction } from "./storeReaction";
import type { GameEngine } from "./gameEngine";

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
 * Scene-global lights (directional sun + ambient) from the mission's Sun
 * entity, or a neutral ambient until there is one. Shapes light
 * themselves from the same sun (setShapeSun); the directional light is
 * for interiors and the shadow map they receive.
 */
export function installSceneLighting(engine: GameEngine): () => void {
  const fallbackAmbient = new AmbientLight("#888888", 1);
  const ambient = new AmbientLight(0xffffff, 1);
  const sun = new DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  sun.shadow.bias = -0.00001;
  sun.shadow.radius = 1;
  const direction = new Vector3();
  let sunData: SceneSun | null = null;

  // Fit the ortho shadow frustum to what actually casts. A fixed box wasted
  // most of the map's texels on empty space, and the resulting coarse texels
  // are what force a large normalBias, which is in turn what detaches a
  // shadow from the thing casting it. Before any caster has registered (the
  // terrain is still loading) this falls back to a fixed box, so the light
  // is always somewhere sensible.
  const fitShadow = () => {
    const sphere = shadowCasterSphere();
    const center = sphere ? sphere.center : new Vector3(0, 0, 0);
    const radius = sphere ? sphere.radius : FALLBACK_SHADOW_RADIUS;
    const distance = Math.max(radius * 2, 1000);
    // The light sits back along the sun direction from the centre of what
    // it has to cover, which is what makes the ortho frustum symmetric.
    sun.position.copy(center).addScaledVector(direction, -distance);
    // `target` is not part of the scene graph, so its world matrix has to
    // be updated by hand; it never moves again afterwards.
    sun.target.position.copy(center);
    sun.target.updateMatrixWorld();
    const camera = sun.shadow.camera;
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
    sun.shadow.normalBias = Math.max(texelSize * 0.2, 0.02);
    // The shadow map is frozen (see shadowControl.ts); re-render it when
    // the light itself changes.
    invalidateShadows();
    log.debug(
      "shadow camera fitted: radius %d m, texel %s m, normalBias %s",
      Math.round(radius),
      texelSize.toFixed(2),
      sun.shadow.normalBias.toFixed(3),
    );
  };

  const applySun = (data: SceneSun) => {
    log.debug(
      "sunData: dir=(%s, %s, %s) color=(%s, %s, %s) ambient=(%s, %s, %s)",
      data.direction.x.toFixed(3),
      data.direction.y.toFixed(3),
      data.direction.z.toFixed(3),
      data.color.r.toFixed(3),
      data.color.g.toFixed(3),
      data.color.b.toFixed(3),
      data.ambient.r.toFixed(3),
      data.ambient.g.toFixed(3),
      data.ambient.b.toFixed(3),
    );
    const [x, y, z] = torqueToThree(data.direction);
    direction.set(x, y, z).normalize();
    sun.color.copy(new Color(data.color.r, data.color.g, data.color.b));
    ambient.color.copy(
      new Color(data.ambient.r, data.ambient.g, data.ambient.b),
    );
    updateGlobalSunUniforms(direction.y < 0);
    // Shapes light themselves from the sun's colour, ambient and direction
    // (toward the light) rather than from Three's directional light.
    setShapeSun(sun.color, ambient.color, direction.clone().negate());
    fitShadow();
  };

  return engine.withHost(({ scene }) => {
    const showLights = (data: SceneSun | null) => {
      if (data) {
        scene.remove(fallbackAmbient);
        scene.add(sun, ambient);
      } else {
        log.debug("No sunData — using fallback ambient #888");
        scene.remove(sun, ambient);
        scene.add(fallbackAmbient);
      }
    };
    return combineCleanups(
      () => scene.remove(fallbackAmbient, sun, ambient),
      reaction(gameEntityStore, selectSunData, (data) => {
        sunData = data;
        if (data) applySun(data);
        showLights(data);
      }),
      // Re-fits whenever a caster's bounds change (the terrain loading).
      onShadowBoundsChanged(() => {
        if (sunData) fitShadow();
      }),
      () => sun.dispose(),
    );
  });
}
