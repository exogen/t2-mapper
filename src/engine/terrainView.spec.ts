import { expect, it, vi } from "vitest";
import {
  DataTexture,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  Scene,
  ShaderLib,
  Texture,
  type WebGLRenderer,
} from "three";
import { TERRAIN_SIZE, type TerrainFile } from "../terrain";
import { TERRAIN_DETAIL_TEXELS_PER_UNIT } from "../terrainMaterial";
import type { ShaderSource } from "../shaderUtils";
import type { TerrainBlockEntity } from "../state/gameEntityTypes";
import { GameEngine, type EngineHost } from "./gameEngine";
import { FrameScheduler } from "./frameScheduler";
import { createTerrainView } from "./terrainView";
import { registerShadowRenderer } from "./shadowControl";
import { FramePriority } from "./framePriority";
import { commandCircuitStore } from "../state/commandCircuitStore";
import { SceneAssets } from "../assets/sceneAssets";
import { collisionState } from "../collision/collisionContext";

const loads = vi.hoisted(() => ({
  terrain: vi.fn(),
  textures: vi.fn(),
  terrainTextureUrl: vi.fn((name: string) => name),
  detailTextureUrl: vi.fn((name: string) => name),
}));
vi.mock("../assets/htmlTextures", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../assets/htmlTextures")>()),
  retainHtmlTexture: vi.fn(() => true),
}));
vi.mock("./terrainCache", () => ({ loadTerrainAsset: loads.terrain }));
vi.mock("./textures", () => ({ loadTextures: loads.textures }));
vi.mock("../terrainLightmap", async () => {
  const { DataTexture } = await import("three");
  return {
    bakeTerrainLightmap: () => ({
      texture: new DataTexture(new Uint8Array([255]), 1, 1),
      step: () => true,
    }),
  };
});
vi.mock("../loaders", () => ({
  FALLBACK_TEXTURE_URL: "white.png",
  terrainTextureToUrl: loads.terrainTextureUrl,
  textureToUrl: loads.detailTextureUrl,
}));
vi.mock("../logger", () => ({
  createLogger: () => ({ debug: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));

it("keeps terrain and shadows during a detail-only switch and rebuilds changed base layers", async () => {
  const terrain: TerrainFile = {
    version: 1,
    textureNames: ["grass"],
    heightMap: new Uint16Array(TERRAIN_SIZE * TERRAIN_SIZE),
    alphaMaps: [new Uint8Array(TERRAIN_SIZE * TERRAIN_SIZE).fill(255)],
    minHeight: 0,
    maxHeight: 0,
  };
  loads.terrain.mockResolvedValue(terrain);
  const pendingTextures = new Map<string, (textures: Texture[]) => void>();
  loads.textures.mockImplementation(
    ([url]: string[]) =>
      new Promise<Texture[]>((resolve) => {
        pendingTextures.set(url, resolve);
      }),
  );
  const finishTexture = (url: string, texture: Texture) => {
    pendingTextures.get(url)!([texture]);
    pendingTextures.delete(url);
  };
  const renderer = {
    domElement: new EventTarget(),
    capabilities: { getMaxAnisotropy: () => 4 },
    shadowMap: { autoUpdate: true, needsUpdate: false },
    getSize: (size: import("three").Vector2) => size.set(390, 844),
    getPixelRatio: () => 1,
  } as unknown as WebGLRenderer;
  const host: EngineHost = {
    renderer,
    scene: new Scene(),
    invalidate: vi.fn(),
    assetsLoading: () => false,
  };
  const hostCleanups = new Set<() => void>();
  const engine = {
    invalidate: host.invalidate,
    scheduler: new FrameScheduler(),
    sceneAssets: new SceneAssets(),
    prepareWithHost: GameEngine.prototype.prepareWithHost,
    prepareTextureWithHost: GameEngine.prototype.prepareTextureWithHost,
    withHost(start: (host: EngineHost) => (() => void) | void) {
      const cleanup = start(host);
      if (cleanup) hostCleanups.add(cleanup);
      return () => {
        if (cleanup && hostCleanups.delete(cleanup)) cleanup();
      };
    },
  } as unknown as GameEngine;
  const previousCommandMap = commandCircuitStore.getState().active;
  commandCircuitStore.setState({ active: false });
  const releaseShadow = registerShadowRenderer(renderer);
  const view = createTerrainView(
    {
      id: "terrain-shadow-transition",
      renderType: "TerrainBlock",
      terrainData: {
        className: "TerrainBlock",
        terrFileName: "flat.ter",
        squareSize: 8,
        detailTextureName: "detail",
        ghostIndex: 1,
      },
    } as TerrainBlockEntity,
    engine,
  );
  const baseTexture = new Texture();
  const oldDetail = new DataTexture(undefined, 4, 2);
  const newDetail = new DataTexture(undefined, 8, 4);
  try {
    await vi.waitFor(() => expect(loads.textures).toHaveBeenCalledTimes(2));
    const primary = view.root.children[0].children[0] as Mesh<
      import("three").BufferGeometry,
      MeshLambertMaterial | MeshBasicMaterial
    >;
    const pool = () => view.root.children[0].children[1] as typeof primary;
    const fallback = primary.material;
    expect(primary.geometry.getAttribute("position").count).toBe(
      (TERRAIN_SIZE + 1) ** 2,
    );
    expect(primary.castShadow).toBe(false);
    expect(pool().castShadow).toBe(false);
    expect(fallback).toBeInstanceOf(MeshBasicMaterial);
    expect(fallback.wireframe).toBe(true);
    // Rebuilding and placing wireframe-only pools must not dirty shadows.
    renderer.shadowMap.needsUpdate = false;
    const originalPool = pool();
    commandCircuitStore.setState({ active: true });
    expect(pool()).not.toBe(originalPool);
    expect(pool().castShadow).toBe(false);
    engine.scheduler.run(FramePriority.PostCamera, {
      camera: new PerspectiveCamera(),
      renderer,
      scene: host.scene,
      delta: 0.016,
      elapsed: 0,
      frame: 1,
    });
    expect(renderer.shadowMap.needsUpdate).toBe(false);
    finishTexture("grass", baseTexture);
    await vi.waitFor(() => expect(primary.material).not.toBe(fallback));
    expect(primary.material.wireframe).toBe(false);
    expect(pool().material.wireframe).toBe(false);
    expect(primary.castShadow).toBe(true);
    expect(pool().castShadow).toBe(true);
    expect(renderer.shadowMap.needsUpdate).toBe(true);
    commandCircuitStore.setState({ active: false });
    expect(pool().castShadow).toBe(true);
    const collision = collisionState().terrain;
    expect(collision).not.toBeNull();
    const geometry = primary.geometry;
    const outgoingTextures = engine.sceneAssets.textures;
    const originalMaterial = primary.material;
    const pooledMaterial = pool().material;
    const compile = (material: typeof originalMaterial) => {
      const shader: ShaderSource = { ...ShaderLib.lambert, uniforms: {} };
      material.onBeforeCompile(
        shader as Parameters<typeof material.onBeforeCompile>[0],
        renderer,
      );
      return shader.uniforms;
    };
    const uniforms = compile(originalMaterial);
    expect(compile(pooledMaterial).detailTexture).toBe(uniforms.detailTexture);
    expect(uniforms.detailEnabled.value).toBe(false);
    finishTexture("detail", oldDetail);
    await vi.waitFor(() => expect(uniforms.detailEnabled.value).toBe(true));
    expect(uniforms.detailTexture.value).toBe(oldDetail);

    engine.sceneAssets.refreshTextures();
    expect(primary.material).toBe(originalMaterial);
    expect(primary.castShadow).toBe(true);
    await Promise.resolve();
    expect(uniforms.detailTexture.value).toBe(oldDetail);
    expect(loads.textures).toHaveBeenCalledTimes(2);

    renderer.shadowMap.needsUpdate = false;
    loads.detailTextureUrl.mockImplementation((name) => `hd/${name}`);
    engine.sceneAssets.refreshTextures();
    expect(primary.material).toBe(originalMaterial);
    expect(pool().material).toBe(pooledMaterial);
    expect(primary.castShadow && pool().castShadow).toBe(true);
    expect(renderer.shadowMap.needsUpdate).toBe(false);
    expect(uniforms.detailEnabled.value).toBe(false);
    expect(uniforms.detailTexture.value).toBeNull();
    await vi.waitFor(() => expect(loads.textures).toHaveBeenCalledTimes(3));
    finishTexture("hd/detail", newDetail);
    await vi.waitFor(() => expect(uniforms.detailEnabled.value).toBe(true));
    expect(uniforms.detailTexture.value).toBe(newDetail);
    const texelsPerTile = 8 * TERRAIN_SIZE * TERRAIN_DETAIL_TEXELS_PER_UNIT;
    expect(uniforms.detailTiling.value).toMatchObject({
      x: texelsPerTile / 8,
      y: texelsPerTile / 4,
    });
    expect(renderer.shadowMap.needsUpdate).toBe(false);

    loads.terrainTextureUrl.mockImplementation((name) => `hd/${name}`);
    engine.sceneAssets.refreshTextures();
    expect(outgoingTextures.disposed).toBe(true);
    expect(primary.material).toBe(fallback);
    expect(primary.castShadow).toBe(false);
    expect(primary.geometry).toBe(geometry);
    expect(collisionState().terrain).toBe(collision);
    await vi.waitFor(() => expect(loads.textures).toHaveBeenCalledTimes(4));
    expect(loads.terrain).toHaveBeenCalledOnce();
    expect(loads.textures.mock.lastCall?.[4]).toBe(engine.sceneAssets.textures);
    finishTexture("hd/grass", baseTexture);
    await vi.waitFor(() => expect(primary.material).not.toBe(fallback));
    expect(primary.castShadow).toBe(true);
    expect(collisionState().terrain).toBe(collision);
    const disposeSolid = vi.spyOn(primary.material, "dispose");
    renderer.shadowMap.needsUpdate = false;
    for (const cleanup of hostCleanups) cleanup();
    hostCleanups.clear();
    expect(primary.material).toBe(fallback);
    expect(pool().material).toBe(fallback);
    expect(primary.castShadow).toBe(false);
    expect(pool().castShadow).toBe(false);
    expect(renderer.shadowMap.needsUpdate).toBe(true);
    expect(disposeSolid).toHaveBeenCalledOnce();
    renderer.shadowMap.needsUpdate = false;
    commandCircuitStore.setState({ active: true });
    expect(pool().castShadow).toBe(false);
    expect(renderer.shadowMap.needsUpdate).toBe(false);
  } finally {
    view.dispose();
    engine.sceneAssets.dispose();
    commandCircuitStore.setState({ active: previousCommandMap });
    releaseShadow();
    baseTexture.dispose();
    oldDetail.dispose();
    newDetail.dispose();
  }
});
