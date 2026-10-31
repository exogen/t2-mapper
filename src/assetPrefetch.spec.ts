import { afterEach, expect, it, vi } from "vitest";
import { createDIFTestBuffer } from "./dif/difTestFixtures";

const mocks = vi.hoisted(() => ({
  loadShape: vi.fn(async () => {}),
  loadInterior: vi.fn(),
  loadSharedTexture: vi.fn(async () => {}),
}));
vi.mock("./engine/shapeCache", () => ({ loadShape: mocks.loadShape }));
vi.mock("./loaders", () => ({
  interiorToUrl: (name: string) => `/interiors/${name}`,
  shapeToUrl: (name: string) => `/shapes/${name}`,
  textureToUrl: (name: string) => `/textures/${name}.png`,
  terrainTextureToUrl: vi.fn(),
  loadTerrain: vi.fn(),
}));
vi.mock("./textureUtils", () => ({ loadTexture: vi.fn() }));
vi.mock("./engine/interiorCache", () => ({ loadInterior: mocks.loadInterior }));
vi.mock("./engine/textures", () => ({
  loadSharedTexture: mocks.loadSharedTexture,
}));

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
  mocks.loadInterior.mockImplementationOnce(async () =>
    new InteriorLoader().parse(buffer),
  );
  startAssetPrefetch(() => [{ kind: "interior", name: "native-test.dif" }]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(mocks.loadInterior).toHaveBeenCalledWith("/interiors/native-test.dif");
  expect(mocks.loadShape).not.toHaveBeenCalled();
  expect(mocks.loadSharedTexture).toHaveBeenCalledWith("/textures/test.png");
  expect(mocks.loadSharedTexture).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
});
