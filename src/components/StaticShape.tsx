import { Suspense, useMemo } from "react";
import { ErrorBoundary } from "react-error-boundary";
import type { TorqueObject } from "../torqueScript";
import { getPosition, getProperty, getRotation, getScale } from "../mission";
import { DebugPlaceholder, ShapeModel, ShapePlaceholder } from "./GenericShape";
import { ShapeInfoProvider } from "./ShapeInfoProvider";
import { useDatablock } from "./useDatablock";

export function StaticShape({ object }: { object: TorqueObject }) {
  const datablockName = getProperty(object, "dataBlock") ?? "";
  const datablock = useDatablock(datablockName);

  const position = useMemo(() => getPosition(object), [object]);
  const q = useMemo(() => getRotation(object), [object]);
  const scale = useMemo(() => getScale(object), [object]);

  const shapeName = getProperty(datablock, "shapeFile");

  if (!shapeName) {
    console.error(
      `<StaticShape> missing shape for datablock: ${datablockName}`,
    );
  }

  return (
    <ShapeInfoProvider shapeName={shapeName} type="StaticShape">
      <group position={position} quaternion={q} scale={scale}>
        {shapeName ? (
          <ErrorBoundary
            fallback={<DebugPlaceholder color="red" label={shapeName} />}
          >
            <Suspense fallback={<ShapePlaceholder color="yellow" />}>
              <ShapeModel />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <DebugPlaceholder color="orange" />
        )}
      </group>
    </ShapeInfoProvider>
  );
}
