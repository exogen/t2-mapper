import { useMemo } from "react";
import { ConsoleObject, getPosition, getProperty } from "../mission";
import { FloatingLabel } from "./FloatingLabel";
import { useSimGroup } from "./SimGroup";

export function WayPoint({ object }: { object: ConsoleObject }) {
  const simGroup = useSimGroup();
  const position = useMemo(() => getPosition(object), [object]);
  const label = getProperty(object, "name")?.value;

  return label ? (
    <FloatingLabel position={position} opacity={0.6}>
      {label}
    </FloatingLabel>
  ) : null;
}
