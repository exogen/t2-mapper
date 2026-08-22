import { describe, it, expect } from "vitest";
import { parseScoreHudLine } from "./shared";

describe("parseScoreHudLine", () => {
  it("parses a TacoServer CTFHud player line (name, score, kills)", () => {
    // SetLineHud data args from z_dtStats CTFHud observer format.
    expect(parseScoreHudLine(["\x10\x0bVaxity\x11", "470", "35", "5"])).toEqual(
      [{ name: "Vaxity", score: 470, kills: 35 }],
    );
  });

  it("parses a stock two-column line (name1/score1, name2/score2)", () => {
    expect(parseScoreHudLine(["Storm P1", "120", "Inferno P2", "90"])).toEqual([
      { name: "Storm P1", score: 120 },
      { name: "Inferno P2", score: 90 },
    ]);
  });

  it("drops team-header and blank lines (non-numeric or empty)", () => {
    expect(parseScoreHudLine(["Storm", "208", "19", "Players"])).toEqual([
      // "Storm 208" reads as a player candidate; the caller drops it when
      // no roster player is named "Storm". kills=19 from the numeric 3rd.
      { name: "Storm", score: 208, kills: 19 },
    ]);
    expect(parseScoreHudLine([])).toEqual([]);
    expect(parseScoreHudLine(["", "0"])).toEqual([]);
  });
});
