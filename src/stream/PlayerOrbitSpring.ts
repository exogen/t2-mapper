import type { PlayerViewAngles } from "./playerView";
import { DampedSpring } from "./DampedSpring";

/** SmoothDamp-style response times in seconds; larger values feel softer. */
export const PLAYER_ORBIT_SMOOTH_TIME = { yaw: 0.18, pitch: 0.22 } as const;

/** Angular lag around the player's current position; never changes orbit radius. */
export class PlayerOrbitSpring implements PlayerViewAngles {
  targetId: string | null = null;
  private seekNonce = 0;
  private time = 0;
  private readonly yawSpring = new DampedSpring();
  private readonly pitchSpring = new DampedSpring();

  get yaw(): number {
    return this.yawSpring.value;
  }

  get pitch(): number {
    return this.pitchSpring.value;
  }

  reset(): void {
    this.targetId = null;
  }

  update(
    targetId: string,
    seekNonce: number,
    time: number,
    view: PlayerViewAngles,
  ): void {
    const dt = time - this.time;
    if (this.targetId !== targetId || this.seekNonce !== seekNonce || dt < 0) {
      this.yawSpring.reset(view.yaw);
      this.pitchSpring.reset(view.pitch);
    } else if (dt > 0) {
      this.yawSpring.step(view.yaw, PLAYER_ORBIT_SMOOTH_TIME.yaw, dt, true);
      this.pitchSpring.step(
        view.pitch,
        PLAYER_ORBIT_SMOOTH_TIME.pitch,
        dt,
        false,
      );
    }
    this.targetId = targetId;
    this.seekNonce = seekNonce;
    this.time = time;
  }
}
