import { describe, expect, it } from "vitest";
import { cloneData } from "./cloneData";

describe("cloneData", () => {
  it("deep-copies plain data like structuredClone", () => {
    const source = {
      position: [1.5, 2, -3.25],
      nested: { list: [{ id: 1 }, { id: 2 }], when: new Date(0) },
      byId: new Map([["a", { rotation: [0, 0, 0, 1] }]]),
      tags: new Set(["x", "y"]),
      buffer: new Float32Array([1, 2]),
    };
    const copy = cloneData(source);
    expect(copy).toEqual(source);
    expect(copy.position).not.toBe(source.position);
    expect(copy.nested.list[0]).not.toBe(source.nested.list[0]);
    expect(copy.byId.get("a")).not.toBe(source.byId.get("a"));
    expect(copy.buffer).not.toBe(source.buffer);
  });

  it("keeps shared references and cycles", () => {
    const shared = [1, 2, 3];
    const source: Record<string, unknown> = { a: shared, b: { c: shared } };
    source.self = source;
    const copy = cloneData(source);
    expect(copy.a).toBe((copy.b as { c: unknown }).c);
    expect(copy.self).toBe(copy);
  });
});
