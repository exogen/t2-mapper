import { memo, Suspense, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useThree, useFrame } from "@react-three/fiber";
import { useCubeTexture } from "@react-three/drei";
import { Color, Fog, Vector4, type Camera, type ShaderMaterial } from "three";
import { computeSkyFogBands, skyFogAlphaGlsl } from "../skyFogBands";
import { createLogger } from "../logger";
import { useDebug, useSettings } from "./SettingsProvider";
import { useCommandCircuit } from "../state/commandCircuitStore";
import {
  FALLBACK_TEXTURE_URL,
  loadDetailMapList,
  textureToUrl,
} from "../loaders";
import {
  setShapeEnvMap,
  resetShapeEnvMap,
  shapeEnvMapUniforms,
} from "../shapeMaterial";
import { loadTexture, setupTexture } from "../textureUtils";
import { CloudLayers } from "./CloudLayers";
import { fogStateFromScene, type FogState } from "./FogProvider";
import { installCustomFogShader } from "../fogShader";
import { cameraRegistry } from "../state/cameraRegistry";
import {
  globalFogUniforms,
  updateGlobalFogUniforms,
  packFogVolumeData,
  resetGlobalFogUniforms,
} from "../globalFogUniforms";

/** three.js's PerspectiveCamera default — restored whenever fog is off. */
const DEFAULT_CAMERA_FAR = 2000;

/** Clip the perspective camera at `far` (the engine's far plane is visibleDistance). */
function setPerspectiveFar(far: number): void {
  const perspective = cameraRegistry.perspective;
  if (!perspective || perspective.far === far) return;
  perspective.far = far;
  perspective.updateProjectionMatrix();
}

const log = createLogger("Sky");

// Track if fog shader has been installed (idempotent installation)
let fogShaderInstalled = false;

import type { Color3 } from "../scene/types";
import { SkyEntity } from "../state/gameEntityTypes";

/** Convert a Color3 to [sRGB Color, linear Color]. */
function color3ToThree(c: Color3): [Color, Color] {
  return [
    new Color().setRGB(c.r, c.g, c.b),
    new Color().setRGB(c.r, c.g, c.b).convertSRGBToLinear(),
  ];
}

/**
 * Load a .dml file, used to list the textures for different faces of a skybox.
 */
function useDetailMapList(name: string) {
  const result = useQuery({
    queryKey: ["detailMapList", name],
    queryFn: () => {
      log.debug("Loading detail map list: %s", name);
      return loadDetailMapList(name);
    },
  });

  useEffect(() => {
    log.debug(
      "DML query status: %s%s%s file=%s",
      result.status,
      result.error ? ` error=${result.error.message}` : "",
      result.data ? ` (${result.data.length} entries)` : " (no data)",
      name,
    );
  }, [result.status, result.error, result.data, name]);

  return result;
}

/**
 * Inner component that renders the skybox once texture URLs are known.
 * Separated so useCubeTexture only runs with valid URLs.
 */
/**
 * Per-frame sky material updates, shared by both sky shaders. The camera
 * matrices must come from the CURRENT render camera — a mount-time
 * useThree capture can be the command circuit's ortho camera when the sky
 * remounts during the commit that closes CC (the perspective camera is
 * only restored afterwards), which breaks the ray unprojection
 * permanently. The fog bands depend on the camera height, so they update
 * here too.
 */
function updateSkyFrameUniforms(
  u: Record<string, { value: unknown }>,
  renderCamera: Camera,
  fogState: FogState | undefined,
): void {
  u.inverseProjectionMatrix.value = renderCamera.projectionMatrixInverse;
  u.cameraMatrixWorld.value = renderCamera.matrixWorld;
  if (fogState) {
    const bands = computeSkyFogBands(
      fogState.visibleDistance,
      fogState.fogVolumes,
      renderCamera.position.y,
    );
    (u.fogBands.value as Vector4).set(
      bands.h0,
      bands.h1,
      bands.alpha0,
      bands.alpha1,
    );
    u.skyRadius.value = bands.radius;
  }
}

function SkyBoxTexture({
  skyBoxFiles,
  fogColor,
  fogState,
}: {
  skyBoxFiles: string[];
  fogColor?: Color;
  fogState?: FogState;
}) {
  const camera = useThree((state) => state.camera);
  const skyBox = useCubeTexture(skyBoxFiles, { path: "" });

  const enableFog = !!fogColor;

  const inverseProjectionMatrix = useMemo(() => {
    return camera.projectionMatrixInverse;
  }, [camera]);

  // Initial uniform values for material construction only.
  const uniformsRef = useRef({
    skybox: { value: skyBox },
    fogColor: { value: fogColor ?? new Color(0, 0, 0) },
    enableFog: { value: enableFog },
    inverseProjectionMatrix: { value: inverseProjectionMatrix },
    cameraMatrixWorld: { value: camera.matrixWorld },
    fogBands: { value: new Vector4(0, 60, 0, 0) },
    skyRadius: { value: 300 },
  });

  // IMPORTANT: post-construction updates must go through the MATERIAL's
  // uniforms, not uniformsRef — r3f copies each uniform entry into its
  // own stable objects when applying the `uniforms` prop, so mutating
  // uniformsRef after mount never reaches the shader.
  const materialRef = useRef<ShaderMaterial>(null);

  // Update uniform values when props change
  useEffect(() => {
    const u = materialRef.current?.uniforms;
    if (!u) return;
    u.skybox.value = skyBox;
    u.fogColor.value = fogColor ?? new Color(0, 0, 0);
    u.enableFog.value = enableFog;
  }, [skyBox, fogColor, enableFog]);

  useFrame(({ camera: renderCamera }) => {
    const u = materialRef.current?.uniforms;
    if (u) updateSkyFrameUniforms(u, renderCamera, fogState);
  });

  return (
    <mesh renderOrder={-1000} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3]}
          count={3}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-uv"
          args={[new Float32Array([0, 0, 2, 0, 0, 2]), 2]}
          count={3}
          itemSize={2}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniformsRef.current} // eslint-disable-line react-hooks/refs
        vertexShader={`
          varying vec2 vUv;

          void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.9999, 1.0);
          }
        `}
        fragmentShader={`
          uniform samplerCube skybox;
          uniform vec3 fogColor;
          uniform bool enableFog;
          uniform mat4 inverseProjectionMatrix;
          uniform mat4 cameraMatrixWorld;

          varying vec2 vUv;

          ${skyFogAlphaGlsl}

          // Convert linear to sRGB for display
          // shaderMaterial does NOT get automatic linear->sRGB output conversion
          // Use proper sRGB transfer function (not simplified gamma 2.2) to match Three.js
          vec3 linearToSRGB(vec3 linear) {
            vec3 low = linear * 12.92;
            vec3 high = 1.055 * pow(linear, vec3(1.0 / 2.4)) - 0.055;
            return mix(low, high, step(vec3(0.0031308), linear));
          }

          void main() {
            vec2 ndc = vUv * 2.0 - 1.0;
            vec4 viewPos = inverseProjectionMatrix * vec4(ndc, 1.0, 1.0);
            viewPos.xyz /= viewPos.w;
            vec3 direction = normalize((cameraMatrixWorld * vec4(viewPos.xyz, 0.0)).xyz);
            direction = vec3(direction.z, direction.y, -direction.x);
            // Sample skybox - Three.js CubeTexture with SRGBColorSpace auto-converts to linear
            vec4 skyColor = textureCube(skybox, direction);
            vec3 finalColor;

            if (enableFog) {
              // Tribes2.exe fog/sky boundary (Sky::renderSkyBox, 0x5acb20):
              // the sky is painted fog color, skybox walls are clipped to
              // above the saturation ring, and two alpha-graded pieces of
              // band geometry blend the transition. skyFogAlpha evaluates
              // the same bands analytically per ray.
              float finalFogFactor = skyFogAlpha(direction.y);
              finalColor = mix(skyColor.rgb, fogColor, finalFogFactor);
            } else {
              finalColor = skyColor.rgb;
            }
            // Convert linear result to sRGB for display
            gl_FragColor = vec4(linearToSRGB(finalColor), 1.0);
          }
        `}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}

function SkyBox({
  materialList,
  fogColor,
  fogState,
}: {
  materialList: string;
  fogColor?: Color;
  fogState?: FogState;
}) {
  const { data: detailMapList } = useDetailMapList(materialList);

  const skyBoxFiles = useMemo(
    () =>
      detailMapList
        ? [
            textureToUrl(detailMapList[1]!), // +x
            textureToUrl(detailMapList[3]!), // -x
            textureToUrl(detailMapList[4]!), // +y
            textureToUrl(detailMapList[5]!), // -y
            textureToUrl(detailMapList[0]!), // +z
            textureToUrl(detailMapList[2]!), // -z
          ]
        : null,
    [detailMapList],
  );

  // Load the sphere-map environment texture (index 6 in the .dml) for shape
  // reflections. This is a dedicated 2D texture, NOT the skybox cubemap.
  // Some maps have broken emap paths (e.g. Katabatic references desert/skies/
  // but file is at ice/skies/) — skip if the texture doesn't resolve.
  useEffect(() => {
    const emapName = detailMapList?.[6];
    if (!emapName) return;
    const url = textureToUrl(emapName);
    // textureToUrl returns the fallback URL for missing textures (e.g.
    // Katabatic's DML has a broken emap path). Don't set a fallback as envmap.
    if (url === FALLBACK_TEXTURE_URL) return;
    // Load WITHOUT sRGB conversion (noColorSpace). The env map values stay as
    // raw sRGB bytes, which is what Torque's fixed-function pipeline operates
    // on. The 2x modulate: 2 * lit_base_linear * env_sRGB produces display
    // values that closely match Torque's 2 * lit_base_sRGB * env_sRGB.
    const tex = loadTexture(url, (loaded) => {
      setupTexture(loaded, { noColorSpace: true });
      setShapeEnvMap(loaded);
    });
    if (tex.image) {
      setupTexture(tex, { noColorSpace: true });
      setShapeEnvMap(tex);
    }
    return () => resetShapeEnvMap();
  }, [detailMapList]);

  // In debug mode, show sphere map UVs as colors instead of the texture.
  const { debugMode } = useDebug();
  useEffect(() => {
    shapeEnvMapUniforms.shapeEnvMapDebugUV.value = debugMode;
  }, [debugMode]);

  // Don't render until we have real texture URLs
  if (!skyBoxFiles) {
    return null;
  }

  return (
    <SkyBoxTexture
      skyBoxFiles={skyBoxFiles}
      fogColor={fogColor}
      fogState={fogState}
    />
  );
}

/**
 * Solid color sky component for when useSkyTextures = 0.
 * Renders SkySolidColor (ignoring alpha) with fog at the horizon.
 * Uses the same fog logic as SkyBoxTexture for consistency.
 */
function SolidColorSky({
  skyColor,
  fogColor,
  fogState,
}: {
  skyColor: Color;
  fogColor?: Color;
  fogState?: FogState;
}) {
  const camera = useThree((state) => state.camera);

  const enableFog = !!fogColor;

  const inverseProjectionMatrix = useMemo(() => {
    return camera.projectionMatrixInverse;
  }, [camera]);

  // Initial uniform values for material construction only.
  const uniformsRef = useRef({
    skyColor: { value: skyColor },
    fogColor: { value: fogColor ?? new Color(0, 0, 0) },
    enableFog: { value: enableFog },
    inverseProjectionMatrix: { value: inverseProjectionMatrix },
    cameraMatrixWorld: { value: camera.matrixWorld },
    fogBands: { value: new Vector4(0, 60, 0, 0) },
    skyRadius: { value: 300 },
  });

  // Post-construction updates must go through the MATERIAL's uniforms —
  // see SkyBoxTexture.
  const materialRef = useRef<ShaderMaterial>(null);

  // Update uniform values when props change
  useEffect(() => {
    const u = materialRef.current?.uniforms;
    if (!u) return;
    u.skyColor.value = skyColor;
    u.fogColor.value = fogColor ?? new Color(0, 0, 0);
    u.enableFog.value = enableFog;
  }, [skyColor, fogColor, enableFog]);

  useFrame(({ camera: renderCamera }) => {
    const u = materialRef.current?.uniforms;
    if (u) updateSkyFrameUniforms(u, renderCamera, fogState);
  });

  return (
    <mesh renderOrder={-1000} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3]}
          count={3}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-uv"
          args={[new Float32Array([0, 0, 2, 0, 0, 2]), 2]}
          count={3}
          itemSize={2}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniformsRef.current} // eslint-disable-line react-hooks/refs
        vertexShader={`
          varying vec2 vUv;

          void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.9999, 1.0);
          }
        `}
        fragmentShader={`
          uniform vec3 skyColor;
          uniform vec3 fogColor;
          uniform bool enableFog;
          uniform mat4 inverseProjectionMatrix;
          uniform mat4 cameraMatrixWorld;

          varying vec2 vUv;

          ${skyFogAlphaGlsl}

          // Convert linear to sRGB for display
          vec3 linearToSRGB(vec3 linear) {
            vec3 low = linear * 12.92;
            vec3 high = 1.055 * pow(linear, vec3(1.0 / 2.4)) - 0.055;
            return mix(low, high, step(vec3(0.0031308), linear));
          }

          void main() {
            vec2 ndc = vUv * 2.0 - 1.0;
            vec4 viewPos = inverseProjectionMatrix * vec4(ndc, 1.0, 1.0);
            viewPos.xyz /= viewPos.w;
            vec3 direction = normalize((cameraMatrixWorld * vec4(viewPos.xyz, 0.0)).xyz);
            direction = vec3(direction.z, direction.y, -direction.x);

            vec3 finalColor;

            if (enableFog) {
              // Tribes2.exe fog band model — see SkyBoxTexture.
              float finalFogFactor = skyFogAlpha(direction.y);
              finalColor = mix(skyColor, fogColor, finalFogFactor);
            } else {
              finalColor = skyColor;
            }

            gl_FragColor = vec4(linearToSRGB(finalColor), 1.0);
          }
        `}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
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
 *
 * @returns [near, far] distances for haze (always global values)
 */
function calculateFogParameters(
  fogState: FogState,
  _cameraHeight: number,
): [number, number] {
  const { fogDistance, visibleDistance } = fogState;
  // Always return global fog parameters for the haze calculation.
  // Volumetric fog from fog volumes is computed separately in the shader
  // and added to the haze value.
  return [fogDistance, visibleDistance];
}

/**
 * Dynamic fog component that manages Torque-style fog rendering.
 *
 * This component:
 * - Sets up Three.js Fog with global fogDistance/visibleDistance for haze
 * - Updates cameraHeight uniform each frame for volumetric fog shaders
 * - Manages global fog uniforms lifecycle (reset on mount, cleanup on unmount)
 *
 * The custom fog shader (fogFragmentShader) handles:
 * 1. Haze: Distance-based quadratic fog using global parameters
 * 2. Volume fog: Height-based fog using per-volume parameters
 * Both are combined additively, matching Torque's getHazeAndFog function.
 */
function DynamicFog({
  fogState,
  enabled,
}: {
  fogState: FogState;
  enabled: boolean;
}) {
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const fogRef = useRef<Fog | null>(null);

  // Pack fog volume data once (it doesn't change during runtime)
  const fogVolumeData = useMemo(
    () => packFogVolumeData(fogState.fogVolumes),
    [fogState.fogVolumes],
  );

  // Install custom fog shader (idempotent - only runs once globally)
  useEffect(() => {
    if (!fogShaderInstalled) {
      installCustomFogShader();
      fogShaderInstalled = true;
    }
  }, []);

  // Create fog object on mount
  useEffect(() => {
    // Reset global fog uniforms to ensure clean state for new mission
    resetGlobalFogUniforms();

    const [near, far] = calculateFogParameters(fogState, camera.position.y);
    const fog = new Fog(fogState.fogColor, near, far);
    scene.fog = fog;
    fogRef.current = fog;

    // Initial update of global fog uniforms
    updateGlobalFogUniforms(camera.position.y, fogVolumeData);

    return () => {
      scene.fog = null;
      fogRef.current = null;
      // Reset fog uniforms on unmount so next mission starts clean
      resetGlobalFogUniforms();
      setPerspectiveFar(DEFAULT_CAMERA_FAR);
    };
  }, [scene, camera, fogState, fogVolumeData]);

  // When fog is disabled, set near=far to effectively disable fog
  // without removing scene.fog (which would require shader recompilation)
  useEffect(() => {
    const fog = fogRef.current;
    if (!fog) return;

    if (enabled) {
      const [near, far] = calculateFogParameters(fogState, camera.position.y);
      fog.near = near;
      fog.far = far;
    } else {
      // Setting near = far = large value effectively disables fog
      // (fog factor = 0 when distance < near)
      fog.near = 1e10;
      fog.far = 1e10;
      setPerspectiveFar(DEFAULT_CAMERA_FAR);
    }
  }, [enabled, fogState, camera.position.y]);

  // Update fog parameters each frame based on camera height. The packed
  // volume data is copied on mount / fogState change above; per frame only
  // the scalars change.
  useFrame(() => {
    const fog = fogRef.current;
    if (!fog) return;

    const cameraHeight = camera.position.y;
    globalFogUniforms.cameraHeight.value = cameraHeight;
    globalFogUniforms.fogEnabled.value = enabled;

    if (enabled) {
      // Update Three.js basic fog
      const [near, far] = calculateFogParameters(fogState, cameraHeight);
      // When fogDistanceScale > 1 (camera tour), stretch haze range so fog
      // starts nearby but doesn't reach full until past the orbit distance.
      const scale = globalFogUniforms.fogDistanceScale.value;
      fog.near = scale > 1 ? Math.min(near, 100) : near;
      fog.far = far * scale;
      fog.color.copy(fogState.fogColor);
      // The engine's frustum far plane IS visibleDistance (SceneGraph::
      // renderScene builds the SceneState with it; every object's projection
      // clips there). Haze reaches 1 exactly at that plane, so fogged
      // surfaces fade out cleanly — and things the engine never fogs, like
      // particles (ParticleEmitter::renderObject draws raw colours), simply
      // stop existing past it instead of glowing through the haze.
      setPerspectiveFar(fog.far);
    }
    // When disabled, fog.near/far are already set to 1e10 by the useEffect
  });

  return null;
}

export const Sky = memo(function Sky({ entity }: { entity: SkyEntity }) {
  const { skyData } = entity;
  log.debug(
    "Rendering: materialList=%s, useSkyTextures=%s",
    skyData.materialList,
    skyData.useSkyTextures,
  );
  const { fogEnabled: fogSetting } = useSettings();
  // Command circuit's top-down overview disables fog and the sky domes.
  const isCommandCircuit = useCommandCircuit((s) => s.active);
  const fogEnabled = fogSetting && !isCommandCircuit;

  // Skybox textures
  const materialList = skyData.materialList || undefined;

  const skySolidColor = useMemo(
    () => color3ToThree(skyData.skySolidColor),
    [skyData.skySolidColor],
  );

  const useSkyTextures = skyData.useSkyTextures;

  // Parse full fog state from typed scene sky
  const fogState = useMemo(() => fogStateFromScene(skyData), [skyData]);

  log.debug(
    "fogState: fogColor=(%s, %s, %s) visibleDistance=%d fogDistance=%d enabled=%s volumes=%d",
    skyData.fogColor.r.toFixed(3),
    skyData.fogColor.g.toFixed(3),
    skyData.fogColor.b.toFixed(3),
    skyData.visibleDistance,
    skyData.fogDistance,
    fogState.enabled,
    fogState.fogVolumes.length,
  );

  // Get sRGB fog color for background
  const fogColor = useMemo(
    () => color3ToThree(skyData.fogColor),
    [skyData.fogColor],
  );

  const skyColor = skySolidColor || fogColor;

  // Only enable fog if we have valid distance parameters
  const hasFogParams = fogState.enabled && fogEnabled;

  // Use the linear fog color from fogState - Three.js will handle display conversion
  const effectiveFogColor = fogState.fogColor;

  // Set scene background color directly using useThree
  // This ensures the gap between fogged terrain and skybox blends correctly
  const threeScene = useThree((state) => state.scene);
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    if (hasFogParams) {
      // Use effective fog color for background (matches terrain fog)
      const bgColor = effectiveFogColor.clone();
      threeScene.background = bgColor;
      // Also set the renderer clear color as a fallback
      gl.setClearColor(bgColor);
    } else if (skyColor) {
      const bgColor = skyColor[0].clone();
      threeScene.background = bgColor;
      gl.setClearColor(bgColor);
    } else {
      threeScene.background = null;
    }
    return () => {
      threeScene.background = null;
    };
  }, [threeScene, gl, hasFogParams, effectiveFogColor, skyColor]);

  // Get linear sky solid color for the solid color sky shader
  const linearSkySolidColor = skySolidColor?.[1];

  return (
    <>
      {/* The camera-centered sky domes and clouds render as garbage from the
          command circuit's top-down orthographic view; the scene background
          (sky color) fills the frame instead. */}
      {!isCommandCircuit &&
      materialList &&
      useSkyTextures &&
      materialList.length > 0 ? (
        <Suspense>
          {/* Key forces remount when mission changes to clear texture caches */}
          <SkyBox
            key={materialList}
            materialList={materialList}
            fogColor={hasFogParams ? effectiveFogColor : undefined}
            fogState={hasFogParams ? fogState : undefined}
          />
        </Suspense>
      ) : !isCommandCircuit && linearSkySolidColor ? (
        /* When useSkyTextures = 0, render solid color sky with SkySolidColor */
        <SolidColorSky
          skyColor={linearSkySolidColor}
          fogColor={hasFogParams ? effectiveFogColor : undefined}
          fogState={hasFogParams ? fogState : undefined}
        />
      ) : null}
      {/* Cloud layers render independently of skybox textures */}
      {!isCommandCircuit && (
        <Suspense>
          <CloudLayers
            scene={skyData}
            fogState={hasFogParams ? fogState : undefined}
          />
        </Suspense>
      )}
      {/* Always render DynamicFog when mission has fog params.
          Pass fogEnabled to control visibility - this avoids shader recompilation
          when toggling fog (USE_FOG stays defined, but fog.near/far disable fog). */}
      {fogState.enabled ? (
        <DynamicFog fogState={fogState} enabled={fogEnabled} />
      ) : null}
    </>
  );
});
