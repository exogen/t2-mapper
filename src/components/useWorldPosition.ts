import { useFrame } from "@react-three/fiber";
import { useRef, RefObject } from "react";
import { Object3D, Vector3 } from "three";

export function useWorldPosition<T extends Object3D>(
  ref: RefObject<T>,
): RefObject<Vector3 | null> {
  const worldPositionRef = useRef<Vector3 | null>(null);

  useFrame(() => {
    if (ref.current) {
      worldPositionRef.current ??= new Vector3();
      ref.current.getWorldPosition(worldPositionRef.current);
    }
  });

  return worldPositionRef;
}
