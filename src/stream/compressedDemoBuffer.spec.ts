import { describe, expect, it } from "vitest";
import { CompressedDemoBuffer } from "./compressedDemoBuffer";

describe("compressed demo ownership", () => {
  it("reuses a correct content-length allocation at completion", () => {
    const buffer = new CompressedDemoBuffer(6);
    buffer.append(new Uint8Array([1, 2]));
    const prefix = buffer.prefix();
    buffer.append(new Uint8Array([3, 4, 5, 6]));
    const final = buffer.finish();
    expect([...new Uint8Array(prefix)]).toEqual([1, 2]);
    expect([...new Uint8Array(final)]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(buffer.finish()).toBe(final);
    expect(buffer.metrics()).toMatchObject({
      compressedCopies: 1,
      compressedChunkBytes: 0,
      compressedPreallocatedBytes: 0,
      compressedAssembledBytes: 6,
    });
  });

  it("releases unknown-length chunks after the final copy and measures their overlap", () => {
    const overlap: Record<string, number>[] = [];
    const buffer = new CompressedDemoBuffer(0, 64, () =>
      overlap.push(buffer.metrics()),
    );
    buffer.append(new Uint8Array([1, 2]));
    buffer.append(new Uint8Array([3, 4]));
    expect([...new Uint8Array(buffer.finish())]).toEqual([1, 2, 3, 4]);
    expect(overlap[0]).toMatchObject({
      compressedChunkBytes: 4,
      compressedCopyTransientBytes: 4,
    });
    expect(buffer.metrics()).toMatchObject({
      compressedChunkBytes: 0,
      compressedCopyTransientBytes: 0,
      compressedAssembledBytes: 4,
    });
  });

  it.each([2, 100, NaN, Infinity])(
    "preserves partial data with an inaccurate length %s",
    (length) => {
      const buffer = new CompressedDemoBuffer(length);
      buffer.append(new Uint8Array([1, 2, 3]));
      buffer.append(new Uint8Array([4]));
      expect([...new Uint8Array(buffer.finish())]).toEqual([1, 2, 3, 4]);
      expect(buffer.metrics().compressedChunkBytes).toBe(0);
    },
  );

  it("does not preallocate arbitrary advertised sizes or reuse a partial view's backing bytes", () => {
    const buffer = new CompressedDemoBuffer(1000, 10);
    expect(buffer.metrics().compressedPreallocatedBytes).toBe(0);
    buffer.append(new Uint8Array([0, 1, 2, 3]).subarray(1, 3));
    expect([...new Uint8Array(buffer.finish())]).toEqual([1, 2]);
  });
});
