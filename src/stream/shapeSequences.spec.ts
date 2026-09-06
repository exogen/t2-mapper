import { beforeEach, describe, expect, it } from "vitest";
import {
  clearShapeSequences,
  getShapeSequenceDurationSec,
  registerShapeSequences,
} from "./shapeSequences";

describe("shape sequence registry", () => {
  beforeEach(() => clearShapeSequences());

  it("keys by DTS basename regardless of case, path, or .glb extension", () => {
    registerShapeSequences("shapes/Disc_Explosion.glb", [
      { name: "Ambient", duration: 0.9 },
    ]);
    expect(getShapeSequenceDurationSec("disc_explosion.dts", "ambient")).toBe(
      0.9,
    );
    expect(
      getShapeSequenceDurationSec("disc_explosion.dts", "root"),
    ).toBeUndefined();
    expect(getShapeSequenceDurationSec(undefined, "ambient")).toBeUndefined();
  });

  it("keeps the first registration for a shape", () => {
    registerShapeSequences("x.dts", [{ name: "ambient", duration: 1 }]);
    registerShapeSequences("x.dts", [{ name: "ambient", duration: 2 }]);
    expect(getShapeSequenceDurationSec("x.dts", "ambient")).toBe(1);
  });
});
