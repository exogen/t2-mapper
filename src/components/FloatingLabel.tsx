import { ReactNode, useEffect, useRef, useState } from "react";
import { Object3D } from "three";
import { useDistanceFromCamera } from "./useDistanceFromCamera";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";

const DEFAULT_POSITION = [0, 0, 0] as [x: number, y: number, z: number];

export function FloatingLabel({
  children,
  color = "white",
  position = DEFAULT_POSITION,
}: {
  children: ReactNode;
  color?: string;
  position?: [x: number, y: number, z: number];
}) {
  const groupRef = useRef<Object3D>(null);
  const distanceRef = useDistanceFromCamera(groupRef);
  const [isVisible, setIsVisible] = useState(false);
  const labelRef = useRef<HTMLDivElement>(null);

  // Initialize opacity when label ref is attached
  useEffect(() => {
    if (labelRef.current && distanceRef.current != null) {
      const opacity = Math.max(0, Math.min(1, 1 - distanceRef.current / 200));
      labelRef.current.style.opacity = opacity.toString();
    }
  }, [isVisible]);

  useFrame(() => {
    const distance = distanceRef.current;
    const shouldBeVisible = distance != null && distance < 200;

    // Update visibility state only when crossing threshold
    if (isVisible !== shouldBeVisible) {
      setIsVisible(shouldBeVisible);
    }

    // Update opacity directly on DOM element (no re-render)
    if (labelRef.current && shouldBeVisible) {
      const opacity = Math.max(0, Math.min(1, 1 - distance / 200));
      labelRef.current.style.opacity = opacity.toString();
    }
  });

  return (
    <group ref={groupRef}>
      {isVisible ? (
        <Html position={position} center>
          <div ref={labelRef} className="StaticShapeLabel" style={{ color }}>
            {children}
          </div>
        </Html>
      ) : null}
    </group>
  );
}
