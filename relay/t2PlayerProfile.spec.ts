import { describe, expect, it } from "vitest";
import { loadoutKey, outfitKey, type PlayerDemoStats } from "./demoPlayerStats";
import {
  buildT2PlayerProfile,
  summarizePlayerStats,
  type PlayerDemo,
} from "./t2PlayerProfile";

function demo(recordedAt: string, stats: Partial<PlayerDemoStats>): PlayerDemo {
  return {
    recordedAt,
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

const HEAVY_SHIELD = loadoutKey({
  armor: "Heavy",
  pack: "pack_upgrade_shield",
  weapons: ["weapon_disc", "weapon_mortar"],
});
const MEDIUM_REPAIR = loadoutKey({
  armor: "Medium",
  pack: "pack_upgrade_repair",
  weapons: ["weapon_disc"],
});
const LIGHT_ENERGY = outfitKey({ armor: "Light", pack: "pack_upgrade_energy" });

const build = (demos: PlayerDemo[], suitUps = 100) =>
  buildT2PlayerProfile("12345", summarizePlayerStats(demos, suitUps), {
    lastSeenAt: 7,
    computedAt: 8,
  });

describe("representative T2 profiles", () => {
  it("prefers full-station loadouts and the top weapon kill", () => {
    expect(
      build([
        demo("2026-11-02", {
          skins: [{ raceGender: "Human Female", skin: "Philthy Birds" }],
          // Turret, mine and hand grenade kills are no held weapon.
          killsByWeapon: {
            "spike turret": 9,
            "hand grenade": 8,
            mortar: 3,
            disc: 2,
          },
          invLoadouts: { [HEAVY_SHIELD]: 2 },
          deployInvLoadouts: { [MEDIUM_REPAIR]: 5 },
          wornSec: { [LIGHT_ENERGY]: 900 },
        }),
        demo("2026-11-01", {
          killsByWeapon: { disc: 2 },
          invLoadouts: { [HEAVY_SHIELD]: 1, [MEDIUM_REPAIR]: 1 },
        }),
      ]),
    ).toEqual({
      guid: "12345",
      bodyType: "female",
      skin: "Philthy Birds",
      armor: "Heavy",
      pack: "pack_upgrade_shield",
      weapon: "weapon_disc",
      loadoutSource: "inv",
      suitUps: 9,
      demoCount: 2,
      lastSeenAt: 7,
      computedAt: 8,
    });
  });

  it("falls back to deployable loadouts, then to what was worn", () => {
    expect(
      build([
        demo("2026-11-01", { deployInvLoadouts: { [MEDIUM_REPAIR]: 1 } }),
      ]),
    ).toMatchObject({
      armor: "Medium",
      pack: "pack_upgrade_repair",
      loadoutSource: "deployInv",
    });
    // A duel or LCTF player never buys anything.
    expect(
      build([
        demo("2026-11-01", {
          skins: [{ raceGender: "Bioderm", skin: "base" }],
          wornSec: {
            [LIGHT_ENERGY]: 600,
            [outfitKey({ armor: "Light", pack: null })]: 30,
          },
          weaponsHeldSec: {
            weapon_targeting: 900,
            weapon_repair: 800,
            weapon_disc: 500,
            weapon_chaingun: 100,
          },
        }),
      ]),
    ).toMatchObject({
      bodyType: "bioderm",
      skin: "base",
      armor: "Light",
      pack: "pack_upgrade_energy",
      weapon: "weapon_disc",
      loadoutSource: "worn",
      suitUps: 0,
    });
  });

  it("keeps what little a spectator leaves", () => {
    expect(
      build([
        demo("2026-11-01", { skins: [{ raceGender: null, skin: "Watcher" }] }),
      ]),
    ).toMatchObject({
      bodyType: null,
      skin: "Watcher",
      armor: null,
      pack: null,
      weapon: null,
      loadoutSource: null,
    });
  });

  it("samples the newest demos up to the suit-up count, but reads skins from all", () => {
    const summary = summarizePlayerStats(
      [
        demo("2026-11-03", {
          skins: [{ raceGender: null, skin: "Chrome" }],
          invLoadouts: { [HEAVY_SHIELD]: 3 },
        }),
        demo("2026-11-02", {
          skins: [{ raceGender: "Human Male", skin: "Chrome" }],
          invLoadouts: { [MEDIUM_REPAIR]: 2 },
        }),
        demo("2026-11-01", {
          skins: [{ raceGender: "Human Male", skin: "Orange" }],
          invLoadouts: { [MEDIUM_REPAIR]: 9 },
        }),
      ],
      4,
    );
    expect(summary.sampledDemos).toBe(2);
    expect(summary.suitUps).toBe(5);
    expect(Object.fromEntries(summary.invLoadouts)).toEqual({
      [HEAVY_SHIELD]: 3,
      [MEDIUM_REPAIR]: 2,
    });
    // A skin known from client info takes the race/gender seen in play.
    expect(summary.looks).toEqual([
      { raceGender: "Human Male", skin: "Chrome", recordedAt: "2026-11-03" },
      { raceGender: "Human Male", skin: "Orange", recordedAt: "2026-11-01" },
    ]);
  });
});
