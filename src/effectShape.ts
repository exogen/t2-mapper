import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { disposeClonedScene, processShapeScene } from "./stream/playbackUtils";
import { observeShapeMeshes } from "./dts/dtsScene";
import type { DTSShape, DTSModel } from "./dts/dtsModel";
import { DTSAnimationMixer } from "./dts/dtsAnimationMixer";
import { sampleDTSSequence } from "./dts/dtsAnimation";
import { DTSSequenceFlags } from "./dts/dtsTypes";

/** Native DTS effect instance with its own animation state and materials. */
export function createEffectShape(
  model: DTSModel,
  shapeName: string | undefined,
  options: {
    anisotropy?: number;
    ignoreDetailSize?: boolean;
    loop?: boolean;
    transparent?: boolean;
  } = {},
) {
  const scene = SkeletonUtils.clone(model.scene) as DTSShape;
  processShapeScene(scene, shapeName, options);
  observeShapeMeshes(scene, (child) => {
    child.frustumCulled = false;
    if (options.transparent)
      for (const material of Array.isArray(child.material)
        ? child.material
        : [child.material]) {
        material.transparent = true;
        material.depthWrite = false;
      }
  });
  const clip = model.animations.find((c) => c.name.toLowerCase() === "ambient");
  const mixer = clip ? new DTSAnimationMixer(scene) : null;
  const cyclic =
    options.loop ?? !!((clip?.sequence?.flags ?? 0) & DTSSequenceFlags.Cyclic);
  return {
    scene,
    setTime(seconds: number) {
      if (mixer && clip) sampleDTSSequence(mixer, clip, seconds, cyclic);
      scene.setImageAnimationTime(seconds);
    },
    reset() {
      mixer?.stopAllAction();
      scene.setImageAnimationTime(0);
    },
    dispose() {
      mixer?.uncacheRoot(scene);
      disposeClonedScene(scene);
    },
  };
}
