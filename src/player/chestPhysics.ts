import { Matrix3, Vector3 } from "three";
import type { DTSShape } from "../dts/dtsModel";
import { createChestDeformation } from "./chestDeformation";
import { ChestDynamics } from "./ChestDynamics";

/** Optional visual effect: failures restore the native model for this player. */
export function createChestPhysics(scene: DTSShape, shapeName: string) {
  let chest: ReturnType<typeof createChestDeformation>;
  const disable = (error: unknown) => {
    chest?.dispose();
    console.warn(`Disabled chest physics for ${shapeName}`, error);
  };
  try {
    chest = createChestDeformation(scene, shapeName);
  } catch (error) {
    disable(error);
  }
  if (!chest || chest.disabled) return;
  const deformation = chest;
  const dynamics = new ChestDynamics();
  const anchors = [new Vector3(), new Vector3()];
  const offsets = [new Vector3(), new Vector3()];
  const up = new Vector3(),
    forward = new Vector3();
  const toLocal = new Matrix3();
  return {
    update(time: number, resetKey: number, size: number, movement: number) {
      if (deformation.disabled) return;
      try {
        if (
          !Number.isFinite(time) ||
          !Number.isFinite(size) ||
          !Number.isFinite(movement)
        )
          throw new Error("Non-finite chest physics input");
        size = Math.max(0.7, Math.min(3, size));
        movement = Math.max(0, Math.min(1, movement));
        deformation.bone.updateWorldMatrix(true, false);
        const world = deformation.bone.matrixWorld;
        toLocal.setFromMatrix4(world);
        const determinant = toLocal.determinant();
        if (
          !world.elements.every(Number.isFinite) ||
          !Number.isFinite(determinant) ||
          Math.abs(determinant) < 1e-8
        )
          throw new Error("Invalid chest bone transform");
        toLocal.invert();
        up.set(-1, 0, 0).transformDirection(world);
        forward.set(0, 0, 1).transformDirection(world);
        for (let side = 0; side < 2; side++) {
          deformation.getAnchor(side, size, anchors[side]).applyMatrix4(world);
          if (!Number.isFinite(anchors[side].lengthSq()))
            throw new Error("Non-finite chest anchor");
        }
        const worldOffsets = dynamics.update(
          time,
          anchors,
          up,
          forward,
          size,
          movement,
          resetKey,
        );
        for (let side = 0; side < 2; side++)
          offsets[side]
            .copy(worldOffsets[side])
            .applyMatrix3(toLocal)
            .clampLength(0, 0.5);
        deformation.apply(size, offsets[0], offsets[1]);
      } catch (error) {
        disable(error);
      }
    },
    dispose: deformation.dispose,
  };
}
