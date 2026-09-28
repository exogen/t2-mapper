import { describe, expect, it, vi } from "vitest";
import {
  DemoImportQueue,
  DemoImportQueueFull,
  MAX_QUEUED_DEMO_IMPORTS,
} from "./demoImportQueue";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("source transfer queue", () => {
  it("runs one transfer at a time in FIFO order and recovers after failure", async () => {
    const queue = new DemoImportQueue();
    const gate = deferred();
    const order: number[] = [];
    const first = queue.run(async () => {
      order.push(1);
      await gate.promise;
      throw new Error("source failed");
    });
    const failed = expect(first).rejects.toThrow("source failed");
    const second = queue.run(async () => {
      order.push(2);
    });
    const third = queue.run(async () => {
      order.push(3);
    });
    await Promise.resolve();
    expect(order).toEqual([1]);
    gate.resolve();
    await Promise.all([failed, second, third]);
    expect(order).toEqual([1, 2, 3]);
  });

  it("rejects overflow without running it and frees space when a waiter cancels", async () => {
    const queue = new DemoImportQueue();
    const gate = deferred();
    const active = queue.run(() => gate.promise);
    const abort = new AbortController();
    const skipped = vi.fn(async () => {});
    const canceled = queue.run(skipped, abort.signal);
    const rejected = expect(canceled).rejects.toMatchObject({
      name: "AbortError",
    });
    const waiting = Array.from({ length: MAX_QUEUED_DEMO_IMPORTS - 1 }, () =>
      queue.run(async () => {}),
    );
    const overflow = vi.fn(async () => {});
    await expect(queue.run(overflow)).rejects.toBeInstanceOf(
      DemoImportQueueFull,
    );
    abort.abort();
    await rejected;
    const replacement = queue.run(async () => "accepted");
    gate.resolve();
    await Promise.all([active, ...waiting]);
    expect(await replacement).toBe("accepted");
    expect(skipped).not.toHaveBeenCalled();
    expect(overflow).not.toHaveBeenCalled();
  });

  it("does not run already-canceled work or block the next transfer", async () => {
    const queue = new DemoImportQueue();
    const abort = new AbortController();
    abort.abort();
    const skipped = vi.fn(async () => {});
    await expect(queue.run(skipped, abort.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(await queue.run(async () => "next")).toBe("next");
    expect(skipped).not.toHaveBeenCalled();
  });
});
