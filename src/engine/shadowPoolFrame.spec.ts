import { afterEach, expect, it, vi } from "vitest";
import {
  Mesh,
  Object3D,
  Scene,
  PerspectiveCamera,
  SkinnedMesh,
  Vector2,
  Vector3,
  type ShaderMaterial,
  type WebGLRenderer,
} from "three";
import { setTerrainCollisionData } from "../collision/terrainCollision";
import { buildDTS } from "../dts/dtsBuilder";
import { batchDTSRigidMeshes } from "../dts/dtsRigidBatch";
import { createDTSRigidTestShape } from "../dts/dtsTestFixtures";
import { createChestPhysics } from "../player/chestPhysics";
import { installShadowPool } from "./shadowPool";
import { GameEngine } from "./gameEngine";
import type { FrameContext } from "./frameScheduler";
import { ShadowPoolRuntime } from "./shadowPoolRuntime";
import { FramePriority } from "./framePriority";
import { addShadowCaster, removeShadowCaster } from "./shadowCasters";

afterEach(() => {
  vi.restoreAllMocks();
});

it("releases shadow casters before scene assets and reuses the atlas", () => {
  const engine = new GameEngine();
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  camera.position.z = 10;
  const renderer = {
    domElement: new EventTarget(),
    getDrawingBufferSize: (size: Vector2) => size.set(800, 600),
    getContext: () => ({ isContextLost: () => false }),
    getRenderTarget: () => null,
    getClearAlpha: () => 1,
    getClearColor: vi.fn(),
    setClearColor: vi.fn(),
    setRenderTarget: vi.fn(),
    clear: vi.fn(),
    render: vi.fn(),
  } as unknown as WebGLRenderer;
  const disconnect = engine.connect({
    scene,
    renderer,
    invalidate() {},
    assetsLoading: () => false,
  });
  const stop = installShadowPool(engine);
  const caster = {
    root: new Object3D(),
    center: new Vector3(0, 1, 0),
    radius: 1,
    enabled: true,
    alpha: 1,
  };
  const shadows = scene.getObjectByName("ShadowPool")!;
  const disposeAtlas = vi.spyOn(shadows.userData.atlas, "dispose");
  const drawScene = () =>
    Reflect.apply(scene.onBeforeRender, scene, [renderer, scene, camera]);
  const renderFrame = () => {
    engine.scheduler.run(
      FramePriority.ShadowAtlas,
      engine.beginFrame({ renderer, scene, camera, delta: 0, elapsed: 0 }),
    );
    drawScene();
  };
  const decalMaterial = () =>
    (shadows.children[0] as Mesh).material as ShaderMaterial;
  const atlasPassScenes = () =>
    vi
      .mocked(renderer.render)
      .mock.calls.slice(-2)
      .map(([scene]) => scene.id);
  setTerrainCollisionData({
    heightMap: new Uint16Array(256 * 256),
    squareSize: 8,
  });
  addShadowCaster(caster);
  try {
    renderFrame();
    const tile = decalMaterial().uniforms.tile.value.toArray();
    expect(decalMaterial().visible).toBe(false);
    renderFrame();
    expect(decalMaterial().visible).toBe(true);
    const oldPassScenes = atlasPassScenes();
    expect(oldPassScenes).toHaveLength(2);

    const disposeAsset = vi.fn(() => expect(shadows.children).toHaveLength(0));
    engine.sceneAssets.cache({}, disposeAsset).set("caster geometry", true);
    removeShadowCaster(caster);
    engine.releaseSceneAssets();
    expect(disposeAsset).toHaveBeenCalledOnce();
    expect(disposeAtlas).not.toHaveBeenCalled();

    addShadowCaster(caster);
    renderFrame();
    expect(decalMaterial().uniforms.tile.value.toArray()).toEqual(tile);
    expect(decalMaterial().visible).toBe(false);
    renderFrame();
    expect(decalMaterial().visible).toBe(true);
    for (const scene of atlasPassScenes())
      expect(oldPassScenes).not.toContain(scene);

    renderer.domElement.dispatchEvent(new Event("webglcontextrestored"));
    drawScene();
    expect(decalMaterial().visible).toBe(false);
    renderFrame();
    expect(decalMaterial().visible).toBe(true);
  } finally {
    setTerrainCollisionData(null);
    removeShadowCaster(caster);
    stop();
    disconnect();
  }
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
