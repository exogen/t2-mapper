import { useMemo } from "react";
import type { SceneTSStatic } from "../scene/types";
import {
  torqueToThree,
  torqueScaleToThree,
  matrixFToQuaternion,
} from "../scene/coordinates";
import { ShapeRenderer } from "./GenericShape";
import { ShapeInfoProvider } from "./ShapeInfoProvider";
export function TSStatic({ scene }: { scene: SceneTSStatic }) {
  const position = useMemo(
    () => torqueToThree(scene.transform.position),
    [scene.transform.position],
  );
  const q = useMemo(
    () => matrixFToQuaternion(scene.transform),
    [scene.transform],
  );
  const scale = useMemo(() => torqueScaleToThree(scene.scale), [scene.scale]);
  if (!scene.shapeName) {
    console.error(
      "<TSStatic> missing shapeName for ghostIndex",
      scene.ghostIndex,
    );
  }
  return (
    <ShapeInfoProvider type="TSStatic" shapeName={scene.shapeName}>
      <group position={position} quaternion={q} scale={scale}>
        <ShapeRenderer />
      </group>
    </ShapeInfoProvider>
  );
}
