import { useMemo } from "react";
import type { TorqueObject } from "../torqueScript";
import { getPosition, getProperty } from "../mission";
import { FloatingLabel } from "./FloatingLabel";

export function WayPoint({ object }: { object: TorqueObject }) {
  const position = useMemo(() => getPosition(object), [object]);
  const label = getProperty(object, "name");

  return label ? (
    <FloatingLabel position={position} opacity={0.6}>
      {label}
    </FloatingLabel>
  ) : null;
}
