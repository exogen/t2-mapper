import { expect, it, vi } from "vitest";
import { SceneAssets } from "./sceneAssets";

it("disposes every cached resource even if a release listener throws", () => {
  const assets = new SceneAssets();
  const error = new Error("release failed");
  const release = vi.fn((name: string) => {
    if (name === "first") throw error;
  });
  const first = assets.cache<string, string>({}, release);
  const second = assets.cache<string, string>({}, release);
  first.set("a", "first").set("b", "second");
  second.set("c", "third");

  expect(() => assets.dispose()).toThrow(error);
  expect(release.mock.calls).toEqual([["first"], ["second"], ["third"]]);
  expect(first.size + second.size).toBe(0);
  expect(assets.disposed).toBe(true);
  assets.dispose();
  expect(release).toHaveBeenCalledTimes(3);
});

it("detaches old image bindings before canceling image requests and keeps world resources", () => {
  const assets = new SceneAssets();
  const world = assets.cache({}, vi.fn());
  world.set("terrain", {});
  const first = assets.textures;
  const detach = vi.fn(() => expect(first.disposed).toBe(false));
  const bind = vi.fn((textures: SceneAssets) =>
    textures === first ? detach : undefined,
  );
  const stop = assets.bindTextures(bind);

  assets.refreshTextures();
  const second = assets.textures;
  expect(bind.mock.calls).toEqual([[first], [second]]);
  expect(detach).toHaveBeenCalledOnce();
  expect(first.signal.aborted).toBe(true);
  expect(second.signal.aborted).toBe(false);
  expect(world.has("terrain")).toBe(true);

  stop();
  assets.dispose();
  expect(second.signal.aborted).toBe(true);
  expect(world.size).toBe(0);
});
