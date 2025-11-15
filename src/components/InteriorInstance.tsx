import { memo, Suspense, useMemo } from "react";
import { Mesh } from "three";
import { useGLTF, useTexture } from "@react-three/drei";
import { BASE_URL, interiorTextureToUrl, interiorToUrl } from "../loaders";
import {
  ConsoleObject,
  getPosition,
  getProperty,
  getRotation,
  getScale,
} from "../mission";
import { setupColor } from "../textureUtils";

const FALLBACK_URL = `${BASE_URL}/black.png`;

/**
 * Load a .gltf file that was converted from a .dif, used for "interior" models.
 */
function useInterior(interiorFile: string) {
  const url = interiorToUrl(interiorFile);
  return useGLTF(url);
}

function InteriorTexture({ materialName }: { materialName: string }) {
  let url = FALLBACK_URL;
  try {
    url = interiorTextureToUrl(materialName);
  } catch (err) {
    console.error(err);
  }

  const texture = useTexture(url, (texture) => setupColor(texture));

  return <meshStandardMaterial map={texture} side={2} />;
}

function InteriorMesh({ node }: { node: Mesh }) {
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
              <InteriorTexture key={index} materialName={mat.name} />
            ))
          ) : (
            <InteriorTexture materialName={node.material.name} />
          )}
        </Suspense>
      ) : null}
    </mesh>
  );
}

export const InteriorModel = memo(
  ({ interiorFile }: { interiorFile: string }) => {
    const { nodes } = useInterior(interiorFile);

    return (
      <>
        {Object.entries(nodes)
          .filter(
            ([name, node]: [string, any]) =>
              !node.material || !node.material.name.match(/\.\d+$/)
          )
          .map(([name, node]: [string, any]) => (
            <InteriorMesh key={name} node={node} />
          ))}
      </>
    );
  }
);

function InteriorPlaceholder() {
  return (
    <mesh>
      <boxGeometry args={[10, 10, 10]} />
      <meshStandardMaterial color="orange" wireframe />
    </mesh>
  );
}

export const InteriorInstance = memo(
  ({ object }: { object: ConsoleObject }) => {
    const interiorFile = getProperty(object, "interiorFile").value;
    const [z, y, x] = useMemo(() => getPosition(object), [object]);
    const [scaleX, scaleY, scaleZ] = useMemo(() => getScale(object), [object]);
    const q = useMemo(() => getRotation(object, true), [object]);

    return (
      <group
        quaternion={q}
        position={[x - 1024, y, z - 1024]}
        scale={[-scaleX, scaleY, -scaleZ]}
      >
        <Suspense fallback={<InteriorPlaceholder />}>
          <InteriorModel interiorFile={interiorFile} />
        </Suspense>
      </group>
    );
  }
);
