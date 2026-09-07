import { useMemo } from "react";
import { Box3, Vector3, type Object3D } from "three";
import { DebugBounds } from "./DebugBounds";
import { useIsDebugTourTarget } from "../state/cameraTourStore";

/**
 * The shape's bounding box, drawn while it is the debug tour's target.
 */
export function DebugShapeBounds({
  entityId,
  scene,
}: {
  entityId: string;
  /** The unrotated source scene (bounds are in GLB space). */
  scene: Object3D;
}) {
  const isTarget = useIsDebugTourTarget(entityId);
  const bounds = useMemo(() => {
    if (!isTarget) return null;
    const box = new Box3().setFromObject(scene);
    return {
      center: box.getCenter(new Vector3()),
      size: box.getSize(new Vector3()).toArray() as [number, number, number],
    };
  }, [isTarget, scene]);
  if (!bounds) return null;
  return (
    <group position={bounds.center}>
      <DebugBounds size={bounds.size} />
    </group>
  );
}
