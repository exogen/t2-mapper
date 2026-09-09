import { describe, expect, it } from "vitest";
import { parseDTS } from "./dts";
import { createDTSTestBuffer } from "./dtsTestFixtures";

describe("native DTS reader", () => {
  it.each([15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26])(
    "reads version %i lane layouts",
    (version) => {
      const shape = parseDTS(createDTSTestBuffer(version));
      expect(shape.version).toBe(version);
      expect(shape.nodes).toEqual([{ nameIndex: 0, parentIndex: -1 }]);
      expect(shape.materials[0].name).toBe("test");
      expect(Array.from(shape.meshes[0].indices)).toEqual([0, 1, 2]);
      expect(Array.from(shape.defaultRotations)).toEqual([0, 0, 0, 32767]);
    },
  );
  it("rejects truncated and unknown layouts", () => {
    const buffer = createDTSTestBuffer();
    expect(() => parseDTS(buffer.slice(0, -1))).toThrow(/truncated/);
    new DataView(buffer).setUint32(0, 27, true);
    expect(() => parseDTS(buffer)).toThrow(/unsupported DTS version 27/);
  });
  it("checks cross-lane guards", () => {
    const buffer = createDTSTestBuffer();
    const view = new DataView(buffer);
    const firstGuardOffset = 16 + 19 * 4;
    view.setUint32(firstGuardOffset, 99, true);
    expect(() => parseDTS(buffer)).toThrow(/guard/);
  });
});
