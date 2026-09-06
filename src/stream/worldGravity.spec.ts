import { describe, expect, it } from "vitest";
import { DEFAULT_WORLD_GRAVITY, worldGravityToMS2 } from "./worldGravity";

describe("worldGravityToMS2", () => {
  it("scales setGravity() units by the engine's 0.4905", () => {
    expect(worldGravityToMS2(DEFAULT_WORLD_GRAVITY)).toBeCloseTo(-9.81, 5);
    // A "classic" pug server at −26.9 with the mod mortar's gravityMod 1.1:
    // the value fitted from recorded mortar flights was 14.6 m/s².
    expect(worldGravityToMS2(-26.9) * 1.1).toBeCloseTo(-14.51, 2);
    expect(worldGravityToMS2(0)).toBe(0);
  });
});
