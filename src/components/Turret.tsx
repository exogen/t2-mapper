import { Suspense, useMemo } from "react";
import { ErrorBoundary } from "react-error-boundary";
import type { TorqueObject } from "../torqueScript";
import { getPosition, getProperty, getRotation, getScale } from "../mission";
import { DebugPlaceholder, ShapeModel, ShapePlaceholder } from "./GenericShape";
import { ShapeInfoProvider } from "./ShapeInfoProvider";
import { useDatablock } from "./useDatablock";

export function Turret({ object }: { object: TorqueObject }) {
  const datablockName = getProperty(object, "dataBlock") ?? "";
  const barrelDatablockName = getProperty(object, "initialBarrel");
  const datablock = useDatablock(datablockName);
  const barrelDatablock = useDatablock(barrelDatablockName);

  const position = useMemo(() => getPosition(object), [object]);
  const q = useMemo(() => getRotation(object), [object]);
  const scale = useMemo(() => getScale(object), [object]);

  const shapeName = getProperty(datablock, "shapeFile");
  const barrelShapeName = getProperty(barrelDatablock, "shapeFile");

  if (!shapeName) {
    console.error(`<Turret> missing shape for datablock: ${datablockName}`);
  }
  // `initialBarrel` is optional - turrets can exist without a barrel mounted.
  // But if we do have one, it needs a shape name.
  if (barrelDatablockName && !barrelShapeName) {
    console.error(
      `<Turret> missing shape for barrel datablock: ${barrelDatablockName}`,
    );
  }

  return (
    <ShapeInfoProvider shapeName={shapeName} type="Turret">
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
        {barrelShapeName ? (
          <ShapeInfoProvider shapeName={barrelShapeName} type="Turret">
            <group position={[0, 1.5, 0]}>
              <ErrorBoundary
                fallback={
                  <DebugPlaceholder color="red" label={barrelShapeName} />
                }
              >
                <Suspense fallback={<ShapePlaceholder color="yellow" />}>
                  <ShapeModel />
                </Suspense>
              </ErrorBoundary>
            </group>
          </ShapeInfoProvider>
        ) : null}
      </group>
    </ShapeInfoProvider>
  );
}
