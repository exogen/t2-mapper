import type { DTSShape } from "../dts/dtsModel";

/**
 * How often a dormant shape still evaluates its animation, in seconds: one
 * tick. What reads its nodes while it's out of view (mounted weapon
 * lights, jet emitters, muzzles) sees a pose at most this old.
 */
const DORMANT_POSE_INTERVAL = 0.032;

let nextPhase = 0;

/**
 * Evaluate a shape's animation every frame while it's posed, and at
 * DORMANT_POSE_INTERVAL while it's dormant (out of view, along with
 * everything it affects; see DTSShape.dormant). Animation time skipped in
 * between accumulates into the next evaluation, which happens at the
 * latest when the shape is posed again or collision reads it.
 */
export function createDeferredPose(
  shape: DTSShape,
  evaluate: (animationDelta: number) => void,
): {
  update(frameDelta: number, animationDelta: number): void;
  dispose(): void;
} {
  let pending = 0;
  let stale = false;
  // Spread dormant shapes' evaluations across frames.
  let sinceEvaluate =
    (nextPhase = (nextPhase + 0.381966) % 1) * DORMANT_POSE_INTERVAL;
  const catchUp = () => {
    if (!stale) return;
    stale = false;
    sinceEvaluate = 0;
    const delta = pending;
    pending = 0;
    evaluate(delta);
  };
  shape.catchUpPose = catchUp;
  return {
    update(frameDelta, animationDelta) {
      pending += animationDelta;
      stale = true;
      if (
        shape.dormant &&
        (sinceEvaluate += frameDelta) < DORMANT_POSE_INTERVAL
      )
        return;
      catchUp();
    },
    dispose() {
      if (shape.catchUpPose === catchUp) shape.catchUpPose = undefined;
    },
  };
}
