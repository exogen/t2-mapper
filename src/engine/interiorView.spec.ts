import { afterEach, expect, it, vi } from "vitest";
import { Mesh, Scene, Texture, type WebGLRenderer } from "three";
import { loadInterior } from "../assets/interiorAssets";
import { loadHtmlTexture } from "../assets/htmlTextures";
import { createDIFModel, DIFMaterial } from "../dif/difLoader";
import { createDIFTestBuffer } from "../dif/difTestFixtures";
import { IDENTITY_MATRIX } from "../scene/types";
import type { InteriorInstanceEntity } from "../state/gameEntityTypes";
import { GameEngine, type EngineHost } from "./gameEngine";
import { createInteriorView } from "./interiorView";
import {
  registerInteriorCollider,
  unregisterInteriorCollider,
} from "../collision/worldCollision";

vi.mock("./ambientParticles", () => ({ AmbientParticles: class {} }));
vi.mock("./lightningEffects", () => ({ LightningEffects: class {} }));
vi.mock("../assets/interiorAssets", () => ({ loadInterior: vi.fn() }));
vi.mock("../assets/htmlTextures", () => ({
  loadHtmlTexture: vi.fn(),
  recordSkippedHtmlTextureUpload: vi.fn(),
}));
vi.mock("../loaders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../loaders")>()),
  interiorToUrl: (name: string) => `/interiors/${name}`,
  textureToUrl: (name: string) => `/textures/${name}`,
}));
vi.mock("../collision/worldCollision", () => ({
  registerInteriorCollider: vi.fn(),
  unregisterInteriorCollider: vi.fn(),
}));
vi.mock("../world/colliderPolicy", () => ({
  interiorColliderMeshes: () => [],
}));
vi.mock("../shadowBounds", () => ({ setShadowCasterBounds: vi.fn() }));
vi.mock("../shapeLighting", () => ({ invalidateInteriorLighting: vi.fn() }));
vi.mock("./shadowControl", () => ({ invalidateShadows: vi.fn() }));
vi.mock("./terrainLightmapControl", () => ({
  invalidateTerrainLightmap: vi.fn(),
}));

afterEach(() => vi.restoreAllMocks());

function entity(ghostIndex: number): InteriorInstanceEntity {
  return {
    id: `interior:${ghostIndex}`,
    className: "InteriorInstance",
    renderType: "InteriorInstance",
    interiorData: {
      className: "InteriorInstance",
      interiorFile: "shared-static.dif",
      ghostIndex,
      transform: IDENTITY_MATRIX,
      scale: { x: 1, y: 1, z: 1 },
      showTerrainInside: false,
      skinBase: "",
      alarmState: false,
    },
  };
}

function host(): EngineHost {
  return {
    scene: new Scene(),
    renderer: {
      capabilities: { getMaxAnisotropy: () => 8 },
      initTexture: vi.fn(),
    } as unknown as WebGLRenderer,
    invalidate: vi.fn(),
    assetsLoading: () => false,
  };
}

it("preserves a surviving static interior's shared texture when another instance is removed or its host detaches", async () => {
  const model = createDIFModel(createDIFTestBuffer().buffer);
  expect(model.interior.hasAlarmState).toBe(false);
  expect(model.interior.animatedLights).toHaveLength(0);
  vi.mocked(loadInterior).mockResolvedValue(model);
  const texture = new Texture({ width: 16, height: 16 });
  vi.mocked(loadHtmlTexture).mockResolvedValue(texture);
  const engine = new GameEngine();
  const firstHost = host();
  const disconnectFirst = engine.connect(firstHost);
  const first = createInteriorView(entity(1), engine);
  const second = createInteriorView(entity(2), engine);
  let firstDisposed = false;
  let disconnectSecond: (() => void) | undefined;
  try {
    await vi.waitFor(() =>
      expect(firstHost.renderer.initTexture).toHaveBeenCalledTimes(2),
    );
    const secondMaterials: DIFMaterial[] = [];
    second.root.traverse((node) => {
      if (node instanceof Mesh && node.material instanceof DIFMaterial)
        secondMaterials.push(node.material);
    });
    expect(secondMaterials).toHaveLength(model.surfaceMeshes.length);
    for (const [index, material] of secondMaterials.entries()) {
      expect(material).toBe(model.surfaceMeshes[index].material);
      expect(material.map).toBe(texture);
    }
    const lightMaps = secondMaterials.map((material) => material.lightMap);
    const shaderHooks = secondMaterials.map(
      (material) => material.onBeforeCompile,
    );
    first.dispose();
    firstDisposed = true;
    for (const [index, material] of secondMaterials.entries()) {
      expect(material.map).toBe(texture);
      expect(material.map!.image).toBe(texture.image);
      expect(material.lightMap).toBe(lightMaps[index]);
      expect(material.onBeforeCompile).toBe(shaderHooks[index]);
    }
    disconnectFirst();
    for (const material of secondMaterials) expect(material.map).toBe(texture);
    const secondHost = host();
    disconnectSecond = engine.connect(secondHost);
    await vi.waitFor(() =>
      expect(secondHost.renderer.initTexture).toHaveBeenCalledOnce(),
    );
    for (const material of secondMaterials) expect(material.map).toBe(texture);
    const registered = vi.mocked(registerInteriorCollider).mock.calls.length;
    const unregistered = vi.mocked(unregisterInteriorCollider).mock.calls
      .length;
    const nextTexture = new Texture({ width: 4, height: 4 });
    vi.mocked(loadHtmlTexture).mockResolvedValue(nextTexture);
    engine.sceneAssets.refreshTextures();
    for (const material of secondMaterials) expect(material.map).toBeNull();
    await vi.waitFor(() =>
      expect(
        secondMaterials.every((material) => material.map === nextTexture),
      ).toBe(true),
    );
    expect(registerInteriorCollider).toHaveBeenCalledTimes(registered);
    expect(unregisterInteriorCollider).toHaveBeenCalledTimes(unregistered);
    for (const [index, material] of secondMaterials.entries())
      expect(material.lightMap).toBe(lightMaps[index]);
  } finally {
    if (!firstDisposed) first.dispose();
    second.dispose();
    disconnectFirst();
    disconnectSecond?.();
  }
});
