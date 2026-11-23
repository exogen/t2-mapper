import { expect, it, vi } from "vitest";
import { ByteLruMap } from "./byteLruMap";

const cache = (maxBytes = 8, maxEntries = 4) =>
  new ByteLruMap<string, { bytes: number }>({
    maxBytes,
    maxEntries,
    sizeOf: (value) => value.bytes,
  });

it("evicts the least recently read key to obey the byte budget without invalidating owners", () => {
  const lru = cache();
  const activeOwner = { bytes: 4, dispose: vi.fn() };
  lru.set("first", activeOwner).set("second", { bytes: 4 });
  expect(lru.get("first")).toBe(activeOwner);
  lru.set("third", { bytes: 4 });
  expect([...lru.keys()]).toEqual(["first", "third"]);
  lru.set("fourth", { bytes: 8 });
  expect([...lru.keys()]).toEqual(["fourth"]);
  expect(lru.retainedBytes).toBe(8);
  expect(lru.evictions).toBe(3);
  expect(activeOwner.dispose).not.toHaveBeenCalled();
  expect(activeOwner.bytes).toBe(4);
});

it("counts aliases once while independently bounding URL entries", () => {
  const lru = cache(8, 3);
  const aliased = { bytes: 6 };
  lru.set("alias1", aliased).set("alias2", aliased).set("other", { bytes: 2 });
  expect(lru.retainedBytes).toBe(8);
  expect(lru.uniqueValues).toBe(2);
  lru.set("alias3", aliased);
  expect(lru.has("alias1")).toBe(false);
  expect(lru.size).toBe(3);
  expect(lru.retainedBytes).toBe(8);
  lru.delete("alias2");
  expect(lru.retainedBytes).toBe(8);
  lru.delete("alias3");
  expect(lru.retainedBytes).toBe(2);
  expect(lru.uniqueValues).toBe(1);
});

it("replaces and clears ownership correctly while preserving Map methods and lifetime counters", () => {
  const lru = cache();
  const value = { bytes: 8 };
  lru.set("key", value).set("key", value);
  expect(lru.retainedBytes).toBe(8);
  lru.set("key", { bytes: 4 });
  expect(lru.retainedBytes).toBe(4);
  expect(lru.get("missing")).toBeUndefined();
  expect(lru.get("key")).toEqual({ bytes: 4 });
  expect(lru.hits).toBe(1);
  expect(lru.misses).toBe(1);
  expect([...lru.values()]).toEqual([{ bytes: 4 }]);
  expect(lru.delete("missing")).toBe(false);
  lru.clear();
  expect(lru.size).toBe(0);
  expect(lru.retainedBytes).toBe(0);
  expect(lru.uniqueValues).toBe(0);
  expect(lru.hits).toBe(1);
});

it("does not retain an individually oversized value and bounds zero-byte values by entries", () => {
  const lru = cache(8, 2);
  const large = { bytes: 9 };
  expect(lru.set("large", large)).toBe(lru);
  expect(lru.size).toBe(0);
  expect(lru.retainedBytes).toBe(0);
  expect(lru.oversizedRejections).toBe(1);
  for (let i = 0; i < 100; i++) lru.set(String(i), { bytes: 0 });
  expect(lru.size).toBe(2);
  expect(lru.uniqueValues).toBe(2);
  expect(lru.evictions).toBe(98);
});

it("rejects invalid size accounting without deleting an existing lookup", () => {
  const lru = cache();
  const original = { bytes: 2 };
  lru.set("keep", original);
  for (const bytes of [NaN, Infinity, -1])
    expect(() => lru.set("keep", { bytes })).toThrow("value size");
  expect(lru.get("keep")).toBe(original);
  expect(lru.retainedBytes).toBe(2);
  expect(() => cache(Infinity)).toThrow("budget");
  expect(() => cache(8, -1)).toThrow("budget");
  expect(() => cache(8, 1.5)).toThrow("budget");
});
