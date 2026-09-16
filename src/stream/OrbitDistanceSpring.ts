import { DampedSpring } from "./DampedSpring";

/** Seconds: retract promptly, recover slowly to avoid bouncing around corners. */
export const ORBIT_DISTANCE_SMOOTH_TIME = {
  inward: 0.1,
  outward: 0.35,
} as const;
/** Extra probe reach lets the spring start retracting before an obstruction. */
export const ORBIT_OBSTACLE_CUSHION = 0.75;

export class OrbitDistanceSpring {
  private targetId: string | null = null;
  private seekNonce = 0;
  private readonly spring = new DampedSpring();

  get distance(): number {
    return this.spring.value;
  }

  reset(): void {
    this.targetId = null;
    this.spring.reset(0);
  }

  update(
    targetId: string,
    seekNonce: number,
    delta: number,
    goal: number,
  ): number {
    if (this.targetId !== targetId || this.seekNonce !== seekNonce) {
      this.spring.reset(goal);
    } else if (delta > 0) {
      this.spring.step(
        goal,
        goal < this.distance
          ? ORBIT_DISTANCE_SMOOTH_TIME.inward
          : ORBIT_DISTANCE_SMOOTH_TIME.outward,
        delta,
      );
    }
    this.targetId = targetId;
    this.seekNonce = seekNonce;
    // Collision constrains the destination; transient intersections are allowed
    // during easing. Only prevent residual momentum from crossing the pivot.
    this.spring.clamp(0, Infinity);
    return this.distance;
  }
}
