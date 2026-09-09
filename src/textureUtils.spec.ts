import { describe, expect, it, vi } from "vitest";
const pending = vi.hoisted(
  () =>
    new Map<string, { load: (image: unknown) => void; error: () => void }>(),
);
vi.mock("three", async (importOriginal) => {
  const three = await importOriginal<typeof import("three")>();
  return {
    ...three,
    ImageBitmapLoader: class {
      setOptions() {
        return this;
      }
      load(
        url: string,
        load: (image: unknown) => void,
        _progress: unknown,
        error: () => void,
      ) {
        pending.set(url, { load, error });
      }
    },
  };
});
import {
  loadTexture,
  loadTextureAsync,
  loadTextureInstance,
} from "./textureUtils";

describe("shared shape texture images", () => {
  it("notifies every in-flight sampler instance without sharing sampler state", () => {
    const original = loadTexture("instances.png"),
      a = loadTextureInstance("instances.png"),
      b = loadTextureInstance("instances.png");
    expect(pending.size).toBe(1);
    expect(a.source).toBe(original.source);
    expect(b.source).toBe(original.source);
    const image = { width: 2, height: 2 };
    pending.get("instances.png")!.load(image);
    expect(a.image).toBe(image);
    expect(b.image).toBe(image);
    expect(a.version).toBeGreaterThan(0);
    expect(b.version).toBeGreaterThan(0);
    a.repeat.set(3, 4);
    expect(b.repeat.toArray()).toEqual([1, 1]);
  });
  it("rejects all waiters when a shared fetch fails", async () => {
    loadTexture("missing.png");
    const a = loadTextureAsync("missing.png"),
      b = loadTextureAsync("missing.png");
    const assertions = Promise.all([
      expect(a).rejects.toThrow("missing.png"),
      expect(b).rejects.toThrow("missing.png"),
    ]);
    pending.get("missing.png")!.error();
    await assertions;
  });
});
