import { STREAM_TICK_SEC } from "../stream/streamHelpers";

export type TickCallback = (tick: number) => void;

/**
 * The 32 ms tick clock (ProcessList's tick; the physics TickSec constant
 * is separate). Frame time accumulates, and every whole tick it covers
 * fires the subscribers in order.
 */
export class TickClock {
  private accumulator = 0;
  private tick = 0;
  private readonly callbacks = new Set<TickCallback>();

  advance(delta: number): void {
    this.accumulator += delta;
    while (this.accumulator >= STREAM_TICK_SEC) {
      this.accumulator -= STREAM_TICK_SEC;
      this.tick++;
      for (const callback of this.callbacks) callback(this.tick);
    }
  }

  subscribe(callback: TickCallback): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /** Ticks fired so far. */
  get current(): number {
    return this.tick;
  }

  /** Fraction [0, 1) of the current tick elapsed since the last one fired. */
  get fraction(): number {
    return this.accumulator / STREAM_TICK_SEC;
  }
}
