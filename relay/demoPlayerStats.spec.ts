import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type {
  PlayerRosterEntry,
  ServerMessageEvent,
  StreamEntity,
  StreamSnapshot,
} from "../src/stream/types";
import {
  DEMO_STATS_VERSION,
  DemoPlayerStatsTracker,
  describeLoadout,
  loadStationPurchaseSequences,
  loadoutKey,
  outfitKey,
} from "./demoPlayerStats";

const ALICE = "12345";
const BOB = "67890";
/** Activate1 indices, as read from the stock shapes. */
const SEQUENCES = new Map([
  ["station_inv_human", 0],
  ["deploy_inventory", 1],
]);

function station(
  dataBlock: string,
  sequence: number | null,
  position: [number, number, number] = [0, 0, 0],
): StreamEntity {
  return {
    id: dataBlock,
    type: "StaticShape",
    dataBlock,
    position,
    threads:
      sequence == null
        ? []
        : [{ index: 2, sequence, state: 0, forward: true, atEnd: false }],
  } as unknown as StreamEntity;
}

function player(
  fields: Partial<StreamEntity> & { weapon?: string; pack?: string } = {},
): StreamEntity {
  const { weapon, pack, ...rest } = fields;
  const imageSlots = [];
  if (weapon) imageSlots[0] = { shapeName: weapon };
  if (pack) imageSlots[2] = { shapeName: pack };
  return {
    id: "alice",
    type: "Player",
    targetId: 10,
    targetGeneration: 0,
    dataBlock: "light_male.dts",
    position: [0, 0, 0.3],
    skinPrefName: "Chrome",
    imageSlots,
    ...rest,
  } as StreamEntity;
}

function rosterEntry(
  guid: string,
  name: string,
  clientId: number,
  targetId?: number,
): PlayerRosterEntry {
  return {
    clientId,
    guid,
    name,
    rawName: name,
    targetId,
    teamId: 1,
    score: 0,
    ping: 0,
    packetLoss: 0,
  };
}

const ROSTER = [
  rosterEntry(ALICE, "Alice", 1, 10),
  rosterEntry(BOB, "Bob", 2, 11),
];

/** Builds snapshots a quarter-second apart. */
function timeline() {
  let timeSec = 0;
  return (
    entities: StreamEntity[],
    {
      live = true,
      endedAtSec,
      events = [] as ServerMessageEvent[],
      roster = ROSTER,
    }: {
      live?: boolean;
      /** The match ended at this time, before the snapshot. */
      endedAtSec?: number;
      events?: ServerMessageEvent[];
      roster?: PlayerRosterEntry[];
    } = {},
  ): StreamSnapshot =>
    ({
      timeSec: (timeSec += 0.25),
      matchStarted: live || endedAtSec != null,
      matchEnded: endedAtSec != null,
      matchEndedAtSec: endedAtSec ?? null,
      entities,
      serverEvents: events,
      playerRoster: roster,
    }) as unknown as StreamSnapshot;
}

function kill(
  id: number,
  killer: string,
  victim: string,
  weapon: string,
  msgType = "MsgLegitKill",
): ServerMessageEvent {
  return {
    id,
    timeSec: id,
    msgType,
    args: ["", "", victim, "", "", killer, "", "", "", weapon],
  };
}

const HEAVY_SHIELD = loadoutKey({
  armor: "Heavy",
  pack: "pack_upgrade_shield",
  weapons: ["weapon_disc", "weapon_chaingun"],
});

describe("DemoPlayerStatsTracker", () => {
  it("reads a full-station purchase as they step off, then the weapons they hold", () => {
    const tracker = new DemoPlayerStatsTracker(SEQUENCES);
    const at = timeline();
    const inv = (sequence: number | null) =>
      station("station_inv_human.dts", sequence);
    // A bystander beside the station still holds a weapon.
    const bob = player({
      id: "bob",
      targetId: 11,
      position: [0.5, 0, 0.3],
      weapon: "weapon_disc.dts",
      skinPrefName: "base",
    });
    tracker.step(at([inv(2), bob, player()]));
    tracker.step(
      at([
        inv(0),
        bob,
        player({
          dataBlock: "heavy_male.dts",
          pack: "pack_upgrade_shield.dts",
          cloakLevel: 0.5,
        }),
      ]),
    );
    const suited = {
      dataBlock: "heavy_male.dts",
      pack: "pack_upgrade_shield.dts",
      position: [10, 0, 0.3] as [number, number, number],
    };
    tracker.step(at([inv(null), player(suited)]));
    for (const weapon of [
      "weapon_disc.dts",
      "weapon_disc.dts",
      "weapon_targeting.dts",
      "weapon_chaingun.dts",
    ])
      tracker.step(at([inv(null), player({ ...suited, weapon })]));
    tracker.step(at([inv(null), player({ ...suited, damageState: 1 })]));
    const { version, statsByGuid } = tracker.finish();
    expect(version).toBe(DEMO_STATS_VERSION);
    expect(statsByGuid[ALICE]).toEqual({
      skins: [{ raceGender: "Human Male", skin: "Chrome" }],
      killsByWeapon: {},
      weaponsHeldSec: {
        weapon_disc: 0.5,
        weapon_targeting: 0.25,
        weapon_chaingun: 0.25,
      },
      wornSec: {
        [outfitKey({ armor: "Heavy", pack: "pack_upgrade_shield" })]: 1.5,
      },
      invLoadouts: { [HEAVY_SHIELD]: 1 },
      deployInvLoadouts: {},
    });
    expect(statsByGuid[BOB].invLoadouts).toEqual({});
    expect(statsByGuid[BOB].skins).toEqual([
      { raceGender: "Human Male", skin: "base" },
    ]);
  });

  it("confirms deployable purchases by Activate1 and keeps a loadout through an aborted visit", () => {
    const tracker = new DemoPlayerStatsTracker(SEQUENCES);
    const at = timeline();
    const deployed = (sequence: number | null) =>
      station("deploy_inventory.dts", sequence);
    const near = (x: number, weapon?: string) =>
      player({
        dataBlock: "medium_female.dts",
        pack: "pack_upgrade_repair.dts",
        position: [x, 0, 0.1],
        weapon,
      });
    tracker.step(at([deployed(1), near(1.4)]));
    tracker.step(at([deployed(null), near(6, "weapon_disc.dts")]));
    // Knocked off during the 0.03 s Activate: nothing was bought.
    tracker.step(at([deployed(4), near(1.4)]));
    tracker.step(at([deployed(null), near(6, "weapon_mortar.dts")]));
    expect(tracker.finish().statsByGuid[ALICE].deployInvLoadouts).toEqual({
      [loadoutKey({
        armor: "Medium",
        pack: "pack_upgrade_repair",
        weapons: ["weapon_mortar", "weapon_disc"],
      })]: 1,
    });
  });

  it("counts nothing but skins outside the live match", () => {
    const tracker = new DemoPlayerStatsTracker(SEQUENCES);
    const at = timeline();
    const inv = (sequence: number | null) =>
      station("station_inv_human.dts", sequence);
    // Warmup: a purchase, a blaster, and a kill all go uncounted.
    tracker.step(at([inv(0), player()], { live: false }));
    tracker.step(
      at(
        [
          inv(null),
          player({ position: [10, 0, 0], weapon: "weapon_energy.dts" }),
        ],
        { live: false, events: [kill(1, "Alice", "Bob", "blaster")] },
      ),
    );
    // Live: a purchase whose life runs into the end of the match.
    tracker.step(at([inv(0), player()]));
    tracker.step(
      at(
        [
          inv(null),
          player({ position: [10, 0, 0], weapon: "weapon_disc.dts" }),
        ],
        {
          events: [kill(2, "Alice", "Bob", "disc")],
        },
      ),
    );
    // End-of-match screen: the life is closed; nothing more is added.
    tracker.step(
      at(
        [
          inv(null),
          player({ position: [10, 0, 0], weapon: "weapon_mortar.dts" }),
        ],
        { live: false, events: [kill(3, "Alice", "Bob", "mortar")] },
      ),
    );
    const alice = tracker.finish().statsByGuid[ALICE];
    expect(alice.killsByWeapon).toEqual({ disc: 1 });
    expect(alice.weaponsHeldSec).toEqual({ weapon_disc: 0.25 });
    expect(alice.invLoadouts).toEqual({
      [loadoutKey({ armor: "Light", pack: null, weapons: ["weapon_disc"] })]: 1,
    });
    expect(alice.skins).toEqual([{ raceGender: "Human Male", skin: "Chrome" }]);
  });

  it("counts a kill that shares a step with the end of the match", () => {
    const tracker = new DemoPlayerStatsTracker(SEQUENCES);
    const at = timeline();
    tracker.step(at([]));
    tracker.step(
      at([], {
        endedAtSec: 0.4,
        events: [
          { ...kill(1, "Alice", "Bob", "disc"), timeSec: 0.3 },
          { ...kill(2, "Alice", "Bob", "mortar"), timeSec: 0.45 },
        ],
      }),
    );
    expect(tracker.finish().statsByGuid[ALICE].killsByWeapon).toEqual({
      disc: 1,
    });
  });

  it("keeps a connection's skins after its target id goes to another player", () => {
    const tracker = new DemoPlayerStatsTracker(SEQUENCES);
    const at = timeline();
    tracker.step(at([player({ skinPrefName: "Chrome" })]));
    // Same target id and generation, now on Bob's roster entry.
    tracker.step(
      at([player({ id: "bob", skinPrefName: "Orange" })], {
        roster: [rosterEntry(BOB, "Bob", 2, 10)],
      }),
    );
    const { statsByGuid } = tracker.finish();
    expect(statsByGuid[ALICE].skins).toEqual([
      { raceGender: "Human Male", skin: "Chrome" },
    ]);
    expect(statsByGuid[BOB].skins).toEqual([
      { raceGender: "Human Male", skin: "Orange" },
    ]);
  });

  it("ignores spawn loadouts and follows the living body past its corpse", () => {
    const tracker = new DemoPlayerStatsTracker(SEQUENCES);
    const at = timeline();
    const inv = (sequence: number | null) =>
      station("station_inv_human.dts", sequence);
    tracker.step(at([inv(0), player({ dataBlock: "heavy_male.dts" })]));
    const corpse = player({
      dataBlock: "heavy_male.dts",
      position: [20, 0, 0],
      damageState: 1,
    });
    const respawned = player({
      id: "alice-2",
      position: [30, 0, 0],
      weapon: "weapon_energy.dts",
    });
    tracker.step(at([inv(null), corpse]));
    tracker.step(at([inv(null), corpse, respawned]));
    tracker.step(at([inv(null), respawned, corpse]));
    const alice = tracker.finish().statsByGuid[ALICE];
    expect(alice.invLoadouts).toEqual({});
    expect(alice.weaponsHeldSec).toEqual({ weapon_energy: 0.5 });
  });

  it("reads race and gender from the armor datablock, and skins from client info", () => {
    // HeavyFemaleHumanArmor differs from the male one only in its water
    // breath sound, PlayerData.sounds[19].
    const breathing = (sound: number) => {
      const sounds: number[] = Array(20).fill(0);
      sounds[19] = sound;
      return { sounds };
    };
    const datablocks = new Map<number, Record<string, unknown>>([
      [7, breathing(99)],
      [99, { filename: "fx/armor/breath_fem_uw.wav" }],
      [8, breathing(98)],
      [98, { filename: "fx/armor/breath_uw.wav" }],
    ]);
    const skinPrefs = new Map([
      [10, "Orange"],
      [11, "Chrome"],
      [12, "Watcher"],
    ]);
    const tracker = new DemoPlayerStatsTracker(SEQUENCES, {
      getDataBlockData: (id) => datablocks.get(id),
      getTargetSkinPref: (id) => skinPrefs.get(id),
    });
    const at = timeline();
    tracker.step(
      at(
        [
          player({
            dataBlock: "heavy_male.dts",
            dataBlockId: 7,
            skinPrefName: "Orange",
          }),
          player({
            id: "bob",
            targetId: 11,
            dataBlock: "heavy_male.dts",
            dataBlockId: 8,
            skinPrefName: "Chrome",
          }),
        ],
        // Carol watches without ever being seen in play.
        { roster: [...ROSTER, rosterEntry("555", "Carol", 3, 12)] },
      ),
    );
    const { statsByGuid } = tracker.finish();
    expect(statsByGuid[ALICE].skins).toEqual([
      { raceGender: "Human Female", skin: "Orange" },
    ]);
    expect(statsByGuid[BOB].skins).toEqual([
      { raceGender: "Human Male", skin: "Chrome" },
    ]);
    expect(statsByGuid["555"].skins).toEqual([
      { raceGender: null, skin: "Watcher" },
    ]);
  });

  it("keeps each reconnect's race, gender and skin, newest first", () => {
    const tracker = new DemoPlayerStatsTracker(SEQUENCES);
    const at = timeline();
    tracker.step(at([player({ skinPrefName: "Old" })]));
    tracker.step(
      at(
        [
          player({
            id: "again",
            targetId: 20,
            dataBlock: "bioderm_light.dts",
            skinPrefName: "Orange",
          }),
        ],
        { roster: [rosterEntry(ALICE, "Alice", 4, 20)] },
      ),
    );
    expect(tracker.finish().statsByGuid[ALICE].skins).toEqual([
      { raceGender: "Bioderm", skin: "Orange" },
      { raceGender: "Human Male", skin: "Old" },
    ]);
  });

  it("matches players whose roster entry lacks a target id by name", () => {
    const tracker = new DemoPlayerStatsTracker(SEQUENCES);
    const at = timeline();
    const roster = [rosterEntry(ALICE, "Alice", 1)];
    tracker.step(
      at(
        [player({ targetId: 77, playerName: "Alice", skinPrefName: "Orange" })],
        {
          roster,
        },
      ),
    );
    tracker.step(at([player({ targetId: 78, playerName: "Bob" })], { roster }));
    expect(tracker.finish().statsByGuid).toEqual({
      [ALICE]: expect.objectContaining({
        skins: [{ raceGender: "Human Male", skin: "Orange" }],
      }),
    });
  });

  it("records what players wear without any inventory station", () => {
    const tracker = new DemoPlayerStatsTracker(SEQUENCES);
    const at = timeline();
    const duelist = player({ pack: "pack_upgrade_energy.dts" });
    for (let i = 0; i < 5; i++) tracker.step(at([duelist]));
    tracker.step(at([player({ ...duelist, damageState: 1 })]));
    const alice = tracker.finish().statsByGuid[ALICE];
    expect(alice.wornSec).toEqual({
      [outfitKey({ armor: "Light", pack: "pack_upgrade_energy" })]: 1,
    });
    expect(alice.invLoadouts).toEqual({});
  });

  it("credits each grenade kill to the grenade that exploded by the victim", () => {
    const tracker = new DemoPlayerStatsTracker(SEQUENCES);
    const at = timeline();
    const alice = (weapon: string) =>
      player({ ghostIndex: 5, weapon: `${weapon}.dts` });
    const bob = player({
      id: "bob",
      targetId: 11,
      playerName: "Bob",
      position: [10, 0, 0],
    });
    const grenade = (
      id: string,
      position: [number, number, number],
      sourceGhostIndex?: number,
      damageState = 0,
    ) =>
      ({
        id,
        type: sourceGhostIndex == null ? "Item" : "Projectile",
        dataBlock:
          sourceGhostIndex == null ? "grenade.dts" : "grenade_projectile.dts",
        sourceGhostIndex,
        position,
        damageState,
      }) as unknown as StreamEntity;
    const killed = (id: number) => ({
      events: [kill(id, "Alice", "Bob", "grenade")],
    });
    // Alice's shell bursts beside Bob while she holds her disc.
    tracker.step(
      at([alice("weapon_disc"), bob, grenade("shell", [12, 0, 0], 5)]),
    );
    tracker.step(at([alice("weapon_disc"), bob], killed(1)));
    // A thrown grenade bursts beside Bob, though Alice holds the launcher
    // and has a shell in flight far away. Thrown grenades turn Destroyed as
    // they burst and are deleted later, which is no second burst.
    const far = grenade("far", [200, 0, 0], 5);
    const held = alice("weapon_grenade_launcher");
    tracker.step(at([held, bob, far, grenade("hand", [11, 0, 0])]));
    tracker.step(
      at(
        [held, bob, far, grenade("hand", [11, 0, 0], undefined, 1)],
        killed(2),
      ),
    );
    tracker.step(at([held, bob, far]));
    for (let i = 0; i < 5; i++) tracker.step(at([alice("weapon_disc"), bob]));
    // Only someone else's shell burst nearby; Alice holds her disc.
    tracker.step(
      at([alice("weapon_disc"), bob, grenade("other", [10, 1, 0], 9)]),
    );
    tracker.step(at([alice("weapon_disc"), bob], killed(3)));
    // Nothing seen bursting: the launcher in hand decides.
    tracker.step(at([alice("weapon_grenade_launcher"), bob], killed(4)));
    expect(tracker.finish().statsByGuid[ALICE].killsByWeapon).toEqual({
      "grenade launcher": 2,
      "hand grenade": 2,
    });
  });

  it("keeps a life going while only an older corpse is in view", () => {
    const tracker = new DemoPlayerStatsTracker(SEQUENCES);
    const at = timeline();
    const inv = (sequence: number | null) =>
      station("station_inv_human.dts", sequence);
    const corpse = player({ id: "old", position: [50, 0, 0], damageState: 1 });
    const body = (weapon?: string) =>
      player({
        id: "new",
        position: [10, 0, 0.3],
        weapon,
        dataBlock: "heavy_male.dts",
      });
    tracker.step(at([inv(0), corpse, player({ id: "new" })]));
    tracker.step(at([inv(null), corpse, body("weapon_disc.dts")]));
    // The living body leaves view; its old corpse is still there.
    tracker.step(at([inv(null), corpse]));
    tracker.step(at([inv(null), corpse]));
    tracker.step(at([inv(null), corpse, body("weapon_chaingun.dts")]));
    tracker.step(at([inv(null), player({ id: "new", damageState: 1 })]));
    expect(tracker.finish().statsByGuid[ALICE].invLoadouts).toEqual({
      [loadoutKey({
        armor: "Heavy",
        pack: null,
        weapons: ["weapon_disc", "weapon_chaingun"],
      })]: 1,
    });
  });

  it("finds a grenade victim by the body that just died, not an older corpse", () => {
    const tracker = new DemoPlayerStatsTracker(SEQUENCES);
    const at = timeline();
    const alice = player({
      ghostIndex: 5,
      weapon: "weapon_grenade_launcher.dts",
    });
    const bob = (damageState: number) =>
      player({
        id: "bob-now",
        targetId: 11,
        playerName: "Bob",
        position: [10, 0, 0],
        damageState,
      });
    const oldCorpse = player({
      id: "bob-before",
      targetId: 11,
      playerName: "Bob",
      position: [500, 0, 0],
      damageState: 1,
    });
    const thrown = (damageState: number) =>
      ({
        id: "hand",
        type: "Item",
        dataBlock: "grenade.dts",
        position: [11, 0, 0],
        damageState,
      }) as unknown as StreamEntity;
    tracker.step(at([alice, bob(0), oldCorpse, thrown(0)]));
    tracker.step(
      at([alice, bob(1), oldCorpse, thrown(1)], {
        events: [kill(1, "Alice", "Bob", "grenade")],
      }),
    );
    expect(tracker.finish().statsByGuid[ALICE].killsByWeapon).toEqual({
      "hand grenade": 1,
    });
  });

  it("does not take a grenade pickup that vanished for a burst", () => {
    const tracker = new DemoPlayerStatsTracker(SEQUENCES);
    const at = timeline();
    const alice = player({
      ghostIndex: 5,
      weapon: "weapon_grenade_launcher.dts",
    });
    const bob = player({
      id: "bob",
      targetId: 11,
      playerName: "Bob",
      position: [10, 0, 0],
    });
    const pickup = {
      id: "pickup",
      type: "Item",
      dataBlock: "grenade.dts",
      position: [11, 0, 0],
    } as unknown as StreamEntity;
    tracker.step(at([alice, bob, pickup]));
    // Picked up as Bob dies to a shell that burst unseen.
    tracker.step(
      at([alice, bob], { events: [kill(1, "Alice", "Bob", "grenade")] }),
    );
    expect(tracker.finish().statsByGuid[ALICE].killsByWeapon).toEqual({
      "grenade launcher": 1,
    });
  });

  it("counts each kill once by damage type, skipping teamkills and self-kills", () => {
    const tracker = new DemoPlayerStatsTracker(SEQUENCES);
    const at = timeline();
    const events = [
      kill(1, "Alice", "Bob", "disc"),
      kill(2, "Alice", "Bob", "spike turret"),
      kill(3, "Alice", "Bob", "disc", "MsgTeamKill"),
      kill(4, "Alice", "Alice", "mortar", "MsgSelfKill"),
      kill(5, "Bob", "Alice", "chaingun"),
    ];
    tracker.step(at([], { events }));
    tracker.step(
      at([], { events: [...events, kill(6, "Alice", "Bob", "disc")] }),
    );
    const { statsByGuid } = tracker.finish();
    expect(statsByGuid[ALICE].killsByWeapon).toEqual({
      disc: 2,
      "spike turret": 1,
    });
    expect(statsByGuid[BOB].killsByWeapon).toEqual({ chaingun: 1 });
  });
});

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

describe("loadStationPurchaseSequences", () => {
  it("refuses to run without every station shape", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "station-shapes-"));
    try {
      const manifest = path.join(dir, "manifest.json");
      await fs.writeFile(manifest, JSON.stringify({ resources: {} }));
      await expect(
        loadStationPurchaseSequences("docs/base", manifest),
      ).rejects.toThrow(/not in the manifest/);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("reads each stock station's Activate1 index from its shape", async () => {
    expect(
      Object.fromEntries(
        await loadStationPurchaseSequences("docs/base", "src/manifest.json"),
      ),
    ).toEqual({
      station_inv_human: 0,
      station_inv_mpb: 0,
      deploy_inventory: 1,
    });
  });
});
