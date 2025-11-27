import { memo, Suspense, useMemo } from "react";
import { useGLTF, useTexture } from "@react-three/drei";
import { BASE_URL, shapeTextureToUrl, shapeToUrl } from "../loaders";
import { filterGeometryByVertexGroups, getHullBoneIndices } from "../meshUtils";
import {
  createAlphaAsRoughnessMaterial,
  setupAlphaAsRoughnessTexture,
} from "../shaderMaterials";
import { MeshStandardMaterial } from "three";
import { setupColor } from "../textureUtils";
import { useDebug } from "./SettingsProvider";
import { useShapeInfo } from "./ShapeInfoProvider";
import { FloatingLabel } from "./FloatingLabel";

const FALLBACK_URL = `${BASE_URL}/black.png`;

/**
 * Load a .glb file that was converted from a .dts, used for static shapes.
 */
export function useStaticShape(shapeName: string) {
  const url = shapeToUrl(shapeName);
  return useGLTF(url);
}

export function ShapeTexture({
  material,
  shapeName,
}: {
  material?: MeshStandardMaterial;
  shapeName?: string;
}) {
  const url = shapeTextureToUrl(material.name, FALLBACK_URL);
  const isOrganic = shapeName && /borg|xorg|porg|dorg/i.test(shapeName);

  const texture = useTexture(url, (texture) => {
    if (!isOrganic) {
      setupAlphaAsRoughnessTexture(texture);
    }
    return setupColor(texture);
  });

  const customMaterial = useMemo(() => {
    // Only use alpha-as-roughness material for borg shapes
    if (!isOrganic) {
      const shaderMaterial = createAlphaAsRoughnessMaterial();
      shaderMaterial.map = texture;
      return shaderMaterial;
    }

    // For non-borg shapes, use the original GLTF material with updated texture
    const clonedMaterial = material.clone();
    clonedMaterial.map = texture;
    clonedMaterial.transparent = true;
    clonedMaterial.alphaTest = 0.9;
    return clonedMaterial;
  }, [material, texture, isOrganic]);

  return <primitive object={customMaterial} attach="material" />;
}

export function ShapePlaceholder({ color }: { color: string }) {
  return (
    <mesh>
      <boxGeometry args={[10, 10, 10]} />
      <meshStandardMaterial color={color} wireframe />
    </mesh>
  );
}

export function DebugPlaceholder({ color }: { color: string }) {
  const { debugMode } = useDebug();
  return debugMode ? <ShapePlaceholder color={color} /> : null;
}

export type StaticShapeType = "StaticShape" | "TSStatic" | "Item" | "Turret";

export const ShapeModel = memo(function ShapeModel() {
  const { shapeName } = useShapeInfo();
  const { debugMode } = useDebug();
  const { nodes } = useStaticShape(shapeName);

  const hullBoneIndices = useMemo(() => {
    const skeletonsFound = Object.values(nodes).filter(
      (node: any) => node.skeleton
    );

    if (skeletonsFound.length > 0) {
      const skeleton = (skeletonsFound[0] as any).skeleton;
      return getHullBoneIndices(skeleton);
    }
    return new Set<number>();
  }, [nodes]);

  const processedNodes = useMemo(() => {
    return Object.entries(nodes)
      .filter(
        ([name, node]: [string, any]) =>
          node.material &&
          node.material.name !== "Unassigned" &&
          !node.name.match(/^Hulk/i)
      )
      .map(([name, node]: [string, any]) => {
        const geometry = filterGeometryByVertexGroups(
          node.geometry,
          hullBoneIndices
        );
        return { node, geometry };
      });
  }, [nodes, hullBoneIndices]);

  return (
    <group rotation={[0, Math.PI / 2, 0]}>
      {processedNodes.map(({ node, geometry }) => (
        <mesh key={node.id} geometry={geometry} castShadow receiveShadow>
          {node.material ? (
            <Suspense
              fallback={
                // Allow the mesh to render while the texture is still loading;
                // show a wireframe placeholder.
                <meshStandardMaterial color="gray" wireframe />
              }
            >
              {Array.isArray(node.material) ? (
                node.material.map((mat, index) => (
                  <ShapeTexture
                    key={index}
                    material={mat as MeshStandardMaterial}
                    shapeName={shapeName}
                  />
                ))
              ) : (
                <ShapeTexture
                  material={node.material as MeshStandardMaterial}
                  shapeName={shapeName}
                />
              )}
            </Suspense>
          ) : null}
        </mesh>
      ))}
      {debugMode ? <FloatingLabel>{shapeName}</FloatingLabel> : null}
    </group>
  );
});
