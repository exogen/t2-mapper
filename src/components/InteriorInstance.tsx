import { memo, Suspense, useMemo } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Mesh, Material, MeshStandardMaterial, Texture } from "three";
import { useGLTF, useTexture } from "@react-three/drei";
import { textureToUrl, interiorToUrl } from "../loaders";
import type { TorqueObject } from "../torqueScript";
import { getPosition, getProperty, getRotation, getScale } from "../mission";
import { setupColor } from "../textureUtils";
import { FloatingLabel } from "./FloatingLabel";
import { useDebug } from "./SettingsProvider";

const LIGHTMAP_INTENSITY = 4;

/**
 * Load a .gltf file that was converted from a .dif, used for "interior" models.
 */
function useInterior(interiorFile: string) {
  const url = interiorToUrl(interiorFile);
  return useGLTF(url);
}

function InteriorTexture({
  materialName,
  material,
  lightMap,
}: {
  materialName: string;
  material?: Material;
  lightMap?: Texture | null;
}) {
  const url = textureToUrl(materialName);
  const texture = useTexture(url, (texture) => setupColor(texture));

  // Check for self-illuminating flag in material userData
  // Note: The io_dif Blender add-on needs to be updated to export material flags
  const flagNames = new Set<string>(material?.userData?.flag_names ?? []);
  const isSelfIlluminating = flagNames.has("SelfIlluminating");

  // Self-illuminating materials are fullbright (unlit)
  if (isSelfIlluminating) {
    return <meshBasicMaterial map={texture} side={2} toneMapped={false} />;
  }

  // Use lightMap if available (baked lighting from DIF files)
  // Three.js MeshLambertMaterial automatically uses uv2 for lightMap
  return (
    <meshLambertMaterial
      map={texture}
      lightMap={lightMap ?? undefined}
      lightMapIntensity={lightMap ? LIGHTMAP_INTENSITY : undefined}
      side={2}
    />
  );
}

/**
 * Extract lightmap texture from a glTF material.
 * The io_dif Blender addon stores lightmaps in the emissive channel for transport.
 */
function getLightMap(material: Material | null): Texture | null {
  if (!material) return null;
  // glTF materials come through as MeshStandardMaterial
  const stdMat = material as MeshStandardMaterial;
  // Lightmap is stored in emissiveMap with 0 strength (just for glTF transport)
  return stdMat.emissiveMap ?? null;
}

function InteriorMesh({ node }: { node: Mesh }) {
  // Extract lightmaps from original materials (stored in emissiveMap for glTF transport)
  const lightMaps = useMemo(() => {
    if (!node.material) return [];
    if (Array.isArray(node.material)) {
      return node.material.map(getLightMap);
    }
    return [getLightMap(node.material)];
  }, [node.material]);

  return (
    <mesh geometry={node.geometry} castShadow receiveShadow>
      {node.material ? (
        <Suspense
          fallback={
            // Allow the mesh to render while the texture is still loading;
            // show a wireframe placeholder.
            <meshStandardMaterial color="yellow" wireframe />
          }
        >
          {Array.isArray(node.material) ? (
            node.material.map((mat, index) => (
              <InteriorTexture
                key={index}
                materialName={mat.userData.resource_path}
                material={mat}
                lightMap={lightMaps[index]}
              />
            ))
          ) : (
            <InteriorTexture
              materialName={node.material.userData.resource_path}
              material={node.material}
              lightMap={lightMaps[0]}
            />
          )}
        </Suspense>
      ) : null}
    </mesh>
  );
}

export const InteriorModel = memo(
  ({ interiorFile }: { interiorFile: string }) => {
    const { nodes } = useInterior(interiorFile);
    const { debugMode } = useDebug();

    return (
      <group rotation={[0, -Math.PI / 2, 0]}>
        {Object.entries(nodes)
          .filter(([, node]: [string, any]) => node.isMesh)
          .map(([name, node]: [string, any]) => (
            <InteriorMesh key={name} node={node} />
          ))}
        {debugMode ? <FloatingLabel>{interiorFile}</FloatingLabel> : null}
      </group>
    );
  },
);

function InteriorPlaceholder({
  color,
  label,
}: {
  color: string;
  label?: string;
}) {
  return (
    <mesh>
      <boxGeometry args={[10, 10, 10]} />
      <meshStandardMaterial color={color} wireframe />
      {label ? <FloatingLabel color={color}>{label}</FloatingLabel> : null}
    </mesh>
  );
}

function DebugInteriorPlaceholder({ label }: { label?: string }) {
  const { debugMode } = useDebug();
  return debugMode ? <InteriorPlaceholder color="red" label={label} /> : null;
}

export const InteriorInstance = memo(function InteriorInstance({
  object,
}: {
  object: TorqueObject;
}) {
  const interiorFile = getProperty(object, "interiorFile");
  const position = useMemo(() => getPosition(object), [object]);
  const scale = useMemo(() => getScale(object), [object]);
  const q = useMemo(() => getRotation(object), [object]);

  return (
    <group position={position} quaternion={q} scale={scale}>
      <ErrorBoundary
        fallback={<DebugInteriorPlaceholder label={interiorFile} />}
      >
        <Suspense fallback={<InteriorPlaceholder color="orange" />}>
          <InteriorModel interiorFile={interiorFile} />
        </Suspense>
      </ErrorBoundary>
    </group>
  );
});
