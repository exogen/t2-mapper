import { useCallback, useRef } from "react";
import { Vector3 } from "three";

export function usePositionTracker() {
  const positionRef = useRef<Vector3>(null);

  const hasChanged = useCallback((position: Vector3) => {
    if (!positionRef.current) {
      positionRef.current = position.clone();
      return true;
    }
    const isSamePosition =
      positionRef.current.x === position.x &&
      positionRef.current.y === position.y &&
      positionRef.current.z === position.z;

    if (!isSamePosition) {
      positionRef.current.copy(position);
    }

    return isSamePosition;
  }, []);

  return hasChanged;
}
