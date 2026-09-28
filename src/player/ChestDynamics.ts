import { Vector3 } from "three";
import { ChestSpring } from "./ChestSpring";

/** Two inertial lobes with slightly different responses and a shared contact
 * limit. Translation drives both; compression also makes them spread/rebound. */
export class ChestDynamics {
  readonly offsets = [new Vector3(), new Vector3()] as const;
  private springs = [new ChestSpring(100, 6.5), new ChestSpring(120, 7.5)];
  private lateral = new Vector3();
  private inward = new Vector3();
  private up = new Vector3();
  private forward = new Vector3();
  private previousSize = NaN;
  private responses = [-1, 1].map((side) => (acceleration: Vector3) => {
    const compression =
      acceleration.dot(this.up) * 0.3 + acceleration.dot(this.forward) * 0.15;
    acceleration.addScaledVector(this.lateral, -side * compression);
  });

  update(
    time: number,
    anchors: readonly Vector3[],
    up: Vector3,
    forward: Vector3,
    size: number,
    movement: number,
    resetKey?: unknown,
  ) {
    this.up.copy(up).normalize();
    this.forward.copy(forward).normalize();
    this.lateral.copy(anchors[1]).sub(anchors[0]);
    const separation = this.lateral.length();
    this.lateral.normalize();
    const scale = size * movement;
    for (let side = 0; side < 2; side++) {
      // Resizing moves the rest anchors; it must not inject a movement impulse.
      if (movement === 0 || size !== this.previousSize)
        this.springs[side].reset(time, anchors[side], resetKey);
      this.offsets[side]
        .copy(
          this.springs[side].update(
            time,
            anchors[side],
            resetKey,
            this.responses[side],
          ),
        )
        .multiplyScalar(scale);
    }
    this.previousSize = size;
    if (scale === 0) return this.offsets;
    // Keep the centers ordered across the torso, allowing soft compression
    // before contact. Enforce this after size/firmness scaling as well.
    const gap =
      separation +
      this.offsets[1].dot(this.lateral) -
      this.offsets[0].dot(this.lateral);
    const penetration = separation * 0.55 - gap;
    if (penetration > 0) {
      this.inward.copy(this.lateral).negate();
      this.springs[0].contact(this.inward, penetration / (2 * scale));
      this.springs[1].contact(this.lateral, penetration / (2 * scale));
      for (let side = 0; side < 2; side++)
        this.offsets[side]
          .copy(this.springs[side].offset)
          .multiplyScalar(scale);
    }
    return this.offsets;
  }
}
