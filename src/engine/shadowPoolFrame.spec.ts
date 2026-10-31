import { afterEach, expect, it, vi } from "vitest";
import {
  Scene,
  PerspectiveCamera,
  SkinnedMesh,
  type WebGLRenderer,
} from "three";
import { buildDTS } from "../dts/dtsBuilder";
import { batchDTSRigidMeshes } from "../dts/dtsRigidBatch";
import { createDTSRigidTestShape } from "../dts/dtsTestFixtures";
import { createChestPhysics } from "../player/chestPhysics";
import { installShadowPool } from "./shadowPool";
import { GameEngine } from "./gameEngine";
import type { FrameContext } from "./frameScheduler";
import { ShadowPoolRuntime } from "./shadowPoolRuntime";
import { FramePriority } from "./framePriority";

afterEach(() => {
  vi.restoreAllMocks();
});

it("draws shadows from a complete pose before physics updates only part of the skeleton", () => {
  const data = createDTSRigidTestShape();
  data.names[data.objects[0].nameIndex] = "Submesh_torso";
  const shape = buildDTS(data).scene;
  const [body] = batchDTSRigidMeshes(shape);
  if (!(body instanceof SkinnedMesh))
    throw new Error("Expected articulated body");
  const scene = new Scene();
  scene.add(shape);
  const physics = createChestPhysics(shape, "light_female.dts")!;
  scene.updateMatrixWorld(true);
  shape.update(new PerspectiveCamera());
  const completedPose = body.skeleton.bones.map((bone) =>
    bone.matrixWorld.toArray(),
  );
  let shadowPose: number[][] | undefined;
  vi.spyOn(ShadowPoolRuntime.prototype, "renderPending").mockImplementation(
    () => {
      shadowPose = body.skeleton.bones.map((bone) =>
        bone.matrixWorld.toArray(),
      );
    },
  );
  const engine = new GameEngine();
  const dispose = installShadowPool(engine);
  engine.scheduler.add(FramePriority.StreamPlayback, () => {
    shape.position.x += 5;
  });
  engine.scheduler.add(FramePriority.ShapeAnimation, () =>
    physics.update(1, 0, 1, 0),
  );
  engine.scheduler.runAll(
    engine.beginFrame({ renderer: {} as WebGLRenderer } as Omit<
      FrameContext,
      "frame"
    >),
  );
  expect(shadowPose).toEqual(completedPose);
  // The fixture really does leave mixed world transforms before Three's final
  // scene traversal: the chest updates its ancestors, but not its child bones.
  const torso = shape.getNode(0)!,
    child = shape.getNode(1)!;
  expect(torso.matrixWorld.toArray()).not.toEqual(
    completedPose[body.skeleton.bones.indexOf(torso)],
  );
  expect(child.matrixWorld.toArray()).toEqual(
    completedPose[body.skeleton.bones.indexOf(child)],
  );
  physics.dispose();
  dispose();
});
