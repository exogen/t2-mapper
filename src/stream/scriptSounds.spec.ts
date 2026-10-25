import { describe, expect, it } from "vitest";
import type { ParsedData } from "t2-demo-parser";
import { LiveStreamAdapter } from "./liveStreaming";
import type { RelayClient } from "./relayClient";
import {
  findAudioProfileId,
  normalizeAudioFile,
  SCRIPT_SOUNDS,
  ScriptSoundPairing,
  ScriptSoundTracker,
} from "./scriptSounds";
import type { StreamEntity, StreamSnapshot } from "./types";

class LaserStream extends LiveStreamAdapter {
  constructor() {
    super({} as RelayClient, { mode: "watch" });
    this.registry = {
      getGhostParser: (classId: number) => ({
        name: classId === 2 ? "Player" : "SniperProjectile",
      }),
      getEventParser: () => undefined,
    };
  }
  override getDataBlockData() {
    return {};
  }
  create(index: number, classId: number, parsedData: ParsedData) {
    this.processGhostUpdate({ index, classId, type: "create", parsedData });
  }
  entity(index: number) {
    return this.buildEntityList().find((e) => e.ghostIndex === index)!;
  }
}

const at = (
  timeSec: number,
  x = 0,
): { timeSec: number; position: [number, number, number] } => ({
  timeSec,
  position: [x, 0, 0],
});

const TICK = 0.032;
const datablocks = new Map<number, ParsedData>([
  [1, { shapeName: "grenade.dts", explosion: 90 }],
  [2, { shapeName: "grenade.dts" }],
  [3, { shapeName: "camera.dts", sticky: true }],
  [4, { shapeName: "flag.dts", isInvincible: true }],
  [5, { shapeName: "weapon_disc.dts" }],
  [6, { shapeName: "mine.dts", explosion: 91 }],
  [7, { shapeName: "grenade_flash.dts", explosion: 92 }],
]);
const getDb = (id: number) => datablocks.get(id);

function snapshot(
  timeSec: number,
  entities: Partial<StreamEntity>[],
): StreamSnapshot {
  return { timeSec, entities } as StreamSnapshot;
}

const player = (
  id: string,
  position: [number, number, number],
  extra: Partial<StreamEntity> = {},
): Partial<StreamEntity> => ({ id, type: "Player", position, ...extra });

const item = (
  id: string,
  dataBlockId: number,
  position: [number, number, number],
  extra: Partial<StreamEntity> = {},
): Partial<StreamEntity> => ({
  id,
  type: "Item",
  className: "Item",
  dataBlockId,
  position,
  velocity: [0, 20, 4],
  ...extra,
});

/**
 * A tracker that has seen `before`, then the sounds `after` adds.
 */
function sounds(
  before: Partial<StreamEntity>[],
  after: Partial<StreamEntity>[],
  tracker = new ScriptSoundTracker(),
) {
  tracker.update(snapshot(10, before), getDb);
  return tracker
    .update(snapshot(10 + TICK, after), getDb)
    .map(({ file, position }) => ({ file, position }));
}

describe("script sounds", () => {
  it("knows a script's sound by its file", () => {
    expect(normalizeAudioFile("fx/weapons/SNIPER_FIRE.wav")).toBe(
      SCRIPT_SOUNDS.laserFire,
    );
    const blocks = new Map<number, ParsedData>([
      [12, { filename: "fx/weapons/sniper_miss" }],
      [398, { filename: "fx/weapons/sniper_fire.wav", description: 20 }],
    ]);
    expect(
      findAudioProfileId((id) => blocks.get(id), SCRIPT_SOUNDS.laserFire),
    ).toBe(398);
    expect(findAudioProfileId(() => undefined, SCRIPT_SOUNDS.laserFire)).toBe(
      undefined,
    );
  });

  it("names a laser shot's shooter, as Tribes2.exe's beam does", () => {
    const stream = new LaserStream();
    stream.create(2, 2, { dataBlockId: 1, position: { x: 0, y: 0, z: 100 } });
    stream.create(5, 3, {
      dataBlockId: 2,
      initialPosition: { x: 1, y: 2, z: 101.5 },
      endPos: { x: 1, y: 300, z: 101.5 },
      sourceObject: 2,
      sourceSlot: 0,
    });
    // An unscoped shooter is sent as no source.
    stream.create(6, 3, {
      dataBlockId: 2,
      initialPosition: { x: 500, y: 2, z: 101.5 },
      endPos: { x: 500, y: 300, z: 101.5 },
    });
    expect(stream.entity(5).linkSourceId).toBe(stream.entity(2).id);
    expect(stream.entity(5).beamStart).toEqual([1, 2, 101.5]);
    expect(stream.entity(6).linkSourceId).toBe(undefined);
  });

  it("fires a player's laser at the muzzle, even an unnamed one's", () => {
    const shooter = player("p", [0, 0, 100]);
    const turret = player("t", [9, 9, 100], { type: "Deployable" });
    const laser = (id: string, linkSourceId?: string, x = 1) => ({
      id,
      className: "SniperProjectile",
      type: "Ghost",
      linkSourceId,
      beamStart: [x, 0, 101.5] as [number, number, number],
    });
    expect(
      sounds(
        [shooter, turret],
        [
          shooter,
          turret,
          laser("a", "p"),
          laser("b", undefined, 50),
          laser("c", "t"),
        ],
      ),
    ).toEqual([
      { file: SCRIPT_SOUNDS.laserFire, position: [1, 0, 101.5] },
      { file: SCRIPT_SOUNDS.laserFire, position: [50, 0, 101.5] },
    ]);
  });

  it("tells grenade throws from item throws by their explosion", () => {
    const thrower = player("p", [0, 0, 100]);
    const atHand: [number, number, number] = [0.5, 0, 101.2];
    const thrown = [
      item("grenade", 1, atHand),
      item("ammo", 2, atHand),
      item("camera", 3, atHand),
      item("flag", 4, atHand),
      item("disc", 5, atHand),
      item("modded", 7, atHand),
    ];
    // The camera grenade only sticks, so it passes for an item.
    expect(sounds([thrower], [thrower, ...thrown]).map((s) => s.file)).toEqual([
      SCRIPT_SOUNDS.grenadeThrow,
      SCRIPT_SOUNDS.itemThrow,
      SCRIPT_SOUNDS.itemThrow,
      SCRIPT_SOUNDS.itemThrow,
      SCRIPT_SOUNDS.grenadeThrow,
    ]);
  });

  it("ignores items that appear without a throw", () => {
    const thrower = player("p", [0, 0, 100]);
    expect(
      sounds(
        [thrower],
        [
          thrower,
          item("far", 5, [30, 0, 101]),
          item("respawn", 5, [0.5, 0, 101], { isStaticItem: true }),
          item("resting", 5, [0.5, 0, 101], { velocity: [0, 0, 0] }),
        ],
      ),
    ).toEqual([]);
  });

  it("hears a throw whose item arrived late at its thrower", () => {
    const thrower = player("p", [0, 0, 100]);
    // The item's first ghost update came after it flew 6 m.
    const away = item("late", 1, [0, 6, 101.2], { velocity: [0, 20, 2] });
    const toward = item("back", 1, [0, 6, 101.2], { velocity: [0, -20, 2] });
    expect(sounds([thrower], [thrower, away])).toEqual([
      { file: SCRIPT_SOUNDS.grenadeThrow, position: [0, 0, 101.2] },
    ]);
    expect(sounds([thrower], [thrower, toward])).toEqual([]);
  });

  it("hears a pickup at the player who touched the item", () => {
    const picker = player("p", [0, 0, 100]);
    const disc = item("disc", 5, [0.8, 0, 100.5], { velocity: [0, 0, 0] });
    expect(sounds([picker, disc], [picker])).toEqual([
      { file: SCRIPT_SOUNDS.itemPickup, position: [0, 0, 100] },
    ]);
  });

  it("hears no pickup when the scripts play none", () => {
    const at: [number, number, number] = [0.8, 0, 100.5];
    const still = { velocity: [0, 0, 0] as [number, number, number] };
    const picker = player("p", [0, 0, 100]);
    for (const [before, after] of [
      // Flags have their own pickup; grenades and mines never get picked up.
      [[picker, item("flag", 4, at, still)], [picker]],
      [[picker, item("grenade", 1, at, still)], [picker]],
      // The dead and the mounted can't pick anything up.
      [
        [
          player("dead", [0, 0, 100], { damageState: 1 }),
          item("disc", 5, at, still),
        ],
        [player("dead", [0, 0, 100], { damageState: 1 })],
      ],
      [
        [
          player("rider", [0, 0, 100], { mountObjectId: "v" }),
          item("disc", 5, at, still),
        ],
        [player("rider", [0, 0, 100], { mountObjectId: "v" })],
      ],
      // RepairPatch::onCollision plays its own sound through a slot.
      [
        [picker, item("patch", 5, at, still)],
        [
          player("p", [0, 0, 100], {
            soundSlots: [
              { index: 0, playing: true, revision: 1, changedAtSec: 10 + TICK },
            ],
          }),
        ],
      ],
    ] as Partial<StreamEntity>[][][])
      expect(sounds(before, after)).toEqual([]);
  });

  it("hears no pickup for an item that popped", () => {
    const tracker = new ScriptSoundTracker();
    const picker = player("p", [0, 0, 100]);
    const fading = (fadeVal: number) =>
      item("disc", 5, [0.8, 0, 100.5], { velocity: [0, 0, 0], fadeVal });
    tracker.update(snapshot(10, [picker, fading(1)]), getDb);
    tracker.update(snapshot(10.5, [picker, fading(0.5)]), getDb);
    tracker.update(snapshot(10.9, [picker, fading(0.1)]), getDb);
    expect(tracker.update(snapshot(11, [picker]), getDb)).toEqual([]);
  });

  it("arms a mine when its deploy thread starts", () => {
    const mine = item("mine", 6, [5, 5, 100], { velocity: [0, 0, 0] });
    const deploying = {
      ...mine,
      threads: [
        { index: 0, sequence: 1, state: 0, forward: true, atEnd: false },
      ],
    };
    expect(sounds([mine], [deploying])).toEqual([
      { file: SCRIPT_SOUNDS.mineDeploy, position: [5, 5, 100] },
    ]);
  });

  it("places a deployable where its pack's carrier looks", () => {
    // Facing +y (Torque yaw 0).
    const facing = (
      id: string,
      x: number,
      shapeName?: string,
    ): Partial<StreamEntity> =>
      player(id, [x, 0, 100], {
        rotation: [0, 0, 0, 1],
        imageSlots: shapeName
          ? ([
              undefined,
              undefined,
              { shapeName },
            ] as StreamEntity["imageSlots"])
          : undefined,
      });
    const deployable = (
      id: string,
      x: number,
      y = 3,
      className = "StaticShape",
    ): Partial<StreamEntity> => ({
      id,
      type: "Deployable",
      className,
      position: [x, y, 100],
    });
    // A station appears before its pack comes off, a tick later.
    const tracker = new ScriptSoundTracker();
    tracker.update(
      snapshot(10, [facing("p", 0, "pack_deploy_inventory.dts")]),
      getDb,
    );
    expect(
      tracker.update(
        snapshot(10 + TICK, [
          facing("p", 0, "pack_deploy_inventory.dts"),
          deployable("station", 0),
          // The beacon a station brings is no deploy of its own.
          deployable("beacon", 0, 3, "BeaconObject"),
        ]),
        getDb,
      ),
    ).toEqual([
      {
        file: SCRIPT_SOUNDS.stationDeploy,
        timeSec: 10 + TICK,
        position: [0, 3, 100],
      },
    ]);
    // A sensor pack can stay on for the next sensor.
    const carrier = facing("q", 40, "pack_deploy_sensor_motion.dts");
    expect(sounds([carrier], [carrier, deployable("sensor", 40)])).toEqual([
      { file: SCRIPT_SOUNDS.motionSensorDeploy, position: [40, 3, 100] },
    ]);
    const gunner = facing("t", 80, "pack_deploy_turreto.dts");
    expect(
      sounds([gunner], [gunner, deployable("turret", 80, 3, "Turret")]),
    ).toEqual([{ file: SCRIPT_SOUNDS.turretDeploy, position: [80, 3, 100] }]);
    // Out of the carrier's eye ray, or no pack at all, it isn't theirs.
    expect(sounds([carrier], [carrier, deployable("behind", 40, -3)])).toEqual(
      [],
    );
    expect(sounds([carrier], [carrier, deployable("far", 40, 20)])).toEqual([]);
    expect(
      sounds([facing("r", 0)], [facing("r", 0), deployable("other", 0)]),
    ).toEqual([]);
  });

  it("places a deployable that appears after its pack comes off", () => {
    const tracker = new ScriptSoundTracker();
    const withPack = player("p", [0, 0, 100], {
      rotation: [0, 0, 0, 1],
      imageSlots: [
        undefined,
        undefined,
        { shapeName: "pack_deploy_inventory.dts" },
      ] as StreamEntity["imageSlots"],
    });
    const without = { ...withPack, imageSlots: undefined };
    const station = {
      id: "s",
      type: "Deployable",
      className: "StaticShape",
      position: [0, 4, 100] as [number, number, number],
    };
    tracker.update(snapshot(10, [withPack]), getDb);
    expect(tracker.update(snapshot(10 + TICK, [without]), getDb)).toEqual([]);
    expect(
      tracker
        .update(snapshot(10 + 2 * TICK, [without, station]), getDb)
        .map((s) => s.file),
    ).toEqual([SCRIPT_SOUNDS.stationDeploy]);
  });

  it("stays quiet about what a seek skipped", () => {
    const tracker = new ScriptSoundTracker();
    const thrower = player("p", [0, 0, 100]);
    const grenade = (id: string) => item(id, 1, [0.5, 0, 101.2]);
    tracker.update(snapshot(10, [thrower]), getDb);
    expect(
      tracker.update(snapshot(100, [thrower, grenade("a")]), getDb),
    ).toEqual([]);
    expect(
      tracker.update(
        snapshot(100 + TICK, [thrower, grenade("a"), grenade("b")]),
        getDb,
      ),
    ).toHaveLength(1);
    expect(
      tracker.update(snapshot(50, [thrower, grenade("c")]), getDb),
    ).toEqual([]);
  });

  it("restores only what the recording lacks, once per cause", () => {
    const tracker = new ScriptSoundTracker();
    const thrower = player("p", [0, 0, 100]);
    const atHand: [number, number, number] = [0.5, 0, 101.2];
    tracker.update(snapshot(10, [thrower]), getDb);
    // Two identical grenade sounds in one tick, for two grenades.
    const recorded = { timeSec: 10 + TICK, position: atHand };
    expect(tracker.playRecorded("fx/weapons/throw_grenade.WAV", recorded)).toBe(
      true,
    );
    expect(tracker.playRecorded("fx/weapons/throw_grenade.wav", recorded)).toBe(
      true,
    );
    expect(tracker.playRecorded("fx/misc/other.wav", recorded)).toBe(true);
    expect(
      tracker.update(
        snapshot(10 + TICK, [
          thrower,
          item("a", 1, atHand),
          item("b", 1, atHand),
          item("c", 1, atHand),
        ]),
        getDb,
      ),
    ).toHaveLength(1);
  });

  it("restores only shots the recording has no sound for", () => {
    const pairing = new ScriptSoundPairing();
    // The recorded sound comes first, in the same packet as the shot.
    expect(pairing.playRecorded(at(10, 100))).toBe(true);
    expect(pairing.restore(at(10, 102.5))).toBe(false);
    // The next shot, beyond the recorder's 60 m, has none.
    expect(pairing.restore(at(11, 100))).toBe(true);
    // A shot far from the recorded sound gets its own.
    expect(pairing.playRecorded(at(12, 100))).toBe(true);
    expect(pairing.restore(at(12, 400))).toBe(true);
  });

  it("pairs each recorded sound with its nearest cause", () => {
    const pairing = new ScriptSoundPairing();
    expect(pairing.playRecorded(at(10, 100))).toBe(true);
    expect(pairing.playRecorded(at(10, 106))).toBe(true);
    expect(pairing.restore(at(10, 105))).toBe(false);
    expect(pairing.restore(at(10, 101))).toBe(false);
    expect(pairing.restore(at(10, 103))).toBe(true);
  });

  it("drops a recorded sound that arrives after its shot was restored", () => {
    const pairing = new ScriptSoundPairing();
    expect(pairing.restore(at(10, 100))).toBe(true);
    expect(pairing.playRecorded(at(10.16, 100))).toBe(false);
    expect(pairing.playRecorded(at(10.2, 100))).toBe(true);
  });

  it("matches a cause whose ghost trails its sound, but not a stale one", () => {
    const pairing = new ScriptSoundPairing();
    expect(pairing.playRecorded(at(10, 100))).toBe(true);
    expect(pairing.restore(at(10.6, 100))).toBe(false);
    expect(pairing.playRecorded(at(20, 100))).toBe(true);
    expect(pairing.restore(at(21.5, 100))).toBe(true);
  });

  it("forgets sounds across a seek", () => {
    const pairing = new ScriptSoundPairing();
    expect(pairing.playRecorded(at(30, 100))).toBe(true);
    // Back before the recorded sound, then forward to it again.
    expect(pairing.restore(at(5, 100))).toBe(true);
    expect(pairing.restore(at(30, 100))).toBe(true);
    pairing.reset();
    expect(pairing.playRecorded(at(30, 100))).toBe(true);
    expect(pairing.restore(at(30, 100))).toBe(false);
  });
});
