import { describe, expect, it } from "vitest";
import type { LinkPreviewTarget } from "./linkPreviewRoute";
import {
  linkPreviewArtifacts,
  linkPreviewCacheControl,
  linkPreviewObjectKey,
} from "./linkPreviewStorage";

describe("linkPreviewObjectKey", () => {
  it("keeps nested demo keys in one bounded, filesystem-safe identity", () => {
    const targets: LinkPreviewTarget[] = [
      { kind: "demo", demo: "users/123/clip #1.rec" },
      { kind: "demo", demo: "tribesforever:22945" },
      { kind: "demo", demo: "../../a.rec" },
      { kind: "demo", demo: "山と鳥/El Niño.rec" },
      { kind: "demo", demo: "x".repeat(20_000) },
    ];
    const keys = targets.map((target) => linkPreviewObjectKey(target));
    for (const key of keys) {
      expect(key).toMatch(/^previews\/v1\/demos\/[a-f0-9]{64}\/head\.html$/);
      expect(key.length).toBeLessThan(110);
    }
    expect(new Set(keys).size).toBe(targets.length);
  });

  it("preserves opaque identifiers rather than decoding or folding them", () => {
    const ids = ["a/b.rec", "a%2Fb.rec", "A/b.rec", "é.rec", "e\u0301.rec"];
    const keys = ids.map((demo) =>
      linkPreviewObjectKey({ kind: "demo", demo }),
    );
    expect(new Set(keys).size).toBe(ids.length);
    expect(linkPreviewObjectKey({ kind: "demo", demo: ids[0] })).toBe(keys[0]);
  });

  it("namespaces resource kinds even when their IDs are identical", () => {
    const demo = linkPreviewObjectKey({ kind: "demo", demo: "123" });
    const profile = linkPreviewObjectKey({ kind: "profile", userId: "123" });
    const clip = linkPreviewObjectKey({ kind: "clip", clipId: "123" });
    expect(new Set([demo, profile, clip]).size).toBe(3);
    expect(profile).toMatch(/^previews\/v1\/profiles\//);
    expect(clip).toMatch(/^previews\/v1\/clips\//);
  });

  it("uses the clip ID independently of optional playback companions", () => {
    expect(
      linkPreviewObjectKey({ kind: "clip", clipId: "clip-123", demo: "a.rec" }),
    ).toBe(
      linkPreviewObjectKey({ kind: "clip", clipId: "clip-123", demo: "b.rec" }),
    );
    expect(
      linkPreviewObjectKey({ kind: "clip", clipId: "clip-123", demo: "a.rec" }),
    ).toBe(linkPreviewObjectKey({ kind: "clip", clipId: "clip-123" }));
  });

  it("identifies addressed servers by address rather than display labels", () => {
    expect(
      linkPreviewObjectKey({
        kind: "server",
        address: "example.com:28000",
        name: "Old name",
      }),
    ).toBe(
      linkPreviewObjectKey({
        kind: "server",
        address: "example.com:28000",
        name: "New name",
      }),
    );
    expect(
      linkPreviewObjectKey({ kind: "server", name: "example.com:28000" }),
    ).not.toBe(
      linkPreviewObjectKey({ kind: "server", address: "example.com:28000" }),
    );
    expect(
      linkPreviewObjectKey({ kind: "server", address: " Example.COM " }),
    ).toBe(
      linkPreviewObjectKey({ kind: "server", address: "example.com:28000" }),
    );
  });

  it("distinguishes mission variants while treating absent type consistently", () => {
    const map: LinkPreviewTarget = { kind: "map", missionName: "Katabatic" };
    expect(linkPreviewObjectKey(map)).toBe(
      linkPreviewObjectKey({ ...map, missionType: undefined }),
    );
    expect(linkPreviewObjectKey({ ...map, missionType: "CTF" })).not.toBe(
      linkPreviewObjectKey({ ...map, missionType: "DM" }),
    );
  });

  it("keeps known index pages readable and all output files colocated", () => {
    const page = { kind: "page", page: "clips" } as const;
    expect(linkPreviewObjectKey(page)).toBe(
      "previews/v1/pages/clips/head.html",
    );
    expect(linkPreviewObjectKey(page, "preview.html", "/social/v2/")).toBe(
      "social/v2/pages/clips/preview.html",
    );
  });

  it("rejects prefixes which could escape the output directory", () => {
    const page = { kind: "page", page: "home" } as const;
    for (const prefix of ["", "../previews", "previews//v1", "a/./b", "a\\b"]) {
      expect(() => linkPreviewObjectKey(page, "head.html", prefix)).toThrow(
        "safe path segments",
      );
    }
  });
});

describe("linkPreviewArtifacts", () => {
  it("packages the same rendered metadata for injection, inspection and publishing", () => {
    const target = { kind: "clip", clipId: "clip-123" } as const;
    const metadata = {
      title: "An aerial & a flag",
      url: "https://example.com/",
    };
    const headHtml =
      '<meta property="og:title" content="An aerial &amp; a flag"/>';
    const documentHtml = `<!doctype html><html><head>${headHtml}</head></html>`;
    const artifacts = linkPreviewArtifacts({
      target,
      metadata,
      headHtml,
      documentHtml,
    });
    expect(artifacts.map(({ key }) => key.split("/").at(-1))).toEqual([
      "head.html",
      "preview.html",
      "data.json",
    ]);
    expect(artifacts[0]).toMatchObject({
      body: headHtml,
      contentType: "text/html; charset=utf-8",
      cacheControl: "no-cache",
    });
    expect(artifacts[1].body).toBe(documentHtml);
    expect(artifacts[2].contentType).toBe("application/json; charset=utf-8");
    expect(JSON.parse(artifacts[2].body)).toEqual({
      version: 1,
      target,
      metadata,
    });
    expect(
      new Set(artifacts.map(({ key }) => key.slice(0, key.lastIndexOf("/"))))
        .size,
    ).toBe(1);
  });

  it("never marks mutable heads immutable, and limits live-server freshness", () => {
    expect(
      linkPreviewCacheControl({ kind: "server", address: "host:28000" }),
    ).toBe("public, max-age=30");
    const targets: LinkPreviewTarget[] = [
      { kind: "map", missionName: "Katabatic" },
      { kind: "demo", demo: "a.rec" },
      { kind: "profile", userId: "123" },
      { kind: "clip", clipId: "123" },
      { kind: "page", page: "home" },
    ];
    for (const target of targets) {
      expect(linkPreviewCacheControl(target)).toBe("no-cache");
    }
  });
});
