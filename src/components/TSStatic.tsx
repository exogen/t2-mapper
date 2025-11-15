import { Suspense, useMemo } from "react";
import { ErrorBoundary } from "react-error-boundary";
import {
  ConsoleObject,
  getPosition,
  getProperty,
  getRotation,
  getScale,
} from "../mission";
import { ShapeModel, ShapePlaceholder } from "./GenericShape";

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
