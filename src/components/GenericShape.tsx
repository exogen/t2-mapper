import { Suspense } from "react";
import { useGLTF, useTexture } from "@react-three/drei";
import { BASE_URL, shapeTextureToUrl, shapeToUrl } from "../loaders";
import { filterGeometryByVertexGroups, getHullBoneIndices } from "../meshUtils";
import {
  createAlphaAsRoughnessMaterial,
  setupAlphaAsRoughnessTexture,
} from "../shaderMaterials";
import { MeshStandardMaterial } from "three";

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
}: {
  material?: MeshStandardMaterial;
}) {
  const url = shapeTextureToUrl(material.name, FALLBACK_URL);
  const texture = useTexture(url, (texture) =>
    setupAlphaAsRoughnessTexture(texture)
  );

  // Create or reuse shader material that uses alpha channel as roughness
  const shaderMaterial = createAlphaAsRoughnessMaterial();
  shaderMaterial.map = texture;

  return <primitive object={shaderMaterial} attach="material" />;
}

export function ShapeModel({ shapeName }: { shapeName: string }) {
  const { nodes } = useStaticShape(shapeName);

  let hullBoneIndices = new Set<number>();
  const skeletonsFound = Object.values(nodes).filter(
    (node: any) => node.skeleton
  );

  if (skeletonsFound.length > 0) {
    const skeleton = (skeletonsFound[0] as any).skeleton;
    hullBoneIndices = getHullBoneIndices(skeleton);
  }

  return (
    <>
      {Object.entries(nodes)
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

          return (
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
                      />
                    ))
                  ) : (
                    <ShapeTexture
                      material={node.material as MeshStandardMaterial}
                    />
                  )}
                </Suspense>
              ) : null}
            </mesh>
          );
        })}
    </>
  );
}

export function ShapePlaceholder({ color }: { color: string }) {
  return (
    <mesh>
      <boxGeometry args={[10, 10, 10]} />
      <meshStandardMaterial color={color} wireframe />
    </mesh>
  );
}
