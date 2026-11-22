import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { frameScore, paddedFrameWeight, type FrameContext } from "./frameScore";

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
    expect(result.parts.anchor).toBeGreaterThan(0.5);
    const off = frameScore(
      ctx({ stands: [new Vector3(-1200, 30, 40)], fogDistance: 150 }),
    );
    expect(off.parts.anchor).toBe(0);
  });

  it("prefers landmarks inside the frame margin to those near its edge", () => {
    const eye = new Vector3();
    const aim = new Vector3(1, 0, 0);
    expect(paddedFrameWeight(eye, aim, new Vector3(10, 0, 7))).toBe(1);
    expect(paddedFrameWeight(eye, aim, new Vector3(10, 0, 9))).toBeCloseTo(0.4);
    expect(paddedFrameWeight(eye, aim, new Vector3(10, 6, 0))).toBe(0);
    const landmarks = [
      { pos: new Vector3(50, 0, 0), weight: 0.55 },
      { pos: new Vector3(80, 0, 10), weight: 0.3 },
      { pos: new Vector3(200, 0, 0), weight: 0.55 },
    ];
    const result = frameScore(
      ctx({
        eye,
        aim,
        landmarks,
        landmarkVisible: (_, landmark) => landmark !== landmarks[0],
        fogDistance: 100,
      }),
    );
    expect(result.parts.anchor).toBe(0.3);
  });

  it("credits a visible landmark behind stronger contenders within four sightline checks", () => {
    const landmarks = [0.3, 0.2, 0.1, 0.55, 0.5].map((weight) => ({
      pos: new Vector3(50, 0, 0),
      weight,
    }));
    const checked: number[] = [];
    const result = frameScore(
      ctx({
        eye: new Vector3(),
        aim: new Vector3(1, 0, 0),
        landmarks,
        landmarkVisible: (_, landmark) => {
          checked.push(landmark.weight);
          return landmark === landmarks[0] || landmark === landmarks[2];
        },
      }),
    );
    expect(result.parts.anchor).toBe(0.3);
    expect(checked).toEqual([0.55, 0.5, 0.3, 0.2]);
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
