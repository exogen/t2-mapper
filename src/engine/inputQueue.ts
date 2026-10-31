export interface InputFrame {
  /** Look rotation deltas (radians). */
  deltaYaw: number;
  deltaPitch: number;
  /** Movement axes [-1, 1], pre-scaled by speedMultiplier. */
  x: number;
  y: number;
  z: number;
  /** Trigger states. OR'd by consumer between ticks. */
  triggers: boolean[];
  /** Frame delta time (seconds). */
  delta: number;
}

/**
 * Input frames reported by the producers (keyboard and mouse, touch)
 * since the consumer last drained them.
 */
export class InputQueue {
  readonly frames: InputFrame[] = [];

  push(frame: InputFrame): void {
    this.frames.push(frame);
  }

  clear(): void {
    this.frames.length = 0;
  }
}
