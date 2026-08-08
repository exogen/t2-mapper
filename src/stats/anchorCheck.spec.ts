import { describe, it, expect } from "vitest";
import { checkAnchors } from "./anchorCheck";

const ANCHORS = {
  storm: { x: -424.61, z: -266.04 },
  inferno: { x: 131.94, z: -232.38 },
};

describe("checkAnchors", () => {
  it("passes when flags are within epsilon of their anchors", () => {
    expect(
      checkAnchors(ANCHORS, [
        { teamId: 1, x: -424.608, z: -266.035 },
        { teamId: 2, x: 131.943, z: -232.377 },
      ]),
    ).toBeNull();
  });

  it("warns when an anchor is far from its team's flag", () => {
    expect(
      checkAnchors(ANCHORS, [
        { teamId: 1, x: 100, z: 100 },
        { teamId: 2, x: 131.94, z: -232.38 },
      ]),
    ).toMatch(/don't match/);
  });

  it("passes silently when the map has no flags", () => {
    expect(checkAnchors(ANCHORS, [])).toBeNull();
  });

  it("passes when the data has no anchors", () => {
    expect(checkAnchors({}, [{ teamId: 1, x: 0, z: 0 }])).toBeNull();
  });
});
