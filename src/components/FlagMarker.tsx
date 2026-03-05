import { useRef } from "react";
import type { MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Group, Vector3 } from "three";
import { textureToUrl } from "../loaders";
import type { DemoEntity } from "../demo/types";
import styles from "./FlagMarker.module.css";

const FLAG_ICON_HEIGHT = 1.5;

const FLAG_ICON_URL = textureToUrl("commander/MiniIcons/com_flag_grey");

const _tmpVec = new Vector3();

/**
 * Floating flag icon above a flag entity, tinted by IFF color (green for
 * friendly, red for enemy — matching Tribes 2's sensor group color system).
 * Always visible regardless of distance.
 */
export function FlagMarker({
  entity,
}: {
  entity: DemoEntity;
  timeRef: MutableRefObject<number>;
}) {
  const markerRef = useRef<Group>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const distRef = useRef<HTMLSpanElement>(null);
  const { camera } = useThree();

  useFrame(() => {
    // Tint imperatively — iffColor is mutated in-place by streaming playback.
    if (iconRef.current && entity.iffColor) {
      const { r, g, b } = entity.iffColor;
      iconRef.current.style.backgroundColor = `rgb(${r},${g},${b})`;
    }
    // Update distance label.
    if (distRef.current && markerRef.current) {
      markerRef.current.getWorldPosition(_tmpVec);
      const distance = camera.position.distanceTo(_tmpVec);
      distRef.current.textContent = distance.toFixed(1);
    }
  });

  const initialColor = entity.iffColor
    ? `rgb(${entity.iffColor.r},${entity.iffColor.g},${entity.iffColor.b})`
    : "rgb(200,200,200)";

  return (
    <group ref={markerRef}>
      <Html position={[0, FLAG_ICON_HEIGHT, 0]} center>
        <div className={styles.Root}>
          <span ref={distRef} className={styles.Distance} />
          <div
            ref={iconRef}
            className={styles.Icon}
            style={{
              backgroundColor: initialColor,
              "--flag-icon-url": `url(${FLAG_ICON_URL})`,
            } as React.CSSProperties}
          />
        </div>
      </Html>
    </group>
  );
}
