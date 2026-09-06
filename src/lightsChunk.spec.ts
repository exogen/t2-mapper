import { describe, expect, it } from "vitest";
import { ShaderChunk } from "three";
import { lightsFragmentBeginByType } from "./lightsChunk";

function calls(source: string, fn: string): number {
  return source.split(`${fn}(`).length - 1;
}

describe("lightsFragmentBeginByType", () => {
  const original = ShaderChunk.lights_fragment_begin;
  const total = calls(original, "RE_Direct");

  it("leaves the chunk alone by default", () => {
    expect(lightsFragmentBeginByType({})).toBe(original);
  });

  it("gives the directional loop its own function", () => {
    const out = lightsFragmentBeginByType({ directional: "RE_Direct_Sun" });
    expect(calls(out, "RE_Direct_Sun")).toBe(1);
    expect(calls(out, "RE_Direct")).toBe(total - 1);
    const dir = out.indexOf("#if ( NUM_DIR_LIGHTS > 0 )");
    expect(out.indexOf("RE_Direct_Sun(")).toBeGreaterThan(dir);
    expect(out.indexOf("RE_Direct_Sun(")).toBeLessThan(
      out.indexOf("#if ( NUM_RECT_AREA_LIGHTS > 0 )"),
    );
  });

  it("gives the point and spot loops their own function", () => {
    const out = lightsFragmentBeginByType({ punctual: "RE_Direct_Dyn" });
    expect(calls(out, "RE_Direct_Dyn")).toBe(2);
    expect(out.lastIndexOf("RE_Direct_Dyn(")).toBeLessThan(
      out.indexOf("#if ( NUM_DIR_LIGHTS > 0 )"),
    );
    expect(calls(out, "RE_Direct")).toBe(total - 2);
  });
});
