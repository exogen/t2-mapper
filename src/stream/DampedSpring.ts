/** Exact critically damped scalar spring, with optional angular wrapping. */
export class DampedSpring {
  value = 0;
  private velocity = 0;

  reset(value: number): void {
    this.value = value;
    this.velocity = 0;
  }

  step(target: number, smoothTime: number, dt: number, wrap = false): void {
    let difference = target - this.value;
    if (wrap) {
      difference %= 2 * Math.PI;
      if (difference > Math.PI) difference -= 2 * Math.PI;
      if (difference < -Math.PI) difference += 2 * Math.PI;
    }
    const goal = this.value + difference;
    const omega = 2 / smoothTime;
    const decay = Math.exp(-omega * dt);
    const impulse = (this.velocity - omega * difference) * dt;
    const value = goal + (impulse - difference) * decay;
    this.velocity = (this.velocity - omega * impulse) * decay;
    // Stop at the goal if residual velocity would carry us past it.
    if (difference === 0 || (value - goal) * difference > 0) {
      this.reset(goal);
    } else {
      this.value = value;
    }
  }

  clamp(minimum: number, maximum: number): void {
    this.value = Math.max(minimum, Math.min(maximum, this.value));
    // Preserve momentum only when it points back into the allowed range.
    if (
      (this.value === minimum && this.velocity < 0) ||
      (this.value === maximum && this.velocity > 0)
    )
      this.velocity = 0;
  }
}
