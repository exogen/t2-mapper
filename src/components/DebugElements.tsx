import { Stats, Html } from "@react-three/drei";
import { useDebug } from "./SettingsProvider";
import { useEffect, useRef } from "react";
import { AxesHelper } from "three";

export function DebugElements() {
  const { debugMode } = useDebug();
  const axesRef = useRef<AxesHelper>(null);

  useEffect(() => {
    const axes = axesRef.current;
    if (!axes) {
      return;
    }
    axes.setColors("rgb(153, 255, 0)", "rgb(0, 153, 255)", "rgb(255, 153, 0)");
  });

  return debugMode ? (
    <>
      <Stats className="StatsPanel" />
      <axesHelper ref={axesRef} args={[70]} renderOrder={999}>
        <lineBasicMaterial
          depthTest={false}
          depthWrite={false}
          fog={false}
          vertexColors
        />
      </axesHelper>
      <Html position={[80, 0, 0]} center>
        <span className="AxisLabel" data-axis="y">
          Y
        </span>
      </Html>
      <Html position={[0, 80, 0]} center>
        <span className="AxisLabel" data-axis="z">
          Z
        </span>
      </Html>
      <Html position={[0, 0, 80]} center>
        <span className="AxisLabel" data-axis="x">
          X
        </span>
      </Html>
    </>
  ) : null;
}
