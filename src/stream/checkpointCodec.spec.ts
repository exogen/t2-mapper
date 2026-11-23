import { describe, expect, it, vi } from "vitest";
import { gzipSync } from "node:zlib";
import {
  encodeCheckpoint,
  decodeCheckpoint,
  decodeCompressedCheckpoint,
  bytesToBase64,
} from "./checkpointCodec";
import { readResourceMetrics } from "../diagnostics/resourceMetricRegistry";

describe("checkpoint graph codec", () => {
  it("cancels a decompressor stalled before its first output chunk", async () => {
    const cancelled = vi.fn();
    let finish!: () => void;
    vi.stubGlobal(
      "DecompressionStream",
      class {
        readable = new ReadableStream<Uint8Array>({
          start(controller) {
            finish = () => controller.error(new Error("test cleanup"));
          },
          cancel: cancelled,
        });
        writable = new WritableStream<Uint8Array>();
      },
    );
    const abort = new AbortController();
    const pending = decodeCompressedCheckpoint("AA==", abort.signal);
    const settled = pending.then(
      () => "complete",
      (error: Error) => (error.name === "AbortError" ? "aborted" : "error"),
    );
    try {
      await Promise.resolve();
      abort.abort();
      expect(
        await Promise.race([
          settled,
          new Promise((resolve) => setTimeout(() => resolve("pending"), 25)),
        ]),
      ).toBe("aborted");
      expect(cancelled).toHaveBeenCalledOnce();
      expect(readResourceMetrics()["checkpointDecode.active"]).toBe(0);
    } finally {
      finish();
      await settled;
      vi.unstubAllGlobals();
    }
  });
  it("releases aborted decompression gauges without counting cancellation as a decode failure", async () => {
    const data = bytesToBase64(
      gzipSync(encodeCheckpoint({ payload: "x".repeat(1024 * 1024) })),
    );
    const before = readResourceMetrics()["checkpointDecode.failures"];
    const abort = new AbortController();
    const pending = decodeCompressedCheckpoint(data, abort.signal);
    abort.abort();
    await expect(pending).rejects.toThrow();
    const after = readResourceMetrics();
    expect(after["checkpointDecode.failures"]).toBe(before);
    expect(after["checkpointDecode.active"]).toBe(0);
    expect(after["checkpointDecode.activeCompressedBytes"]).toBe(0);
    expect(after["checkpointDecode.activePlaintextBytes"]).toBe(0);
  });
  it("keeps prototype-named properties as data and rejects prototype constructor names", () => {
    const source = JSON.parse(
      '{"__proto__":{"checkpointPolluted":true},"constructor":"data"}',
    );
    const decoded = decodeCheckpoint(encodeCheckpoint(source)) as Record<
      string,
      unknown
    >;
    expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype);
    expect(Object.hasOwn(decoded, "__proto__")).toBe(true);
    expect(decoded.constructor).toBe("data");
    expect(({} as Record<string, unknown>).checkpointPolluted).toBeUndefined();
    expect(() =>
      decodeCheckpoint(
        '{"root":{"ref":0},"nodes":[{"type":"__proto__","value":[]}]}',
      ),
    ).toThrow("node type");
  });
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
