import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("DEMOS_BASE_URL", "https://demos.example/demos");
  vi.stubEnv("RELAY_URL", "wss://relay.example");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("demo")),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("demo source registry", () => {
  it("polls a pending import at Retry-After intervals without returning it as demo data", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const ready = new Response("demo");
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(new ReadableStream({ cancel }), {
          status: 202,
          headers: { "Retry-After": "2" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(ready);
    const { resolveDemoSource } = await import("./demoSources");
    const pending = resolveDemoSource("tribesforever:22945").load(
      new AbortController().signal,
    );
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetch).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await pending).toBe(ready);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels between polls without making another request", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 202 }));
    const { resolveDemoSource } = await import("./demoSources");
    const abort = new AbortController();
    const pending = resolveDemoSource("tribesforever:22945").load(abort.signal);
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.advanceTimersByTimeAsync(0);
    abort.abort();
    await rejected;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("surfaces a failed import on the next poll and stops retrying", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(
        new Response("Demo exceeds the 150 MB size limit", { status: 413 }),
      );
    const { resolveDemoSource } = await import("./demoSources");
    const pending = resolveDemoSource("tribesforever:22945").load(
      new AbortController().signal,
    );
    const rejected = expect(pending).rejects.toThrow("150 MB");
    await vi.advanceTimersByTimeAsync(10_000);
    await rejected;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("closes the body when the relay is busy", async () => {
    const cancel = vi.fn();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(new ReadableStream({ cancel }), { status: 503 }),
    );
    const { resolveDemoSource } = await import("./demoSources");
    await expect(
      resolveDemoSource("tribesforever:22945").load(
        new AbortController().signal,
      ),
    ).rejects.toThrow("busy");
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("keeps unqualified filenames on the published demo host", async () => {
    const { resolveDemoSource } = await import("./demoSources");
    const source = resolveDemoSource("my demo #1.rec");
    const signal = new AbortController().signal;
    await source.load(signal);
    expect(source.url).toBe("https://demos.example/demos/my%20demo%20%231.rec");
    expect(source.sidecarSourceUrl).toBe(source.url);
    expect(fetch).toHaveBeenCalledWith(source.url, { signal });
  });

  it.each([
    ["wss://relay.example", "https://relay.example"],
    ["ws://localhost:8765", "http://localhost:8765"],
    ["https://relay.example", "https://relay.example"],
    ["http://localhost:8765", "http://localhost:8765"],
  ])(
    "loads TribesForever through %s without needing the demo index",
    async (relay, http) => {
      vi.stubEnv("RELAY_URL", relay);
      vi.stubEnv("DEMOS_BASE_URL", "");
      const { resolveDemoSource, demoSourceUrl } =
        await import("./demoSources");
      const source = resolveDemoSource("tribesforever:22945");
      const signal = new AbortController().signal;
      await source.load(signal);
      expect(fetch).toHaveBeenCalledWith(
        `${http}/demo-download/tribesforever/22945`,
        {
          signal,
          headers: { Accept: "application/octet-stream, application/json" },
        },
      );
      expect(source.url).toBe("https://tribesforever.com/demo/22945/download");
      expect(source.sidecarSourceUrl).toBeNull();
      expect(demoSourceUrl("TRIBESFOREVER:22945")).toBe(source.url);
    },
  );

  it.each([
    "tribesforever:",
    "tribesforever:0",
    "tribesforever:-1",
    "tribesforever:1.5",
    "tribesforever:22945/../../x",
    "tribesforever:22945?url=https://example.com",
  ])("rejects malformed IDs before making requests (%s)", async (reference) => {
    const { resolveDemoSource, demoSourceUrl } = await import("./demoSources");
    expect(() => resolveDemoSource(reference)).toThrow("positive integer");
    expect(demoSourceUrl(reference)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["unknown:1", "constructor:1", "https://example.com/demo.rec"])(
    "reports unsupported sources instead of fetching a filename (%s)",
    async (reference) => {
      const { resolveDemoSource } = await import("./demoSources");
      expect(() => resolveDemoSource(reference)).toThrow("Unknown demo source");
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("loads matching metadata beside the final cached response URL", async () => {
    const { resolveDemoSource } = await import("./demoSources");
    const source = resolveDemoSource("tribesforever:22945");
    const metadata = {
      format: "t2-source-demo",
      schemaVersion: 1,
      source: "tribesforever",
      id: "22945",
      sourceUrl: source.url,
      fetchedAt: "2026-09-28T12:00:00.000Z",
      recordedAt: null,
      originalFilename: "original.rec",
      gameVersion: 25034,
      protocolVersion: 0x330004,
      durationMs: 1259725,
    };
    const response = {
      url: "https://demos.example/demos/sources/tribesforever/22945.rec",
    } as Response;
    const signal = new AbortController().signal;
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(metadata)),
    );
    expect(await source.loadMetadata!(response, signal)).toEqual(metadata);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(`${response.url}.json`, {
      signal,
    });
    for (const invalid of [
      { ...metadata, id: "22946" },
      { ...metadata, gameVersion: 25033 },
      { ...metadata, sourceUrl: "wrong" },
    ]) {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(invalid)),
      );
      expect(await source.loadMetadata!(response, signal)).toBeNull();
    }
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("missing", { status: 404 }),
    );
    expect(await source.loadMetadata!(response, signal)).toBeNull();
  });

  it("skips metadata when a relay streams the demo without R2", async () => {
    const { resolveDemoSource } = await import("./demoSources");
    const source = resolveDemoSource("tribesforever:22945");
    const response = {
      url: "https://relay.example/demo-download/tribesforever/22945",
    } as Response;
    expect(
      await source.loadMetadata!(response, new AbortController().signal),
    ).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
