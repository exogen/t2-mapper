import { expect, it, vi } from "vitest";
import {
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  Scene,
  Texture,
  type WebGLRenderer,
} from "three";
import { TERRAIN_SIZE, type TerrainFile } from "../terrain";
import type { TerrainBlockEntity } from "../state/gameEntityTypes";
import { GameEngine, type EngineHost } from "./gameEngine";
import { FrameScheduler } from "./frameScheduler";
import { createTerrainView } from "./terrainView";
import { registerShadowRenderer } from "./shadowControl";
import { FramePriority } from "./framePriority";
import { commandCircuitStore } from "../state/commandCircuitStore";

const loads = vi.hoisted(() => ({ terrain: vi.fn(), textures: vi.fn() }));
vi.mock("./terrainCache", () => ({ acquireTerrain: loads.terrain }));
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
  terrainTextureToUrl: (name: string) => name,
  textureToUrl: (name: string) => name,
}));
vi.mock("../logger", () => ({
  createLogger: () => ({ debug: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));

it("refreshes frozen shadows when terrain changes from wireframe to solid and back on host detach", async () => {
  const terrain: TerrainFile = {
    version: 1,
    textureNames: ["grass"],
    heightMap: new Uint16Array(TERRAIN_SIZE * TERRAIN_SIZE),
    alphaMaps: [new Uint8Array(TERRAIN_SIZE * TERRAIN_SIZE).fill(255)],
    minHeight: 0,
    maxHeight: 0,
  };
  const releaseTerrain = vi.fn();
  loads.terrain.mockReturnValue({
    promise: Promise.resolve(terrain),
    release: releaseTerrain,
  });
  let finishTextures!: (textures: Texture[]) => void;
  loads.textures.mockReturnValue(
    new Promise<Texture[]>((resolve) => {
      finishTextures = resolve;
    }),
  );
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
  let detachHost: (() => void) | undefined;
  const engine = {
    invalidate: host.invalidate,
    scheduler: new FrameScheduler(),
    prepareWithHost: GameEngine.prototype.prepareWithHost,
    withHost(start: (host: EngineHost) => (() => void) | void) {
      detachHost = start(host) || undefined;
      return () => {
        detachHost?.();
        detachHost = undefined;
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
        ghostIndex: 1,
      },
    } as TerrainBlockEntity,
    engine,
  );
  const sourceTextures = [new Texture(), new Texture()];
  try {
    await vi.waitFor(() => expect(loads.textures).toHaveBeenCalledOnce());
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
    finishTextures(sourceTextures);
    await vi.waitFor(() => expect(primary.material).not.toBe(fallback));
    expect(primary.material.wireframe).toBe(false);
    expect(pool().material.wireframe).toBe(false);
    expect(primary.castShadow).toBe(true);
    expect(pool().castShadow).toBe(true);
    expect(renderer.shadowMap.needsUpdate).toBe(true);
    commandCircuitStore.setState({ active: false });
    expect(pool().castShadow).toBe(true);
    const disposeSolid = vi.spyOn(primary.material, "dispose");
    renderer.shadowMap.needsUpdate = false;
    detachHost?.();
    detachHost = undefined;
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
    commandCircuitStore.setState({ active: previousCommandMap });
    releaseShadow();
    for (const texture of sourceTextures) texture.dispose();
  }
  expect(releaseTerrain).toHaveBeenCalledOnce();
});
