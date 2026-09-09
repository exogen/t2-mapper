import { describe, expect, it } from "vitest";
import { mergeDSQ, parseDSQ, type DSQData } from "./dsq";
import { createDTSSequence, createDTSTestShape } from "./dtsTestFixtures";

function data(): DSQData {
  return {
    version: 24,
    nodeNames: ["Extra", "rOoT"],
    sequenceNames: ["Walk"],
    rotations: new Int16Array(),
    translations: new Float32Array([99, 99, 99, 98, 98, 98, 1, 2, 3, 4, 5, 6]),
    uniformScales: new Float32Array(),
    alignedScales: new Float32Array(),
    arbitraryScaleRotations: new Int16Array(),
    arbitraryScaleFactors: new Float32Array(),
    groundTranslations: new Float32Array([1, 2, 3]),
    groundRotations: new Int16Array([0, 0, 0, 32767]),
    objectStates: [],
    triggers: [{ state: 0x80000001, position: 0.5 }],
    sequences: [
      createDTSSequence({
        numKeyframes: 2,
        translationMatters: [0, 1],
        numGroundFrames: 1,
        numTriggers: 1,
      }),
    ],
  };
}
describe("DSQ sequences", () => {
  it("remaps nodes case-insensitively without shifting past unmatched channels", () => {
    const shape = createDTSTestShape();
    const source = data();
    const merged = mergeDSQ(shape, [{ data: source, name: "forward" }]);
    expect(Array.from(merged.translations)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(merged.sequences[0].translationMatters).toEqual([0]);
    expect(merged.names[merged.sequences[0].nameIndex]).toBe("forward");
    expect(merged.triggers).toEqual(source.triggers);
    expect(Array.from(merged.groundTranslations)).toEqual([1, 2, 3]);
    expect(shape.sequences).toEqual([]);
    expect(source.sequences[0].translationMatters).toEqual([0, 1]);
  });
  it("appends channel, trigger, and ground offsets independently", () => {
    const merged = mergeDSQ(createDTSTestShape(), [
      { data: data() },
      { data: data(), name: "back" },
    ]);
    expect(merged.sequences[1].baseTranslation).toBe(2);
    expect(merged.sequences[1].firstGroundFrame).toBe(1);
    expect(merged.sequences[1].firstTrigger).toBe(1);
    expect(merged.translations).toHaveLength(12);
  });
  it("rejects invalid keyframe ranges before building animations", () => {
    const source = data();
    source.sequences[0].baseTranslation = 999;
    expect(() => mergeDSQ(createDTSTestShape(), [{ data: source }])).toThrow(
      /keyframe range/,
    );
    expect(() => parseDSQ(new ArrayBuffer(0))).toThrow(/truncated/);
    const unsupported = new ArrayBuffer(4);
    new DataView(unsupported).setUint32(0, 21, true);
    expect(() => parseDSQ(unsupported)).toThrow(/unsupported DSQ/);
  });
});
