import { describe, expect, it } from "vitest";
import { readWorldShadowSize, selectWorldShadowSize } from "./worldShadowSize";

describe("world shadow selection", () => {
  it("preserves the desktop default when signals and valid overrides are absent", () => {
    for (const search of [
      "",
      "?worldShadowSize=0",
      "?worldShadowSize=8192",
      "?worldShadowSize=NaN",
    ])
      expect(readWorldShadowSize(search, {})).toBe(4096);
  });

  it("selects 1024 for mobile and constrained desktops without diagnostics enabled", () => {
    for (const signals of [
      { mobile: true },
      { deviceMemoryGB: 4 },
      { hardwareConcurrency: 4 },
      { coarsePointer: true },
    ])
      expect(selectWorldShadowSize("?mode=demo", signals)).toEqual({
        size: 1024,
        source: "device-default",
        constrained: true,
      });
  });

  it("respects every explicit supported size on both device classes", () => {
    for (const signals of [{}, { mobile: true }]) {
      for (const size of [1024, 2048, 4096])
        expect(
          selectWorldShadowSize(`?worldShadowSize=${size}`, signals),
        ).toMatchObject({ size, source: "override" });
    }
  });

  it("falls back to the device default for invalid overrides", () => {
    for (const value of ["", "0", "8192", "NaN", "2048.0", "-1024"])
      expect(
        selectWorldShadowSize(`?worldShadowSize=${value}`, { mobile: true }),
      ).toMatchObject({ size: 1024, source: "device-default" });
  });
});
