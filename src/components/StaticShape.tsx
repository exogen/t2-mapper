import { useMemo } from "react";
import type { TorqueObject } from "../torqueScript";
import { getPosition, getProperty, getRotation, getScale } from "../mission";
import { ShapeRenderer } from "./GenericShape";
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
    <ShapeInfoProvider type="StaticShape" object={object} shapeName={shapeName}>
      <group position={position} quaternion={q} scale={scale}>
        <ShapeRenderer />
      </group>
    </ShapeInfoProvider>
  );
}
