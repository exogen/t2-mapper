import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { frameScore, type FrameContext } from "./frameScore";

function ctx(overrides: Partial<FrameContext>): FrameContext {
  return {
    eye: new Vector3(0, 20, 0),
    aim: new Vector3(50, 5, 0),
    entities: [],
    stands: [],
    ...overrides,
  };
}

describe("frameScore", () => {
  it("prefers a level-to-down wide frame over one aimed at the sky", () => {
    const down = frameScore(
      ctx({ eye: new Vector3(0, 40, 0), aim: new Vector3(60, 0, 0) }),
    );
    const up = frameScore(
      ctx({ eye: new Vector3(0, 0, 0), aim: new Vector3(60, 55, 0) }),
    );
    expect(down.parts.skyBalance).toBeGreaterThan(up.parts.skyBalance);
  });

  it("forgives sky in a TIGHT low-angle frame more than a wide one", () => {
    const tight = frameScore(
      ctx({ eye: new Vector3(0, 0, 0), aim: new Vector3(12, 8, 0) }),
    );
    const wide = frameScore(
      ctx({ eye: new Vector3(0, 0, 0), aim: new Vector3(90, 60, 0) }),
    );
    expect(tight.parts.skyBalance).toBeGreaterThan(wide.parts.skyBalance);
  });

  it("counts salient entities inside the frustum and fog only", () => {
    const inFrame = new Vector3(45, 5, 5);
    const behind = new Vector3(-40, 5, 0);
    const beyondFog = new Vector3(400, 5, 0);
    const result = frameScore(
      ctx({
        entities: [
          { pos: inFrame, weight: 3 },
          { pos: behind, weight: 3 },
          { pos: beyondFog, weight: 3 },
        ],
        fogDistance: 200,
      }),
    );
    expect(result.parts.saliency).toBeCloseTo(3 / 6, 5);
  });

  it("credits a stand anchor at any distance, even past the fog", () => {
    const result = frameScore(
      ctx({ stands: [new Vector3(1200, 30, 40)], fogDistance: 150 }),
    );
    expect(result.parts.anchor).toBe(1);
    const off = frameScore(
      ctx({ stands: [new Vector3(-1200, 30, 40)], fogDistance: 150 }),
    );
    expect(off.parts.anchor).toBe(0);
  });

  it("peaks sizeFit at the intended subject size", () => {
    const at = (dist: number) =>
      frameScore(
        ctx({
          aim: new Vector3(dist, 20, 0),
          subjectPos: new Vector3(dist, 20, 0),
          targetSubjectFraction: 0.06,
        }),
      ).parts.sizeFit;
    // 2.4m at ~32m ≈ 6% of frame height with the modeled FOV.
    expect(at(32)).toBeGreaterThan(at(8));
    expect(at(32)).toBeGreaterThan(at(150));
  });

  it("prefers motion across the frame over motion along the lens", () => {
    const crossing = frameScore(ctx({ subjectVel: { x: 0, z: 40 } }));
    const radial = frameScore(ctx({ subjectVel: { x: 40, z: 0 } }));
    expect(crossing.parts.tangential).toBeGreaterThan(0.9);
    expect(radial.parts.tangential).toBeLessThan(0.35);
  });
});
