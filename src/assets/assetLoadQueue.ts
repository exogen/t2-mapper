const priorityOrder = { speculative: 0, demand: 1, critical: 2 } as const;
export type AssetLoadPriority = keyof typeof priorityOrder;

interface WaitingLoad {
  run(): void;
  priority: AssetLoadPriority;
}

interface AssetLoadOptions {
  priority?: AssetLoadPriority;
  /** Identifies a shared request whose priority can increase while queued. */
  key?: object;
}

/** Bounds the whole fetch/decode lifetime, including synchronous failures.
 * Queued jobs retain request metadata, not fetched blobs waiting to decode. */
export class AssetLoadQueue {
  readonly concurrency: number;
  active = 0;
  peakActive = 0;
  peakQueued = 0;
  completed = 0;
  failed = 0;
  private readonly waiting: Record<AssetLoadPriority, Set<WaitingLoad>> = {
    critical: new Set(),
    demand: new Set(),
    speculative: new Set(),
  };
  private readonly waitingByKey = new Map<object, WaitingLoad>();
  private pumping = false;

  constructor(concurrency: number) {
    this.concurrency = Number.isFinite(concurrency)
      ? Math.max(1, Math.floor(concurrency))
      : 2;
  }

  get queued(): number {
    return this.queuedCritical + this.queuedDemand + this.queuedSpeculative;
  }

  get queuedCritical(): number {
    return this.waiting.critical.size;
  }

  get queuedDemand(): number {
    return this.waiting.demand.size;
  }

  get queuedSpeculative(): number {
    return this.waiting.speculative.size;
  }

  /** Reorder shared unfinished work without restarting a fetch or decode. */
  promote(key: object, priority: AssetLoadPriority = "demand"): void {
    const load = this.waitingByKey.get(key);
    if (!load || priorityOrder[load.priority] >= priorityOrder[priority])
      return;
    this.waiting[load.priority].delete(load);
    load.priority = priority;
    this.waiting[priority].add(load);
    this.pump();
  }

  /** Aborting removes waiting work immediately. A running job owns its cleanup. */
  run<T>(
    start: () => T | PromiseLike<T>,
    signal?: AbortSignal,
    { priority = "demand", key }: AssetLoadOptions = {},
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      signal?.throwIfAborted();
      const remove = () => {
        this.waiting[load.priority].delete(load);
        if (key && this.waitingByKey.get(key) === load)
          this.waitingByKey.delete(key);
      };
      const cancel = () => {
        remove();
        reject(signal!.reason);
      };
      const run = () => {
        remove();
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
      const load: WaitingLoad = { run, priority };
      this.waiting[priority].add(load);
      if (key) this.waitingByKey.set(key, load);
      signal?.addEventListener("abort", cancel, { once: true });
      this.pump();
      this.peakQueued = Math.max(this.peakQueued, this.queued);
    });
  }

  private pump(): void {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.active < this.concurrency) {
        const load =
          this.waiting.critical.values().next().value ??
          this.waiting.demand.values().next().value ??
          this.waiting.speculative.values().next().value;
        if (!load) break;
        load.run();
      }
    } finally {
      this.pumping = false;
    }
  }
}
