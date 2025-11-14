import { useGLTF, useTexture } from "@react-three/drei";
import { BASE_URL, interiorTextureToUrl, interiorToUrl } from "@/src/loaders";
import {
  ConsoleObject,
  getPosition,
  getProperty,
  getRotation,
  getScale,
} from "@/src/mission";
import { Suspense, useMemo } from "react";
import { Material, Mesh } from "three";
import { setupColor } from "@/src/textureUtils";

const FALLBACK_URL = `${BASE_URL}/black.png`;

/**
 * Load a .gltf file that was converted from a .dif, used for "interior" models.
 */
function useInterior(interiorFile: string) {
  const url = interiorToUrl(interiorFile);
  return useGLTF(url);
}

function InteriorTexture({ material }: { material: Material }) {
  let url = FALLBACK_URL;
  try {
    url = interiorTextureToUrl(material.name);
  } catch (err) {
    console.error(err);
  }

  const texture = useTexture(url, (texture) => setupColor(texture));

  return <meshStandardMaterial map={texture} />;
}

function InteriorMesh({ node }: { node: Mesh }) {
  if (Array.isArray(node.material)) {
    throw new Error("Unexpected multi-material node");
  }
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
          <InteriorTexture material={node.material} />
        </Suspense>
      ) : null}
    </mesh>
  );
}

export function InteriorModel({ interiorFile }: { interiorFile: string }) {
  const { nodes } = useInterior(interiorFile);

  return (
    <>
      {Object.entries(nodes)
        // .filter(
        //   ([name, node]: [string, any]) => true
        //   // !node.material || !node.material.name.match(/\.\d+$/)
        // )
        .map(([name, node]: [string, any]) => (
          <InteriorMesh key={name} node={node} />
        ))}
    </>
  );
}

function InteriorPlaceholder() {
  return (
    <mesh>
      <boxGeometry args={[10, 10, 10]} />
      <meshStandardMaterial color="orange" wireframe />
    </mesh>
  );
}

export function InteriorInstance({ object }: { object: ConsoleObject }) {
  const interiorFile = getProperty(object, "interiorFile").value;
  const [z, y, x] = useMemo(() => getPosition(object), [object]);
  const [scaleX, scaleY, scaleZ] = useMemo(() => getScale(object), [object]);
  const q = useMemo(() => getRotation(object, true), [object]);

  return (
    <group quaternion={q} position={[x, y, z]} scale={[scaleX, scaleY, scaleZ]}>
      <Suspense fallback={<InteriorPlaceholder />}>
        <InteriorModel interiorFile={interiorFile} />
      </Suspense>
    </group>
  );
}
