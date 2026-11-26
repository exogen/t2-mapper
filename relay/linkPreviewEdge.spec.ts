import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequest } from "../functions/_middleware";
import { linkPreviewCatalogPath } from "./linkPreviewKey";

const origin = "https://play.tribes2.online";
const relay = "https://relay.tribes2.online";
const genericPath = "/preview-snippets/pages/home/head.txt";
const env = {
  LINK_PREVIEW_RELAY_URL: relay,
  LINK_PREVIEW_RELAY_SECRET: "test-only",
};

function asset() {
  return new Response(
    "<!doctype html><html><head></head><body>App</body></html>",
    {
      headers: {
        "Content-Type": "text/html",
        "Cache-Control": "public, max-age=600",
        ETag: '"shell"',
      },
    },
  );
}

function snippet(text: string, contentType = "text/plain; charset=utf-8") {
  return new Response(text, { headers: { "Content-Type": contentType } });
}

const head = `<title>Expected preview</title><link rel="canonical" href="${origin}/"/><meta property="og:title" content="Expected preview"/>`;
const prepend = vi.fn();
const remove = vi.fn();
type Handler = {
  element(element: {
    prepend: typeof prepend;
    remove: typeof remove;
    getAttribute(name: string): string | null;
  }): void;
};
const handlers = new Map<string, Handler>();

describe("Pages link previews", () => {
  beforeEach(() => {
    prepend.mockClear();
    remove.mockClear();
    handlers.clear();
    vi.stubGlobal(
      "HTMLRewriter",
      class {
        on(selector: string, handler: Handler) {
          handlers.set(selector, handler);
          return this;
        }

        transform(response: Response) {
          handlers
            .get("head")
            ?.element({ prepend, remove, getAttribute: () => null });
          return response;
        }
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("fetches the deployed map snippet and replaces the conflicting head metadata", async () => {
    const fetchAsset = vi.fn(async (_request: Request) => snippet(head));
    const next = vi.fn(async (_request?: Request) => asset());
    const passThroughOnException = vi.fn();
    const response = await onRequest({
      request: new Request(
        "https://preview.pages.dev/?mission=RiverDance~CTF&view=cc",
        {
          headers: {
            "If-None-Match": '"shell"',
            "If-Modified-Since": "Wed, 18 Mar 2026 10:30:00 GMT",
          },
        },
      ),
      env: { ASSETS: { fetch: fetchAsset } },
      next,
      passThroughOnException,
    });

    const path = await linkPreviewCatalogPath({
      kind: "map",
      missionName: "RiverDance",
      missionType: "CTF",
    });
    expect(fetchAsset.mock.calls.map(([request]) => request.url)).toEqual([
      `https://preview.pages.dev${genericPath}`,
      `https://preview.pages.dev/${path}`,
    ]);
    expect(prepend).toHaveBeenCalledWith(head, { html: true });
    expect(passThroughOnException).toHaveBeenCalledOnce();
    expect(handlers.has("head > title")).toBe(true);
    expect(handlers.has('head > link[rel~="canonical"]')).toBe(true);
    const meta = handlers.get("head > meta")!;
    for (const [name, value] of [
      ["name", "description"],
      ["property", "OG:title"],
      ["name", "twitter:card"],
      ["name", "theme-color"],
    ]) {
      meta.element({
        prepend,
        remove,
        getAttribute: (attribute) => (attribute === name ? value : null),
      });
    }
    meta.element({
      prepend,
      remove,
      getAttribute: (name) => (name === "name" ? "viewport" : null),
    });
    expect(remove).toHaveBeenCalledTimes(4);
    expect(next.mock.calls[0][0]?.headers.has("If-None-Match")).toBe(false);
    expect(next.mock.calls[0][0]?.headers.has("If-Modified-Since")).toBe(false);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.has("ETag")).toBe(false);
  });

  it("falls back to the untyped map when the requested map type is unknown", async () => {
    const fetchAsset = vi.fn(async (request: Request) =>
      new URL(request.url).pathname === `/${untyped}`
        ? snippet(head)
        : new Response(null, { status: 404 }),
    );
    const untyped = await linkPreviewCatalogPath({
      kind: "map",
      missionName: "RiverDance",
    });
    const typed = await linkPreviewCatalogPath({
      kind: "map",
      missionName: "RiverDance",
      missionType: "Unsupported",
    });

    await onRequest({
      request: new Request(`${origin}/?mission=RiverDance~Unsupported`),
      env: { ASSETS: { fetch: fetchAsset } },
      next: async () => asset(),
    });

    expect(fetchAsset.mock.calls.map(([request]) => request.url)).toEqual([
      `${origin}${genericPath}`,
      `${origin}/${typed}`,
      `${origin}/${untyped}`,
    ]);
    expect(prepend).toHaveBeenCalledWith(head, { html: true });
  });

  it.each([
    [
      "/?ownerToken=private&address=EXAMPLE.COM",
      "/?mode=live&address=example.com%3A28000",
    ],
    ["/?clip=clip-one", "/?mode=demo&clip=clip-one"],
    [
      "/?demo=%E5%B1%B1%2FEl+Ni%C3%B1o.rec&view=cc",
      "/?mode=demo&demo=%E5%B1%B1%2FEl+Ni%C3%B1o.rec",
    ],
    ["/?user=123", "/?mode=demo&user=123"],
  ])("uses the relay for entity previews at %s", async (path, canonical) => {
    const fetchAsset = vi.fn(async (_request: Request) => snippet(head));
    const fetch = vi.fn(
      async (_url: URL, _init: RequestInit) =>
        new Response(head, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
    );
    vi.stubGlobal("fetch", fetch);

    await onRequest({
      request: new Request(`https://incoming.example${path}`, {
        headers: { Cookie: "private" },
      }),
      env: { ...env, ASSETS: { fetch: fetchAsset } },
      next: async () => asset(),
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetch.mock.calls[0];
    expect(endpoint.origin).toBe(relay);
    expect(endpoint.pathname).toBe("/api/link-preview");
    expect(endpoint.searchParams.get("url")).toBe(`${origin}${canonical}`);
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer test-only",
    );
    expect(new Headers(init.headers).has("Cookie")).toBe(false);
    expect(
      fetchAsset.mock.calls.map(([request]) => new URL(request.url).pathname),
    ).toEqual([genericPath]);
    expect(prepend).toHaveBeenCalledWith(head, { html: true });
  });

  it.each([
    ["failure", () => new Response("error", { status: 503 })],
    [
      "malformed markup",
      () => snippet(`${head}<script></script>`, "text/html"),
    ],
    ["unexpected full page", asset],
  ])("uses the generic home head on relay %s", async (_case, relayResponse) => {
    const home = head.replaceAll("Expected preview", "Home preview");
    const fetchAsset = vi.fn(async () => snippet(home));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => relayResponse()),
    );

    await onRequest({
      request: new Request(`${origin}/?clip=clip-one`),
      env: { ...env, ASSETS: { fetch: fetchAsset } },
      next: async () => asset(),
    });

    expect(prepend).toHaveBeenCalledWith(home, { html: true });
  });

  it.each([
    "missing file",
    "error",
    "unexpected full page",
    "malformed snippet",
  ])("serves the original shell when the home asset has %s", async (kind) => {
    const shell = asset();
    const fetchAsset = async () => {
      switch (kind) {
        case "missing file":
          return new Response(null, { status: 404 });
        case "error":
          throw new Error("asset unavailable");
        case "unexpected full page":
          return asset();
        default:
          return snippet("incomplete");
      }
    };
    const response = await onRequest({
      request: new Request(origin),
      env: { ASSETS: { fetch: fetchAsset } },
      next: async () => shell,
    });
    expect(response).toBe(shell);
    expect(prepend).not.toHaveBeenCalled();
  });

  it("uses the already loaded generic head and aborts a hung relay call", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
      (_url: URL, _init: RequestInit) => new Promise<Response>(() => {}),
    );
    vi.stubGlobal("fetch", fetch);
    const response = onRequest({
      request: new Request(`${origin}/?clip=clip-one`),
      env: { ...env, ASSETS: { fetch: async () => snippet(head) } },
      next: async () => asset(),
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await response).toBeInstanceOf(Response);
    expect(prepend).toHaveBeenCalledWith(head, { html: true });
    expect(fetch.mock.calls[0][1].signal?.aborted).toBe(true);
  });

  it("uses the already loaded generic head when a typed map asset stalls", async () => {
    const path = await linkPreviewCatalogPath({
      kind: "map",
      missionName: "RiverDance",
      missionType: "CTF",
    });
    vi.useFakeTimers();
    let started: () => void;
    const startedRequest = new Promise<void>((resolve) => {
      started = resolve;
    });
    const fetchAsset = vi.fn((request: Request) => {
      if (new URL(request.url).pathname === genericPath)
        return Promise.resolve(snippet(head));
      started();
      return new Promise<Response>(() => {});
    });
    const response = onRequest({
      request: new Request(`${origin}/?mission=RiverDance~CTF`),
      env: { ASSETS: { fetch: fetchAsset } },
      next: async () => asset(),
    });
    await startedRequest;
    await vi.advanceTimersByTimeAsync(1000);
    expect(await response).toBeInstanceOf(Response);
    expect(prepend).toHaveBeenCalledWith(head, { html: true });
    const requests = fetchAsset.mock.calls.map(([request]) => request);
    expect(requests.map(({ url }) => url)).toEqual([
      `${origin}${genericPath}`,
      `${origin}/${path}`,
    ]);
    expect(requests[1].signal.aborted).toBe(true);
  });

  it("falls back to the shell when the Pages asset doesn't respond in time", async () => {
    vi.useFakeTimers();
    const fetchAsset = vi.fn(
      (_request: Request) => new Promise<Response>(() => {}),
    );
    const shell = asset();
    const response = onRequest({
      request: new Request(origin),
      env: { ASSETS: { fetch: fetchAsset } },
      next: async () => shell,
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await response).toBe(shell);
    expect(prepend).not.toHaveBeenCalled();
    expect(fetchAsset.mock.calls[0][0].signal.aborted).toBe(true);
  });

  it("leaves assets, redirects, and unconfigured deployments alone", async () => {
    const fetchAsset = vi.fn();
    const assets = { ASSETS: { fetch: fetchAsset } };
    const shell = asset();
    const redirect = Response.redirect(`${origin}/clips/`, 308);

    expect(
      await onRequest({
        request: new Request(`${origin}/assets/app.js`),
        env: assets,
        next: async () => shell,
      }),
    ).toBe(shell);
    expect(
      await onRequest({
        request: new Request(`${origin}/clips`),
        env: assets,
        next: async () => redirect,
      }),
    ).toBe(redirect);
    expect(
      await onRequest({
        request: new Request(origin),
        env: {},
        next: async () => shell,
      }),
    ).toBe(shell);
    expect(fetchAsset).not.toHaveBeenCalled();
    expect(prepend).not.toHaveBeenCalled();
  });
});
