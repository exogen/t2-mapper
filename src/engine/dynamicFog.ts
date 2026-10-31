import { Fog, type PerspectiveCamera } from "three";
import { installCustomFogShader } from "../fogShader";
import {
  globalFogUniforms,
  packFogVolumeData,
  resetGlobalFogUniforms,
  updateGlobalFogUniforms,
} from "../globalFogUniforms";
import type { FogState } from "./fogState";
import { FramePriority } from "./framePriority";
import { combineCleanups } from "./storeReaction";
import type { GameEngine } from "./gameEngine";

/**
 * three.js's PerspectiveCamera default — restored whenever fog is off.
 */
const DEFAULT_CAMERA_FAR = 2000;

// Track if fog shader has been installed (idempotent installation)
let fogShaderInstalled = false;

/**
 * Clip the perspective camera at `far` (the engine's far plane is
 * visibleDistance).
 */
function setPerspectiveFar(perspective: PerspectiveCamera, far: number): void {
  if (perspective.far === far) return;
  perspective.far = far;
  perspective.updateProjectionMatrix();
}

/**
 * Get fog near/far parameters for the distance-based haze.
 *
 * IMPORTANT: In Torque, the distance-based haze ALWAYS uses the global
 * fogDistance and visibleDistance parameters. Per-volume fog contributions
 * are calculated separately in the volumetric fog shader and ADDED to haze.
 *
 * The shader's haze formula reads fogNear/fogFar from scene.fog, so these
 * must be the global parameters, NOT per-volume adjusted values.
 */
function calculateFogParameters(fogState: FogState): [number, number] {
  const { fogDistance, visibleDistance } = fogState;
  // Always return global fog parameters for the haze calculation.
  // Volumetric fog from fog volumes is computed separately in the shader
  // and added to the haze value.
  return [fogDistance, visibleDistance];
}

export interface DynamicFog {
  /**
   * Show or hide the fog. Disabled fog keeps `scene.fog` (removing it
   * would recompile every fogged shader) but pushes it out to 1e10.
   */
  setEnabled(enabled: boolean): void;
  dispose(): void;
}

/**
 * Torque-style fog for a mission's sky:
 * - three.js Fog on the scene with the global fogDistance/visibleDistance
 *   for haze, and the perspective camera clipped at the haze's far end;
 * - the camera height for the volumetric fog shaders, every frame;
 * - the global fog uniforms reset when it starts and when it's disposed.
 *
 * The custom fog shader (fogFragmentShader) handles:
 * 1. Haze: Distance-based quadratic fog using global parameters
 * 2. Volume fog: Height-based fog using per-volume parameters
 * Both are combined additively, matching Torque's getHazeAndFog function.
 */
export function createDynamicFog(
  engine: GameEngine,
  fogState: FogState,
  enabled: boolean,
): DynamicFog {
  const perspective = engine.cameras.perspective;
  let fog: Fog | null = null;

  if (!fogShaderInstalled) {
    installCustomFogShader();
    fogShaderInstalled = true;
  }

  // Pack fog volume data once (it doesn't change during runtime)
  const fogVolumeData = packFogVolumeData(fogState.fogVolumes);

  const applyEnabled = () => {
    if (!fog) return;
    if (enabled) {
      const [near, far] = calculateFogParameters(fogState);
      fog.near = near;
      fog.far = far;
    } else {
      // Setting near = far = large value effectively disables fog
      // (fog factor = 0 when distance < near)
      fog.near = 1e10;
      fog.far = 1e10;
      setPerspectiveFar(perspective, DEFAULT_CAMERA_FAR);
    }
  };

  const dispose = combineCleanups(
    engine.withHost(({ scene }) => {
      // Reset global fog uniforms to ensure clean state for new mission
      resetGlobalFogUniforms();

      const cameraHeight = engine.cameras.active.position.y;
      const [near, far] = calculateFogParameters(fogState);
      fog = new Fog(fogState.fogColor, near, far);
      scene.fog = fog;

      // Initial update of global fog uniforms
      updateGlobalFogUniforms(cameraHeight, fogVolumeData);
      applyEnabled();

      return () => {
        scene.fog = null;
        fog = null;
        // Reset fog uniforms on unmount so next mission starts clean
        resetGlobalFogUniforms();
        setPerspectiveFar(perspective, DEFAULT_CAMERA_FAR);
      };
    }),
    // Update fog parameters each frame based on camera height. The packed
    // volume data is copied when the fog starts; per frame only the
    // scalars change.
    engine.scheduler.add(FramePriority.PostCamera, ({ camera }) => {
      if (!fog) return;

      const cameraHeight = camera.position.y;
      globalFogUniforms.cameraHeight.value = cameraHeight;
      globalFogUniforms.fogEnabled.value = enabled;

      if (enabled) {
        // Update Three.js basic fog
        const [near, far] = calculateFogParameters(fogState);
        // When fogDistanceScale > 1 (camera tour), stretch haze range so
        // fog starts nearby but doesn't reach full until past the orbit
        // distance.
        const scale = globalFogUniforms.fogDistanceScale.value;
        fog.near = scale > 1 ? Math.min(near, 100) : near;
        fog.far = far * scale;
        fog.color.copy(fogState.fogColor);
        // The engine's frustum far plane IS visibleDistance (SceneGraph::
        // renderScene builds the SceneState with it; every object's
        // projection clips there). Haze reaches 1 exactly at that plane,
        // so fogged surfaces fade out cleanly — and things the engine
        // never fogs, like particles (ParticleEmitter::renderObject draws
        // raw colours), simply stop existing past it instead of glowing
        // through the haze.
        setPerspectiveFar(perspective, fog.far);
      }
      // When disabled, fog.near/far are already set to 1e10 by
      // applyEnabled.
    }),
  );

  return {
    setEnabled(next) {
      enabled = next;
      applyEnabled();
    },
    dispose,
  };
}
