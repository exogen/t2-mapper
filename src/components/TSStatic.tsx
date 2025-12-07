import { useMemo } from "react";
import type { TorqueObject } from "../torqueScript";
import { getPosition, getProperty, getRotation, getScale } from "../mission";
import { ShapeRenderer } from "./GenericShape";
import { ShapeInfoProvider } from "./ShapeInfoProvider";

export function TSStatic({ object }: { object: TorqueObject }) {
  const shapeName = getProperty(object, "shapeName");

  const position = useMemo(() => getPosition(object), [object]);
  const q = useMemo(() => getRotation(object), [object]);
  const scale = useMemo(() => getScale(object), [object]);

  if (!shapeName) {
    console.error("<TSStatic> missing shapeName for object", object);
  }

  return (
    <ShapeInfoProvider shapeName={shapeName} type="TSStatic">
      <group position={position} quaternion={q} scale={scale}>
        <ShapeRenderer shapeName={shapeName} />
      </group>
    </ShapeInfoProvider>
  );
}
