import { Suspense, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useThree, useFrame } from "@react-three/fiber";
import { useCubeTexture } from "@react-three/drei";
import { Color, Fog } from "three";
import type { TorqueObject } from "../torqueScript";
import { getInt, getProperty } from "../mission";
import { useSettings } from "./SettingsProvider";
import { BASE_URL, loadDetailMapList, textureToUrl } from "../loaders";
import { CloudLayers } from "./CloudLayers";
import { parseFogState, type FogState, type FogVolume } from "./FogProvider";
import { installCustomFogShader } from "../fogShader";
import {
  globalFogUniforms,
  updateGlobalFogUniforms,
  packFogVolumeData,
  resetGlobalFogUniforms,
} from "../globalFogUniforms";

const FALLBACK_TEXTURE_URL = `${BASE_URL}/black.png`;

// Track if fog shader has been installed (idempotent installation)
let fogShaderInstalled = false;

/**
 * Parse a Tribes 2 color string (space-separated RGB or RGBA values 0-1).
 * Returns [sRGB Color, linear Color] or undefined if no color string.
 */
function parseColorString(
  colorString: string | undefined,
): [Color, Color] | undefined {
  if (!colorString) return undefined;
  const [r, g, b] = colorString.split(" ").map((s) => parseFloat(s));
  return [
    new Color().setRGB(r, g, b),
    new Color().setRGB(r, g, b).convertSRGBToLinear(),
  ];
}

/**
 * Load a .dml file, used to list the textures for different faces of a skybox.
 */
function useDetailMapList(name: string) {
  return useQuery({
    queryKey: ["detailMapList", name],
    queryFn: () => loadDetailMapList(name),
  });
}

/**
 * Inner component that renders the skybox once texture URLs are known.
 * Separated so useCubeTexture only runs with valid URLs.
 */
// Torque sky constants (from sky.cc)
// OFFSET_HEIGHT = 60.0 - height of the horizon fog band in world units
const HORIZON_FOG_HEIGHT = 60.0;

function SkyBoxTexture({
  skyBoxFiles,
  fogColor,
  fogState,
}: {
  skyBoxFiles: string[];
  fogColor?: Color;
  fogState?: FogState;
}) {
  const { camera } = useThree();
  const skyBox = useCubeTexture(skyBoxFiles, { path: "" });

  const enableFog = !!fogColor;

  const inverseProjectionMatrix = useMemo(() => {
    return camera.projectionMatrixInverse;
  }, [camera]);

  const fogVolumeData = useMemo(
    () =>
      fogState ? packFogVolumeData(fogState.fogVolumes) : new Float32Array(12),
    [fogState],
  );

  // Create stable uniform objects that persist across renders
  // This ensures the shader gets updated values when props change
  const uniformsRef = useRef({
    skybox: { value: skyBox },
    fogColor: { value: fogColor ?? new Color(0, 0, 0) },
    enableFog: { value: enableFog },
    inverseProjectionMatrix: { value: inverseProjectionMatrix },
    cameraMatrixWorld: { value: camera.matrixWorld },
    cameraHeight: globalFogUniforms.cameraHeight,
    fogVolumeData: { value: fogVolumeData },
    horizonFogHeight: { value: 0.18 },
  });

  // Calculate the horizon fog cutoff based on visible distance
  // In Torque's sky.cc:
  //   mRadius = visibleDistance * 0.95
  //   tpt = (1,1,1).normalize(mRadius) -> each component = mRadius / sqrt(3)
  //   mSkyBoxPt.x = mSkyBoxPt.z = mRadius / sqrt(3) (corner of cube)
  //
  // The fog band is rendered as geometry from height 0 to OFFSET_HEIGHT (60)
  // on a skybox where the horizontal distance to the edge is mSkyBoxPt.x
  //
  // For a ray direction, direction.y corresponds to the vertical component
  // The fog should cover directions where:
  //   height / horizontal_dist = direction.y / sqrt(1 - direction.y^2) < 60 / skyBoxPt.x
  //
  // Simplifying: direction.y < OFFSET_HEIGHT / sqrt(skyBoxPt.x^2 + OFFSET_HEIGHT^2)
  const horizonFogHeight = useMemo(() => {
    if (!fogState) return 0.18; // Default fallback
    const mRadius = fogState.visibleDistance * 0.95;
    const skyBoxPtX = mRadius / Math.sqrt(3); // Corner coordinate
    // For direction vector (horizontal, y), y / horizontal = height / skyBoxPtX
    // At the fog boundary: y / sqrt(1-y^2) = 60 / skyBoxPtX
    // Solving for y: y = 60 / sqrt(skyBoxPtX^2 + 60^2)
    return (
      HORIZON_FOG_HEIGHT /
      Math.sqrt(skyBoxPtX * skyBoxPtX + HORIZON_FOG_HEIGHT * HORIZON_FOG_HEIGHT)
    );
  }, [fogState]);

  // Update uniform values when props change
  useEffect(() => {
    uniformsRef.current.skybox.value = skyBox;
    uniformsRef.current.fogColor.value = fogColor ?? new Color(0, 0, 0);
    uniformsRef.current.enableFog.value = enableFog;
    uniformsRef.current.fogVolumeData.value = fogVolumeData;
    uniformsRef.current.horizonFogHeight.value = horizonFogHeight;
  }, [skyBox, fogColor, enableFog, fogVolumeData, horizonFogHeight]);

  return (
    <mesh renderOrder={-1000} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0])}
          count={3}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-uv"
          array={new Float32Array([0, 0, 2, 0, 0, 2])}
          count={3}
          itemSize={2}
        />
      </bufferGeometry>
      <shaderMaterial
        uniforms={uniformsRef.current}
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
          uniform float cameraHeight;
          uniform float fogVolumeData[12];
          uniform float horizonFogHeight;

          varying vec2 vUv;

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
              vec3 effectiveFogColor = fogColor;

              // Calculate how much fog volume the ray passes through
              // For skybox at "infinite" distance, the relevant height is how much
              // of the volume is above/below camera depending on view direction
              float volumeFogInfluence = 0.0;

              for (int i = 0; i < 3; i++) {
                int offset = i * 4;
                float volVisDist = fogVolumeData[offset + 0];
                float volMinH = fogVolumeData[offset + 1];
                float volMaxH = fogVolumeData[offset + 2];
                float volPct = fogVolumeData[offset + 3];

                if (volVisDist <= 0.0) continue;

                // Check if camera is inside this volume
                if (cameraHeight >= volMinH && cameraHeight <= volMaxH) {
                  // Camera is inside the fog volume
                  // Looking horizontally or up at shallow angles means ray travels
                  // through more fog before exiting the volume
                  float heightAboveCamera = volMaxH - cameraHeight;
                  float heightBelowCamera = cameraHeight - volMinH;
                  float volumeHeight = volMaxH - volMinH;

                  // For horizontal rays (direction.y ≈ 0), maximum fog influence
                  // For rays going up steeply, less fog (exits volume quickly)
                  // For rays going down, more fog (travels through volume below)
                  float rayInfluence;
                  if (direction.y >= 0.0) {
                    // Looking up: influence based on how steep we're looking
                    // Shallow angles = long path through fog = high influence
                    rayInfluence = 1.0 - smoothstep(0.0, 0.3, direction.y);
                  } else {
                    // Looking down: always high fog (into the volume)
                    rayInfluence = 1.0;
                  }

                  // Scale by percentage and volume depth factor
                  volumeFogInfluence += rayInfluence * volPct;
                }
              }

              // Base fog factor from view direction (for haze at horizon)
              // In Torque, the fog "bans" (bands) are rendered as geometry from
              // height 0 (HORIZON) to height 60 (OFFSET_HEIGHT) on the skybox.
              // The skybox corner is at mSkyBoxPt.x = mRadius / sqrt(3).
              //
              // horizonFogHeight is the direction.y value where the fog band ends:
              //   horizonFogHeight = 60 / sqrt(skyBoxPt.x^2 + 60^2)
              //
              // For Firestorm (visDist=600): mRadius=570, skyBoxPt.x=329, horizonFogHeight≈0.18
              //
              // Torque renders the fog bands as geometry with linear vertex alpha
              // interpolation. We use a squared curve (t^2) to create a gentler
              // falloff at the top of the gradient, matching Tribes 2's appearance.
              float baseFogFactor;
              if (direction.y <= 0.0) {
                // Looking at or below horizon: full fog
                baseFogFactor = 1.0;
              } else if (direction.y >= horizonFogHeight) {
                // Above fog band: no fog
                baseFogFactor = 0.0;
              } else {
                // Within fog band: squared curve for gentler falloff at top
                float t = direction.y / horizonFogHeight;
                baseFogFactor = (1.0 - t) * (1.0 - t);
              }

              // Combine base fog with volume fog influence
              // When inside a volume, increase fog intensity
              float finalFogFactor = min(1.0, baseFogFactor + volumeFogInfluence * 0.5);

              finalColor = mix(skyColor.rgb, effectiveFogColor, finalFogFactor);
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

export function SkyBox({
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
            textureToUrl(detailMapList[1]), // +x
            textureToUrl(detailMapList[3]), // -x
            textureToUrl(detailMapList[4]), // +y
            textureToUrl(detailMapList[5]), // -y
            textureToUrl(detailMapList[0]), // +z
            textureToUrl(detailMapList[2]), // -z
          ]
        : null,
    [detailMapList],
  );

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
  const { camera } = useThree();

  const enableFog = !!fogColor;

  const inverseProjectionMatrix = useMemo(() => {
    return camera.projectionMatrixInverse;
  }, [camera]);

  const fogVolumeData = useMemo(
    () =>
      fogState ? packFogVolumeData(fogState.fogVolumes) : new Float32Array(12),
    [fogState],
  );

  const horizonFogHeight = useMemo(() => {
    if (!fogState) return 0.18;
    const mRadius = fogState.visibleDistance * 0.95;
    const skyBoxPtX = mRadius / Math.sqrt(3);
    return (
      HORIZON_FOG_HEIGHT /
      Math.sqrt(skyBoxPtX * skyBoxPtX + HORIZON_FOG_HEIGHT * HORIZON_FOG_HEIGHT)
    );
  }, [fogState]);

  // Create stable uniform objects that persist across renders
  const uniformsRef = useRef({
    skyColor: { value: skyColor },
    fogColor: { value: fogColor ?? new Color(0, 0, 0) },
    enableFog: { value: enableFog },
    inverseProjectionMatrix: { value: inverseProjectionMatrix },
    cameraMatrixWorld: { value: camera.matrixWorld },
    cameraHeight: globalFogUniforms.cameraHeight,
    fogVolumeData: { value: fogVolumeData },
    horizonFogHeight: { value: horizonFogHeight },
  });

  // Update uniform values when props change
  useEffect(() => {
    uniformsRef.current.skyColor.value = skyColor;
    uniformsRef.current.fogColor.value = fogColor ?? new Color(0, 0, 0);
    uniformsRef.current.enableFog.value = enableFog;
    uniformsRef.current.fogVolumeData.value = fogVolumeData;
    uniformsRef.current.horizonFogHeight.value = horizonFogHeight;
  }, [skyColor, fogColor, enableFog, fogVolumeData, horizonFogHeight]);

  return (
    <mesh renderOrder={-1000} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0])}
          count={3}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-uv"
          array={new Float32Array([0, 0, 2, 0, 0, 2])}
          count={3}
          itemSize={2}
        />
      </bufferGeometry>
      <shaderMaterial
        uniforms={uniformsRef.current}
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
          uniform float cameraHeight;
          uniform float fogVolumeData[12];
          uniform float horizonFogHeight;

          varying vec2 vUv;

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
              // Calculate volume fog influence (same logic as SkyBoxTexture)
              float volumeFogInfluence = 0.0;

              for (int i = 0; i < 3; i++) {
                int offset = i * 4;
                float volVisDist = fogVolumeData[offset + 0];
                float volMinH = fogVolumeData[offset + 1];
                float volMaxH = fogVolumeData[offset + 2];
                float volPct = fogVolumeData[offset + 3];

                if (volVisDist <= 0.0) continue;

                if (cameraHeight >= volMinH && cameraHeight <= volMaxH) {
                  float rayInfluence;
                  if (direction.y >= 0.0) {
                    rayInfluence = 1.0 - smoothstep(0.0, 0.3, direction.y);
                  } else {
                    rayInfluence = 1.0;
                  }
                  volumeFogInfluence += rayInfluence * volPct;
                }
              }

              // Base fog factor from view direction
              float baseFogFactor;
              if (direction.y <= 0.0) {
                baseFogFactor = 1.0;
              } else if (direction.y >= horizonFogHeight) {
                baseFogFactor = 0.0;
              } else {
                float t = direction.y / horizonFogHeight;
                baseFogFactor = (1.0 - t) * (1.0 - t);
              }

              // Combine base fog with volume fog influence
              float finalFogFactor = min(1.0, baseFogFactor + volumeFogInfluence * 0.5);

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
  const { scene, camera } = useThree();
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
    }
  }, [enabled, fogState, camera.position.y]);

  // Update fog parameters each frame based on camera height
  useFrame(() => {
    const fog = fogRef.current;
    if (!fog) return;

    const cameraHeight = camera.position.y;

    // Always update global fog uniforms so shaders know the enabled state
    updateGlobalFogUniforms(cameraHeight, fogVolumeData, enabled);

    if (enabled) {
      // Update Three.js basic fog
      const [near, far] = calculateFogParameters(fogState, cameraHeight);
      fog.near = near;
      fog.far = far;
      fog.color.copy(fogState.fogColor);
    }
    // When disabled, fog.near/far are already set to 1e10 by the useEffect
  });

  return null;
}

export function Sky({ object }: { object: TorqueObject }) {
  const { fogEnabled, highQualityFog } = useSettings();

  // Skybox textures
  const materialList = getProperty(object, "materialList");

  const skySolidColor = useMemo(
    () => parseColorString(getProperty(object, "SkySolidColor")),
    [object],
  );

  const useSkyTextures = getInt(object, "useSkyTextures") ?? 1;

  // Parse full fog state from Sky object using FogProvider's parser
  const fogState = useMemo(
    () => parseFogState(object, highQualityFog),
    [object, highQualityFog],
  );

  // Get sRGB fog color for background
  const fogColor = useMemo(
    () => parseColorString(getProperty(object, "fogColor")),
    [object],
  );

  const skyColor = skySolidColor || fogColor;

  // Only enable fog if we have valid distance parameters
  const hasFogParams = fogState.enabled && fogEnabled;

  // Use the linear fog color from fogState - Three.js will handle display conversion
  const effectiveFogColor = fogState.fogColor;

  // Set scene background color directly using useThree
  // This ensures the gap between fogged terrain and skybox blends correctly
  const { scene, gl } = useThree();
  useEffect(() => {
    if (hasFogParams) {
      // Use effective fog color for background (matches terrain fog)
      const bgColor = effectiveFogColor.clone();
      scene.background = bgColor;
      // Also set the renderer clear color as a fallback
      gl.setClearColor(bgColor);
    } else if (skyColor) {
      const bgColor = skyColor[0].clone();
      scene.background = bgColor;
      gl.setClearColor(bgColor);
    } else {
      scene.background = null;
    }
    return () => {
      scene.background = null;
    };
  }, [scene, gl, hasFogParams, effectiveFogColor, skyColor]);

  // Get linear sky solid color for the solid color sky shader
  const linearSkySolidColor = skySolidColor?.[1];

  return (
    <>
      {materialList && useSkyTextures ? (
        <Suspense fallback={null}>
          {/* Key forces remount when mission changes to clear texture caches */}
          <SkyBox
            key={materialList}
            materialList={materialList}
            fogColor={hasFogParams ? effectiveFogColor : undefined}
            fogState={hasFogParams ? fogState : undefined}
          />
        </Suspense>
      ) : linearSkySolidColor ? (
        /* When useSkyTextures = 0, render solid color sky with SkySolidColor */
        <SolidColorSky
          skyColor={linearSkySolidColor}
          fogColor={hasFogParams ? effectiveFogColor : undefined}
          fogState={hasFogParams ? fogState : undefined}
        />
      ) : null}
      {/* Cloud layers render independently of skybox textures */}
      <Suspense>
        <CloudLayers object={object} />
      </Suspense>
      {/* Always render DynamicFog when mission has fog params.
          Pass fogEnabled to control visibility - this avoids shader recompilation
          when toggling fog (USE_FOG stays defined, but fog.near/far disable fog). */}
      {fogState.enabled ? (
        <DynamicFog fogState={fogState} enabled={fogEnabled} />
      ) : null}
    </>
  );
}
