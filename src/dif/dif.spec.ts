import { describe, expect, it } from "vitest";
import { parseDIF } from "./dif";
import { createDIFTestBuffer } from "./difTestFixtures";

describe("Tribes 2 DIF reader", () => {
  it("reads multiple details, signed plane references, and exact PNG bytes", () => {
    const { buffer, png } = createDIFTestBuffer({ details: 2, preview: true });
    const file = parseDIF(buffer);
    expect(file.interiors.map((it) => it.detailLevel)).toEqual([0, 1]);
    expect(file.subObjects).toEqual([]);
    const interior = file.interiors[0];
    expect(interior.materialNames).toEqual(["test"]);
    expect(interior.points[3]).toEqual([3, 2, 0]);
    expect(interior.surfaces[1].planeIndex).toBe(0x8000);
    expect(interior.surfaces[1].flags).toBe(16);
    expect(interior.lightMaps[0].png).toEqual(png);
    expect(interior.lightMaps[0].keep).toBe(true);
  });

  it.each([
    [0, 0, 1],
    [1, 0, 2],
    [2, 1, 0],
    [3, 1, 2],
    [4, 2, 0],
    [5, 2, 1],
  ])("decodes lightmap axis encoding %i", (axisEncoding, sAxis, tAxis) => {
    const { buffer } = createDIFTestBuffer({ axisEncoding });
    const [s, t] = parseDIF(buffer).interiors[0].surfaces[0].lightMapTexGen;
    const expectedS = [0, 0, 0, 0.125];
    expectedS[sAxis] = 1 / 8;
    const expectedT = [0, 0, 0, 0.5];
    expectedT[tAxis] = 1 / 4;
    expect(s).toEqual(expectedS);
    expect(t).toEqual(expectedT);
  });

  it("rejects incompatible versions and invalid references with context", () => {
    for (const [offset, value, message] of [
      [0, 43, /unsupported resource version/],
      [9, 13, /unsupported interior version/],
      [5, 0xffffffff, /truncated data/],
    ] as const) {
      const { buffer } = createDIFTestBuffer();
      new DataView(buffer).setUint32(offset, value, true);
      expect(() => parseDIF(buffer)).toThrow(message);
    }
    const { buffer, offsets } = createDIFTestBuffer();
    new DataView(buffer).setUint32(offsets.pointIndex, 99, true);
    expect(() => parseDIF(buffer)).toThrow(
      /DIF windings at byte .* invalid point index/,
    );
  });

  it("rejects truncated PNGs, render arrays, and bad lightmap axis encodings", () => {
    const { buffer, offsets } = createDIFTestBuffer();
    for (const end of [0, 8, offsets.surface + 20, offsets.png + 50]) {
      expect(() => parseDIF(buffer.slice(0, end))).toThrow(
        /DIF .*truncated data/,
      );
    }
    expect(() =>
      parseDIF(createDIFTestBuffer({ axisEncoding: 6 }).buffer),
    ).toThrow(/axis encoding/);
  });
});
