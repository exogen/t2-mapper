import { afterEach, expect, it, vi } from "vitest";
import { createDIFTestBuffer } from "./dif/difTestFixtures";

const mocks = vi.hoisted(() => ({
  preloadDIF: vi.fn(),
  preloadGLTF: vi.fn(),
  preloadTexture: vi.fn(),
}));
vi.mock("@react-three/fiber", () => ({
  useLoader: { preload: mocks.preloadDIF },
}));
vi.mock("@react-three/drei", () => ({
  useGLTF: { preload: mocks.preloadGLTF },
  useTexture: { preload: mocks.preloadTexture },
}));
vi.mock("./loaders", () => ({
  interiorToUrl: (name: string) => `/interiors/${name}`,
  shapeToUrl: (name: string) => `/shapes/${name}`,
  textureToUrl: (name: string) => `/textures/${name}.png`,
  terrainTextureToUrl: vi.fn(),
  loadTerrain: vi.fn(),
}));
vi.mock("./textureUtils", () => ({ loadTexture: vi.fn() }));

import { startAssetPrefetch, stopAssetPrefetch } from "./assetPrefetch";
import { InteriorLoader } from "./interiorLoader";

afterEach(() => {
  stopAssetPrefetch();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("prefetches interiors and their textures through one loader request", async () => {
  vi.useFakeTimers();
  const { buffer } = createDIFTestBuffer({ materialNames: ["test", "unused"] });
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  mocks.preloadDIF.mockImplementationOnce((Loader) =>
    new Loader().parse(buffer),
  );
  startAssetPrefetch(() => [{ kind: "interior", name: "native-test.dif" }]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(mocks.preloadDIF).toHaveBeenCalledWith(
    InteriorLoader,
    "/interiors/native-test.dif",
  );
  expect(mocks.preloadGLTF).not.toHaveBeenCalled();
  expect(mocks.preloadTexture).toHaveBeenCalledWith("/textures/test.png");
  expect(mocks.preloadTexture).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
});
