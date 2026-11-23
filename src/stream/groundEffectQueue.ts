import type { MoveAnimationTimeline } from "./clientAnimation";
import { performanceTuning } from "../performanceTuning";
import type { Vec3 } from "../collision/terrainCollision";

/** Immutable inputs queued only until the renderer consumes their tick. */
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
  moveAnimation?: MoveAnimationTimeline;
  actionSlot?: import("./actionSlot").ActionSlot;
}
export interface GroundEffectFrame {
  timeSec: number;
  gravity: number;
  actors: readonly GroundActor[];
}

/** Pending simulation ticks consumed once by the active ground renderer. */
export class GroundEffectQueue {
  private readonly frames: (GroundEffectFrame | undefined)[];
  private start = 0;
  private count = 0;
  private actors = 0;
  private dropped = 0;
  private owner?: symbol;
  private enabled = false;
  private readonly capacity: number;
  private readonly onCaptureEnabled?: () => void;
  generation = 0;

  constructor(
    capacity: number = performanceTuning.groundEffects.maximumPendingFrames,
    onCaptureEnabled?: () => void,
  ) {
    if (!Number.isSafeInteger(capacity) || capacity < 1)
      throw new Error("Invalid ground-effect queue capacity");
    this.capacity = capacity;
    this.onCaptureEnabled = onCaptureEnabled;
    this.frames = new Array(capacity);
  }

  get capturing(): boolean {
    return this.owner !== undefined && this.enabled;
  }

  /** A replaced view cannot disable or clear its successor's input queue. */
  connect() {
    const owner = Symbol();
    this.owner = owner;
    this.enabled = true;
    this.clear();
    return {
      isCurrent: () => this.owner === owner,
      setCapturing: (enabled: boolean) => {
        if (this.owner !== owner || this.enabled === enabled) return;
        this.enabled = enabled;
        this.clear();
        // Seeking may already have simulated the next interpolation tick.
        // Let the producer queue that endpoint when capture resumes.
        if (enabled) this.onCaptureEnabled?.();
      },
      dispose: () => {
        if (this.owner !== owner) return;
        this.owner = undefined;
        this.enabled = false;
        this.clear();
      },
    };
  }

  get oldestTimeSec(): number {
    return this.frames[this.start]?.timeSec ?? Infinity;
  }

  append(frame: GroundEffectFrame): void {
    if (this.count === this.capacity) {
      this.shift();
      this.dropped++;
      // Consumers reset their emission origins after a gap, avoiding a wake
      // interpolated across ticks that were never rendered.
      this.generation++;
    }
    this.frames[(this.start + this.count) % this.capacity] = frame;
    this.count++;
    this.actors += frame.actors.length;
  }

  private shift(): GroundEffectFrame {
    const frame = this.frames[this.start]!;
    this.frames[this.start] = undefined;
    this.start = (this.start + 1) % this.capacity;
    this.count--;
    this.actors -= frame.actors.length;
    return frame;
  }

  /** Consume each elapsed tick exactly once, retaining interpolation lookahead. */
  consumeThrough(
    after: number,
    through: number,
    fn: (frame: GroundEffectFrame) => void,
  ): void {
    const generation = this.generation;
    while (
      this.count &&
      this.generation === generation &&
      this.oldestTimeSec <= through
    ) {
      const frame = this.shift();
      if (frame.timeSec > after) fn(frame);
    }
  }

  discardThrough(timeSec: number): void {
    while (this.count && this.oldestTimeSec <= timeSec) this.shift();
  }

  clear(): void {
    this.frames.fill(undefined);
    this.start = this.count = this.actors = 0;
    this.generation++;
  }

  getMetrics(): Record<string, number> {
    return {
      groundEffectPendingFrames: this.count,
      groundEffectPendingActors: this.actors,
      groundEffectQueueLimit: this.capacity,
      groundEffectDroppedFrames: this.dropped,
    };
  }
}
