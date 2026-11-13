import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { T2ProfileView } from "../../relay/accountTypes";
import {
  type ProfileAppearanceInput,
  profileArmorShape,
  resolveProfileAppearance,
} from "./profileAppearance";

vi.mock("../loaders", () => ({
  getUrlForPath: (path: string) => path,
}));

const profile: T2ProfileView = {
  armor: "Light",
  bodyType: "male",
  skin: "base",
  pack: "pack_upgrade_energy",
  weapon: "weapon_disc",
  loadoutSource: "inv",
  lastSeenAt: null,
};

beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (path: string) =>
        new Response(
          await readFile(
            new URL(
              `../../docs/base/@vl2/scripts.vl2/${path}`,
              import.meta.url,
            ),
            "utf8",
          ),
        ),
    ),
  );
});
afterAll(() => vi.unstubAllGlobals());

describe("profile armor shapes", () => {
  it("resolves every body type and preserves the shared heavy human shape", () => {
    for (const armor of ["Light", "Medium", "Heavy"]) {
      expect(profileArmorShape({ armor, bodyType: "male" })).toBe(
        `${armor.toLowerCase()}_male.dts`,
      );
      expect(profileArmorShape({ armor, bodyType: "female" })).toBe(
        `${armor.toLowerCase()}_${armor === "Heavy" ? "male" : "female"}.dts`,
      );
      expect(profileArmorShape({ armor, bodyType: "bioderm" })).toBe(
        `bioderm_${armor.toLowerCase()}.dts`,
      );
    }
  });

  it("uses a default for sparse profiles and retains a custom armor shape", () => {
    expect(profileArmorShape({ armor: null, bodyType: null })).toBe(
      "light_male.dts",
    );
    expect(
      profileArmorShape({ armor: "custom_armor", bodyType: "female" }),
    ).toBe("custom_armor.dts");
  });
});

describe("stock profile appearance", () => {
  it("accepts appearance data without account statistics or timestamps", async () => {
    const appearance: ProfileAppearanceInput = {
      armor: "Light",
      bodyType: "female",
      skin: "base",
      pack: null,
      weapon: null,
    };
    expect((await resolveProfileAppearance(appearance)).shapeName).toBe(
      "light_female.dts",
    );
  });

  it("reads constructor aliases and mounted-image settings from the shipped scripts", async () => {
    const appearance = await resolveProfileAppearance(profile);
    expect(appearance.shapeName).toBe("light_male.dts");
    expect(appearance.sequences).toContain("light_male_root.dsq root");
    expect(appearance.sequences).toContain("light_male_lookde.dsq look");
    expect(appearance.emap).toBe(true);
    expect(appearance.armAction).toBe("look");
    expect(appearance.images).toEqual([
      {
        shapeName: "weapon_disc.dts",
        mountPoint: 0,
        emap: true,
        mountOffset: undefined,
        sequence: "DiscSpin",
        activationSequence: "Activated",
      },
      {
        shapeName: "pack_upgrade_energy.dts",
        mountPoint: 1,
        emap: false,
        mountOffset: undefined,
        sequence: "activation",
        activationSequence: undefined,
      },
    ]);
  });

  it("uses weapon-specific arm poses and inherited bioderm armor settings", async () => {
    const sniper = await resolveProfileAppearance({
      ...profile,
      bodyType: "bioderm",
      weapon: "weapon_sniper",
      pack: null,
    });
    expect(sniper.shapeName).toBe("bioderm_light.dts");
    expect(sniper.emap).toBe(true);
    expect(sniper.armAction).toBe("looksn");
    expect(sniper.images).toHaveLength(1);
    const heavy = await resolveProfileAppearance({
      ...profile,
      armor: "Heavy",
      bodyType: "bioderm",
      weapon: "weapon_missile",
      pack: "pack_deploy_inventory",
    });
    expect(heavy.emap).toBe(false);
    expect(heavy.armAction).toBe("lookms");
    expect(heavy.images[0].activationSequence).toBe("Activate");
    expect(heavy.images[0].sequence).toBeUndefined();
    expect(heavy.images[1].mountPoint).toBe(1);
  });

  it("can have a representative heavy sniper loadout without a matching aim thread", async () => {
    const appearance = await resolveProfileAppearance({
      ...profile,
      armor: "Heavy",
      bodyType: "female",
      weapon: "weapon_sniper",
      pack: null,
    });
    expect(appearance.shapeName).toBe("heavy_male.dts");
    expect(appearance.armAction).toBe("looksn");
    expect(appearance.sequences).toContain("heavy_male_lookde.dsq look");
    expect(
      appearance.sequences.some((entry) => entry.endsWith(" looksn")),
    ).toBe(false);
  });

  it.each([
    "pack_upgrade_shield",
    "pack_upgrade_cloaking",
    "pack_upgrade_sensorjammer",
    "pack_upgrade_repair",
  ])("does not activate an idle %s", async (pack) => {
    const appearance = await resolveProfileAppearance({
      ...profile,
      weapon: null,
      pack,
    });
    expect(appearance.images[0].activationSequence).toBeUndefined();
    expect(appearance.images[0].sequence).toBeUndefined();
  });

  it("keeps the character when optional image metadata is unavailable", async () => {
    const normalFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation((input, init) =>
      String(input).endsWith("/blaster.cs")
        ? Promise.resolve(new Response("", { status: 503 }))
        : normalFetch(input, init),
    );
    try {
      const appearance = await resolveProfileAppearance({
        ...profile,
        weapon: "weapon_energy",
        pack: null,
      });
      expect(appearance.shapeName).toBe("light_male.dts");
      expect(appearance.images[0].shapeName).toBe("weapon_energy.dts");
      expect(appearance.images[0].mountPoint).toBe(0);
    } finally {
      vi.mocked(fetch).mockImplementation(normalFetch);
    }
  });

  it("has no attachments for null fields and preserves unknown mod image shapes", async () => {
    expect(
      (await resolveProfileAppearance({ ...profile, pack: null, weapon: null }))
        .images,
    ).toEqual([]);
    const custom = await resolveProfileAppearance({
      ...profile,
      pack: "custom_pack",
      weapon: "custom_weapon",
    });
    expect(
      custom.images.map((image) => [image.shapeName, image.mountPoint]),
    ).toEqual([
      ["custom_weapon.dts", 0],
      ["custom_pack.dts", 1],
    ]);
  });
});
