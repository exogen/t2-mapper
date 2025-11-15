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

/**
 * Load a .glb file that was converted from a .dts, used for static shapes.
 */
function useStaticShape(shapeName: string) {
  const url = shapeToUrl(shapeName);
  return useGLTF(url);
}

function ShapeModel({ shapeName }: { shapeName: string }) {
  const { scene } = useStaticShape(shapeName);

  return <primitive object={scene} />;
}

function ShapePlaceholder({ color }: { color: string }) {
  return (
    <mesh>
      <boxGeometry args={[10, 10, 10]} />
      <meshStandardMaterial color={color} wireframe />
    </mesh>
  );
}

export function TSStatic({ object }: { object: ConsoleObject }) {
  const shapeName = getProperty(object, "shapeName").value;

  const [z, y, x] = useMemo(() => getPosition(object), [object]);
  const [scaleX, scaleY, scaleZ] = useMemo(() => getScale(object), [object]);
  const q = useMemo(() => getRotation(object, true), [object]);

  return (
    <group
      quaternion={q}
      position={[x - 1024, y, z - 1024]}
      scale={[-scaleX, scaleY, -scaleZ]}
    >
      <ErrorBoundary fallback={<ShapePlaceholder color="red" />}>
        <Suspense fallback={<ShapePlaceholder color="yellow" />}>
          <ShapeModel shapeName={shapeName} />
        </Suspense>
      </ErrorBoundary>
    </group>
  );
}
