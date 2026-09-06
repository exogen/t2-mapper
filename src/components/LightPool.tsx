import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Vector2, Vector3, type Camera, type PerspectiveCamera } from "three";
import {
  dynamicLightScreenFade,
  EFFECT_LIGHT_COUNT,
  effectLightUniforms,
  ensureEffectLightFalloff,
} from "../effectLightUniforms";
import {
  shapeInteriorWorldDir,
  shapeSunUniforms,
  shapeSunWorldDir,
} from "../shapeLighting";
import { effectLights, type EffectLight } from "./effectLights";
import { isVisibleInHierarchy } from "../objectUtils";

const _viewPosition = new Vector3();
const _viewDir = new Vector3();
const _viewportSize = new Vector2();

/**
 * The engine's projected light radius in pixels: radius / distance ×
 * viewport height / (2 tan(fov/2)). Orthographic views have no such fade.
 */
function screenSizeFade(
  light: EffectLight,
  camera: Camera,
  viewportHeight: number,
): number {
  if (!(camera as PerspectiveCamera).isPerspectiveCamera) return 1;
  const pixelsPerUnit =
    viewportHeight * 0.5 * camera.projectionMatrix.elements[5];
  const distance = light.position.distanceTo(camera.position);
  return dynamicLightScreenFade(
    (light.radius / Math.max(distance, 1e-3)) * pixelsPerUnit,
  );
}

/**
 * Fills the shared light uniforms from the effect-light registry before
 * each render: the nearest active lights take the EFFECT_LIGHT_COUNT slots
 * (the farthest from the camera are dropped, as the game prioritized
 * lights; shapes apply them
 * as GL-style point lights at radius/d, terrain and interiors as the
 * engine's projected falloff-disc pass), and the sun and indoor light
 * directions are brought into view space for the shape shader. No Three
 * lights are involved, so nothing here ever recompiles a material.
 *
 * Runs from the scene's onBeforeRender rather than useFrame: Three calls it
 * after every frame callback has moved the shapes and after the scene's
 * world matrices are refreshed, but before any material's uniforms upload —
 * so each light sits exactly where its shape is drawn this frame instead
 * of lagging a frame or two behind a fast projectile.
 */
export function LightPool() {
  const scene = useThree((state) => state.scene);
  const activeRef = useRef<EffectLight[]>([]);

  useEffect(() => {
    ensureEffectLightFalloff();
  }, []);

  useEffect(() => {
    const previous = scene.onBeforeRender;
    scene.onBeforeRender = function (this: unknown, ...args) {
      previous.apply(this, args);
      const [renderer, , camera] = args;
      const active = activeRef.current;
      active.length = 0;
      for (const light of effectLights()) {
        // A shape the engine does not draw registers no light: Projectile
        // explode sets the hidden flag before anything else and
        // registerLights (0x6323d0) is gated on it, so the light dies in
        // the tick the explosion starts, not when the ghost is removed.
        if (light.intensity <= 0 || !isVisibleInHierarchy(light.anchor)) {
          continue;
        }
        light.position
          .copy(light.offset)
          .applyMatrix4(light.anchor.matrixWorld);
        active.push(light);
      }
      // Only prioritize by camera distance when we have to drop some — with
      // few enough lights they all fit and the order is irrelevant.
      if (active.length > EFFECT_LIGHT_COUNT) {
        const camPos = camera.position;
        active.sort(
          (a, b) =>
            a.position.distanceToSquared(camPos) -
            b.position.distanceToSquared(camPos),
        );
      }
      const viewportHeight = renderer.getDrawingBufferSize(_viewportSize).y;
      const viewPositions = effectLightUniforms.effectLightViewPosition.value;
      const colors = effectLightUniforms.effectLightColor.value;
      const fades = effectLightUniforms.effectLightFade.value;
      const radii = effectLightUniforms.effectLightRadius.value;
      for (let i = 0; i < EFFECT_LIGHT_COUNT; i++) {
        const src = active[i];
        if (!src) {
          radii[i] = 0;
          continue;
        }
        _viewPosition
          .copy(src.position)
          .applyMatrix4(camera.matrixWorldInverse);
        viewPositions[i * 3] = _viewPosition.x;
        viewPositions[i * 3 + 1] = _viewPosition.y;
        viewPositions[i * 3 + 2] = _viewPosition.z;
        colors[i * 3] = src.color.r * src.intensity;
        colors[i * 3 + 1] = src.color.g * src.intensity;
        colors[i * 3 + 2] = src.color.b * src.intensity;
        fades[i] = screenSizeFade(src, camera, viewportHeight);
        radii[i] = src.radius;
      }
      // Directions are world-space vectors; the shape shader lights in view space.
      shapeSunUniforms.shapeSunViewDir.value.copy(
        _viewDir
          .copy(shapeSunWorldDir)
          .transformDirection(camera.matrixWorldInverse),
      );
      shapeSunUniforms.shapeInteriorViewDir.value.copy(
        _viewDir
          .copy(shapeInteriorWorldDir)
          .transformDirection(camera.matrixWorldInverse),
      );
    };
    return () => {
      scene.onBeforeRender = previous;
    };
  }, [scene]);

  return null;
}
