import { expect, it, vi } from "vitest";
import { collisionState } from "../collision/collisionContext";
import { castWorldRay } from "../collision/worldCollision";
import { buildDTS } from "../dts/dtsBuilder";
import { createDTSCollisionTestShape } from "../dts/dtsTestFixtures";
import { DTSPrimitiveFlags } from "../dts/dtsTypes";
import { GameEngine } from "./gameEngine";
import { createShapeModel } from "./shapeModel";

vi.mock("./imageStateAnimation", () => ({
  createImageStateAnimation: () => ({ dispose: () => {} }),
}));

it("registers collision only when the shape is a world object", () => {
  const data = createDTSCollisionTestShape();
  for (const mesh of data.meshes)
    for (const primitive of mesh.primitives)
      primitive.material |= DTSPrimitiveFlags.NoMaterial;
  const options = {
    model: buildDTS(data),
    shapeName: "collision-test",
    type: "StaticShape" as const,
    anisotropy: 1,
  };
  const engine = new GameEngine();
  const world = collisionState();
  const cast = () =>
    castWorldRay([-5, 0, 0], [5, 0, 0], { includeStatics: true });

  const image = createShapeModel(engine, { ...options, imageSlot: 0 });
  try {
    expect(cast()).toBeNull();
    expect(world.playerShapes.size).toBe(0);
  } finally {
    image.dispose();
  }

  const placed = createShapeModel(engine, options);
  try {
    expect(cast()?.source).toBe("static");
    expect(world.playerShapes.size).toBe(1);
  } finally {
    placed.dispose();
  }
  expect(cast()).toBeNull();
  expect(world.playerShapes.size).toBe(0);
});
