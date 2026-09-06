import { describe, expect, it } from "vitest";
import { glbAnimationDurations, parseGlbJson } from "./glbJson";

describe("parseGlbJson", () => {
  it("reads the JSON chunk and rejects non-GLB buffers", () => {
    const json = new TextEncoder().encode('{"asset":{"version":"2.0"}}');
    const buf = new ArrayBuffer(20 + json.byteLength);
    const view = new DataView(buf);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, buf.byteLength, true);
    view.setUint32(12, json.byteLength, true);
    view.setUint32(16, 0x4e4f534a, true);
    new Uint8Array(buf, 20).set(json);
    expect(parseGlbJson(buf)).toEqual({ asset: { version: "2.0" } });
    expect(parseGlbJson(new ArrayBuffer(8))).toBeUndefined();
  });
});

describe("glbAnimationDurations", () => {
  it("takes the largest sampler input max per named animation", () => {
    expect(
      glbAnimationDurations({
        accessors: [{ max: [0.3] }, { max: [1.1333] }, { max: [0.5] }],
        animations: [
          { name: "Ambient", samplers: [{ input: 0 }, { input: 1 }] },
          { name: "Ambient_Fiery_frame", samplers: [{ input: 2 }] },
          { samplers: [{ input: 2 }] },
        ],
      }),
    ).toEqual([
      { name: "Ambient", duration: 1.1333 },
      { name: "Ambient_Fiery_frame", duration: 0.5 },
    ]);
  });
});
