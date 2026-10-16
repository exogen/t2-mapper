import { describe, expect, it } from "vitest";
import { tickedCameraPitch } from "./legacyControlObject";

const bits = (value: number) => {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value);
  return view.getUint32(0);
};

describe("tickedCameraPitch", () => {
  it("clamps past 1.3962 to its nearest float", () => {
    expect(tickedCameraPitch(0x3fb2b6ae)).toBe(0x3fb2b6ae);
    expect(tickedCameraPitch(0x3fb2b6af)).toBe(0x3fb2b6ae);
    expect(tickedCameraPitch(bits((80 * Math.PI) / 180))).toBe(0x3fb2b6ae);
    expect(tickedCameraPitch(bits(1.484838843345642))).toBe(0x3fb2b6ae);
    expect(tickedCameraPitch(0xbfb2b6af)).toBe(0xbfb2b6ae);
  });

  it("leaves a pitch within the clamp", () => {
    for (const pitch of [0, 1.2, -1.3962, 1.39619])
      expect(tickedCameraPitch(bits(pitch))).toBe(bits(pitch));
  });
});
