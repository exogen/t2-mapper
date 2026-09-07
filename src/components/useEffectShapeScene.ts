import { useEffect, useMemo, useRef, type RefObject } from "react";
import type { Group } from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { disposeClonedScene, processShapeScene } from "../stream/playbackUtils";
import {
  collectIflMeshes,
  loadIflMaterialInstance,
  type IflMaterialInstance,
} from "../iflAtlas";
import { useAnisotropy } from "./useAnisotropy";

/**
 * A billboarded effect shape's scene (explosion fireballs, projectile
 * bolts): the GLB cloned and material-processed, every mesh un-culled
 * (the shape scales past its bounds), its IFL meshes shown and their
 * atlases loading into `iflInstances`, which the caller steps on its own
 * clock. The clone is disposed with the component.
 */
export function useEffectShapeScene(
  gltf: { scene: Group },
  shapeName: string | undefined,
  options: { ignoreDetailSize?: boolean } = {},
): { scene: Group; iflInstances: RefObject<IflMaterialInstance[]> } {
  const anisotropy = useAnisotropy();
  const { ignoreDetailSize } = options;
  const { scene, iflInfos } = useMemo(() => {
    const scene = SkeletonUtils.clone(gltf.scene) as Group;
    // Collect IFL info BEFORE processShapeScene replaces the materials.
    const iflInfos = collectIflMeshes(scene);
    processShapeScene(scene, shapeName, { anisotropy, ignoreDetailSize });
    // IFL meshes without a vis sequence are always visible.
    for (const info of iflInfos) {
      if (!info.hasVisSequence) info.mesh.visible = true;
    }
    scene.traverse((child) => {
      child.frustumCulled = false;
    });
    return { scene, iflInfos };
  }, [gltf, shapeName, anisotropy, ignoreDetailSize]);

  useEffect(() => () => disposeClonedScene(scene), [scene]);

  const iflInstances = useRef<IflMaterialInstance[]>([]);
  useEffect(() => {
    let disposed = false;
    iflInstances.current = [];
    for (const info of iflInfos) {
      loadIflMaterialInstance(info)
        .then((inst) => {
          if (inst && !disposed) iflInstances.current.push(inst);
        })
        .catch(() => {});
    }
    return () => {
      disposed = true;
      iflInstances.current = [];
    };
  }, [iflInfos]);

  return { scene, iflInstances };
}
