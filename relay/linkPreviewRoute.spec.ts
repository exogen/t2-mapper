import { describe, expect, it } from "vitest";
import {
  linkPreviewUrl,
  resolveLinkPreviewTarget,
  type LinkPreviewTarget,
} from "./linkPreviewRoute";

const site = "https://play.tribes2.online/";
const resolve = (path: string, basePath?: string) =>
  resolveLinkPreviewTarget(new URL(path, site), basePath);

describe("resolveLinkPreviewTarget", () => {
  it.each([
    ["/", { kind: "page", page: "home" }],
    ["/index.html?tracking=1", { kind: "page", page: "home" }],
    ["/?mode=map", { kind: "page", page: "maps" }],
    ["/?mode=demo", { kind: "page", page: "demos" }],
    ["/?mode=live", { kind: "page", page: "servers" }],
    ["/?mode=replay&replay=private-session", { kind: "page", page: "replays" }],
    ["/clips", { kind: "page", page: "clips" }],
    ["/clips/", { kind: "page", page: "clips" }],
    ["/clips/index.html?demo=a.rec", { kind: "page", page: "clips" }],
  ])("recognizes page entry %s", (path, target) => {
    expect(resolve(path)).toEqual(target);
  });

  it("retains a selected map and explicit game type", () => {
    expect(resolve("/?mission=DX_Ice~CTF#camera")).toEqual({
      kind: "map",
      missionName: "DX_Ice",
      missionType: "CTF",
    });
    expect(resolve("/?mission=RiverDance")).toEqual({
      kind: "map",
      missionName: "RiverDance",
    });
    expect(resolve("/?mission=~CTF")).toEqual({ kind: "page", page: "maps" });
  });

  it("follows inferred mode and content precedence", () => {
    expect(
      resolve("/?demo=a.rec&clip=clip-one&user=profile&name=server"),
    ).toEqual({
      kind: "clip",
      clipId: "clip-one",
      demo: "a.rec",
    });
    expect(
      resolve("/?demo=tribesforever:22945&user=profile&name=server"),
    ).toEqual({
      kind: "demo",
      demo: "tribesforever:22945",
    });
    expect(resolve("/?user=profile&name=server")).toEqual({
      kind: "profile",
      userId: "profile",
    });
    expect(resolve("/?user=&name=server")).toEqual({
      kind: "page",
      page: "demos",
    });
    expect(resolve("/?replay=session&demo=a.rec&clip=clip-one")).toEqual({
      kind: "page",
      page: "replays",
    });
  });

  it("ignores selections incompatible with an explicit mode", () => {
    expect(
      resolve("/?mode=map&mission=RiverDance&demo=a.rec&clip=one"),
    ).toEqual({
      kind: "map",
      missionName: "RiverDance",
    });
    expect(resolve("/?mode=live&clip=one&demo=a.rec&name=Legacy")).toEqual({
      kind: "server",
      name: "Legacy",
    });
    expect(
      resolve("/?mode=demo&address=example.com&mission=RiverDance"),
    ).toEqual({
      kind: "page",
      page: "demos",
    });
    expect(resolve("/?mode=invalid&clip=one")).toEqual({
      kind: "clip",
      clipId: "one",
    });
  });

  it("normalizes addresses and prefers them over names", () => {
    expect(resolve("/?name=Ignored&address=%20EXAMPLE.COM%20")).toEqual({
      kind: "server",
      address: "example.com:28000",
    });
    expect(resolve("/?address=EXAMPLE.COM:28001")).toEqual({
      kind: "server",
      address: "example.com:28001",
    });
  });

  it("treats legacy watch links as live even when mode says otherwise", () => {
    expect(resolve("/watch?mode=demo&demo=a.rec&name=Legacy")).toEqual({
      kind: "server",
      name: "Legacy",
    });
    expect(
      resolve("/watch/index.html?mode=command&address=example.com"),
    ).toEqual({
      kind: "server",
      address: "example.com:28000",
    });
    expect(resolve("/watch/")).toEqual({ kind: "page", page: "servers" });
  });

  it("recognizes only known entries under the configured base directory", () => {
    expect(resolve("/tools/mapgenius/?clip=one", "/tools/mapgenius")).toEqual({
      kind: "clip",
      clipId: "one",
    });
    expect(resolve("/tools/mapgenius/clips", "/tools/mapgenius/")).toEqual({
      kind: "page",
      page: "clips",
    });
    expect(
      resolve("/tools/mapgenius/watch?name=Legacy", "/tools/mapgenius/"),
    ).toEqual({
      kind: "server",
      name: "Legacy",
    });
    for (const path of [
      "/",
      "/clips/",
      "/tools/mapgenius-other/",
      "/tools/mapgenius/assets/a.js",
    ])
      expect(resolve(path, "/tools/mapgenius/")).toBeNull();
    for (const path of [
      "/account/sign-in/",
      "/other/",
      "/clips/one",
      "/index.html/",
      "/watching/",
    ])
      expect(resolve(path)).toBeNull();
  });
});

describe("linkPreviewUrl", () => {
  it("removes request-only state and private data by reconstructing identity", () => {
    const incoming = new URL(
      "https://attacker.example/?demo=users%2F123%2Fa.rec&mode=demo&t=12&ownerToken=secret&token=private&view=cc&utm_source=chat#camera",
    );
    const target = resolveLinkPreviewTarget(incoming)!;
    const url = new URL(
      linkPreviewUrl(
        target,
        "https://user:password@play.example/app?ownerToken=config-secret#old",
      ),
    );
    expect(url.origin).toBe("https://play.example");
    expect(url.pathname).toBe("/app/");
    expect(url.username).toBe("");
    expect(url.password).toBe("");
    expect(url.hash).toBe("");
    expect([...url.searchParams]).toEqual([
      ["mode", "demo"],
      ["demo", "users/123/a.rec"],
    ]);
  });

  it.each<LinkPreviewTarget>([
    { kind: "map", missionName: "DX_Ice", missionType: "CTF" },
    { kind: "demo", demo: "tribesforever:22945" },
    { kind: "demo", demo: "users/123/old demo ?#%.rec" },
    { kind: "clip", clipId: "clip-one", demo: "a.rec" },
    { kind: "clip", clipId: "clip-without-source" },
    { kind: "profile", userId: "126767979894407168" },
    { kind: "server", address: "example.com:28001" },
    { kind: "server", name: "| the cut |" },
    { kind: "page", page: "home" },
    { kind: "page", page: "maps" },
    { kind: "page", page: "demos" },
    { kind: "page", page: "servers" },
    { kind: "page", page: "clips" },
    { kind: "page", page: "replays" },
  ])("round-trips the public identity of $kind", (target) => {
    expect(resolveLinkPreviewTarget(new URL(linkPreviewUrl(target)))).toEqual(
      target,
    );
    expect(
      resolveLinkPreviewTarget(
        new URL(linkPreviewUrl(target, "http://localhost:3000/app/")),
        "/app/",
      ),
    ).toEqual(target);
  });

  it("chooses the server address when a caller supplies both selectors", () => {
    expect(
      linkPreviewUrl({
        kind: "server",
        address: "EXAMPLE.COM",
        name: "Ignored",
      }),
    ).toBe(`${site}?mode=live&address=example.com%3A28000`);
  });

  it("rejects non-HTTP deployment URLs", () => {
    expect(() =>
      linkPreviewUrl({ kind: "page", page: "home" }, "javascript:alert(1)"),
    ).toThrow("HTTP or HTTPS");
  });
});
