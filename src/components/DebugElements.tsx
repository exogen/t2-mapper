import { Html } from "@react-three/drei";
import { useEffect, useRef } from "react";
import { AxesHelper } from "three";
import styles from "./DebugElements.module.css";

export function DebugElements() {
  const axesRef = useRef<AxesHelper>(null);

  useEffect(() => {
    const axes = axesRef.current;
    if (!axes) {
      return;
    }
    axes.setColors("rgb(153, 255, 0)", "rgb(0, 153, 255)", "rgb(255, 153, 0)");
  });

  return (
    <>
      <axesHelper ref={axesRef} args={[70]} renderOrder={999}>
        <lineBasicMaterial
          depthTest={false}
          depthWrite={false}
          fog={false}
          vertexColors
        />
      </axesHelper>
      <Html position={[80, 0, 0]} center style={{ pointerEvents: "none" }}>
        <span className={styles.AxisLabel} data-axis="y">
          Y
        </span>
      </Html>
      <Html position={[0, 80, 0]} center style={{ pointerEvents: "none" }}>
        <span className={styles.AxisLabel} data-axis="z">
          Z
        </span>
      </Html>
      <Html position={[0, 0, 80]} center style={{ pointerEvents: "none" }}>
        <span className={styles.AxisLabel} data-axis="x">
          X
        </span>
      </Html>
    </>
  );
}
