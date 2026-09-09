import { LinearInterpolant, NumberKeyframeTrack, type TypedArray } from "three";

/** TSShapeInstance::animateVisibility switches binary visibility at the
 * midpoint, but interpolates authored fades between intermediate values. */
export function interpolateDTSVisibility(
  a: number,
  b: number,
  t: number,
): number {
  return (a - b) ** 2 > 0.99 ? (t < 0.5 ? a : b) : a + (b - a) * t;
}

class DTSVisibilityInterpolant extends LinearInterpolant {
  override interpolate_(
    i1: number,
    t0: number,
    t: number,
    t1: number,
  ): TypedArray {
    this.resultBuffer[0] = interpolateDTSVisibility(
      this.sampleValues[i1 - 1],
      this.sampleValues[i1],
      (t - t0) / (t1 - t0),
    );
    return this.resultBuffer;
  }
}

export class DTSVisibilityTrack extends NumberKeyframeTrack {
  override InterpolantFactoryMethodLinear(
    result?: TypedArray,
  ): LinearInterpolant {
    return new DTSVisibilityInterpolant(this.times, this.values, 1, result);
  }
}
