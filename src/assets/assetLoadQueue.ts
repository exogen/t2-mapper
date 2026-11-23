/** Bounds the whole fetch/decode lifetime, including synchronous failures.
 * Queued jobs retain request metadata, not fetched blobs waiting to decode. */
export class AssetLoadQueue {
  readonly concurrency: number;
  active = 0;
  peakActive = 0;
  peakQueued = 0;
  completed = 0;
  failed = 0;
  private waiting: Array<() => void> = [];
  private pumping = false;

  constructor(concurrency: number) {
    this.concurrency = Number.isFinite(concurrency)
      ? Math.max(1, Math.floor(concurrency))
      : 2;
  }

  get queued(): number {
    return this.waiting.length;
  }

  run<T>(start: () => T | PromiseLike<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.waiting.push(() => {
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
      });
      this.pump();
      this.peakQueued = Math.max(this.peakQueued, this.queued);
    });
  }

  private pump(): void {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.active < this.concurrency && this.waiting.length)
        this.waiting.shift()!();
    } finally {
      this.pumping = false;
    }
  }
}
