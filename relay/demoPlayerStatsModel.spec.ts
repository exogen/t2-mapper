import { describe, expect, it } from "vitest";
import { describeLoadout, loadoutKey } from "./demoPlayerStatsModel";

describe("loadout keys", () => {
  it("are canonical JSON with weapons in inventory order", () => {
    const key = loadoutKey({
      armor: "Light",
      pack: "pack_upgrade_energy",
      weapons: [
        "weapon_sniper",
        "custom_gun",
        "weapon_chaingun",
        "weapon_sniper",
      ],
    });
    expect(key).toBe(
      '{"armor":"Light","pack":"pack_upgrade_energy","weapons":["weapon_chaingun","weapon_sniper","custom_gun"]}',
    );
    expect(describeLoadout(key)).toBe(
      "Light · Energy Pack · Chaingun, Laser Rifle, custom_gun",
    );
    expect(
      describeLoadout(loadoutKey({ armor: "Heavy", pack: null, weapons: [] })),
    ).toBe("Heavy · No Pack · No Weapon Seen");
  });
});
