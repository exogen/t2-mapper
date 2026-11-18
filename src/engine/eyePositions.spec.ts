import { expect, it } from "vitest";
import { Object3D, Vector3 } from "three";
import { DTSShape } from "../dts/dtsModel";
import { createDTSTestShape } from "../dts/dtsTestFixtures";
import { createDeferredPose } from "./deferredPose";
import { readEyePosition, registerEyeNode } from "./eyePositions";

it("samples a dormant shape's current eye before it renders", () => {
  const shape = new DTSShape();
  shape.data = createDTSTestShape();
  const eye = new Object3D();
  shape.add(eye);
  shape.dormant = true;
  const pose = createDeferredPose(shape, () => eye.position.set(1, 2, 3));
  const unregister = registerEyeNode("player", eye, shape);
  try {
    pose.update(0, 0);
    expect(eye.position.lengthSq()).toBe(0);
    expect(readEyePosition("player", new Vector3())?.toArray()).toEqual([
      3, 2, -1,
    ]);
  } finally {
    unregister();
    pose.dispose();
  }
});
