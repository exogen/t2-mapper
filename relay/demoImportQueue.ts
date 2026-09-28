export const MAX_QUEUED_DEMO_IMPORTS = 16;
export const DEMO_TRANSFER_TIMEOUT_MS = 5 * 60_000;

export class DemoImportQueueFull extends Error {
  constructor() {
    super("Demo download queue is full. Please try again shortly.");
  }
}

/** One source transfer per relay, with a bounded FIFO queue behind it. */
export class DemoImportQueue {
  private active = false;
  private readonly waiting: (() => void)[] = [];

  async run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const release = await this.acquire(signal);
    try {
      signal?.throwIfAborted();
      return await task();
    } finally {
      release();
    }
  }

  private async acquire(signal?: AbortSignal): Promise<() => void> {
    signal?.throwIfAborted();
    if (this.active) {
      if (this.waiting.length >= MAX_QUEUED_DEMO_IMPORTS)
        throw new DemoImportQueueFull();
      await new Promise<void>((resolve, reject) => {
        const grant = () => {
          signal?.removeEventListener("abort", cancel);
          resolve();
        };
        const cancel = () => {
          this.waiting.splice(this.waiting.indexOf(grant), 1);
          reject(signal!.reason);
        };
        this.waiting.push(grant);
        signal?.addEventListener("abort", cancel, { once: true });
      });
    } else {
      this.active = true;
    }
    return () => {
      // Hand the occupied slot directly to the next waiter, so new requests
      // cannot overtake it between resolution and its continuation.
      const next = this.waiting.shift();
      if (next) next();
      else this.active = false;
    };
  }
}

// Cache imports and the no-R2 streaming fallback share the same budget.
export const demoImportQueue = new DemoImportQueue();
