import { FrontSide, Group } from "three";
import { DTSAnimationMixer } from "../dts/dtsAnimationMixer";
import {
  DTSRigidMeshBatch,
  type DTSModel,
  type DTSShape,
} from "../dts/dtsModel";
import { observeShapeMeshes } from "../dts/dtsScene";
import { SHAPE_MODEL_ROTATION_Y } from "../world/placement";
import { createShapeInstance } from "./shapeInstance";

export interface PlayerPresentationOptions {
  model: DTSModel;
  anisotropy: number;
  emap: boolean;
  skinUrl: string | undefined;
}

/** A player shape instance, independent of a world, stream or animation clock. */
export interface PlayerPresentation {
  /** Mount yaw is applied here, outside the model's coordinate conversion. */
  readonly root: Group;
  readonly rotated: Group;
  /** Native mount nodes and the independently animated pose. */
  readonly scene: DTSShape;
  readonly mixer: DTSAnimationMixer;
  dispose(): void;
}

/**
 * Shared visual setup for in-game players and standalone character viewers.
 * Cached source geometry/textures remain owned by the shape loader; the
 * skeleton, materials and animation mixer belong to this instance.
 */
export function createPlayerPresentation(
  options: PlayerPresentationOptions,
): PlayerPresentation {
  const instance = createShapeInstance(options);
  const { scene } = instance;
  // First-person cameras can see out through the model's interior faces.
  // Only rigid batches have bounds that reliably follow the current pose.
  observeShapeMeshes(scene, (mesh) => {
    mesh.frustumCulled = mesh instanceof DTSRigidMeshBatch;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials) material.side = FrontSide;
  });
  const mixer = new DTSAnimationMixer(scene);
  const root = new Group();
  root.matrixAutoUpdate = false;
  const rotated = new Group();
  rotated.rotation.set(0, SHAPE_MODEL_ROTATION_Y, 0);
  rotated.updateMatrix();
  rotated.matrixAutoUpdate = false;
  rotated.add(scene);
  root.add(rotated);

  return {
    root,
    rotated,
    scene,
    mixer,
    dispose() {
      mixer.stopAllAction();
      rotated.remove(scene);
      instance.dispose();
      mixer.uncacheRoot(scene);
    },
  };
}
