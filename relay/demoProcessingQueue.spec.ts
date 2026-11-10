import { describe, expect, it } from "vitest";
import { DemoProcessingQueue } from "./demoProcessingQueue";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("background demo processing", () => {
  it("runs one process at a time and puts queued recordings before user uploads", async () => {
    const queue = new DemoProcessingQueue();
    const first = deferred();
    const started: string[] = [];
    const a = queue.run("upload", () => {
      started.push("active");
      return first.promise;
    });
    const b = queue.run("upload", async () => {
      started.push("upload");
    });
    const c = queue.run("recording", async () => {
      started.push("recording");
    });
    expect(started).toEqual(["active"]);
    first.resolve();
    await Promise.all([a, b, c]);
    expect(started).toEqual(["active", "recording", "upload"]);
  });

  it("removes canceled queued work without starting it", async () => {
    const queue = new DemoProcessingQueue();
    const first = deferred();
    const a = queue.run("recording", () => first.promise);
    const abort = new AbortController();
    let started = false;
    const b = queue.run(
      "upload",
      async () => {
        started = true;
      },
      abort.signal,
    );
    const canceled = expect(b).rejects.toThrow("canceled");
    abort.abort(new Error("canceled"));
    await canceled;
    first.resolve();
    await a;
    expect(started).toBe(false);
    expect(await queue.run("upload", async () => 42)).toBe(42);
  });

  it("continues after failed work", async () => {
    const queue = new DemoProcessingQueue();
    await expect(
      queue.run("upload", async () => {
        throw new Error("invalid");
      }),
    ).rejects.toThrow("invalid");
    expect(await queue.run("recording", async () => 42)).toBe(42);
  });
});
