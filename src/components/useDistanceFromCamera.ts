import { useFrame, useThree } from "@react-three/fiber";
import { RefObject, useRef } from "react";
import { Object3D } from "three";
import { useWorldPosition } from "./useWorldPosition";

export function useDistanceFromCamera<T extends Object3D>(
  ref: RefObject<T>,
): RefObject<number> {
  const camera = useThree((state) => state.camera);
  const distanceRef = useRef<number>(null);
  const worldPosRef = useWorldPosition(ref);

  useFrame(() => {
    if (!worldPosRef.current) {
      distanceRef.current = null;
    } else {
      distanceRef.current = camera.position.distanceTo(worldPosRef.current);
    }
  });

  return distanceRef;
}
