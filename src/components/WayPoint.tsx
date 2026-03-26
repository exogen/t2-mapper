import type { WayPointEntity } from "../state/gameEntityTypes";
import { FloatingLabel } from "./FloatingLabel";

export function WayPoint({ entity }: { entity: WayPointEntity }) {
  return entity.label ? (
    <FloatingLabel opacity={0.6}>
      {entity.label}
    </FloatingLabel>
  ) : null;
}
