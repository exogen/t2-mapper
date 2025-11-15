import { Suspense, useMemo } from "react";
import { ErrorBoundary } from "react-error-boundary";
import {
  ConsoleObject,
  getPosition,
  getProperty,
  getRotation,
  getScale,
} from "../mission";
import { shapeToUrl } from "../loaders";
import { useGLTF } from "@react-three/drei";

const dataBlockToShapeName = {
  RepairPack: "pack_upgrade_repair.dts",
};

/**
 * Load a .glb file that was converted from a .dts, used for static shapes.
 */
function useStaticShape(shapeName: string) {
  const url = shapeToUrl(shapeName);
  return useGLTF(url);
}

function ShapeModel({ shapeName }: { shapeName: string }) {
  const { nodes } = useStaticShape(shapeName);

  return (
    <>
      {Object.entries(nodes)
        .filter(
          ([name, node]: [string, any]) =>
            !node.material || !node.material.name.match(/\.\d+$/)
        )
        .map(([name, node]: [string, any]) => (
          <mesh geometry={node.geometry} castShadow receiveShadow>
            <meshStandardMaterial color="cyan" wireframe />
          </mesh>
        ))}
    </>
  );
}

function ShapePlaceholder({ color }: { color: string }) {
  return (
    <mesh>
      <boxGeometry args={[10, 10, 10]} />
      <meshStandardMaterial color={color} wireframe />
    </mesh>
  );
}

export function Item({ object }: { object: ConsoleObject }) {
  const dataBlock = getProperty(object, "dataBlock").value;

  const [z, y, x] = useMemo(() => getPosition(object), [object]);
  const [scaleX, scaleY, scaleZ] = useMemo(() => getScale(object), [object]);
  const q = useMemo(() => getRotation(object, true), [object]);

  const shapeName = dataBlockToShapeName[dataBlock];

  return (
    <group
      quaternion={q}
      position={[x - 1024, y, z - 1024]}
      scale={[-scaleX, scaleY, -scaleZ]}
    >
      {shapeName ? (
        <ErrorBoundary fallback={<ShapePlaceholder color="red" />}>
          <Suspense fallback={<ShapePlaceholder color="yellow" />}>
            <ShapeModel shapeName={shapeName} />
          </Suspense>
        </ErrorBoundary>
      ) : (
        <ShapePlaceholder color="orange" />
      )}
    </group>
  );
}
