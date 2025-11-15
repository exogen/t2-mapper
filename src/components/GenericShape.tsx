import { Suspense } from "react";
import { useGLTF, useTexture } from "@react-three/drei";
import { BASE_URL, shapeTextureToUrl, shapeToUrl } from "../loaders";
import { setupColor } from "../textureUtils";

const FALLBACK_URL = `${BASE_URL}/black.png`;

/**
 * Load a .glb file that was converted from a .dts, used for static shapes.
 */
export function useStaticShape(shapeName: string) {
  const url = shapeToUrl(shapeName);
  return useGLTF(url);
}

export function ShapeTexture({ materialName }: { materialName: string }) {
  // console.log({ materialName });
  const url = shapeTextureToUrl(materialName, FALLBACK_URL);
  const texture = useTexture(url, (texture) => setupColor(texture));

  return <meshStandardMaterial map={texture} side={2} />;
}

export function ShapeModel({ shapeName }: { shapeName: string }) {
  const { nodes } = useStaticShape(shapeName);

  return (
    <>
      {Object.entries(nodes)
        .filter(
          ([name, node]: [string, any]) =>
            !node.material || !node.material.name.match(/\.\d+$/)
        )
        .map(([name, node]: [string, any]) => (
          <mesh key={node.id} geometry={node.geometry} castShadow receiveShadow>
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
                    <ShapeTexture key={index} materialName={mat.name} />
                  ))
                ) : (
                  <ShapeTexture materialName={node.material.name} />
                )}
              </Suspense>
            ) : null}
          </mesh>
        ))}
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
