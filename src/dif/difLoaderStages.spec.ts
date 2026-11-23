import { afterEach, expect, it, vi } from "vitest";
import { LoadingManager, Texture, TextureLoader } from "three";
import { DIFLoader, disposeDIFModel } from "./difLoader";
import { createDIFTestBuffer } from "./difTestFixtures";

afterEach(() => vi.restoreAllMocks());

it("notifies the parsed-model stage before queued embedded images complete", async () => {
  const completions: Array<(texture: Texture<HTMLImageElement>) => void> = [];
  vi.spyOn(TextureLoader.prototype, "loadAsync").mockImplementation(
    () =>
      new Promise((resolve) => {
        completions.push(resolve);
      }),
  );
  const loader = new DIFLoader(new LoadingManager());
  const parsed = vi.fn();
  loader.onModelParsed = parsed;
  const ready = loader.parseAsync(createDIFTestBuffer().buffer);
  expect(parsed).toHaveBeenCalledOnce();
  expect(completions.length).toBeGreaterThan(0);
  for (const complete of completions)
    complete(new Texture({ width: 1, height: 1 } as HTMLImageElement));
  const model = await ready;
  expect(parsed).toHaveBeenCalledExactlyOnceWith(model);
  disposeDIFModel(model);
});
