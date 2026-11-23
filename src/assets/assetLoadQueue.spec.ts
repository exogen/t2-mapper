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
});
