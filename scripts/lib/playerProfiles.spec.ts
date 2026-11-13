import { describe, expect, it } from "vitest";
import type { DemoMetadata } from "../../relay/demoMetadata.js";
import {
  loadoutKey,
  type PlayerDemoStats,
} from "../../relay/demoPlayerStats.js";
import {
  createProfileDemoSelector,
  isCTFDemo,
  summarizePlayerProfile,
  type PlayerProfileDemo,
} from "./playerProfiles.js";

function record(
  filename: string,
  day: number,
  gameType = "Capture the Flag",
): DemoMetadata {
  return {
    filename,
    bytes: 1,
    recordedAt: `2026-11-${String(day).padStart(2, "0")}T12:00:00Z`,
    server: "Test",
    address: "127.0.0.1:28000",
    games: [{ mission: "Test", gameType, startMs: 0, tournament: false }],
    mod: "base",
    recorder: "Test",
    durationMs: 60_000,
    players: [],
  };
}

const appearances = (...filenames: string[]) => {
  const included = new Set(filenames);
  return async (candidates: DemoMetadata[], wanted: number) =>
    candidates
      .filter(({ filename }) => included.has(filename))
      .slice(0, wanted);
};

function statsDemo(
  demo: DemoMetadata,
  stats: Partial<PlayerDemoStats> = {},
): PlayerProfileDemo {
  return {
    record: demo,
    recordedAt: demo.recordedAt,
    stats: {
      skins: [],
      killsByWeapon: {},
      weaponsHeldSec: {},
      wornSec: {},
      invLoadouts: {},
      deployInvLoadouts: {},
      ...stats,
    },
  };
}

describe("profile demo selection", () => {
  it("recognizes CTF variants but excludes LCTF and unrelated game types", () => {
    for (const gameType of ["Capture the Flag", "capture the flag (classic)"])
      expect(isCTFDemo(record("ctf", 1, gameType))).toBe(true);
    for (const gameType of [
      "LakRabbit Capture the Flag",
      "LCTF",
      "Capture the Flagship",
      "Team Deathmatch",
    ])
      expect(isCTFDemo(record("other", 1, gameType))).toBe(false);
  });

  it("prefers the newest CTF appearances while last seen includes newer other games", async () => {
    const oldCTF = record("old-ctf", 1);
    const recentCTF = record("recent-ctf", 5);
    const unseen = record("unseen", 12);
    const newestLCTF = record("latest-lctf", 10, "LakRabbit Capture the Flag");
    const middleCTF = record("middle-ctf", 3);
    const index = [oldCTF, unseen, newestLCTF, recentCTF, middleCTF];
    const original = [...index];
    const select = createProfileDemoSelector(index);
    const selected = await select(
      appearances("old-ctf", "recent-ctf", "middle-ctf", "latest-lctf"),
      2,
    );
    expect(selected.selected).toEqual([recentCTF, middleCTF]);
    expect(selected.lastSeen).toBe(newestLCTF);
    expect(index).toEqual(original);
    // The sorted metadata can be reused for a player with different appearances.
    expect(await select(appearances("old-ctf"), 2)).toEqual({
      selected: [oldCTF],
      lastSeen: oldCTF,
    });
  });

  it("fills a CTF shortfall with the newest other appearances, then sorts the sample", async () => {
    const ctf = record("ctf", 2);
    const oldOther = record("old-other", 1, "Team Deathmatch");
    const newest = record("lctf", 6, "LCTF");
    const other = record("duel", 4, "Duel");
    const select = createProfileDemoSelector([oldOther, other, ctf, newest]);
    expect(
      await select(appearances("ctf", "old-other", "lctf", "duel"), 3),
    ).toEqual({ selected: [newest, other, ctf], lastSeen: newest });
  });

  it("returns no selection for a GUID that appears in no published demo", async () => {
    const select = createProfileDemoSelector([record("published", 1)]);
    expect(await select(appearances("orphan-sidecar"), 10)).toEqual({
      selected: [],
      lastSeen: undefined,
    });
  });
});

describe("profile finalization", () => {
  it("preserves the caller's selected order for tied timestamps", () => {
    const first = statsDemo(record("z-selected-first", 5), {
      skins: [{ raceGender: "Human Female", skin: "Selected First" }],
      invLoadouts: {
        [loadoutKey({ armor: "Light", pack: null, weapons: [] })]: 1,
      },
    });
    const second = statsDemo(record("a-selected-second", 5), {
      skins: [{ raceGender: "Bioderm", skin: "Selected Second" }],
      invLoadouts: {
        [loadoutKey({ armor: "Heavy", pack: null, weapons: [] })]: 1,
      },
    });
    const result = summarizePlayerProfile(
      "123",
      [first, second],
      first.record,
      1,
      1234,
    )!;
    expect(result.used).toEqual([first.record]);
    expect(result.profile).toMatchObject({
      bodyType: "female",
      skin: "Selected First",
      armor: "Light",
      demoCount: 1,
    });
  });

  it("sorts asynchronously collected stats before sampling and retains skins from older demos", () => {
    const light = loadoutKey({
      armor: "Light",
      pack: "pack_upgrade_energy",
      weapons: ["weapon_disc"],
    });
    const heavy = loadoutKey({
      armor: "Heavy",
      pack: "pack_upgrade_shield",
      weapons: ["weapon_mortar"],
    });
    const newest = statsDemo(record("newest", 5), {
      skins: [{ raceGender: "Human Female", skin: "base" }],
      invLoadouts: { [light]: 3 },
      killsByWeapon: { disc: 2 },
    });
    const middle = statsDemo(record("middle", 3), {
      invLoadouts: { [heavy]: 2 },
      killsByWeapon: { mortar: 1 },
    });
    const oldest = statsDemo(record("oldest", 1), {
      skins: [{ raceGender: "Human Male", skin: "Older Custom" }],
      invLoadouts: { [heavy]: 20 },
      killsByWeapon: { mortar: 100 },
    });
    const demos = [oldest, newest, middle];
    const lastSeen = record("newer-other", 8, "LCTF");
    const result = summarizePlayerProfile("123", demos, lastSeen, 4, 1234)!;
    expect(result.used).toEqual([newest.record, middle.record]);
    expect(result.profile).toEqual({
      guid: "123",
      bodyType: "female",
      skin: "Older Custom",
      armor: "Light",
      pack: "pack_upgrade_energy",
      weapon: "weapon_disc",
      loadoutSource: "inv",
      suitUps: 5,
      demoCount: 2,
      lastSeenAt: Date.parse(lastSeen.recordedAt),
      computedAt: 1234,
    });
    expect(result.stats.kills.get("mortar")).toBe(1);
    expect(demos).toEqual([oldest, newest, middle]);
  });

  it("keeps the partial skin data left by a player seen only as a spectator", () => {
    const demo = statsDemo(record("spectator", 1), {
      skins: [{ raceGender: null, skin: "Watcher" }],
    });
    expect(
      summarizePlayerProfile("456", [demo], undefined, 100, 10),
    ).toMatchObject({
      used: [demo.record],
      profile: {
        guid: "456",
        skin: "Watcher",
        bodyType: null,
        armor: null,
        weapon: null,
        demoCount: 1,
        lastSeenAt: null,
        computedAt: 10,
      },
    });
  });

  it("keeps an existing empty-looking stats entry but skips absence of stats", () => {
    const demo = statsDemo(record("empty", 1));
    expect(
      summarizePlayerProfile("456", [demo], demo.record, 100, 10),
    ).toMatchObject({
      profile: { guid: "456", demoCount: 1, skin: null, armor: null },
    });
    expect(summarizePlayerProfile("456", [], demo.record, 100, 10)).toBeNull();
  });
});
