import { describe, expect, it } from "vitest";
import {
  ASSET_CACHE_CONTROL,
  ASSET_MAX_AGE,
  ASSET_STALE_WHILE_REVALIDATE,
  cacheControl,
  BINARY_CONTENT_TYPE,
  TEXT_CONTENT_TYPE,
  contentTypeFor,
  groupByContentType,
  knownExtensions,
  metadataFor,
} from "./assetMetadata";

describe("contentTypeFor", () => {
  it("types the game's own binary formats as blobs, not as the media the CLI guesses", () => {
    // mimetypes reads .dts as DTS audio and .dif as DV video.
    expect(contentTypeFor("shapes/borg11.dts")).toBe(BINARY_CONTENT_TYPE);
    expect(contentTypeFor("interiors/base.dif")).toBe(BINARY_CONTENT_TYPE);
    expect(contentTypeFor("terrains/Magmatic.ter")).toBe(BINARY_CONTENT_TYPE);
  });

  it("types text assets as UTF-8 plain text", () => {
    for (const p of ["scripts/item.cs", "missions/x.mis", "a/b.ifl", "c.dml"]) {
      expect(contentTypeFor(p)).toBe(TEXT_CONTENT_TYPE);
    }
    expect(contentTypeFor("README.md")).toBe("text/markdown; charset=utf-8");
  });

  it("types media by its registered type, whatever the case on disk", () => {
    expect(contentTypeFor("t.PNG")).toBe("image/png");
    expect(contentTypeFor("t.png")).toBe("image/png");
    expect(contentTypeFor("s.WAV")).toBe("audio/wav");
    expect(contentTypeFor("s.m4a")).toBe("audio/mp4");
    expect(contentTypeFor("v.glb")).toBe("model/gltf-binary");
  });

  it("refuses to guess an extension it has never seen", () => {
    expect(contentTypeFor("mystery.qqq")).toBeUndefined();
    expect(metadataFor("mystery.qqq")).toBeUndefined();
  });

  it("always pairs a type with the one cache policy", () => {
    expect(metadataFor("shapes/borg11.dts")).toEqual({
      contentType: BINARY_CONTENT_TYPE,
      cacheControl: ASSET_CACHE_CONTROL,
    });
  });
});

describe("groupByContentType", () => {
  it("keeps each extension's spelling so case-sensitive filters match", () => {
    const { groups, unknown } = groupByContentType([
      "a/one.png",
      "b/two.PNG",
      "c/three.jpg",
      "d/four.dts",
    ]);
    expect(unknown.size).toBe(0);
    expect([...groups.get("image/png")!].sort()).toEqual([".PNG", ".png"]);
    expect([...groups.get("image/jpeg")!]).toEqual([".jpg"]);
    expect([...groups.get(BINARY_CONTENT_TYPE)!]).toEqual([".dts"]);
  });

  it("collects unknown extensions with examples instead of typing them", () => {
    const { groups, unknown } = groupByContentType(["x/a.qqq", "x/b.qqq"]);
    expect(groups.size).toBe(0);
    expect(unknown.get(".qqq")).toEqual(["x/a.qqq", "x/b.qqq"]);
  });
});

describe("knownExtensions", () => {
  it("covers every extension the shipped asset tree uses", () => {
    const known = new Set(knownExtensions());
    for (const ext of [
      ".avi",
      ".bm8",
      ".bmp",
      ".cs",
      ".dif",
      ".dml",
      ".dsq",
      ".dts",
      ".glb",
      ".hfl",
      ".ifl",
      ".jpg",
      ".log",
      ".m4a",
      ".map",
      ".mis",
      ".mp3",
      ".png",
      ".rb",
      ".spn",
      ".ter",
      ".wav",
    ]) {
      expect(known, `${ext} must have a content type`).toContain(ext);
    }
  });
});

describe("cacheControl", () => {
  it("builds the policy from the table's values by default", () => {
    expect(cacheControl()).toBe(
      `max-age=${ASSET_MAX_AGE}, stale-while-revalidate=${ASSET_STALE_WHILE_REVALIDATE}`,
    );
    expect(ASSET_CACHE_CONTROL).toBe(cacheControl());
  });

  it("takes overrides, for a maintenance run trying a policy out", () => {
    expect(cacheControl(300, 900)).toBe(
      "max-age=300, stale-while-revalidate=900",
    );
  });

  it("never emits a directive that would disable the stale window", () => {
    // Cloudflare will not serve stale alongside any of these — s-maxage
    // implies proxy-revalidate — so the header comes back EXPIRED rather
    // than UPDATING and stale-while-revalidate does nothing.
    for (const directive of [
      "s-maxage",
      "must-revalidate",
      "proxy-revalidate",
      "no-cache",
    ]) {
      expect(ASSET_CACHE_CONTROL).not.toContain(directive);
    }
  });
});
