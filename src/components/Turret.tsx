import { useMemo } from "react";
import type { TorqueObject } from "../torqueScript";
import { createLogger } from "../logger";
import { getPosition, getProperty, getRotation, getScale } from "../mission";
import { ShapeRenderer } from "./GenericShape";
import { ShapeInfoProvider } from "./ShapeInfoProvider";
import { useDatablock } from "./useDatablock";

const log = createLogger("Turret");
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
    log.error("Turret missing shape for datablock: %s", datablockName);
  }
  // `initialBarrel` is optional - turrets can exist without a barrel mounted.
  // But if we do have one, it needs a shape name.
  if (barrelDatablockName && !barrelShapeName) {
    log.error(
      "Turret missing shape for barrel datablock: %s",
      barrelDatablockName,
    );
  }
  return (
    <ShapeInfoProvider type="Turret" object={object} shapeName={shapeName}>
      <group position={position} quaternion={q} scale={scale}>
        <ShapeRenderer />
        {barrelShapeName ? (
          <ShapeInfoProvider
            type="Turret"
            object={object}
            shapeName={barrelShapeName}
          >
            <group position={[0, 1.5, 0]}>
              <ShapeRenderer />
            </group>
          </ShapeInfoProvider>
        ) : null}
      </group>
    </ShapeInfoProvider>
  );
}
