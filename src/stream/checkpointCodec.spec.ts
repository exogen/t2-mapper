import { describe, expect, it } from "vitest";
import { encodeCheckpoint, decodeCheckpoint } from "./checkpointCodec";

describe("checkpoint graph codec", () => {
  it("preserves shared objects, cycles, Map keys, sets and typed data", () => {
    const shared = {
      bytes: new Uint8Array([0, 255]),
      values: new Float32Array([1.5, -2]),
    };
    const source = {
      shared,
      map: new Map([[shared, shared]]),
      set: new Set([shared]),
      self: null as unknown,
    };
    source.self = source;
    const result = decodeCheckpoint(encodeCheckpoint(source)) as typeof source;
    expect(result.self).toBe(result);
    expect(result.map.get(result.shared)).toBe(result.shared);
    expect(result.set.has(result.shared)).toBe(true);
    expect(result.shared.bytes).toEqual(shared.bytes);
    expect(result.shared.values).toEqual(shared.values);
  });

  it("preserves undefined properties and non-finite simulation values", () => {
    const source = {
      absent: undefined,
      array: [undefined, NaN, Infinity, -Infinity, -0],
    };
    expect(decodeCheckpoint(encodeCheckpoint(source))).toEqual(source);
  });

  it("rejects unknown types and invalid references", () => {
    expect(() => decodeCheckpoint('{"root":{"ref":0},"nodes":[]}')).toThrow(
      "reference",
    );
    expect(() =>
      decodeCheckpoint(
        '{"root":{"ref":0},"nodes":[{"type":"constructor","value":[]}]}',
      ),
    ).toThrow("node type");
    expect(() => encodeCheckpoint({ callback: () => {} })).toThrow(
      "Unsupported",
    );
  });
});
