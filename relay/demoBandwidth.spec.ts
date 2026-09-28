import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { throttleDemoDownload } from "./demoBandwidth";
import {
  DemoTooLargeError,
  MAX_SOURCE_DEMO_BYTES,
} from "./demoSourceValidation";

afterEach(() => vi.useRealTimers());

async function collect(stream: Readable, onChunk?: (chunk: Buffer) => void) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
    onChunk?.(chunk);
  }
  return Buffer.concat(chunks);
}

describe("source demo bandwidth", () => {
  it("paces downloads at 4 MiB/s without changing the bytes", async () => {
    vi.useFakeTimers();
    const chunks = Array.from({ length: 16 }, (_, i) =>
      Buffer.alloc(64 * 1024, i),
    );
    let received = 0;
    const stream = throttleDemoDownload(
      Readable.from(chunks),
      new AbortController().signal,
      1024 * 1024,
    );
    const output = collect(stream, (chunk) => {
      received += chunk.length;
    });
    await vi.advanceTimersByTimeAsync(125);
    expect(received).toBeGreaterThan(0);
    expect(received).toBeLessThanOrEqual(512 * 1024);
    await vi.advanceTimersByTimeAsync(200);
    expect(await output).toEqual(Buffer.concat(chunks));
  });

  it("cancels a pending wait and destroys the source", async () => {
    vi.useFakeTimers();
    const source = Readable.from([Buffer.alloc(1024 * 1024)]);
    const abort = new AbortController();
    const stream = throttleDemoDownload(source, abort.signal, 1024 * 1024);
    const done = expect(collect(stream)).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.advanceTimersByTimeAsync(1);
    abort.abort();
    await done;
    expect(source.destroyed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("propagates source errors while waiting to release a chunk", async () => {
    vi.useFakeTimers();
    const source = new Readable({ read() {} });
    source.push(Buffer.alloc(1024 * 1024));
    const stream = throttleDemoDownload(
      source,
      new AbortController().signal,
      1024 * 1024,
    );
    const done = expect(collect(stream)).rejects.toThrow("source failed");
    await vi.advanceTimersByTimeAsync(1);
    source.destroy(new Error("source failed"));
    await done;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fails immediately when the source closes without ending or emitting an error", async () => {
    const source = new Readable({ read() {} });
    const stream = throttleDemoDownload(
      source,
      new AbortController().signal,
      100,
    );
    const done = expect(collect(stream)).rejects.toThrow(
      "closed before the download ended",
    );
    source.destroy();
    await done;
    expect(stream.destroyed).toBe(true);
  });

  it.each([5, 20])(
    "rejects a body that does not match its declared %i bytes",
    async (declared) => {
      vi.useFakeTimers();
      const stream = throttleDemoDownload(
        Readable.from([Buffer.alloc(10)]),
        new AbortController().signal,
        declared,
      );
      const rejected = expect(collect(stream)).rejects.toThrow(
        "Content-Length",
      );
      await vi.runAllTimersAsync();
      await rejected;
    },
  );

  it("stops an oversized stream even if its source misreports the length", async () => {
    vi.useFakeTimers();
    // Reuse a single buffer so this test does not allocate a 150 MB demo.
    const chunk = Buffer.alloc(1024 * 1024);
    const source = Readable.from(
      (function* () {
        for (let i = 0; i < 150; i++) yield chunk;
      })(),
    );
    const stream = throttleDemoDownload(
      source,
      new AbortController().signal,
      MAX_SOURCE_DEMO_BYTES,
    );
    const rejected = expect(collect(stream)).rejects.toBeInstanceOf(
      DemoTooLargeError,
    );
    await vi.advanceTimersByTimeAsync(40_000);
    await rejected;
    expect(source.destroyed).toBe(true);
  });
});
