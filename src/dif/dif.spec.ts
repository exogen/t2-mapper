import { describe, expect, it } from "vitest";
import fs from "node:fs";
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

  it("retains authored zones, portal fan ranges and both sides of the portal graph", () => {
    const interior = parseDIF(createDIFTestBuffer({ portals: true }).buffer)
      .interiors[0];
    expect(interior.windingIndices).toEqual([
      { windingStart: 0, windingCount: 4 },
    ]);
    expect(interior.zones).toEqual([
      {
        portalStart: 0,
        portalCount: 1,
        surfaceStart: 0,
        surfaceCount: 1,
        flags: 0,
      },
      {
        portalStart: 1,
        portalCount: 1,
        surfaceStart: 0,
        surfaceCount: 1,
        flags: 0,
      },
    ]);
    expect(interior.zoneSurfaces).toEqual([0]);
    expect(interior.zonePortals).toEqual([0, 0]);
    expect(interior.portals).toEqual([
      {
        planeIndex: 0,
        triFanCount: 1,
        triFanStart: 0,
        zoneFront: 0,
        zoneBack: 1,
      },
    ]);
  });

  it.each([
    ["windingIndices", 4, 4, 100],
    ["zones", 0, 2, 100],
    ["zones", 4, 4, 100],
    ["zoneSurfaces", 0, 2, 100],
    ["zonePortals", 0, 2, 100],
    ["portals", 0, 2, 100],
    ["portals", 4, 4, 100],
    ["portals", 8, 2, 100],
    ["portals", 10, 2, 100],
    ["bspNodes", 34, 2, 0x8003],
  ] as const)(
    "rejects invalid %s portal/zone references",
    (section, relative, width, value) => {
      const { buffer, offsets } = createDIFTestBuffer({ portals: true });
      const view = new DataView(buffer);
      if (width === 2) view.setUint16(offsets[section] + relative, value, true);
      else view.setUint32(offsets[section] + relative, value, true);
      expect(() => parseDIF(buffer)).toThrow(/invalid .*index|invalid range/);
    },
  );

  it("accepts stock room portals and unused unassigned portal slots", () => {
    const bytes = fs.readFileSync(
      "docs/base/@vl2/interiors.vl2/interiors/sbunk2.dif",
    );
    const file = parseDIF(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    const interior = file.interiors[0];
    expect(interior.zones.length).toBeGreaterThan(1);
    expect(interior.zonePortals.length).toBeGreaterThan(0);
    expect(
      file.interiors.some((detail) =>
        detail.portals.some((portal, index) => {
          if (portal.zoneFront !== 0xffff && portal.zoneBack !== 0xffff)
            return false;
          expect(detail.zonePortals).not.toContain(index);
          return true;
        }),
      ),
    ).toBe(true);
  });

  it("rejects a zone graph that references an unassigned or unrelated portal", () => {
    for (const front of [1, 0xffff]) {
      const { buffer, offsets } = createDIFTestBuffer({ portals: true });
      new DataView(buffer).setUint16(offsets.portals + 8, front, true);
      expect(() => parseDIF(buffer)).toThrow(
        /unrelated portal|unassigned portal/,
      );
    }
  });
});
