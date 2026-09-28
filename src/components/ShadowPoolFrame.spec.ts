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
import { ShadowPool } from "./ShadowPool";
import { ShadowPoolRuntime } from "./shadowPoolRuntime";
import { FramePriority } from "./framePriority";

type FrameState = { gl: WebGLRenderer };
const hooks = vi.hoisted(() => ({
  scene: null as Scene | null,
  frames: [] as { priority: number; run: (state: FrameState) => void }[],
  effects: [] as (() => void | (() => void))[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useMemo: (fn: () => unknown) => fn(),
  useEffect: (fn: () => void | (() => void)) => hooks.effects.push(fn),
}));
vi.mock("@react-three/fiber", () => ({
  useFrame: (run: (state: FrameState) => void, priority = 0) =>
    hooks.frames.push({ run, priority }),
  useThree: (select: (state: { scene: Scene | null }) => unknown) =>
    select({ scene: hooks.scene }),
}));
afterEach(() => {
  hooks.frames.length = 0;
  hooks.effects.length = 0;
  vi.restoreAllMocks();
});

it("draws shadows from a complete pose before physics updates only part of the skeleton", () => {
  const data = createDTSRigidTestShape();
  data.names[data.objects[0].nameIndex] = "Submesh_torso";
  const shape = buildDTS(data).scene;
  const [body] = batchDTSRigidMeshes(shape);
  if (!(body instanceof SkinnedMesh))
    throw new Error("Expected articulated body");
  const scene = (hooks.scene = new Scene());
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
  ShadowPool();
  const cleanups = hooks.effects.map((effect) => effect());
  hooks.frames.push(
    {
      priority: FramePriority.StreamPlayback,
      run: () => {
        shape.position.x += 5;
      },
    },
    {
      priority: FramePriority.ShapeAnimation,
      run: () => physics.update(1, 0, 1, 0),
    },
  );
  for (const frame of hooks.frames.sort((a, b) => a.priority - b.priority))
    frame.run({ gl: {} as WebGLRenderer });
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
  for (const cleanup of cleanups) cleanup?.();
});
