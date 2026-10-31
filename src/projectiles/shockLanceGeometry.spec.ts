import { describe, expect, it } from "vitest";
import { BufferAttribute, Vector3 } from "three";
import {
  SHOCK_LANCE_MAX_POINTS,
  generateLightningPoints,
  writeLightningRibbon,
  writeShockStrip,
  zapFrameIndex,
  zapProjectionAxis,
} from "./shockLanceGeometry";

describe("generateLightningPoints", () => {
  it("spaces round(density x length) points along +X with pinned ends", () => {
    const out = new Float32Array(SHOCK_LANCE_MAX_POINTS * 3);
    // 3 points/m over 4 m = 12 points, 1/3 m apart.
    const count = generateLightningPoints(4, 3, 0.25, out, () => 0.9);
    expect(count).toBe(12);
    expect([out[0], out[1], out[2]]).toEqual([0, 0, 0]);
    expect(out[33]).toBeCloseTo(11 / 3);
    expect(out[34]).toBe(0);
    expect(out[35]).toBe(0);
    // Interior points carry a unit-vector jitter scaled by amp.
    const jitter = Math.hypot(out[3] - 1 / 3, out[4], out[5]);
    expect(jitter).toBeCloseTo(0.25);
  });

  it("caps the points at 50 without shrinking the spacing", () => {
    const out = new Float32Array(SHOCK_LANCE_MAX_POINTS * 3);
    // A missed bolt's 20 points/m over a 14 m ghost bolt asks for 280.
    const count = generateLightningPoints(14, 20, 0.1, out, () => 0.5);
    expect(count).toBe(SHOCK_LANCE_MAX_POINTS);
    expect(out[3]).toBeCloseTo(14 / 280);
  });

  it("writes nothing for a degenerate bolt", () => {
    const out = new Float32Array(SHOCK_LANCE_MAX_POINTS * 3);
    expect(generateLightningPoints(0, 3, 0.25, out)).toBe(0);
  });
});

describe("writeLightningRibbon", () => {
  it("sides each point with (p - cam) x segment and alternates U", () => {
    const points = new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0]);
    const pos = new BufferAttribute(new Float32Array(18), 3);
    const uv = new BufferAttribute(new Float32Array(12), 2);
    // Camera below the bolt: (p - cam) = +Y, segment +X, side = -Z.
    writeLightningRibbon(pos, uv, points, 3, 0.5, new Vector3(0, -10, 0));
    const p = pos.array as Float32Array;
    // First point: -side vertex then +side vertex.
    expect([p[0], p[1], p[2]]).toEqual([0, 0, 0.5]);
    expect([p[3], p[4], p[5]]).toEqual([0, 0, -0.5]);
    // The last point reuses the previous segment's direction.
    expect([p[12], p[13], p[14]]).toEqual([2, 0, 0.5]);
    const t = uv.array as Float32Array;
    expect(Array.from(t)).toEqual([0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0]);
  });
});

describe("writeShockStrip", () => {
  it("fades from alpha 0 at the muzzle to endAlpha at the target", () => {
    const pos = new BufferAttribute(new Float32Array(12), 3);
    const uv = new BufferAttribute(new Float32Array(8), 2);
    const color = new BufferAttribute(new Float32Array(16), 4);
    writeShockStrip(
      pos,
      uv,
      color,
      new Vector3(0, 0, 0),
      new Vector3(0, 0, -10),
      new Vector3(0.2, 0, 0),
      1.5,
      0,
      0.4,
    );
    const p = pos.array as Float32Array;
    expect(p[0]).toBeCloseTo(0.2);
    expect(p[3]).toBeCloseTo(-0.2);
    expect(p[6]).toBeCloseTo(-0.2);
    expect(p[9]).toBeCloseTo(0.2);
    expect(Array.from(uv.array as Float32Array)).toEqual([
      1.5, 0, 1.5, 1, 0, 1, 0, 0,
    ]);
    const c = color.array as Float32Array;
    expect(c[3]).toBe(0);
    expect(c[7]).toBe(0);
    expect(c[11]).toBeCloseTo(0.4);
    expect(c[15]).toBeCloseTo(0.4);
  });
});

describe("zapFrameIndex", () => {
  it("cycles texture[0..3] ten times a second", () => {
    expect(zapFrameIndex(0)).toBe(0);
    expect(zapFrameIndex(0.05)).toBe(1);
    expect(zapFrameIndex(0.07)).toBe(2);
    // The engine rounds 2.9999 x phase, so late in a cycle it reaches
    // the fourth texture.
    expect(zapFrameIndex(0.099)).toBe(3);
    expect(zapFrameIndex(0.35)).toBe(1);
  });
});

describe("zapProjectionAxis", () => {
  it("runs S along X for tall shapes and along Y for long ones", () => {
    expect(zapProjectionAxis({ x: 1, y: 1, z: 2.3 })).toBe("x");
    expect(zapProjectionAxis({ x: 2, y: 6, z: 2.5 })).toBe("y");
    expect(zapProjectionAxis({ x: 4, y: 2, z: 1 })).toBe("x");
    expect(zapProjectionAxis({ x: 2, y: 2, z: 2 })).toBe("x");
  });
});
