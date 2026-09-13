import { Vector3 } from "three";

/** RepairProjectile::advanceTime (Tribes2.exe 0x6457d0). Endpoints are world
 * positions, retained when aiming misses, with a first-hit snap and 2*dt chase. */
export class RepairBeamEndpoint {
  readonly current = new Vector3();
  readonly desired = new Vector3();
  private initialHit = true;
  private targetId: string | undefined;
  private lastTime: number | undefined;

  reset(): void {
    this.initialHit = true;
    this.targetId = undefined;
    this.lastTime = undefined;
  }

  update(
    targetId: string,
    time: number,
    cast: (out: Vector3) => boolean,
  ): boolean {
    if (
      targetId !== this.targetId ||
      (this.lastTime != null && time < this.lastTime)
    ) {
      this.reset();
      this.targetId = targetId;
    }
    // The stream clock includes playback timeScale; pause means no raycast or
    // easing. Retry an initial miss as asynchronously loaded targets arrive.
    if (time !== this.lastTime || this.initialHit) {
      if (cast(this.desired) && this.initialHit) {
        this.current.copy(this.desired);
        this.initialHit = false;
      }
      const dt = this.lastTime == null ? 0 : time - this.lastTime;
      if (!this.initialHit) this.current.lerp(this.desired, 2 * dt);
      this.lastTime = time;
    }
    return !this.initialHit;
  }
}

const direction = new Vector3();

/** renderObject uses 90 - dot*90, deliberately not degrees(acos(dot)). */
export function repairBeamWithinCutoff(
  start: Vector3,
  end: Vector3,
  aim: Vector3,
  cutoffAngle: number,
): boolean {
  direction.subVectors(end, start);
  return (
    direction.lengthSq() > 0 &&
    90 - direction.normalize().dot(aim) * 90 <= cutoffAngle
  );
}
