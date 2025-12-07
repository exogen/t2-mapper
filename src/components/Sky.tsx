import { Suspense, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCubeTexture } from "@react-three/drei";
import { Color, ShaderMaterial, BackSide, ShaderChunk } from "three";
import type { TorqueObject } from "../torqueScript";
import { getFloat, getInt, getProperty } from "../mission";
import { useSettings } from "./SettingsProvider";
import { BASE_URL, loadDetailMapList, textureToUrl } from "../loaders";
import { CloudLayers } from "./CloudLayers";

const FALLBACK_TEXTURE_URL = `${BASE_URL}/black.png`;

/**
 * Tribes 2 fog formula (from sceneState.cc getHaze):
 *   fogScale = 1.0 / (visibleDistance - fogDistance)
 *   distFactor = (dist - fogDistance) * fogScale - 1.0
 *   haze = 1.0 - distFactor * distFactor
 *
 * This creates an "ease-in" quadratic curve where fog builds slowly at first,
 * then accelerates toward visibleDistance.
 *
 * Set USE_QUADRATIC_FOG to true to use this formula, false to use Three.js linear fog.
 */
const USE_QUADRATIC_FOG = false;

function installQuadraticFogShader() {
  ShaderChunk.fog_fragment = `
#ifdef USE_FOG
  float fogFactor = 0.0;
  if (vFogDepth > fogNear) {
    if (vFogDepth >= fogFar) {
      fogFactor = 1.0;
    } else {
      float fogScale = 1.0 / (fogFar - fogNear);
      float distFactor = (vFogDepth - fogNear) * fogScale - 1.0;
      fogFactor = 1.0 - distFactor * distFactor;
    }
  }
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
#endif
`;
}

if (USE_QUADRATIC_FOG) {
  installQuadraticFogShader();
}

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

export function SkyBox({
  materialList,
  fogColor,
}: {
  materialList: string;
  fogColor?: Color;
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
        : [
            FALLBACK_TEXTURE_URL,
            FALLBACK_TEXTURE_URL,
            FALLBACK_TEXTURE_URL,
            FALLBACK_TEXTURE_URL,
            FALLBACK_TEXTURE_URL,
            FALLBACK_TEXTURE_URL,
          ],
    [detailMapList],
  );

  const skyBox = useCubeTexture(skyBoxFiles, { path: "" });

  const materialRef = useRef<ShaderMaterial>(null!);

  const shaderMaterial = useMemo(() => {
    // Always use a shader to apply the X-axis mirror transformation.
    // Optionally blend fog toward the horizon.
    return new ShaderMaterial({
      uniforms: {
        skybox: { value: skyBox },
        fogColor: { value: fogColor ?? new Color(0, 0, 0) },
        enableFog: { value: !!fogColor },
      },
      vertexShader: `
        varying vec3 vDirection;

        void main() {
          vDirection = position;
          vec4 pos = projectionMatrix * mat4(mat3(modelViewMatrix)) * vec4(position, 1.0);
          gl_Position = pos.xyww;
        }
      `,
      fragmentShader: `
        uniform samplerCube skybox;
        uniform vec3 fogColor;
        uniform bool enableFog;

        varying vec3 vDirection;

        void main() {
          vec3 direction = normalize(vDirection);
          // Swap X and Z, negate X to mirror across X axis
          direction = vec3(direction.z, direction.y, -direction.x);
          vec4 skyColor = textureCube(skybox, direction);

          if (enableFog) {
            // Fog increases toward and below horizon
            // direction.y: -1 = straight down, 0 = horizon, 1 = straight up
            // Use smoothstep for gradual transition (matches Three.js linear fog feel)
            float fogFactor = 1.0 - smoothstep(-0.1, 0.5, direction.y);
            vec3 finalColor = mix(skyColor.rgb, fogColor, fogFactor);
            gl_FragColor = vec4(finalColor, 1.0);
          } else {
            gl_FragColor = skyColor;
          }
        }
      `,
      side: BackSide,
      depthWrite: false,
    });
  }, [skyBox, fogColor]);

  // Update uniforms when props change (ensures reactivity)
  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.skybox.value = skyBox;
      materialRef.current.uniforms.fogColor.value =
        fogColor ?? new Color(0, 0, 0);
      materialRef.current.uniforms.enableFog.value = !!fogColor;
    }
  }, [skyBox, fogColor]);

  return (
    <mesh scale={5000} frustumCulled={false}>
      <sphereGeometry args={[1, 60, 40]} />
      <primitive ref={materialRef} object={shaderMaterial} attach="material" />
    </mesh>
  );
}

export function Sky({ object }: { object: TorqueObject }) {
  const { fogEnabled } = useSettings();

  // Skybox textures
  const materialList = getProperty(object, "materialList");

  const skySolidColor = useMemo(
    () => parseColorString(getProperty(object, "SkySolidColor")),
    [object],
  );

  const useSkyTextures = getInt(object, "useSkyTextures") ?? 1;

  // Fog parameters - Tribes 2 uses fogDistance (near) and visibleDistance (far)
  // high_* variants are used for high quality settings (-1 or 0 means use normal)
  const fogDistanceBase = getFloat(object, "fogDistance");
  const visibleDistanceBase = getFloat(object, "visibleDistance");
  const highFogDistance = getFloat(object, "high_fogDistance");
  const highVisibleDistance = getFloat(object, "high_visibleDistance");

  // Parse fog volumes - format: "visibleDistance minHeight maxHeight"
  // These define height-based fog bands with different densities
  const fogVolume1 = useMemo(() => {
    const value = getProperty(object, "fogVolume1");
    if (value) {
      const [visibleDistance, minHeight, maxHeight] = value
        .split(" ")
        .map((s: string) => parseFloat(s));
      // Only valid if visibleDistance > 0 and has a height range
      if (visibleDistance > 0 && maxHeight > minHeight) {
        return { visibleDistance, minHeight, maxHeight };
      }
    }
    return null;
  }, [object]);

  // Use high quality values if available and valid (> 0)
  const baseFogNear =
    highFogDistance != null && highFogDistance > 0
      ? highFogDistance
      : fogDistanceBase;
  const baseFogFar =
    highVisibleDistance != null && highVisibleDistance > 0
      ? highVisibleDistance
      : visibleDistanceBase;

  // If fogVolume1 is defined, use denser fog
  // Torque's fog volumes ADD density on top of base fog - objects inside
  // a fog volume get significantly more haze. We approximate this by
  // using a fraction of the volume's visibleDistance.
  const fogNear = fogVolume1
    ? Math.min(baseFogNear ?? Infinity, fogVolume1.visibleDistance * 0.25)
    : baseFogNear;
  const fogFar = fogVolume1
    ? Math.min(baseFogFar ?? Infinity, fogVolume1.visibleDistance * 0.9)
    : baseFogFar;

  const fogColor = useMemo(
    () => parseColorString(getProperty(object, "fogColor")),
    [object],
  );

  const skyColor = skySolidColor || fogColor;

  const backgroundColor = skyColor ? (
    <color attach="background" args={[skyColor[0]]} />
  ) : null;

  // Only enable fog if we have valid near/far distances
  const hasFogParams = fogNear != null && fogFar != null && fogFar > fogNear;

  return (
    <>
      {materialList && useSkyTextures ? (
        <Suspense fallback={backgroundColor}>
          <SkyBox
            materialList={materialList}
            fogColor={fogEnabled && hasFogParams ? fogColor?.[1] : undefined}
          />
        </Suspense>
      ) : (
        // If there's no material list or skybox textures are disabled,
        // render solid background
        backgroundColor
      )}
      {/* Cloud layers render independently of skybox textures */}
      <Suspense>
        <CloudLayers object={object} />
      </Suspense>
      {fogEnabled && hasFogParams && fogColor ? (
        <fog attach="fog" color={fogColor[1]} near={fogNear!} far={fogFar!} />
      ) : null}
    </>
  );
}
