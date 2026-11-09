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

  it("round-trips deep linked timeline histories without exhausting the stack", () => {
    interface Link {
      index: number;
      previous?: Link;
    }
    let history: Link | undefined;
    for (let index = 0; index < 20_000; index++)
      history = { index, previous: history };
    let current = decodeCheckpoint(encodeCheckpoint(history)) as
      Link | undefined;
    let length = 0;
    let sum = 0;
    while (current) {
      length++;
      sum += current.index;
      current = current.previous;
    }
    expect(length).toBe(20_000);
    expect(sum).toBe((20_000 * 19_999) / 2);
  });

  it("round-trips deeply nested arrays while preserving whole-array construction", () => {
    let source: unknown = "leaf";
    for (let i = 0; i < 20_000; i++) source = [source];
    let result = decodeCheckpoint(encodeCheckpoint(source));
    let depth = 0;
    while (Array.isArray(result)) {
      depth++;
      result = result[0];
    }
    expect(depth).toBe(20_000);
    expect(result).toBe("leaf");
  });

  it("keeps shared arrays and cycles through object properties", () => {
    const shared = [1, 2, 3];
    const array: unknown[] = [shared, shared];
    array.push({ array });
    const result = decodeCheckpoint(encodeCheckpoint(array)) as typeof array;
    expect(result[0]).toBe(result[1]);
    expect(result[0]).toEqual(shared);
    expect((result[2] as { array: unknown[] }).array).toBe(result);
  });

  it("continues rejecting direct array cycles", () => {
    const cycle: unknown[] = [];
    cycle.push(cycle);
    expect(() => decodeCheckpoint(encodeCheckpoint(cycle))).toThrow(
      "Unsupported checkpoint array cycle",
    );
  });

  it("decodes checkpoints written with the previous traversal order", () => {
    const result = decodeCheckpoint(
      '{"root":{"ref":0},"nodes":[{"type":"object","value":{"first":{"ref":1},"second":{"ref":1},"values":{"ref":2}}},{"type":"object","value":{"name":"shared"}},{"type":"array","value":[1,2,{"special":"undefined"}]}]}',
    ) as { first: { name: string }; second: object; values: unknown[] };
    expect(result.first).toBe(result.second);
    expect(result.first.name).toBe("shared");
    expect(result.values).toEqual([1, 2, undefined]);
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
