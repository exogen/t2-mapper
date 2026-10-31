import { describe, it, expect } from "vitest";
import { Quaternion, Vector3 } from "three";
import { encodeViewHash, parseViewHash } from "./viewHash";

describe("encodeViewHash", () => {
  it("encodes position and quaternion", () => {
    const hash = encodeViewHash({
      position: new Vector3(1.23456, 2, -3),
      quaternion: new Quaternion(0, 0.7071, 0, 0.7071),
    });
    expect(hash).toBe("#c1.235,2,-3~0,0.707,0,0.707");
  });

  it("appends zoom when provided", () => {
    const hash = encodeViewHash({
      position: new Vector3(1, 2, 3),
      quaternion: new Quaternion(0, 0, 0, 1),
      zoom: 2.0714,
    });
    expect(hash).toBe("#c1,2,3~0,0,0,1~2.071");
  });
});

describe("parseViewHash", () => {
  it("round trips encoded values", () => {
    const parsed = parseViewHash("#c1670.4,2500,1660.8~-0.707,0,0,0.707~2.071");
    expect(parsed).not.toBeNull();
    expect(parsed!.position.toArray()).toEqual([1670.4, 2500, 1660.8]);
    expect(parsed!.quaternion!.toArray()).toEqual([-0.707, 0, 0, 0.707]);
    expect(parsed!.zoom).toBe(2.071);
  });

  it("returns null zoom when the segment is absent", () => {
    const parsed = parseViewHash("#c1,2,3~0,0,0,1");
    expect(parsed!.zoom).toBeNull();
  });

  it("rejects non-view hashes and malformed positions", () => {
    expect(parseViewHash("")).toBeNull();
    expect(parseViewHash("#other")).toBeNull();
    expect(parseViewHash("#cgarbage")).toBeNull();
    expect(parseViewHash("#c1,2~0,0,0,1")).toBeNull();
    expect(parseViewHash("#c1,NaN,3~0,0,0,1")).toBeNull();
  });

  it("tolerates a malformed quaternion by returning null for it", () => {
    const parsed = parseViewHash("#c1,2,3~bogus");
    expect(parsed).not.toBeNull();
    expect(parsed!.quaternion).toBeNull();
  });

  it("rejects non-positive zoom values", () => {
    expect(parseViewHash("#c1,2,3~0,0,0,1~0")!.zoom).toBeNull();
    expect(parseViewHash("#c1,2,3~0,0,0,1~-2")!.zoom).toBeNull();
  });
});
