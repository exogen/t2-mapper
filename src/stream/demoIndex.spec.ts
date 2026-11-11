import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CAST_BASE_URL,
  DEMOS_BASE_URL,
  commentaryFileName,
  commentarySidecarUrl,
  sidecarUrl,
  demoPlayerCount,
  fetchDemoIndex,
  demoDownloadUrl,
  isMapGeniusDemo,
} from "./demoIndex";

afterEach(() => vi.unstubAllGlobals());

it("revalidates the demo index so saved metadata is not hidden by browser caches", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json([]));
  vi.stubGlobal("fetch", fetchMock);

  await expect(fetchDemoIndex()).resolves.toEqual([]);

  expect(fetchMock).toHaveBeenCalledWith(`${DEMOS_BASE_URL}/index.json`, {
    cache: "no-cache",
    signal: expect.any(AbortSignal),
  });
});

it("cancels an in-flight index request when its query is cancelled", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url, { signal }: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          signal!.addEventListener("abort", () => reject(signal!.reason), {
            once: true,
          });
        }),
    ),
  );
  const controller = new AbortController();
  const request = fetchDemoIndex(controller.signal);
  controller.abort();
  await expect(request).rejects.toMatchObject({ name: "AbortError" });
});

describe("demo player count", () => {
  it("uses the tag-less name count rather than counting aliases", () => {
    expect(
      demoPlayerCount({
        players: ["Alice", "[TAG]Alice", "Bob"],
        playerCount: 2,
      }),
    ).toBe(2);
    expect(demoPlayerCount({ players: ["Old name"], playerCount: 0 })).toBe(0);
  });
  it("keeps old metadata usable before backfill", () => {
    expect(demoPlayerCount({ players: ["Alice", "Bob"] })).toBe(2);
  });
});

describe("isMapGeniusDemo", () => {
  it("recognizes published recordings made by MapGenius", () => {
    expect(
      isMapGeniusDemo({ filename: "match.rec", recorder: "MapGenius" }),
    ).toBe(true);
    expect(
      isMapGeniusDemo({ filename: "match.rec", recorder: "mapgenius" }),
    ).toBe(true);
    expect(isMapGeniusDemo({ filename: "match.rec", recorder: "Flyers" })).toBe(
      false,
    );
  });

  it("never trusts a user upload's header recorder name", () => {
    expect(
      isMapGeniusDemo({
        filename: "users/123456789012345678/match.rec",
        recorder: "MapGenius",
      }),
    ).toBe(false);
  });
});

describe("sidecarUrl", () => {
  it("keeps legacy hashed uploads downloadable with their nested sidecars", () => {
    const key = `users/126767979894407168/${"a".repeat(64)}.rec`;
    const source = `https://demos.example/demos/${key}`;
    expect(demoDownloadUrl(key)).toBe(`${DEMOS_BASE_URL}/${key}`);
    expect(sidecarUrl(source, "cast.json")).toBe(
      `${CAST_BASE_URL}/${key}.cast.json`,
    );
    expect(commentarySidecarUrl(source, null, "m4a")).toBe(
      `${CAST_BASE_URL}/${key}.commentary.m4a`,
    );
  });

  it("preserves user directories for recordings and all cast/commentary sidecars", () => {
    const key = `users/126767979894407168/server_20260901T2000_katabatic_aaaaaa.rec`;
    const source = `https://demos.example/demos/${key}`;
    expect(demoDownloadUrl(key)).toBe(`${DEMOS_BASE_URL}/${key}`);
    expect(sidecarUrl(source, "cast.json")).toBe(
      `${CAST_BASE_URL}/${key}.cast.json`,
    );
    expect(commentarySidecarUrl(source, null, "m4a")).toBe(
      `${CAST_BASE_URL}/${key}.commentary.m4a`,
    );
  });

  it("names the sidecar after the demo, under the cast base", () => {
    // The demo streams from the bucket; its sidecars may come from
    // elsewhere (a local folder in dev) but keep the bucket's names.
    const source = "https://demos.example/demos/the%20cut_abc.rec";
    expect(sidecarUrl(source, "cast.json")).toBe(
      `${CAST_BASE_URL}/the%20cut_abc.rec.cast.json`,
    );
  });
});

describe("commentary track files", () => {
  const source = "https://demos.example/demos/the%20cut_abc.rec";

  it("keeps the unlabelled pair for the default track, and for no track at all", () => {
    expect(commentaryFileName(null, "mp3")).toBe("commentary.mp3");
    expect(commentaryFileName({ suffix: undefined }, "json")).toBe(
      "commentary.json",
    );
    expect(commentarySidecarUrl(source, null, "mp3")).toBe(
      `${CAST_BASE_URL}/the%20cut_abc.rec.commentary.mp3`,
    );
  });

  it("puts a labelled track's suffix between the demo and the kind", () => {
    expect(commentaryFileName({ suffix: "Gemini" }, "json")).toBe(
      "Gemini.commentary.json",
    );
    expect(commentarySidecarUrl(source, { suffix: "Gemini" }, "mp3")).toBe(
      `${CAST_BASE_URL}/the%20cut_abc.rec.Gemini.commentary.mp3`,
    );
  });
});
