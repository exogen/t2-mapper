import { useMemo } from "react";
import type { TorqueObject } from "../torqueScript";
import { getPosition, getProperty, getRotation, getScale } from "../mission";
import { ShapeRenderer } from "./GenericShape";
import { ShapeInfoProvider } from "./ShapeInfoProvider";
import { useSimGroup } from "./SimGroup";
import { FloatingLabel } from "./FloatingLabel";
import { useDatablock } from "./useDatablock";

const TEAM_NAMES: Record<number, string> = {
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
  const teamName = team && team > 0 ? TEAM_NAMES[team] : null;
  const label = isFlag && teamName ? `${teamName} Flag` : null;

  return (
    <ShapeInfoProvider type="Item" object={object} shapeName={shapeName}>
      <group position={position} quaternion={q} scale={scale}>
        <ShapeRenderer loadingColor="pink">
          {label ? <FloatingLabel opacity={0.6}>{label}</FloatingLabel> : null}
        </ShapeRenderer>
      </group>
    </ShapeInfoProvider>
  );
}
