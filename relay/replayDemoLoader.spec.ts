import { describe, expect, it, vi } from "vitest";
import {
  createReplayDemoLoader,
  validateReplayDemoReference,
} from "./replayDemoLoader";
import { buildHeader } from "./demoWriter";
import type { RemoteDemo } from "./demoSources";

const demo = buildHeader(0);
const signal = () => new AbortController().signal;

describe("replay demo loading", () => {
  it.each([
    "https://evil.test/a.rec",
    "../a.rec",
    "a/b.rec",
    "a\\b.rec",
    "a.rec\0",
    "unknown:1",
    "tribesforever:0",
  ])("rejects an untrusted reference: %s", (reference) => {
    expect(() => validateReplayDemoReference(reference)).toThrow();
  });

  it("encodes published filenames under the configured bucket", async () => {
    const request = vi.fn<typeof fetch>(async () => new Response(demo));
    const load = createReplayDemoLoader({
      baseUrl: "https://demos.test/recordings",
      fetch: request as typeof fetch,
    });
    expect(await load("match ?#%.rec", signal())).toEqual({
      bytes: demo,
      games: [],
    });
    expect(request.mock.calls[0][0]).toBe(
      "https://demos.test/recordings/match%20%3F%23%25.rec",
    );
    expect(request.mock.calls[0][1]).toMatchObject({ redirect: "error" });
  });

  it("loads validated per-game labels only from the published demo's sibling sidecar", async () => {
    const game = {
      mission: "Katabatic",
      gameType: "CTF",
      startMs: 0,
      tournament: false,
      gameId: "recording-one",
      presentationRevision: 2,
      title: "Final",
      teamNames: { 1: "Storm", 2: "Dragons" },
    };
    const request = vi.fn<typeof fetch>(async (url) =>
      String(url).endsWith(".json")
        ? Response.json({ games: [game] })
        : new Response(demo),
    );
    const load = createReplayDemoLoader({
      baseUrl: "https://demos.test/recordings",
      fetch: request,
    });
    expect(await load("final.rec", signal())).toEqual({
      bytes: demo,
      games: [game],
    });
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      "https://demos.test/recordings/final.rec",
      "https://demos.test/recordings/final.rec.json",
    ]);
    expect(request.mock.calls[1][1]).toMatchObject({
      redirect: "error",
      cache: "no-store",
    });
  });

  it.each([
    "missing",
    "malformed",
    "oversized header",
    "oversized stream",
    "redirect",
  ])(
    "keeps ordinary demo replay usable when optional labels are %s",
    async (kind) => {
      const request = vi.fn<typeof fetch>(async (url) => {
        if (!String(url).endsWith(".json")) return new Response(demo);
        if (kind === "missing") return new Response(null, { status: 404 });
        if (kind === "malformed") return new Response("{");
        if (kind === "oversized header")
          return new Response("{}", {
            headers: { "Content-Length": String(128 * 1024 + 1) },
          });
        if (kind === "oversized stream")
          return new Response("x".repeat(128 * 1024 + 1));
        throw new TypeError("Redirect not allowed");
      });
      const load = createReplayDemoLoader({ fetch: request });
      expect(await load("final.rec", signal())).toEqual({
        bytes: demo,
        games: [],
      });
    },
  );

  it("bounds time spent waiting for optional labels", async () => {
    const request = vi.fn<typeof fetch>(async (url) =>
      String(url).endsWith(".json")
        ? new Promise<Response>(() => {})
        : new Response(demo),
    );
    const load = createReplayDemoLoader({ fetch: request });
    expect(await load("final.rec", signal())).toEqual({
      bytes: demo,
      games: [],
    });
  });

  it("uses the allowlisted external source and the existing cache", async () => {
    const ensure = vi.fn<(demo: RemoteDemo) => Promise<string>>(
      async () => "https://demos.test/sources/tribesforever/42.rec",
    );
    const request = vi.fn<typeof fetch>(async () => new Response(demo));
    const load = createReplayDemoLoader({
      cache: { ensure },
      fetch: request as typeof fetch,
    });
    await load("tribesforever:42", signal());
    expect(ensure.mock.calls[0][0]).toMatchObject({
      source: "tribesforever",
      id: "42",
      url: "https://tribesforever.com/demo/42/download",
    });
    expect(request.mock.calls[0][0]).toBe(
      "https://demos.test/sources/tribesforever/42.rec",
    );
    expect(request).toHaveBeenCalledOnce();
  });

  it("enforces the streamed limit even without Content-Length", async () => {
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(12));
        controller.enqueue(new Uint8Array(12));
      },
      cancel() {
        canceled = true;
      },
    });
    const load = createReplayDemoLoader({
      maxBytes: 20,
      fetch: vi.fn(async () => new Response(body)) as typeof fetch,
    });
    await expect(load("a.rec", signal())).rejects.toThrow("too large");
    expect(canceled).toBe(true);
  });

  it("rejects an oversized Content-Length before reading the body", async () => {
    const load = createReplayDemoLoader({
      maxBytes: 20,
      fetch: vi.fn(
        async () => new Response(demo, { headers: { "content-length": "21" } }),
      ) as typeof fetch,
    });
    await expect(load("a.rec", signal())).rejects.toThrow("too large");
  });

  it("aborts waiting for an import without canceling the shared import", async () => {
    const request = vi.fn();
    const load = createReplayDemoLoader({
      cache: { ensure: () => new Promise(() => {}) },
      fetch: request as typeof fetch,
    });
    const abort = new AbortController();
    const pending = load("tribesforever:42", abort.signal);
    abort.abort(new Error("left the session"));
    await expect(pending).rejects.toThrow("left the session");
    expect(request).not.toHaveBeenCalled();
  });

  it("rejects a successful HTML response", async () => {
    const load = createReplayDemoLoader({
      fetch: vi.fn(
        async () => new Response("<html>not a demo</html>"),
      ) as typeof fetch,
    });
    await expect(load("a.rec", signal())).rejects.toThrow("Tribes 2 demo");
  });
});
