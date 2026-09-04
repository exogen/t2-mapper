import { useEffect, useRef } from "react";
import { AxesHelper } from "three";
import { FloatingLabel } from "./FloatingLabel";
import { DebugFreeSpace } from "./DebugFreeSpace";

/** Axis labels use the same colors as the axes helper lines below. The
 *  world axes are Torque's: Three +X = Torque Y, +Y = Z, +Z = X. */
const AXIS_Y_COLOR = "rgb(153, 255, 0)";
const AXIS_Z_COLOR = "rgb(0, 153, 255)";
const AXIS_X_COLOR = "rgb(255, 153, 0)";

export function DebugElements() {
  const axesRef = useRef<AxesHelper>(null);

  useEffect(() => {
    const axes = axesRef.current;
    if (!axes) {
      return;
    }
    axes.setColors(AXIS_Y_COLOR, AXIS_Z_COLOR, AXIS_X_COLOR);
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
      <DebugFreeSpace />
      <FloatingLabel position={[80, 0, 0]} opacity={1} color={AXIS_Y_COLOR}>
        Y
      </FloatingLabel>
      <FloatingLabel position={[0, 80, 0]} opacity={1} color={AXIS_Z_COLOR}>
        Z
      </FloatingLabel>
      <FloatingLabel position={[0, 0, 80]} opacity={1} color={AXIS_X_COLOR}>
        X
      </FloatingLabel>
    </>
  );
}
