import { Suspense, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCubeTexture } from "@react-three/drei";
import { Color, ShaderMaterial, BackSide } from "three";
import { ConsoleObject, getProperty } from "../mission";
import { useSettings } from "./SettingsProvider";
import { BASE_URL, getUrlForPath, loadDetailMapList } from "../loaders";

const FALLBACK_URL = `${BASE_URL}/black.png`;

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
            getUrlForPath(detailMapList[1], FALLBACK_URL), // +x
            getUrlForPath(detailMapList[3], FALLBACK_URL), // -x
            getUrlForPath(detailMapList[4], FALLBACK_URL), // +y
            getUrlForPath(detailMapList[5], FALLBACK_URL), // -y
            getUrlForPath(detailMapList[0], FALLBACK_URL), // +z
            getUrlForPath(detailMapList[2], FALLBACK_URL), // -z
          ]
        : [
            FALLBACK_URL,
            FALLBACK_URL,
            FALLBACK_URL,
            FALLBACK_URL,
            FALLBACK_URL,
            FALLBACK_URL,
          ],
    [detailMapList]
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

        // Convert linear to sRGB
        vec3 linearToSRGB(vec3 color) {
          return pow(color, vec3(1.0 / 2.2));
        }

        void main() {
          vec3 direction = normalize(vDirection);
          direction.x = -direction.x;
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

export function Sky({ object }: { object: ConsoleObject }) {
  const { fogEnabled } = useSettings();

  // Skybox textures.
  const materialList = getProperty(object, "materialList")?.value;

  // Fog parameters.
  // TODO: There can be multiple fog volumes/layers. Render simple fog for now.
  const fogDistance = useMemo(() => {
    const distanceString = getProperty(object, "fogDistance")?.value;
    if (distanceString) {
      return parseFloat(distanceString);
    }
  }, [object]);

  const fogColor = useMemo(() => {
    const colorString = getProperty(object, "fogColor")?.value;
    if (colorString) {
      // `colorString` might specify an alpha value, but three.js doesn't
      // support opacity on fog or scene backgrounds, so ignore it.
      const [r, g, b] = colorString.split(" ").map((s) => parseFloat(s));
      return [
        new Color().setRGB(r, g, b),
        new Color().setRGB(r, g, b).convertSRGBToLinear(),
      ];
    }
  }, [object]);

  const backgroundColor = fogColor ? (
    <color attach="background" args={[fogColor[0]]} />
  ) : null;

  return (
    <>
      {materialList ? (
        // If there's a skybox, its textures will need to load. Render just the
        // fog color as the background in the meantime.
        <Suspense fallback={backgroundColor}>
          <SkyBox
            materialList={materialList}
            fogColor={fogEnabled ? fogColor[1] : undefined}
            fogDistance={fogEnabled ? fogDistance : undefined}
          />
        </Suspense>
      ) : (
        // If there's no skybox, just render the fog color as the background.
        backgroundColor
      )}
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
