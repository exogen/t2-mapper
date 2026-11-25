/** Bounds the whole fetch/decode lifetime, including synchronous failures.
 * Queued jobs retain request metadata, not fetched blobs waiting to decode. */
export class AssetLoadQueue {
  readonly concurrency: number;
  active = 0;
  peakActive = 0;
  peakQueued = 0;
  completed = 0;
  failed = 0;
  private readonly waiting = new Set<() => void>();
  private pumping = false;

  constructor(concurrency: number) {
    this.concurrency = Number.isFinite(concurrency)
      ? Math.max(1, Math.floor(concurrency))
      : 2;
  }

  get queued(): number {
    return this.waiting.size;
  }

  /** Aborting removes waiting work immediately. A running job owns its cleanup. */
  run<T>(start: () => T | PromiseLike<T>, signal?: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
      signal?.throwIfAborted();
      const cancel = () => {
        this.waiting.delete(run);
        reject(signal!.reason);
      };
      const run = () => {
        signal?.removeEventListener("abort", cancel);
        this.active++;
        this.peakActive = Math.max(this.peakActive, this.active);
        const finish = (success: boolean) => {
          this.active--;
          if (success) this.completed++;
          else this.failed++;
          this.pump();
        };
        try {
          Promise.resolve(start()).then(
            (value) => {
              finish(true);
              resolve(value);
            },
            (error: unknown) => {
              finish(false);
              reject(error);
            },
          );
        } catch (error) {
          finish(false);
          reject(error);
        }
      };
      this.waiting.add(run);
      signal?.addEventListener("abort", cancel, { once: true });
      this.pump();
      this.peakQueued = Math.max(this.peakQueued, this.queued);
    });
  }

  private pump(): void {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (const run of this.waiting) {
        if (this.active >= this.concurrency) break;
        this.waiting.delete(run);
        run();
      }
    } finally {
      this.pumping = false;
    }
  }
}
