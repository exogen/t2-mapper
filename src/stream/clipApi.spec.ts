import { afterEach, expect, it, vi } from "vitest";
import type { ClipCreateRequest } from "../../relay/clipTypes";
vi.mock("../account/authClient", () => ({
  appApiBaseUrl: "https://api.example.com",
}));
import {
  ClipApiError,
  readClip,
  readClipStatus,
  readPublicClips,
  readUserClips,
  clipRefetchInterval,
  deleteClip,
  saveClip,
} from "./clipApi";
afterEach(() => vi.unstubAllGlobals());

it("deletes a clip using the authenticated owner session", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ deleted: true }), { status: 202 }),
    );
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController();
  await expect(
    deleteClip("clip/id", controller.signal),
  ).resolves.toBeUndefined();
  expect(String(fetch.mock.calls[0][0])).toBe(
    "https://api.example.com/api/clips/clip%2Fid",
  );
  expect(fetch.mock.calls[0][1]).toMatchObject({
    method: "DELETE",
    credentials: "include",
    signal: controller.signal,
  });
});

it("preserves the server's clip deletion error", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Sign in to manage clips" }), {
        status: 401,
      }),
    ),
  );
  await expect(
    deleteClip("id", new AbortController().signal),
  ).rejects.toMatchObject({ status: 401, message: "Sign in to manage clips" });
});

it("saves only under the expected signed-in account and shares no editable title", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ id: "saved" }), { status: 202 }),
    );
  vi.stubGlobal("fetch", fetch);
  const request = {
    requestId: "request",
    take: {},
    trimStartMs: 0,
    trimEndMs: 100,
    sourceSha256: "a".repeat(64),
  } as ClipCreateRequest;
  await saveClip(request, "123456789012345678", new AbortController().signal);
  const [url, options] = fetch.mock.calls[0];
  expect(String(url)).toBe(
    "https://api.example.com/api/clips?owner=123456789012345678",
  );
  expect(options.credentials).toBe("include");
  expect(JSON.parse(options.body)).toEqual(request);
});

it("allows anonymous clip views without leaking a session", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ id: "saved" })));
  vi.stubGlobal("fetch", fetch);
  await readClip("clip/id", new AbortController().signal);
  expect(String(fetch.mock.calls[0][0])).toBe(
    "https://api.example.com/api/clips/clip%2Fid",
  );
  expect(fetch.mock.calls[0][1]).toMatchObject({
    credentials: "omit",
    cache: "no-store",
  });
});

it("fetches a creator's requested page publicly and propagates cancellation", async () => {
  const page = { clips: [], total: 7, pending: 1, page: 2, pageSize: 6 };
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(page)));
  vi.stubGlobal("fetch", fetch);
  const controller = new AbortController();
  await expect(
    readUserClips("123456789012345678", 2, controller.signal),
  ).resolves.toEqual(page);
  const [url, options] = fetch.mock.calls[0];
  expect(String(url)).toBe(
    "https://api.example.com/api/clips?owner=123456789012345678&page=2",
  );
  expect(options).toMatchObject({ credentials: "omit", cache: "no-store" });
  controller.abort();
  expect(options.signal.aborted).toBe(true);
});

it("requests the latest public clips together without a page number", async () => {
  const page = {
    clips: [],
    total: 1_005,
    pending: 0,
    page: 1,
    pageSize: 1_000,
  };
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(page)));
  vi.stubGlobal("fetch", fetch);
  await expect(readPublicClips(new AbortController().signal)).resolves.toEqual(
    page,
  );
  const [url, options] = fetch.mock.calls[0];
  expect(String(url)).toBe("https://api.example.com/api/clips?limit=1000");
  expect(options).toMatchObject({ credentials: "omit", cache: "no-store" });
});

it("polls saved clip metadata without requesting its camera timeline", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ id: "saved", state: "ready" })),
    );
  vi.stubGlobal("fetch", fetch);
  await readClipStatus("clip/id", new AbortController().signal);
  expect(String(fetch.mock.calls[0][0])).toBe(
    "https://api.example.com/api/clips/clip%2Fid?summary=1",
  );
  expect(fetch.mock.calls[0][1]).toMatchObject({
    credentials: "omit",
    cache: "no-store",
  });
});

it.each([400, 404, 410])(
  "stops polling a cached processing clip after permanent error %s",
  (status) => {
    expect(
      clipRefetchInterval({
        state: {
          data: { state: "processing" },
          error: new ClipApiError("Unavailable", status),
        },
      }),
    ).toBe(false);
  },
);

it("keeps retrying temporary preparation failures and stops once work finishes", () => {
  expect(
    clipRefetchInterval({
      state: {
        data: { state: "processing" },
        error: new ClipApiError("Temporary failure", 503),
      },
    }),
  ).toBe(1500);
  for (const state of ["ready", "failed"] as const)
    expect(
      clipRefetchInterval({ state: { data: { state }, error: null } }),
    ).toBe(false);
});

it("includes credentials only when requesting the owner's management list", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ clips: [] })));
  vi.stubGlobal("fetch", fetch);
  await readUserClips(
    "123456789012345678",
    1,
    new AbortController().signal,
    true,
  );
  const [url, options] = fetch.mock.calls[0];
  expect(String(url)).toContain("manage=1");
  expect(options.credentials).toBe("include");
});
