import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import type { DTSModel, DTSShape } from "../dts/dtsModel";
import { disposeClonedScene, processShapeScene } from "../stream/playbackUtils";
import { freezeModelTransforms } from "./staticMatrices";

export type ShapeInstanceOptions = NonNullable<
  Parameters<typeof processShapeScene>[2]
> & {
  model: DTSModel;
  shapeName?: string;
};

/** Instance-owned pose and materials, backed by cached source geometry/images.
 * Animation clocks, placement and world effects belong to the caller. */
export function createShapeInstance({
  model,
  shapeName,
  ...materialOptions
}: ShapeInstanceOptions): {
  scene: DTSShape;
  dispose(): void;
} {
  const scene = SkeletonUtils.clone(model.scene) as DTSShape;
  processShapeScene(scene, shapeName, materialOptions);
  const stopFreezing = freezeModelTransforms(scene);
  return {
    scene,
    dispose() {
      stopFreezing();
      disposeClonedScene(scene);
    },
  };
}
