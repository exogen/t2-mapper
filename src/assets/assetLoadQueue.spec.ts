import { describe, expect, it } from "vitest";
import { AssetLoadQueue } from "./assetLoadQueue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("asset load concurrency", () => {
  it("holds a slot through the whole task and starts queued tasks only after release", async () => {
    const queue = new AssetLoadQueue(2);
    const tasks = Array.from({ length: 5 }, () => deferred<number>());
    const started: number[] = [];
    const results = tasks.map((task, index) =>
      queue.run(() => {
        started.push(index);
        return task.promise;
      }),
    );
    expect(started).toEqual([0, 1]);
    expect(queue.active).toBe(2);
    expect(queue.queued).toBe(3);
    tasks[0].resolve(0);
    await results[0];
    expect(started).toEqual([0, 1, 2]);
    tasks[1].resolve(1);
    tasks[2].resolve(2);
    await Promise.all(results.slice(0, 3));
    expect(started).toEqual([0, 1, 2, 3, 4]);
    tasks[3].resolve(3);
    tasks[4].resolve(4);
    expect(await Promise.all(results)).toEqual([0, 1, 2, 3, 4]);
    expect(queue.active).toBe(0);
    expect(queue.queued).toBe(0);
    expect(queue.peakActive).toBe(2);
    expect(queue.peakQueued).toBe(3);
  });

  it("drains after both synchronous throws and asynchronous rejections", async () => {
    const queue = new AssetLoadQueue(1);
    const blocker = deferred<number>();
    const first = queue.run(() => blocker.promise);
    const sync = queue.run(() => {
      throw new Error("sync");
    });
    const rejectedSync = expect(sync).rejects.toThrow("sync");
    const async = queue.run(() => Promise.reject(new Error("async")));
    const rejectedAsync = expect(async).rejects.toThrow("async");
    const last = queue.run(() => 4);
    blocker.resolve(1);
    await first;
    await Promise.all([rejectedSync, rejectedAsync]);
    expect(await last).toBe(4);
    expect(queue.active).toBe(0);
    expect(queue.queued).toBe(0);
    expect(queue.completed).toBe(2);
    expect(queue.failed).toBe(2);
  });

  it("keeps the running job's slot when its queued siblings are canceled", async () => {
    const queue = new AssetLoadQueue(1);
    const controller = new AbortController();
    const blocker = deferred<number>();
    const active = queue.run(() => blocker.promise, controller.signal);
    const skipped = () => {
      throw new Error("canceled job ran");
    };
    const waiting = queue.run(skipped, controller.signal);
    const next = queue.run(() => 2);
    controller.abort();
    await expect(waiting).rejects.toBe(controller.signal.reason);
    await expect(queue.run(skipped, controller.signal)).rejects.toBe(
      controller.signal.reason,
    );
    expect(queue.active).toBe(1);
    expect(queue.queued).toBe(1);
    blocker.resolve(1);
    expect(await Promise.all([active, next])).toEqual([1, 2]);
    expect(queue.active).toBe(0);
  });

  it("starts waiting demand before speculative jobs while preserving demand order", async () => {
    const queue = new AssetLoadQueue(1);
    const blocker = deferred<void>();
    const running = queue.run(() => blocker.promise);
    const order: string[] = [];
    const start = (label: string) => () => order.push(label);
    const key = {};
    const speculative = queue.run(start("speculative"), undefined, {
      priority: "speculative",
    });
    const promoted = queue.run(start("promoted"), undefined, {
      priority: "speculative",
      key,
    });
    const firstDemand = queue.run(start("first demand"));
    expect(queue.queuedDemand).toBe(1);
    expect(queue.queuedSpeculative).toBe(2);
    queue.promote(key);
    const lastDemand = queue.run(start("last demand"));
    expect(queue.active).toBe(1);
    expect(queue.queued).toBe(4);
    expect(queue.queuedDemand).toBe(3);
    expect(queue.queuedSpeculative).toBe(1);

    blocker.resolve();
    await Promise.all([
      running,
      speculative,
      promoted,
      firstDemand,
      lastDemand,
    ]);
    expect(order).toEqual([
      "first demand",
      "promoted",
      "last demand",
      "speculative",
    ]);
    expect(queue.peakActive).toBe(1);
    expect(queue.queuedDemand).toBe(0);
    expect(queue.queuedSpeculative).toBe(0);
  });

  it("starts critical work ahead of demand in FIFO order and never lowers priority", async () => {
    const queue = new AssetLoadQueue(1);
    const blocker = deferred<void>();
    const running = queue.run(() => blocker.promise);
    const order: string[] = [];
    const start = (label: string) => () => order.push(label);
    const key = {};
    const demand = queue.run(start("demand"));
    const promoted = queue.run(start("promoted"), undefined, { key });
    const firstCritical = queue.run(start("first critical"), undefined, {
      priority: "critical",
    });
    queue.promote(key, "critical");
    queue.promote(key, "demand");
    expect(queue.queuedCritical).toBe(2);
    expect(queue.queuedDemand).toBe(1);

    blocker.resolve();
    await Promise.all([running, demand, promoted, firstCritical]);
    expect(order).toEqual(["first critical", "promoted", "demand"]);
    expect(queue.queued).toBe(0);
  });
});
