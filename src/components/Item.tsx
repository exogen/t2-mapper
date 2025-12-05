import { Suspense, useMemo } from "react";
import { ErrorBoundary } from "react-error-boundary";
import type { TorqueObject } from "../torqueScript";
import { getPosition, getProperty, getRotation, getScale } from "../mission";
import { DebugPlaceholder, ShapeModel, ShapePlaceholder } from "./GenericShape";
import { ShapeInfoProvider } from "./ShapeInfoProvider";
import { useSimGroup } from "./SimGroup";
import { FloatingLabel } from "./FloatingLabel";
import { useDatablock } from "./useDatablock";

const TEAM_NAMES = {
  1: "Storm",
  2: "Inferno",
};

export function Item({ object }: { object: TorqueObject }) {
  const simGroup = useSimGroup();
  const datablockName = getProperty(object, "dataBlock") ?? "";
  const datablock = useDatablock(datablockName);

  const position = useMemo(() => getPosition(object), [object]);
  const scale = useMemo(() => getScale(object), [object]);
  const q = useMemo(() => getRotation(object), [object]);

  const shapeName = getProperty(datablock, "shapeFile");

  if (!shapeName) {
    console.error(`<Item> missing shape for datablock: ${datablockName}`);
  }

  const isFlag = datablockName?.toLowerCase() === "flag";
  const team = simGroup?.team ?? null;
  const teamName = team > 0 ? TEAM_NAMES[team] : null;
  const label = isFlag && teamName ? `${teamName} Flag` : null;

  return (
    <ShapeInfoProvider shapeName={shapeName} type="Item">
      <group position={position} quaternion={q} scale={scale}>
        {shapeName ? (
          <ErrorBoundary
            fallback={<DebugPlaceholder color="red" label={shapeName} />}
          >
            <Suspense fallback={<ShapePlaceholder color="pink" />}>
              <ShapeModel />
              {label ? (
                <FloatingLabel opacity={0.6}>{label}</FloatingLabel>
              ) : null}
            </Suspense>
          </ErrorBoundary>
        ) : (
          <DebugPlaceholder color="orange" />
        )}
      </group>
    </ShapeInfoProvider>
  );
}
