import { memo, ReactNode, useRef, useState } from "react";
import { Object3D, Vector3 } from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import styles from "./FloatingLabel.module.css";

const DEFAULT_POSITION = [0, 0, 0] as [x: number, y: number, z: number];
const _worldPos = new Vector3();

/** Check if a world position is behind the camera using only scalar math. */
function isBehindCamera(
  camera: { matrixWorld: { elements: number[] } },
  wx: number,
  wy: number,
  wz: number,
): boolean {
  const e = camera.matrixWorld.elements;
  // Dot product of (objectPos - cameraPos) with camera forward (-Z column).
  return (
    (wx - e[12]) * -e[8] + (wy - e[13]) * -e[9] + (wz - e[14]) * -e[10] < 0
  );
}

export const FloatingLabel = memo(function FloatingLabel({
  children,
  color = "white",
  position = DEFAULT_POSITION,
  opacity = "fadeWithDistance",
}: {
  children: ReactNode;
  color?: string;
  position?: [x: number, y: number, z: number];
  opacity?: number | "fadeWithDistance";
}) {
  const fadeWithDistance = opacity === "fadeWithDistance";
  const groupRef = useRef<Object3D>(null);
  const [isVisible, setIsVisible] = useState(opacity !== 0);
  const labelRef = useRef<HTMLDivElement>(null);

  useFrame(({ camera }) => {
    const group = groupRef.current;
    if (!group) return;

    group.getWorldPosition(_worldPos);
    const behind = isBehindCamera(
      camera,
      _worldPos.x,
      _worldPos.y,
      _worldPos.z,
    );

    if (fadeWithDistance) {
      const distance = behind
        ? Infinity
        : camera.position.distanceTo(_worldPos);
      const shouldBeVisible = distance < 200;

      if (isVisible !== shouldBeVisible) {
        setIsVisible(shouldBeVisible);
      }

      // Update opacity directly on DOM element (no re-render).
      if (labelRef.current && shouldBeVisible) {
        const fadeOpacity = Math.max(0, Math.min(1, 1 - distance / 200));
        labelRef.current.style.opacity = fadeOpacity.toString();
      }
    } else {
      const shouldBeVisible = !behind && opacity !== 0;
      if (isVisible !== shouldBeVisible) {
        setIsVisible(shouldBeVisible);
      }
      if (labelRef.current) {
        labelRef.current.style.opacity = (opacity as number).toString();
      }
    }
  });

  return (
    <group ref={groupRef}>
      {isVisible ? (
        <Html position={position} center>
          <div ref={labelRef} className={styles.Label} style={{ color }}>
            {children}
          </div>
        </Html>
      ) : null}
    </group>
  );
});
