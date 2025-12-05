import { Suspense, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCubeTexture } from "@react-three/drei";
import { Color, ShaderMaterial, BackSide, Euler, ShaderChunk } from "three";
import type { TorqueObject } from "../torqueScript";
import { getFloat, getInt, getProperty } from "../mission";
import { useSettings } from "./SettingsProvider";
import { BASE_URL, loadDetailMapList, textureToUrl } from "../loaders";
import { useThree } from "@react-three/fiber";
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
  fogNear,
  fogFar,
}: {
  materialList: string;
  fogColor?: Color;
  fogNear?: number;
  fogFar?: number;
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

  // Create a shader material for the skybox with fog
  const materialRef = useRef<ShaderMaterial>(null!);

  const hasFog = !!fogColor && fogNear != null && fogFar != null;

  const shaderMaterial = useMemo(() => {
    if (!hasFog) {
      return null;
    }

    // Skybox fog blends toward horizon
    return new ShaderMaterial({
      uniforms: {
        skybox: { value: skyBox },
        fogColor: { value: fogColor },
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

        varying vec3 vDirection;

        void main() {
          vec3 direction = normalize(vDirection);
          // Swap X and Z to match scene.backgroundRotation used in non-fog path
          direction = vec3(direction.z, direction.y, direction.x);
          vec4 skyColor = textureCube(skybox, direction);

          // Fog increases toward and below horizon
          // direction.y: -1 = straight down, 0 = horizon, 1 = straight up
          // Use smoothstep for gradual transition (matches Three.js linear fog feel)
          float fogFactor = 1.0 - smoothstep(-0.1, 0.5, direction.y);

          vec3 finalColor = mix(skyColor.rgb, fogColor, fogFactor);
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
      side: BackSide,
      depthWrite: false,
    });
  }, [skyBox, fogColor, hasFog]);

  // Update uniforms when fog parameters change
  useEffect(() => {
    if (materialRef.current && hasFog && shaderMaterial) {
      materialRef.current.uniforms.skybox.value = skyBox;
      materialRef.current.uniforms.fogColor.value = fogColor!;
    }
  }, [skyBox, fogColor, hasFog, shaderMaterial]);

  const { scene } = useThree();

  // Rotate background to match the X/Z swap applied in the fog shader path
  useEffect(() => {
    scene.backgroundRotation = new Euler(0, Math.PI / 2, 0);
  }, [scene]);

  // If fog is disabled, just use the skybox as background
  if (!hasFog) {
    return <primitive attach="background" object={skyBox} />;
  }

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

  const skySolidColor = useMemo(() => {
    const colorString = getProperty(object, "SkySolidColor");
    if (colorString) {
      // `colorString` might specify an alpha value, but three.js doesn't
      // support opacity on fog or scene backgrounds, so ignore it.
      // Note: This is a space-separated string, so we split and parse each component.
      const [r, g, b] = colorString
        .split(" ")
        .map((s: string) => parseFloat(s));
      return [
        new Color().setRGB(r, g, b),
        new Color().setRGB(r, g, b).convertSRGBToLinear(),
      ];
    }
  }, [object]);

  const useSkyTextures = getInt(object, "useSkyTextures") ?? 1;

  // Fog parameters - Tribes 2 uses fogDistance (near) and visibleDistance (far)
  // high_* variants are used for high quality settings (-1 or 0 means use normal)
  const fogDistanceBase = getFloat(object, "fogDistance");
  const visibleDistanceBase = getFloat(object, "visibleDistance");
  const highFogDistance = getFloat(object, "high_fogDistance");
  const highVisibleDistance = getFloat(object, "high_visibleDistance");

  // Use high quality values if available and valid (> 0)
  const fogNear =
    highFogDistance != null && highFogDistance > 0
      ? highFogDistance
      : fogDistanceBase;
  const fogFar =
    highVisibleDistance != null && highVisibleDistance > 0
      ? highVisibleDistance
      : visibleDistanceBase;

  const fogColor = useMemo(() => {
    const colorString = getProperty(object, "fogColor");
    if (colorString) {
      // `colorString` might specify an alpha value, but three.js doesn't
      // support opacity on fog or scene backgrounds, so ignore it.
      // Note: This is a space-separated string, so we split and parse each component.
      const [r, g, b] = colorString
        .split(" ")
        .map((s: string) => parseFloat(s));
      return [
        new Color().setRGB(r, g, b),
        new Color().setRGB(r, g, b).convertSRGBToLinear(),
      ];
    }
  }, [object]);

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
            fogNear={fogEnabled && hasFogParams ? fogNear : undefined}
            fogFar={fogEnabled && hasFogParams ? fogFar : undefined}
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
