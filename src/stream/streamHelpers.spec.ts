import { describe, expect, it } from "vitest";
import { parseColorSegments } from "./streamHelpers";

describe("parseColorSegments", () => {
  it("chat default: a pushed span inherits the line color (T2 chat HUD)", () => {
    // A chat line embedding a tagged name: the name is NOT recolored.
    const raw = "\x04Gabe: \x10\x0b\x08yeaunome\x11 says hi";
    expect(parseColorSegments(raw)).toEqual([
      { text: "Gabe: yeaunome says hi", colorCode: 2 },
    ]);
  });

  it("taggedColors: keeps color switches inside a pushed span", () => {
    // server.cs: "\cp\c7" @ tag @ "\c6" @ name @ "\co" — c7=0x0b, c6=0x08.
    const raw = "\x10\x0b=TAG=\x08Player\x11";
    expect(parseColorSegments(raw, { taggedColors: true })).toEqual([
      { text: "=TAG=", colorCode: 7 },
      { text: "Player", colorCode: 6 },
    ]);
  });

  it("taggedColors: restores the pre-push color after pop", () => {
    const raw = "\x02before \x10\x0cSmurf\x11 after";
    expect(parseColorSegments(raw, { taggedColors: true })).toEqual([
      { text: "before ", colorCode: 0 },
      { text: "Smurf", colorCode: 8 },
      { text: " after", colorCode: 0 },
    ]);
  });
});
