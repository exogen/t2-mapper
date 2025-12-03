import { Suspense, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCubeTexture } from "@react-three/drei";
import { Color, ShaderMaterial, BackSide, Euler } from "three";
import type { TorqueObject } from "../torqueScript";
import { getFloat, getInt, getProperty } from "../mission";
import { useSettings } from "./SettingsProvider";
import { BASE_URL, loadDetailMapList, textureToUrl } from "../loaders";
import { useThree } from "@react-three/fiber";
import { CloudLayers } from "./CloudLayers";

const FALLBACK_TEXTURE_URL = `${BASE_URL}/black.png`;

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
  fogDistance,
}: {
  materialList: string;
  fogColor?: Color;
  fogDistance?: number;
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

  const hasFog = !!fogColor && !!fogDistance;

  const shaderMaterial = useMemo(() => {
    if (!hasFog) {
      return null;
    }

    return new ShaderMaterial({
      uniforms: {
        skybox: { value: skyBox },
        fogColor: { value: fogColor },
      },
      vertexShader: `
        varying vec3 vDirection;

        void main() {
          // Use position directly as direction (no world transform needed)
          vDirection = position;

          // Transform position but ignore translation
          vec4 pos = projectionMatrix * mat4(mat3(modelViewMatrix)) * vec4(position, 1.0);
          gl_Position = pos.xyww; // Set depth to far plane
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

          // Calculate fog factor based on vertical direction
          // direction.y: -1 = straight down, 0 = horizon, 1 = straight up
          // 100% fog from bottom to horizon, then fade from horizon (0) to 0.4
          float fogFactor = smoothstep(0.0, 0.4, direction.y);

          // Mix in sRGB space to match Three.js fog rendering
          vec3 finalColor = mix(fogColor, skyColor.rgb, fogFactor);
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
    <mesh scale={5000}>
      <sphereGeometry args={[1, 60, 40]} />
      <primitive ref={materialRef} object={shaderMaterial} attach="material" />
    </mesh>
  );
}

export function Sky({ object }: { object: TorqueObject }) {
  const { fogEnabled } = useSettings();

  // Skybox textures.
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

  // Fog parameters.
  // TODO: There can be multiple fog volumes/layers. Render simple fog for now.
  const fogDistance = getFloat(object, "fogDistance");

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

  return (
    <>
      {materialList && useSkyTextures ? (
        // Load the DML for skybox textures
        <Suspense fallback={backgroundColor}>
          <SkyBox
            materialList={materialList}
            fogColor={fogEnabled ? fogColor?.[1] : undefined}
            fogDistance={fogEnabled ? fogDistance : undefined}
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
      {fogEnabled && fogDistance && fogColor ? (
        <fog
          attach="fog"
          color={fogColor[1]}
          near={100}
          far={Math.max(400, fogDistance * 2)}
        />
      ) : null}
    </>
  );
}
