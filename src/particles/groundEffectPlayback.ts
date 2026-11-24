import {
  GroundEffectQueue,
  type GroundEffectFrame,
} from "../stream/groundEffectQueue";

/** The ground simulator owns live particles; this bridge owns pending inputs. */
export interface GroundEffectConsumer {
  readonly timeSec: number;
  /** A landing timestamp seeds the next forward interval without old inputs. */
  clear(timeSec?: number): void;
  step(frame: GroundEffectFrame): void;
}

/** Consume forward ticks once, without warming effects from a seek/archive.
 * Capture is enabled only while this owner has terrain and is not suspended. */
export class GroundEffectPlayback {
  private readonly queue: GroundEffectQueue;
  private readonly simulation: GroundEffectConsumer;
  private readonly onReset: () => void;
  private readonly connection: ReturnType<GroundEffectQueue["connect"]>;
  private suspended = false;
  private disposed = false;
  private resetPending = true;
  private generation = -1;
  private seekNonce: number | undefined;
  private terrain: object | null = null;
  private timeSec = -Infinity;

  constructor(
    queue: GroundEffectQueue,
    simulation: GroundEffectConsumer,
    onReset: () => void,
  ) {
    this.queue = queue;
    this.simulation = simulation;
    this.onReset = onReset;
    this.connection = queue.connect();
    this.connection.setCapturing(false);
  }

  /** Suspend for a hidden page, seek, or replaced stream. Release live effects
   * synchronously: a hidden page may never render another cleanup frame. */
  setCaptureSuspended(suspended: boolean): void {
    if (
      this.disposed ||
      !this.connection.isCurrent() ||
      this.suspended === suspended
    )
      return;
    this.suspended = suspended;
    this.resetPending = true;
    // Disabling active capture clears the queue as part of the transition.
    if (suspended && !this.queue.capturing) this.queue.clear();
    this.connection.setCapturing(!suspended && this.terrain !== null);
    if (suspended) {
      this.simulation.clear();
      this.onReset();
    }
  }

  /** Returns whether this update reset particles, origins and renderer state.
   * Future interpolation endpoints stay queued until their presentation time. */
  update(timeSec: number, seekNonce: number, terrain: object | null): boolean {
    if (this.disposed || !this.connection.isCurrent()) return false;
    this.connection.setCapturing(!this.suspended && terrain !== null);
    const reset =
      this.resetPending ||
      this.generation !== this.queue.generation ||
      this.seekNonce !== seekNonce ||
      this.terrain !== terrain ||
      timeSec < this.timeSec;
    this.resetPending = false;
    this.generation = this.queue.generation;
    this.seekNonce = seekNonce;
    this.terrain = terrain;
    this.timeSec = timeSec;
    if (reset) {
      // Drop reconstruction/gap inputs, but not the next interpolation tick.
      // Do this before callbacks, which can synchronously replace this owner.
      this.queue.discardThrough(timeSec);
      this.simulation.clear(timeSec);
      this.onReset();
    }
    if (
      !this.disposed &&
      this.connection.isCurrent() &&
      !this.suspended &&
      terrain !== null
    )
      this.queue.consumeThrough(this.simulation.timeSec, timeSec, (frame) =>
        this.simulation.step(frame),
      );
    return reset;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.connection.dispose();
  }
}
