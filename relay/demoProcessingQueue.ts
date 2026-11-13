export type DemoProcessingPriority =
  "recording" | "upload" | "stats" | "profiles";

interface Job {
  start(): void;
  cancel?: () => void;
}

/**
 * One background job; relay recordings precede queued user work, then
 * private stats, then representative player profiles.
 */
export class DemoProcessingQueue {
  private active = false;
  private readonly waiting: Record<DemoProcessingPriority, Job[]> = {
    recording: [],
    upload: [],
    stats: [],
    profiles: [],
  };

  run<T>(
    priority: DemoProcessingPriority,
    task: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    return new Promise<T>((resolve, reject) => {
      const job: Job = {
        start: () => {
          signal?.removeEventListener("abort", job.cancel!);
          this.active = true;
          let result: Promise<T>;
          try {
            result = task();
          } catch (error) {
            this.release();
            reject(error);
            return;
          }
          result.then(
            (value) => {
              this.release();
              resolve(value);
            },
            (error) => {
              this.release();
              reject(error);
            },
          );
        },
      };
      job.cancel = () => {
        const queue = this.waiting[priority];
        const index = queue.indexOf(job);
        if (index < 0) return;
        queue.splice(index, 1);
        reject(signal!.reason);
      };
      if (this.active) {
        this.waiting[priority].push(job);
        signal?.addEventListener("abort", job.cancel, { once: true });
      } else {
        job.start();
      }
    });
  }

  private release(): void {
    const next =
      this.waiting.recording.shift() ??
      this.waiting.upload.shift() ??
      this.waiting.stats.shift() ??
      this.waiting.profiles.shift();
    if (next) next.start();
    else this.active = false;
  }
}
