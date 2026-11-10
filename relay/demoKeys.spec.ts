import { describe, expect, it } from "vitest";
import {
  buildDemoFilename,
  encodedDemoKey,
  isPublishedDemoKey,
  isUserDemoKey,
  publishedDemoKeyFromUrl,
} from "./demoKeys";

const userKey = `users/126767979894407168/server_20260901T2000_katabatic_aaaaaa.rec`;
const legacyUserKey = `users/126767979894407168/${"a".repeat(64)}.rec`;
const base = "https://demos.example/demos";

describe("buildDemoFilename", () => {
  it("slugs server and mission, stamps sortable UTC time, appends a random id", () => {
    const name = buildDemoFilename(
      new Date(Date.UTC(2026, 7, 20, 9, 5, 7)),
      "| the cut |",
      "MiniSunDried",
    );
    expect(name).toMatch(
      /^the-cut_20260820T0905_minisundried_[0-9a-f]{6}\.rec$/,
    );
  });

  it("falls back when a component slugs to nothing", () => {
    const name = buildDemoFilename(
      new Date(Date.UTC(2026, 0, 2, 0, 5)),
      "|||",
      "",
    );
    expect(name).toMatch(/^server_20260102T0005_mission_[0-9a-f]{6}\.rec$/);
  });

  it("generates distinct names for identical inputs", () => {
    const date = new Date(Date.UTC(2026, 7, 20, 9, 5));
    expect(buildDemoFilename(date, "Legacy CTF+", "Katabatic")).not.toBe(
      buildDemoFilename(date, "Legacy CTF+", "Katabatic"),
    );
  });

  it.each([
    ["| the cut |", "MiniSunDried"],
    ["|||", ""],
    [`${"Long server name ".repeat(8)}-`, `${"Long mission ".repeat(8)}-`],
  ])("produces valid user keys (%s / %s)", (server, mission) => {
    const name = buildDemoFilename(new Date(), server, mission);
    expect(isUserDemoKey(`users/126767979894407168/${name}`)).toBe(true);
  });
});

describe("published demo keys", () => {
  it("preserves existing hash-named user uploads after the naming format changes", () => {
    expect(isUserDemoKey(legacyUserKey)).toBe(true);
    expect(isPublishedDemoKey(legacyUserKey)).toBe(true);
    expect(encodedDemoKey(legacyUserKey)).toBe(legacyUserKey);
    expect(publishedDemoKeyFromUrl(`${base}/${legacyUserKey}`, base)).toBe(
      legacyUserKey,
    );
  });

  it("keeps legacy names and the generated user directory shape", () => {
    expect(isPublishedDemoKey("old demo ?#%.rec")).toBe(true);
    expect(isPublishedDemoKey(userKey)).toBe(true);
    expect(isUserDemoKey(userKey)).toBe(true);
    expect(isUserDemoKey("old.rec")).toBe(false);
    expect(encodedDemoKey("old demo ?#%.rec")).toBe(
      "old%20demo%20%3F%23%25.rec",
    );
    expect(encodedDemoKey(userKey)).toBe(userKey);
  });

  it.each([
    "Community Final (2002).rec",
    "A different naming scheme.REC",
    `${"g".repeat(64)}.rec`,
  ])(
    "accepts safe storage names independently of upload naming: %s",
    (name) => {
      const key = `users/126767979894407168/${name}`;
      expect(isUserDemoKey(key)).toBe(true);
      expect(isPublishedDemoKey(key)).toBe(true);
      expect(
        publishedDemoKeyFromUrl(`${base}/${encodedDemoKey(key)}`, base),
      ).toBe(key);
    },
  );

  it.each([
    "../old.rec",
    "/old.rec",
    "old\\demo.rec",
    "old%2fdemo.rec",
    "old%5cdemo.rec",
    "https://other.example/old.rec",
    "sources/tribesforever/1.rec",
    `users/123/server_20260901T2000_katabatic_aaaaaa.rec`,
    `users/123/${"a".repeat(64)}.rec`,
    "users/126767979894407168/../escape.rec",
    "users/126767979894407168/demo%2fescape.rec",
    "users/126767979894407168/demo%5cescape.rec",
    "users/126767979894407168/demo\\escape.rec",
    "users/126767979894407168/demo:escape.rec",
    "users/126767979894407168/demo\0.rec",
    "users/126767979894407168/demo.json",
    `${legacyUserKey}/other.rec`,
    `${legacyUserKey}\n`,
    `${userKey}/other.rec`,
    `${userKey}\n`,
  ])("rejects paths outside the published contract: %s", (key) => {
    expect(isPublishedDemoKey(key)).toBe(false);
  });

  it("resolves managed nested recordings without accepting encoded separators", () => {
    expect(publishedDemoKeyFromUrl(`${base}/${userKey}`, base)).toBe(userKey);
    expect(publishedDemoKeyFromUrl(`${base}/old%20demo.rec`, base)).toBe(
      "old demo.rec",
    );
    expect(
      publishedDemoKeyFromUrl(`${base}/${encodeURIComponent(userKey)}`, base),
    ).toBeNull();
    expect(publishedDemoKeyFromUrl(`${base}-else/${userKey}`, base)).toBeNull();
    expect(
      publishedDemoKeyFromUrl(`${base}/${userKey}?download=1`, base),
    ).toBeNull();
    expect(
      publishedDemoKeyFromUrl(`https://other.example/demos/${userKey}`, base),
    ).toBeNull();
  });
});
