import type { ClientAnimationState } from "./clientAnimation";
import type { Vec3 } from "../collision/terrainCollision";

/** Compact immutable inputs, retained only for the lifetime of ground effects.
 * No meshes, particles, or collision queries are created during a seek scan. */
export interface GroundActor {
  key: string;
  ghostIndex: number;
  spawnTick: number;
  type: string;
  className: string;
  dataBlockId: number;
  position: Vec3;
  rotation: [number, number, number, number];
  velocity: Vec3;
  mounted: boolean;
  jetting?: boolean;
  frozen?: boolean;
  scale?: Vec3;
  threads?: import("./types").ThreadState[];
  clientAnimation?: ClientAnimationState;
  actionAnim?: number;
  actionAnimPos?: number;
  actionTimeSec?: number;
  actionAtEnd?: boolean;
  actionHoldAtEnd?: boolean;
  damageState?: number;
}
export interface GroundEffectFrame {
  timeSec: number;
  gravity: number;
  actors: readonly GroundActor[];
}

export class GroundEffectHistory {
  private frames: GroundEffectFrame[] = [];
  private start = 0;
  /** Stock tire dust lives at most seven seconds; allow one second of lead-in. */
  retentionSec = 8;
  generation = 0;

  get oldestTimeSec(): number {
    return this.frames[this.start]?.timeSec ?? Infinity;
  }

  append(frame: GroundEffectFrame): void {
    this.frames.push(frame);
    const cutoff = frame.timeSec - this.retentionSec;
    while (
      this.start < this.frames.length &&
      this.frames[this.start].timeSec < cutoff
    )
      this.start++;
    if (this.start > 256) {
      this.frames = this.frames.slice(this.start);
      this.start = 0;
    }
  }
  visit(
    after: number,
    through: number,
    fn: (frame: GroundEffectFrame) => void,
  ): void {
    // Binary search keeps steady playback independent of retained history size.
    let lo = this.start,
      hi = this.frames.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.frames[mid].timeSec <= after) lo = mid + 1;
      else hi = mid;
    }
    for (
      let i = lo;
      i < this.frames.length && this.frames[i].timeSec <= through;
      i++
    )
      fn(this.frames[i]);
  }
  save(): { frames: readonly GroundEffectFrame[]; retentionSec: number } {
    return {
      frames: this.frames.slice(this.start),
      retentionSec: this.retentionSec,
    };
  }
  restore(saved: ReturnType<GroundEffectHistory["save"]>): void {
    this.frames = [...saved.frames];
    this.start = 0;
    this.retentionSec = saved.retentionSec;
    this.generation++;
  }
  clear(): void {
    this.frames = [];
    this.start = 0;
    this.retentionSec = 8;
    this.generation++;
  }
}
