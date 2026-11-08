import { afterEach, beforeEach, expect, it, vi } from "vitest";

let metadata: typeof import("./demoIndex");

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("DEMOS_BASE_URL", "https://demos.example.com/demos");
  metadata = await import("./demoIndex");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("uses a stable metadata cache version to escape legacy immutable copies", () => {
  const url = "https://demos.example.com/demos/game.rec.json";
  expect(metadata.versionedDemoMetadataUrl(url)).toBe(`${url}?metadata=2`);
  expect(metadata.versionedDemoMetadataUrl(`${url}?metadata=2`)).toBe(
    `${url}?metadata=2`,
  );
  expect(metadata.versionedDemoMetadataUrl(`${url}?other=value`)).toBe(
    `${url}?other=value&metadata=2`,
  );
});

it.each([
  "https://other.example.com/demos/game.rec.json?token=example",
  "https://demos.example.com/demos-other/game.rec.json",
])("leaves unrelated metadata URLs unchanged: %s", (url) => {
  expect(metadata.versionedDemoMetadataUrl(url)).toBe(url);
});

it("revalidates the versioned index URL", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json([]));
  vi.stubGlobal("fetch", fetchMock);
  await metadata.fetchDemoIndex();
  expect(fetchMock).toHaveBeenCalledWith(
    "https://demos.example.com/demos/index.json?metadata=2",
    { cache: "no-cache" },
  );
});
