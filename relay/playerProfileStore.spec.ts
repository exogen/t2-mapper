import { type S3Client } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { T2PlayerProfile } from "./accountTypes";
import { DEMO_GUIDS_SUFFIX } from "./demoGuids";
import type { DemoMetadata } from "./demoMetadata";
import {
  DEMO_STATS_VERSION,
  outfitKey,
  type DemoStatsSidecar,
  type PlayerDemoStats,
} from "./demoPlayerStats";
import { DEMO_STATS_SUFFIX } from "./demoStats";
import {
  createDemoPlayerProfileUpdater,
  updatePlayerProfiles,
} from "./playerProfileStore";

const config = {
  endpoint: "https://example.r2.cloudflarestorage.com",
  bucket: "public",
  prefix: "demos/",
  accessKeyId: "key",
  secretAccessKey: "secret",
};

afterEach(() => vi.restoreAllMocks());

function record(filename: string, day: string): DemoMetadata {
  return {
    filename,
    bytes: 1,
    recordedAt: `2026-11-${day}T12:00:00.000Z`,
    server: "Test",
    address: "localhost:28000",
    games: [
      {
        mission: "Test",
        gameType: "Capture the Flag",
        startMs: 0,
        tournament: false,
      },
    ],
    mod: "base",
    recorder: "test",
    durationMs: 1000,
    players: [],
  };
}

function player(overrides: Partial<PlayerDemoStats> = {}): PlayerDemoStats {
  return {
    skins: [],
    killsByWeapon: {},
    weaponsHeldSec: {},
    wornSec: {},
    invLoadouts: {},
    deployInvLoadouts: {},
    ...overrides,
  };
}

function stats(statsByGuid: DemoStatsSidecar["statsByGuid"]): DemoStatsSidecar {
  return { version: DEMO_STATS_VERSION, statsByGuid };
}

function fixture() {
  const index = [
    record("old.rec", "01"),
    record("new.rec", "03"),
    record("other.rec", "02"),
  ];
  const sidecars = new Map<string, unknown>([
    [`old.rec${DEMO_GUIDS_SUFFIX}`, { namesByGuid: { "101": ["Old name"] } }],
    [
      `new.rec${DEMO_GUIDS_SUFFIX}`,
      { namesByGuid: { "101": [], "202": ["Watcher"], "404": ["No stats"] } },
    ],
    [
      `other.rec${DEMO_GUIDS_SUFFIX}`,
      { namesByGuid: { "303": ["Unrelated"] } },
    ],
    [
      `old.rec${DEMO_STATS_SUFFIX}`,
      stats({
        "101": player({
          skins: [{ raceGender: "Human Male", skin: "Old skin" }],
          wornSec: { [outfitKey({ armor: "Heavy", pack: null })]: 100 },
          weaponsHeldSec: { weapon_mortar: 100 },
        }),
      }),
    ],
  ]);
  const current = stats({
    "101": player({
      skins: [{ raceGender: "Human Female", skin: "New skin" }],
      wornSec: {
        [outfitKey({ armor: "Light", pack: "pack_upgrade_energy" })]: 10,
      },
      weaponsHeldSec: { weapon_disc: 10 },
    }),
    "202": player({ skins: [{ raceGender: null, skin: "Spectator" }] }),
  });
  const store = {
    listDemoKeys: vi.fn(async (suffix: string) =>
      [...sidecars.keys()]
        .filter((key) => key.endsWith(suffix))
        .map((key) => key.slice(0, -suffix.length)),
    ),
    read: vi.fn(async (key: string, suffix: string) => {
      const value = sidecars.get(`${key}${suffix}`);
      if (value instanceof Error) throw value;
      return value ?? null;
    }),
  };
  const send = vi.fn(async () => ({
    Body: { transformToString: async () => JSON.stringify(index) },
  }));
  const saveProfile = vi.fn<(profile: T2PlayerProfile) => void>();
  const update = createDemoPlayerProfileUpdater({
    config,
    store,
    saveProfile,
    client: { send } as unknown as S3Client,
  });
  return { index, sidecars, current, store, send, saveProfile, update };
}

describe("automatic demo player profiles", () => {
  it("reaggregates recent history for every appearing GUID and reuses the freshly computed stats", async () => {
    const f = fixture();
    const result = await f.update("new.rec", f.current);
    expect(result).toMatchObject({
      stored: 2,
      skipped: 1,
      failed: 0,
      statsRead: 1,
    });
    expect(f.saveProfile.mock.calls.map(([profile]) => profile.guid)).toEqual([
      "101",
      "202",
    ]);
    expect(f.saveProfile.mock.calls[0][0]).toMatchObject({
      guid: "101",
      bodyType: "female",
      skin: "New skin",
      armor: "Heavy",
      pack: null,
      weapon: "weapon_mortar",
      loadoutSource: "worn",
      demoCount: 2,
      lastSeenAt: Date.parse(f.index[1].recordedAt),
    });
    expect(f.saveProfile.mock.calls[1][0]).toMatchObject({
      guid: "202",
      skin: "Spectator",
      bodyType: null,
    });
    const reads = f.store.read.mock.calls.filter(
      ([, suffix]) => suffix === DEMO_STATS_SUFFIX,
    );
    expect(reads).toEqual([["old.rec", DEMO_STATS_SUFFIX]]);
    expect(f.send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { Bucket: "public", Key: "demos/index.json" },
      }),
      expect.anything(),
    );
  });

  it("reads a fresh index and inventory for the next published recording", async () => {
    const f = fixture();
    await f.update("new.rec", f.current);
    f.sidecars.set(`new.rec${DEMO_STATS_SUFFIX}`, f.current);
    f.index.push(record("latest.rec", "05"));
    f.sidecars.set(`latest.rec${DEMO_GUIDS_SUFFIX}`, {
      namesByGuid: { "101": [] },
    });
    const latest = stats({
      "101": player({
        skins: [{ raceGender: "Bioderm", skin: "Latest skin" }],
      }),
    });
    const counts = await f.update("latest.rec", latest);
    expect(counts.stored).toBe(1);
    expect(f.saveProfile.mock.calls.at(-1)![0]).toMatchObject({
      guid: "101",
      bodyType: "bioderm",
      skin: "Latest skin",
      demoCount: 3,
      lastSeenAt: Date.parse(f.index.at(-1)!.recordedAt),
    });
    expect(f.send).toHaveBeenCalledTimes(2);
    expect(f.store.listDemoKeys).toHaveBeenCalledTimes(2);
  });

  it("waits for the current recording's index and GUID publication before updating", async () => {
    const f = fixture();
    f.index.splice(1, 1);
    await expect(f.update("new.rec", f.current)).rejects.toThrow(/index/);
    expect(f.store.listDemoKeys).not.toHaveBeenCalled();
    f.index.push(record("new.rec", "03"));
    f.sidecars.delete(`new.rec${DEMO_GUIDS_SUFFIX}`);
    await expect(f.update("new.rec", f.current)).rejects.toThrow(
      /GUID sidecar/,
    );
    expect(f.saveProfile).not.toHaveBeenCalled();
  });

  it("preserves affected profiles after stats or database errors so the job can retry", async () => {
    const f = fixture();
    f.sidecars.set(`old.rec${DEMO_STATS_SUFFIX}`, new Error("R2 offline"));
    await expect(f.update("new.rec", f.current)).rejects.toThrow(
      /1 player profiles/,
    );
    expect(f.saveProfile.mock.calls.map(([profile]) => profile.guid)).toEqual([
      "202",
    ]);
    f.sidecars.set(`old.rec${DEMO_STATS_SUFFIX}`, stats({ "101": player() }));
    f.saveProfile.mockReset().mockImplementation(() => {
      throw new Error("SQLite busy");
    });
    await expect(f.update("new.rec", f.current)).rejects.toThrow(
      /2 player profiles/,
    );
    expect(f.saveProfile).toHaveBeenCalledTimes(2);
  });

  it("does not write any profiles when GUID inventory reads fail", async () => {
    const f = fixture();
    f.sidecars.set(`old.rec${DEMO_GUIDS_SUFFIX}`, new Error("Bad JSON"));
    await expect(f.update("new.rec", f.current)).rejects.toThrow(
      /GUID sidecars/,
    );
    expect(f.saveProfile).not.toHaveBeenCalled();
  });

  it("ignores corrupt orphan GUID sidecars outside the published index", async () => {
    const f = fixture();
    f.sidecars.set(
      `orphan.rec${DEMO_GUIDS_SUFFIX}`,
      new Error("Corrupt orphan"),
    );
    await expect(f.update("new.rec", f.current)).resolves.toMatchObject({
      stored: 2,
      failed: 0,
    });
    expect(f.store.read.mock.calls.some(([key]) => key === "orphan.rec")).toBe(
      false,
    );
  });

  it("tolerates historical demos whose GUID sidecars have not been backfilled", async () => {
    const f = fixture();
    f.sidecars.delete(`old.rec${DEMO_GUIDS_SUFFIX}`);
    await expect(f.update("new.rec", f.current)).resolves.toMatchObject({
      stored: 2,
      failed: 0,
    });
    expect(f.saveProfile.mock.calls[0][0]).toMatchObject({
      guid: "101",
      demoCount: 1,
      armor: "Light",
    });
  });

  it("rejects a cancelled job before reading publication data", async () => {
    const f = fixture();
    const abort = new AbortController();
    const reason = new Error("Demo deleted");
    abort.abort(reason);
    await expect(f.update("new.rec", f.current, abort.signal)).rejects.toBe(
      reason,
    );
    expect(f.send).not.toHaveBeenCalled();
    expect(f.store.read).not.toHaveBeenCalled();
    expect(f.saveProfile).not.toHaveBeenCalled();
  });

  it("cancels while stats are loading without treating cancellation as a partial failure", async () => {
    const f = fixture();
    const abort = new AbortController();
    const reason = new Error("Demo deleted");
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reading = new Promise<void>((resolve) => {
      started = resolve;
    });
    const read = f.store.read.getMockImplementation()!;
    f.store.read.mockImplementation(async (key, suffix) => {
      if (key === "old.rec" && suffix === DEMO_STATS_SUFFIX) {
        started();
        await gate;
      }
      return read(key, suffix);
    });
    const pending = f.update("new.rec", f.current, abort.signal);
    const rejected = expect(pending).rejects.toBe(reason);
    await reading;
    abort.abort(reason);
    release();
    await rejected;
    expect(f.store.read).toHaveBeenCalledWith(
      "old.rec",
      DEMO_STATS_SUFFIX,
      abort.signal,
    );
    expect(f.saveProfile).not.toHaveBeenCalled();
  });

  it("stops between SQLite writes when cancellation arrives during a yield", async () => {
    const f = fixture();
    const abort = new AbortController();
    const reason = new Error("Relay stopped");
    f.saveProfile.mockImplementationOnce(() => {
      setImmediate(() => abort.abort(reason));
    });
    await expect(f.update("new.rec", f.current, abort.signal)).rejects.toBe(
      reason,
    );
    expect(f.saveProfile).toHaveBeenCalledOnce();
    expect(f.saveProfile.mock.calls[0][0].guid).toBe("101");
  });

  it("timestamps the input snapshot before the index or sidecars are fetched", async () => {
    const f = fixture();
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    f.send.mockImplementation(async () => {
      now.mockReturnValue(2000);
      return {
        Body: { transformToString: async () => JSON.stringify(f.index) },
      };
    });
    await f.update("new.rec", f.current);
    expect(
      f.saveProfile.mock.calls.map(([profile]) => profile.computedAt),
    ).toEqual([1000, 1000]);
  });

  it("deduplicates an explicit affected-GUID list and leaves unavailable data untouched", async () => {
    const f = fixture();
    const results: unknown[] = [];
    const counts = await updatePlayerProfiles({
      store: f.store,
      index: f.index,
      guids: ["101", "101", "404"],
      guidSidecars: new Map([
        ["new.rec", { namesByGuid: { "101": [], "404": [] } }],
      ]),
      statsSidecars: new Map([["new.rec", f.current]]),
      onResult: (result) => results.push(result),
    });
    expect(counts).toMatchObject({
      planned: 1,
      stored: 0,
      skipped: 1,
      statsRead: 0,
    });
    expect(results).toEqual([
      { guid: "101", result: "planned", demoCount: 1 },
      { guid: "404", result: "skipped", reason: "no-data" },
    ]);
  });
});
