import { useMemo } from "react";
import { createLogger } from "../logger";
import type { SceneTSStatic } from "../scene/types";

const log = createLogger("TSStatic");
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
    log.error("TSStatic missing shapeName for ghostIndex %d", scene.ghostIndex);
  }
  return (
    <ShapeInfoProvider type="TSStatic" shapeName={scene.shapeName}>
      <group position={position} quaternion={q} scale={scale}>
        <ShapeRenderer />
      </group>
    </ShapeInfoProvider>
  );
}
