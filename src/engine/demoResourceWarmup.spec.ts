import { LoadingManager, Texture } from "three";
import { beforeEach, expect, it, vi } from "vitest";
import { loadBitmapTextureAsync } from "../assets/bitmapTextures";
import { SceneAssets } from "../assets/sceneAssets";
import type { DTSModel } from "../dts/dtsModel";
import { warmParticleTexture } from "../particles/particleRenderer";
import { warmDemoResource } from "./demoResourceWarmup";
import type { GameEngine } from "./gameEngine";
import { playerSkinUrls } from "./playerSkins";
import { loadShape, loadShapeDependencies, peekShape } from "./shapeCache";

vi.mock("../assets/bitmapTextures", () => ({
  loadBitmapTextureAsync: vi.fn(),
}));
vi.mock("../loaders", () => ({
  textureToUrl: (name: string) => `/files/${name}.png`,
}));
vi.mock("../particles/particleRenderer", () => ({
  warmParticleTexture: vi.fn(),
}));
vi.mock("./playerSkins", () => ({
  loadSkinManifest: vi.fn(),
  getPlayerSkinSelection: vi.fn(),
  playerSkinUrls: vi.fn(),
}));
vi.mock("./shapeCache", () => ({
  loadShape: vi.fn(),
  loadShapeDependencies: vi.fn(),
  peekShape: vi.fn(),
}));

function fixture() {
  const initTexture = vi.fn();
  const sceneAssets = new SceneAssets();
  const assetLoadingManager = new LoadingManager();
  type Host = NonNullable<GameEngine["currentHost"]>;
  const host = { renderer: { initTexture } } as unknown as Host;
  const whenHost = vi.fn<(signal: AbortSignal) => Promise<Host>>();
  return {
    engine: {
      currentHost: host as Host | null,
      sceneAssets,
      assetLoadingManager,
      whenHost,
    },
    host,
    initTexture,
    sceneAssets,
    assetLoadingManager,
  };
}

beforeEach(() => vi.resetAllMocks());

it("uploads the scene's actual particle sampler, including large effect textures", async () => {
  const { engine, initTexture, sceneAssets } = fixture();
  const sampler = new Texture({ width: 512, height: 512 });
  vi.mocked(warmParticleTexture).mockResolvedValue(sampler);

  await warmDemoResource(
    { kind: "particleTexture", name: "effects/cloud", observedEffect: true },
    engine,
  );

  expect(warmParticleTexture).toHaveBeenCalledExactlyOnceWith(
    "effects/cloud",
    sceneAssets,
    "critical",
  );
  expect(initTexture).toHaveBeenCalledExactlyOnceWith(sampler);
});

it("skips GPU work if the host changes while the bitmap is loading", async () => {
  const { engine, initTexture } = fixture();
  let finish!: (texture: Texture) => void;
  vi.mocked(warmParticleTexture).mockImplementation(
    () => new Promise((resolve) => (finish = resolve)),
  );
  const warm = warmDemoResource(
    { kind: "particleTexture", name: "effects/cloud" },
    engine,
  );
  engine.currentHost = null;
  finish(new Texture());
  await warm;

  expect(warmParticleTexture).toHaveBeenCalledExactlyOnceWith(
    "effects/cloud",
    engine.sceneAssets,
    "speculative",
  );
  expect(initTexture).not.toHaveBeenCalled();
});

it("waits for the first renderer when decoding finishes before it mounts", async () => {
  const { engine, host, initTexture } = fixture();
  engine.currentHost = null;
  let mount!: () => void;
  engine.whenHost.mockImplementation(
    () =>
      new Promise((resolve) => {
        mount = () => {
          engine.currentHost = host;
          resolve(host);
        };
      }),
  );
  const texture = new Texture({ width: 64, height: 64 });
  vi.mocked(warmParticleTexture).mockResolvedValue(texture);
  const warm = warmDemoResource(
    { kind: "particleTexture", name: "effects/cloud" },
    engine,
  );
  await vi.waitFor(() => expect(engine.whenHost).toHaveBeenCalledOnce());
  expect(initTexture).not.toHaveBeenCalled();
  mount();
  await warm;
  expect(initTexture).toHaveBeenCalledExactlyOnceWith(texture);
});

it("uploads the shared frame samplers after the effect's image lists load", async () => {
  const { engine, initTexture, assetLoadingManager } = fixture();
  const atlas = new Texture({ width: 512, height: 512 });
  const secondFrame = atlas.clone();
  const otherFrame = new Texture({ width: 64, height: 64 });
  vi.mocked(peekShape).mockReturnValue({
    scene: {
      imageAnimations: [
        {
          frames: [atlas, secondFrame, otherFrame].map((texture) => ({
            texture,
          })),
        },
      ],
    },
  } as unknown as DTSModel);
  let finish!: () => void;
  vi.mocked(loadShapeDependencies).mockImplementation(
    () => new Promise((resolve) => (finish = resolve)),
  );

  const warm = warmDemoResource(
    {
      kind: "effectShape",
      name: "mortar_explosion.dts",
      observedEffect: true,
    },
    engine,
  );
  expect(loadShapeDependencies).toHaveBeenCalledExactlyOnceWith(
    "mortar_explosion.dts",
    assetLoadingManager,
    "critical",
  );
  expect(initTexture).not.toHaveBeenCalled();
  finish();
  await warm;
  expect(initTexture.mock.calls).toEqual([[atlas], [otherFrame]]);
});

it("warms skin fallbacks and waits for the authored shape dependencies", async () => {
  const { engine, sceneAssets, assetLoadingManager } = fixture();
  let finishDependencies!: () => void;
  vi.mocked(loadShapeDependencies).mockImplementation(
    () => new Promise((resolve) => (finishDependencies = resolve)),
  );
  vi.mocked(loadShape).mockResolvedValue({
    materials: [
      { resourcePath: "skins/base.lmale", flagNames: new Set() },
      { resourcePath: "ordinary", flagNames: new Set() },
    ],
  } as unknown as DTSModel);
  vi.mocked(playerSkinUrls)
    .mockReturnValueOnce(["/custom.lmale.png", "/team.lmale.png"])
    .mockReturnValueOnce([]);
  vi.mocked(loadBitmapTextureAsync)
    .mockRejectedValueOnce(new Error("Missing custom skin"))
    .mockRejectedValueOnce(new Error("Missing team skin"))
    .mockResolvedValueOnce(new Texture());

  const settled = vi.fn();
  const warm = warmDemoResource(
    {
      kind: "playerSkin",
      shapeName: "light_male.dts",
      skinName: "team",
      skinPrefName: "custom",
    },
    engine,
  ).then(settled);

  expect(loadShape).toHaveBeenCalledExactlyOnceWith(
    "light_male.dts",
    assetLoadingManager,
  );
  expect(loadShapeDependencies).toHaveBeenCalledExactlyOnceWith(
    "light_male.dts",
    assetLoadingManager,
  );
  await vi.waitFor(() =>
    expect(vi.mocked(loadBitmapTextureAsync).mock.calls).toEqual(
      [
        "/custom.lmale.png",
        "/team.lmale.png",
        "/files/skins/base.lmale.png",
      ].map((url) => [url, sceneAssets.textures, "speculative"]),
    ),
  );
  expect(settled).not.toHaveBeenCalled();
  finishDependencies();
  await warm;
  expect(settled).toHaveBeenCalledOnce();
});
