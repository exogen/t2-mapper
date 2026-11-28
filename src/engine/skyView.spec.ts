import {
  Fog,
  Mesh,
  PerspectiveCamera,
  Scene,
  Texture,
  type CubeTexture,
  type ShaderMaterial,
  type WebGLRenderer,
} from "three";
import { expect, it, vi } from "vitest";
import { SceneAssets } from "../assets/sceneAssets";
import { commandCircuitStore } from "../state/commandCircuitStore";
import { globalFogUniforms } from "../globalFogUniforms";
import { skyFromGhost, updateSkyFromGhost } from "../scene/ghostToScene";
import { engineStore } from "../state/engineStore";
import type { SkyEntity } from "../state/gameEntityTypes";
import { settingsStore } from "../state/settingsStore";
import { createRuntime } from "../torqueScript/runtime";
import { FramePriority } from "./framePriority";
import { FrameScheduler } from "./frameScheduler";
import type { EngineHost, GameEngine } from "./gameEngine";
import { createSkyView } from "./skyView";

const assets = vi.hoisted(() => ({
  loadTexture: vi.fn(),
  textureUrl: vi.fn((name: string) => `/sky/${name}`),
}));
vi.mock("./detailMapList", () => ({
  loadSharedDetailMapList: () =>
    Promise.resolve(["north", "east", "south", "west", "top", "bottom"]),
}));
vi.mock("../loaders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../loaders")>()),
  textureToUrl: assets.textureUrl,
}));
vi.mock("../assets/htmlTextures", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../assets/htmlTextures")>()),
  loadHtmlTexture: assets.loadTexture,
  retainHtmlTexture: vi.fn(() => true),
}));

it("updates fog and visibility on the existing view and renders until the fade settles", () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const runtime = createRuntime();
  const previousRuntime = engineStore.getState().runtime;
  const previousOnDemand = settingsStore.getState().renderOnDemand;
  engineStore.setState({ runtime: { ...previousRuntime, runtime } });
  settingsStore.setState({ renderOnDemand: true });

  const camera = new PerspectiveCamera();
  const scheduler = new FrameScheduler();
  const scene = new Scene();
  const renderer = { setClearColor: vi.fn() } as unknown as WebGLRenderer;
  const invalidate = vi.fn();
  const engine = {
    scheduler,
    cameras: { active: camera, perspective: camera },
    withHost: (start: (host: EngineHost) => () => void) =>
      start({ scene, renderer, invalidate, assetsLoading: () => false }),
    invalidate,
  } as unknown as GameEngine;
  const frame = () =>
    scheduler.run(FramePriority.PostCamera, {
      camera,
      renderer,
      scene,
      elapsed: Date.now() / 1000,
      delta: 0.032,
      frame: 0,
    });
  const skyData = skyFromGhost(1, {
    useSkyTextures: false,
    visibleDistance: 1000,
    fogDistance: 250,
    fogVolumes: [
      {
        visibleDistance: 200,
        minHeight: 0,
        maxHeight: 100,
        color: { r: 1, g: 1, b: 1 },
      },
    ],
  });
  const entity = { id: "sky", renderType: "Sky", skyData } as SkyEntity;
  const view = createSkyView(entity, engine);
  try {
    const dome = view.root.children[0];
    const fog = scene.fog as Fog;
    expect(
      view.update?.({
        ...entity,
        skyData: updateSkyFromGhost(
          skyData,
          {
            visibleDistance: 600,
            fogDistance: 100,
            stormTimeline: { startPct: 0, duration: 2, indexOrMode: -1 },
          },
          0,
        ),
      }),
    ).toBe(true);
    vi.setSystemTime(1024);
    invalidate.mockClear();
    frame();
    expect(view.root.children[0]).toBe(dome);
    expect(scene.fog).toBe(fog);
    expect([fog.near, fog.far, camera.far]).toEqual([100, 600, 600]);
    expect(globalFogUniforms.fogVolumeData.value[0]).toBeCloseTo(0.5 / 200);
    expect(invalidate).toHaveBeenCalledOnce();

    vi.setSystemTime(4096);
    invalidate.mockClear();
    frame();
    expect(globalFogUniforms.fogVolumeData.value[0]).toBe(0);
    expect(invalidate).not.toHaveBeenCalled();
  } finally {
    view.dispose();
    engineStore.setState({ runtime: previousRuntime });
    settingsStore.setState({ renderOnDemand: previousOnDemand });
    runtime.destroy();
    vi.useRealTimers();
  }
});

it("keeps the installed sky cube until a face resolves to a new source", async () => {
  assets.loadTexture.mockResolvedValue(new Texture());
  const wasCommandCircuit = commandCircuitStore.getState().active;
  commandCircuitStore.setState({ active: false });
  const camera = new PerspectiveCamera();
  const scene = new Scene();
  const renderer = { setClearColor: vi.fn() } as unknown as WebGLRenderer;
  const invalidate = vi.fn();
  const sceneAssets = new SceneAssets();
  const engine = {
    scheduler: new FrameScheduler(),
    cameras: { active: camera, perspective: camera },
    sceneAssets,
    withHost: (start: (host: EngineHost) => () => void) =>
      start({ scene, renderer, invalidate, assetsLoading: () => false }),
    invalidate,
  } as unknown as GameEngine;
  const view = createSkyView(
    {
      id: "sky-cube",
      renderType: "Sky",
      skyData: skyFromGhost(1, { materialList: "test.dml" }),
    } as SkyEntity,
    engine,
  );
  try {
    await vi.waitFor(() => expect(view.root.children).toHaveLength(1));
    const mesh = view.root.children[0] as Mesh;
    const material = mesh.material as ShaderMaterial;
    const cube = material.uniforms.skybox.value as CubeTexture;
    const dispose = vi.spyOn(cube, "dispose");

    sceneAssets.refreshTextures();
    await Promise.resolve();
    expect(view.root.children[0]).toBe(mesh);
    expect(dispose).not.toHaveBeenCalled();
    expect(assets.loadTexture).toHaveBeenCalledTimes(6);

    assets.textureUrl.mockImplementation((name) =>
      name === "east" ? "/sky/hd/east" : `/sky/${name}`,
    );
    sceneAssets.refreshTextures();
    await vi.waitFor(() => expect(view.root.children).toHaveLength(1));
    expect(view.root.children[0]).not.toBe(mesh);
    expect(dispose).toHaveBeenCalledOnce();
    expect(assets.loadTexture).toHaveBeenCalledWith(
      "/sky/hd/east",
      sceneAssets.textures,
    );
  } finally {
    view.dispose();
    sceneAssets.dispose();
    commandCircuitStore.setState({ active: wasCommandCircuit });
  }
});
