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
import { ShapeInfoProvider } from "./ShapeInfoProvider";

export function TSStatic({ object }: { object: ConsoleObject }) {
  const shapeName = getProperty(object, "shapeName").value;

  const position = useMemo(() => getPosition(object), [object]);
  const q = useMemo(() => getRotation(object), [object]);
  const scale = useMemo(() => getScale(object), [object]);

  if (!shapeName) {
    console.error("<TSStatic> missing shapeName for object", object);
  }

  return (
    <ShapeInfoProvider shapeName={shapeName} type="TSStatic">
      <group position={position} quaternion={q} scale={scale}>
        <ErrorBoundary fallback={<ShapePlaceholder color="red" />}>
          <Suspense fallback={<ShapePlaceholder color="yellow" />}>
            <ShapeModel />
          </Suspense>
        </ErrorBoundary>
      </group>
    </ShapeInfoProvider>
  );
}
