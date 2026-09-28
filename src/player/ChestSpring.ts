import { Vector3 } from "three";

/** World-space inertial offset, driven by an animated chest anchor. */
export class ChestSpring {
  readonly offset = new Vector3();
  private velocity = new Vector3();
  private anchor = new Vector3();
  private anchorVelocity = new Vector3();
  private nextVelocity = new Vector3();
  private acceleration = new Vector3();
  private previousTime = NaN;
  private resetKey: unknown;
  private hasVelocity = false;

  private stiffness: number;
  private damping: number;

  constructor(stiffness = 110, damping = 7) {
    this.stiffness = stiffness;
    this.damping = damping;
  }

  /** Resolve contact without retaining velocity directed into the other side. */
  contact(outward: Vector3, distance: number) {
    this.offset.addScaledVector(outward, distance);
    const inward = this.velocity.dot(outward);
    if (inward < 0) this.velocity.addScaledVector(outward, -inward * 1.15);
  }

  reset(time: number, anchor: Vector3, resetKey?: unknown) {
    this.offset.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.anchor.copy(anchor);
    this.anchorVelocity.set(0, 0, 0);
    this.previousTime = time;
    this.resetKey = resetKey;
    this.hasVelocity = false;
  }

  update(
    time: number,
    anchor: Vector3,
    resetKey?: unknown,
    response?: (acceleration: Vector3) => void,
  ): Vector3 {
    const dt = time - this.previousTime;
    if (
      !Number.isFinite(anchor.lengthSq()) ||
      !Number.isFinite(dt) ||
      dt < 0 ||
      dt > 0.25 ||
      resetKey !== this.resetKey ||
      anchor.distanceTo(this.anchor) > Math.max(3, dt * 150)
    ) {
      this.reset(time, anchor, resetKey);
      return this.offset;
    }
    if (dt < 1e-6) return this.offset; // Paused/sub-microsecond samples add no useful motion.
    this.nextVelocity.copy(anchor).sub(this.anchor).divideScalar(dt);
    this.acceleration
      .copy(this.nextVelocity)
      .sub(this.anchorVelocity)
      .divideScalar(dt)
      .clampLength(0, 120);
    if (!this.hasVelocity) this.acceleration.set(0, 0, 0);
    response?.(this.acceleration);
    if (!Number.isFinite(this.acceleration.lengthSq())) {
      this.reset(time, anchor, resetKey);
      return this.offset;
    }
    this.hasVelocity = true;
    this.anchorVelocity.copy(this.nextVelocity);
    this.anchor.copy(anchor);
    this.previousTime = time;
    // Small integration steps keep damping and stiffness stable at low FPS.
    const steps = Math.ceil(dt * 120);
    const h = dt / steps;
    const damping = Math.exp(-this.damping * h);
    for (let i = 0; i < steps; i++) {
      this.velocity
        .addScaledVector(this.acceleration, -0.6 * h)
        .addScaledVector(this.offset, -this.stiffness * h)
        .multiplyScalar(damping);
      this.offset.addScaledVector(this.velocity, h);
      if (this.offset.lengthSq() > 0.16 ** 2) {
        this.offset.clampLength(0, 0.16);
        const outward = this.velocity.dot(this.offset) / this.offset.lengthSq();
        if (outward > 0) this.velocity.addScaledVector(this.offset, -outward);
      }
    }
    return this.offset;
  }
}
