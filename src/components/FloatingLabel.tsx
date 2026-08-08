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

/** Default fade distance for fadeWithDistance labels. */
const DEFAULT_FADE_DISTANCE = 200;

/**
 * Hook that manages visibility and opacity fading for a floating label group.
 * Attach `groupRef` to a `<group>` so world-position lookups work. Apply
 * `opacityRef.current` to DOM elements each frame for smooth fading.
 */
export function useFloatingLabelFade({
  opacity: opacityProp = "fadeWithDistance" as number | "fadeWithDistance",
  fadeDistance = DEFAULT_FADE_DISTANCE,
} = {}) {
  const fadeWithDistance = opacityProp === "fadeWithDistance";
  const groupRef = useRef<Object3D>(null);
  const [isVisible, setIsVisible] = useState(opacityProp !== 0);
  const opacityRef = useRef("0");

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
      const shouldBeVisible = distance < fadeDistance;

      if (isVisible !== shouldBeVisible) {
        setIsVisible(shouldBeVisible);
      }

      opacityRef.current = shouldBeVisible
        ? Math.max(0, Math.min(1, 1 - distance / fadeDistance)).toString()
        : "0";
    } else {
      const shouldBeVisible = !behind && opacityProp !== 0;
      if (isVisible !== shouldBeVisible) {
        setIsVisible(shouldBeVisible);
      }
      opacityRef.current = (opacityProp as number).toString();
    }
  });

  return { groupRef, isVisible, opacityRef };
}

export const FloatingLabel = memo(function FloatingLabel({
  children,
  color = "white",
  position = DEFAULT_POSITION,
  opacity = "fadeWithDistance",
  fadeDistance,
}: {
  children: ReactNode;
  color?: string;
  position?: [x: number, y: number, z: number];
  opacity?: number | "fadeWithDistance";
  fadeDistance?: number;
}) {
  const { groupRef, isVisible, opacityRef } = useFloatingLabelFade({
    opacity,
    fadeDistance,
  });
  const labelRef = useRef<HTMLDivElement>(null);

  useFrame(() => {
    if (labelRef.current) {
      labelRef.current.style.opacity = opacityRef.current;
    }
  });

  return (
    <group ref={groupRef}>
      {isVisible ? (
        <Html position={position} center style={{ pointerEvents: "none" }}>
          <div ref={labelRef} className={styles.Label} style={{ color }}>
            {children}
          </div>
        </Html>
      ) : null}
    </group>
  );
});
