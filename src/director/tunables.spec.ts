import { describe, expect, it } from "vitest";
import { DIRECTOR_LOOKAHEAD_SEC, envSeconds } from "./tunables";

describe("envSeconds", () => {
  it("falls back when the var is unset or empty", () => {
    // Vite's `define` substitutes an unset var as the literal "" —
    // Number("") is 0, which once pinned the director's lookahead to
    // zero in the browser and killed every peek-based rule.
    expect(envSeconds(undefined, 2)).toBe(2);
    expect(envSeconds("", 2)).toBe(2);
    expect(envSeconds("   ", 2)).toBe(2);
  });

  it("takes a real value, including an explicit zero", () => {
    expect(envSeconds("5", 2)).toBe(5);
    expect(envSeconds("0", 2)).toBe(0);
    expect(envSeconds("0.5", 2)).toBe(0.5);
  });

  it("rejects nonsense", () => {
    expect(envSeconds("soon", 2)).toBe(2);
    expect(envSeconds("-1", 2)).toBe(2);
  });

  it("keeps a usable default lookahead", () => {
    expect(DIRECTOR_LOOKAHEAD_SEC).toBeGreaterThan(0);
  });
});
