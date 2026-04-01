import type { WayPointEntity } from "../state/gameEntityTypes";
import { useIsDebugTourTarget } from "../state/cameraTourStore";
import { DebugMarker } from "./DebugBounds";
import { FloatingLabel } from "./FloatingLabel";

export function WayPoint({ entity }: { entity: WayPointEntity }) {
  const isTarget = useIsDebugTourTarget(entity.id);
  return (
    <>
      {entity.label ? (
        <FloatingLabel opacity={0.6}>{entity.label}</FloatingLabel>
      ) : null}
      {isTarget && <DebugMarker radius={1.5} />}
    </>
  );
}
