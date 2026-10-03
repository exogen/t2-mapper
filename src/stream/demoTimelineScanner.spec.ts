import { beforeEach, describe, expect, it, vi } from "vitest";

const scan = vi.hoisted(() => ({
  blocks: [] as unknown[],
  demoValues: [] as string[],
  dataBlocks: new Map<number, { data: Record<string, unknown> }>(),
  initialGhosts: [] as unknown[],
  targetEntries: [] as unknown[],
  next: vi.fn(),
}));
vi.mock("t2-demo-parser", async (original) => ({
  ...(await original<typeof import("t2-demo-parser")>()),
  DemoParser: class {
    blockCount = 3;
    async load() {
      return {
        initialBlock: {
          taggedStrings: [],
          demoValues: scan.demoValues,
          dataBlocks: scan.dataBlocks,
          initialGhosts: scan.initialGhosts,
          targetEntries: scan.targetEntries,
        },
      };
    }
    getRegistry() {
      return {
        getEventParser: () => undefined,
        getGhostParser: (classId: number) => ({
          name: (
            {
              3: "BombProjectile",
              13: "GrenadeProjectile",
              19: "LinearProjectile",
              25: "Player",
              30: "RepairProjectile",
              32: "ShockLanceProjectile",
              36: "SniperProjectile",
            } as Record<number, string>
          )[classId],
        }),
      };
    }
    nextBlock() {
      return scan.next();
    }
  },
}));

import { BlockTypeMove, BlockTypePacket } from "t2-demo-parser";
import { scanDemoTimeline } from "./demoTimelineScanner";

beforeEach(() => {
  scan.demoValues = [];
  scan.dataBlocks = new Map();
  scan.initialGhosts = [];
  scan.targetEntries = [];
  scan.next.mockImplementation(() => scan.blocks.shift());
});

describe("generator timeline events", () => {
  const ghost = (
    index: number,
    type: "create" | "update" | "delete",
    parsedData = {},
    classId?: number,
  ) => ({ index, type, parsedData, classId });
  const packet = (ghosts: unknown[] = [], events: unknown[] = []) => ({
    type: BlockTypePacket,
    parsed: { ghosts, events: events.map((parsedData) => ({ parsedData })) },
  });
  const advance = () => ({ type: BlockTypeMove });
  const player = (index = 2, targetId = 60) =>
    ghost(index, "create", { targetId }, 25);
  const beam = (index = 3, sourceObject = 2, repairingObject = 1) =>
    ghost(index, "create", { sourceObject, repairingObject }, 30);
  const destroyMessage = (
    actor = "\x10\bAlice\x0b.TAG\x11",
    name = "Main",
    kind = "Generator",
  ) => ({
    type: "RemoteCommandEvent",
    funcName: "TeamDestroyMessage",
    args: [
      "MsgDestroyed",
      `\x07%1 destroyed an enemy %2 ${kind}!`,
      actor,
      name,
    ],
  });
  beforeEach(() => {
    scan.dataBlocks.set(100, {
      data: {
        dynamicTypeField: 0x40000000,
        shapeName: "station_generator_large.dts",
      },
    });
    scan.dataBlocks.set(101, {
      data: { dynamicTypeField: 0x40000000, shapeName: "solarpanel.dts" },
    });
    scan.dataBlocks.set(102, {
      data: { dynamicTypeField: 0, shapeName: "station_inventory.dts" },
    });
    scan.initialGhosts = [
      ghost(1, "create", { dataBlockId: 100, targetId: 50, damageState: 0 }),
    ];
    scan.targetEntries = [
      {
        targetId: 50,
        name: "Main",
        typeDescription: "Generator",
        sensorGroup: 1,
      },
      { targetId: 60, name: "\x10\bAlice\x0b.TAG\x11", sensorGroup: 1 },
      { targetId: 61, name: "Bob", sensorGroup: 1 },
    ];
  });

  describe("recorder filtering", () => {
    const alice = "\x10\bAlice\x0b.TAG\x11";
    const recorder = (teamId = 1, name = alice) => {
      scan.demoValues = [
        "",
        "1",
        `${name}\t123\t100\t32\t${teamId}\t0\t50\t0`,
        "readplayerinfo",
        "1\t100\tAlice\tStorm\t123",
      ];
    };
    const command = (...args: string[]) => ({
      type: "RemoteCommandEvent",
      funcName: "ServerMessage",
      args,
    });
    const offline = (actor?: string) =>
      packet(
        [ghost(1, "update", { damageState: 2 })],
        actor ? [destroyMessage(actor)] : [],
      );
    const online = () => packet([ghost(1, "update", { damageState: 0 })]);
    const gap = () => Array.from({ length: 40 }, advance);
    const genEvents = (
      events: Awaited<ReturnType<typeof scanDemoTimeline>>["events"],
    ) => events.filter((event) => event.type.startsWith("generator-"));

    beforeEach(() => {
      recorder();
      // TeamDestroyMessage reports an enemy generator.
      scan.targetEntries[0] = {
        targetId: 50,
        name: "Main",
        typeDescription: "Generator",
        sensorGroup: 2,
      };
    });

    it("keeps the recorder's destruction and repair, including shared repairs, plus unattributed transitions", async () => {
      scan.initialGhosts.push(player(), beam(), player(4, 61), beam(5, 4));
      scan.blocks = [
        offline("ALICE.TAG"),
        ...gap(),
        online(),
        ...gap(),
        offline("Bob"),
        ...gap(),
        packet([ghost(3, "delete"), ghost(5, "delete")]),
        online(),
        ...gap(),
        offline(),
      ];
      const result = await scanDemoTimeline(new ArrayBuffer(0), "Alice");
      expect(result.observerPerspective).toBe(false);
      expect(
        genEvents(result.events).map(({ type, actor, isRecorder }) => [
          type,
          actor,
          isRecorder,
        ]),
      ).toEqual([
        ["generator-offline", "ALICE.TAG", true],
        ["generator-online", "Alice.TAG", true],
        ["generator-online", undefined, false],
        ["generator-offline", undefined, false],
      ]);
    });

    it.each([
      ["spectator", "Spectator", 0, undefined, true],
      ["MapGenius observer", "MapGenius", 0, undefined, true],
      ["later joins a team", "Alice", 0, 1, false],
      ["ends as an observer", "Alice", 1, 0, false],
      ["MapGenius-named player", "MapGenius", 1, undefined, false],
    ] as const)(
      "uses the existing perspective rule when the recorder %s",
      async (_scenario, name, startTeam, endTeam, observer) => {
        recorder(startTeam, name === "Alice" ? alice : name);
        scan.blocks = [
          offline(alice),
          ...gap(),
          online(),
          ...gap(),
          offline("Bob"),
          ...(endTeam == null
            ? []
            : [
                packet(
                  [],
                  [
                    command(
                      "MsgClientJoinTeam",
                      "",
                      alice,
                      "",
                      "100",
                      String(endTeam),
                    ),
                  ],
                ),
              ]),
        ];
        const result = await scanDemoTimeline(new ArrayBuffer(0), name);
        expect(result.observerPerspective).toBe(observer);
        expect(genEvents(result.events).map((event) => event.actor)).toEqual(
          observer
            ? ["Alice.TAG", undefined, "Bob"]
            : name === "Alice"
              ? ["Alice.TAG", undefined]
              : [undefined],
        );
      },
    );

    it.each(["MsgClientNameChanged", "MsgClientJoin", "MsgClientJoinTeam"])(
      "matches event-time names across %s and delayed destruction credit",
      async (type) => {
        const renamed = "\x10\bRenamed\x0b.TAG\x11";
        const identity =
          type === "MsgClientNameChanged"
            ? command(type, "", alice, renamed, "100")
            : type === "MsgClientJoin"
              ? command(type, "", renamed, "100")
              : command(type, "", renamed, "Storm", "100", "1");
        scan.blocks = [
          offline(),
          advance(),
          packet([], [identity]),
          // Credit for the earlier event arrives after the recorder's rename.
          packet([], [destroyMessage(alice)]),
          ...gap(),
          online(),
          ...gap(),
          offline(renamed),
          ...gap(),
          online(),
          ...gap(),
          // The old name must not remain an alias for all later events.
          offline(alice),
        ];
        const { events } = await scanDemoTimeline(new ArrayBuffer(0), "Alice");
        expect(genEvents(events).map((event) => event.actor)).toEqual([
          "Alice.TAG",
          undefined,
          "Renamed.TAG",
          undefined,
        ]);
        expect(genEvents(events).map((event) => event.isRecorder)).toEqual([
          true,
          false,
          true,
          false,
        ]);
      },
    );
  });

  describe("projectile attribution fallback", () => {
    const position = { x: 10, y: 20, z: 30 };
    const shot = (index = 4, sourceObject = 2, classId = 13) =>
      ghost(index, "create", { sourceObject }, classId);
    const impact = (index = 4, x = 11, field = "explodePoint") =>
      ghost(index, "update", { [field]: { ...position, x } });
    const offline = (damageLevel: number | undefined = 0.8, damageState = 1) =>
      ghost(1, "update", { damageState, damageLevel });
    beforeEach(() => {
      scan.initialGhosts = [
        ghost(1, "create", {
          dataBlockId: 100,
          targetId: 50,
          position,
          damageState: 0,
          damageLevel: 0.1,
        }),
        player(),
        player(5, 61),
      ];
    });
    const scanOffline = async () =>
      (await scanDemoTimeline(new ArrayBuffer(0), null)).events.filter(
        (e) => e.type === "generator-offline",
      );

    it.each([
      [13, "explodePoint"],
      [19, "explodePosition"],
      [3, "endPoint"],
    ])("matches a nearby class %s explosion", async (classId, field) => {
      scan.blocks = [
        packet([shot(4, 2, classId)]),
        packet([offline(), impact(4, 20, field)]),
      ];
      expect((await scanOffline())[0]).toMatchObject({
        actor: "Alice.TAG",
        actorInferred: true,
        description: "Alice.TAG destroyed the Team 1 generator",
      });
    });

    it.each(["first", "last"])(
      "binds a shooter created %s in the impact packet",
      async (order) => {
        scan.initialGhosts = scan.initialGhosts.slice(0, 1);
        const updates = [shot(), impact(), offline()];
        if (order === "first") updates.unshift(player());
        else updates.push(player());
        scan.blocks = [packet(updates)];
        expect((await scanOffline())[0].actor).toBe("Alice.TAG");
      },
    );

    it.each(["Alice first", "Bob first"])(
      "uses receive order for competing impacts: %s",
      async (order) => {
        const impacts = [impact(), impact(6, 13)];
        if (order === "Bob first") impacts.reverse();
        scan.blocks = [
          packet([shot(), shot(6, 5)]),
          packet([...impacts, offline()]),
        ];
        expect((await scanOffline())[0].actor).toBe(
          order === "Alice first" ? "Bob" : "Alice.TAG",
        );
      },
    );

    it("ignores later distant impacts", async () => {
      scan.blocks = [
        packet([shot(), shot(6, 5)]),
        packet([impact(), impact(6, 25), offline()]),
      ];
      expect((await scanOffline())[0].actor).toBe("Alice.TAG");
    });

    it("uses the latest preceding impact without skipping an unidentified shooter", async () => {
      scan.blocks = [
        packet([shot(), shot(6, 99)]),
        packet([impact()]),
        advance(),
        packet([impact(6, 12)]),
        advance(),
        packet([offline()]),
      ];
      expect((await scanOffline())[0].actor).toBeUndefined();
    });

    it("uses the last nearby impact from preceding packets", async () => {
      scan.blocks = [
        packet([shot(), shot(6, 5)]),
        packet([impact()]),
        advance(),
        packet([impact(6, 12)]),
        advance(),
        packet([offline()]),
      ];
      expect((await scanOffline())[0].actor).toBe("Bob");
    });

    it.each([32, 36])(
      "includes class %s beam hits but not misses",
      async (classId) => {
        const point =
          classId === 32
            ? { end: position, hitObject: true }
            : { endPos: position, truncated: true };
        scan.blocks = [
          packet([shot(4, 2, classId), ghost(4, "update", point), offline()]),
        ];
        expect((await scanOffline())[0].actor).toBe("Alice.TAG");
        scan.blocks = [
          packet([
            shot(4, 2, classId),
            ghost(4, "update", {
              ...point,
              hitObject: false,
              truncated: false,
            }),
            offline(),
          ]),
        ];
        expect((await scanOffline())[0].actor).toBeUndefined();
      },
    );

    it.each([
      "distant",
      "expired impact",
      "later packet",
      "no damage increase",
      "no damage level",
      "unknown source",
    ])("leaves %s evidence unattributed", async (reason) => {
      scan.blocks = [packet([shot(4, reason === "unknown source" ? 99 : 2)])];
      const update =
        reason === "no damage level"
          ? ghost(1, "update", { damageState: 1 })
          : offline(reason === "no damage increase" ? 0.1 : 0.8);
      if (reason === "expired impact")
        scan.blocks.push(
          packet([impact()]),
          ...Array.from({ length: 17 }, advance),
          packet([update]),
        );
      else if (reason === "later packet")
        scan.blocks.push(packet([update]), packet([impact()]));
      else
        scan.blocks.push(
          packet([impact(4, reason === "distant" ? 21 : 11), update]),
        );
      expect((await scanOffline())[0].actor).toBeUndefined();
    });

    it("retains the original shooter across ghost reuse and freezes the event-time name", async () => {
      scan.blocks = [
        packet([shot()]),
        packet([player(2, 61)]),
        packet([impact()]),
        advance(),
        packet(
          [offline()],
          [
            { type: "NetStringEvent", id: 10, value: "Renamed" },
            { type: "TargetInfoEvent", targetId: 60, nameTag: 10 },
          ],
        ),
        packet(
          [],
          [
            { type: "NetStringEvent", id: 11, value: "Later name" },
            { type: "TargetInfoEvent", targetId: 60, nameTag: 11 },
          ],
        ),
      ];
      expect((await scanOffline())[0].actor).toBe("Renamed");
    });

    it.each(["reused projectile", "new mission", "repeated explosion"])(
      "does not inherit old evidence after a %s",
      async (reason) => {
        scan.blocks = [packet([shot()])];
        if (reason === "reused projectile")
          scan.blocks.push(packet([ghost(4, "create", {}, 13)]));
        if (reason === "new mission")
          scan.blocks.push(
            packet([impact()]),
            packet([], [{ type: "GhostingMessageEvent", message: 2 }]),
            packet(scan.initialGhosts),
          );
        if (reason === "repeated explosion")
          scan.blocks.push(
            packet([impact()]),
            ...Array.from({ length: 17 }, advance),
          );
        scan.blocks.push(packet([impact(), offline()]));
        expect((await scanOffline())[0].actor).toBeUndefined();
      },
    );

    it.each(["confirmed", "conflicting"])(
      "defers to %s server credits",
      async (kind) => {
        scan.blocks = [
          packet([shot()]),
          packet([impact(), offline(1, 2)]),
          packet(
            [],
            [
              destroyMessage("Bob"),
              ...(kind === "conflicting" ? [destroyMessage("Carol")] : []),
            ],
          ),
        ];
        const event = (await scanOffline())[0];
        expect(event.actor).toBe(kind === "confirmed" ? "Bob" : undefined);
        expect(event.actorInferred).toBeUndefined();
      },
    );
  });

  it("records offline/online boundaries, not further destruction or full repair", async () => {
    scan.blocks = [
      packet(
        [],
        [
          {
            type: "RemoteCommandEvent",
            funcName: "ServerMessage",
            args: ["MsgCTFAddTeam", "", "1", "\x02Storm", "<At Base>", "0"],
          },
        ],
      ),
      advance(),
      // Ghost-only packets must be scanned too.
      {
        type: BlockTypePacket,
        parsed: { ghosts: [ghost(1, "update", { damageState: 1 })] },
      },
      advance(),
      packet([ghost(1, "update", { damageState: 2 })]),
      packet([ghost(1, "update", { damageState: 1 })]),
      packet([ghost(1, "update", { damageLevel: 0.6 })]),
      advance(),
      packet([ghost(1, "update", { damageState: 0, damageLevel: 0.5 })]),
      packet([ghost(1, "update", { damageState: 0, damageLevel: 0 })]),
    ];
    const { events, observerPerspective } = await scanDemoTimeline(
      new ArrayBuffer(0),
      null,
    );
    expect(observerPerspective).toBe(true);
    expect(events).toEqual([
      {
        timeSec: 0.032,
        type: "generator-offline",
        description: "Storm generator offline",
        isRecorder: false,
        generatorLabel: "Storm generator",
        teamAffinity: "neutral",
      },
      {
        timeSec: 0.096,
        type: "generator-online",
        description: "Storm generator online",
        isRecorder: false,
        generatorLabel: "Storm generator",
        teamAffinity: "neutral",
      },
    ]);
  });

  it("seeds disabled generators without inventing a destruction at recording start", async () => {
    scan.initialGhosts = [
      ghost(1, "create", { dataBlockId: 100, damageState: 2 }),
    ];
    scan.blocks = [
      packet([ghost(1, "update", { damageState: 1 })]),
      advance(),
      packet([ghost(1, "update", { damageState: 0 })]),
    ];
    expect(
      (await scanDemoTimeline(new ArrayBuffer(0), null)).events.map(
        (e) => e.type,
      ),
    ).toEqual(["generator-online"]);
  });

  it("captures event-time generator positions and never inherits a reused ghost's position", async () => {
    scan.initialGhosts = [
      ghost(1, "create", {
        dataBlockId: 100,
        damageState: 0,
        position: { x: 1, y: 2, z: 3 },
      }),
    ];
    scan.blocks = [
      packet([ghost(1, "update", { damageState: 1 })]),
      packet([
        ghost(1, "update", { damageState: 0, position: { x: 4, y: 5, z: 6 } }),
      ]),
      packet([ghost(1, "create", { dataBlockId: 100, damageState: 1 })]),
      packet([ghost(1, "update", { damageState: 0 })]),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
    expect(events.map((event) => event.generator)).toEqual([
      { dataBlockId: 100, position: [1, 2, 3] },
      { dataBlockId: 100, position: [4, 5, 6] },
      undefined,
    ]);
  });

  it("does not treat scope loss, re-entry, or ghost index reuse as generator changes", async () => {
    scan.blocks = [
      packet([ghost(1, "delete")]),
      packet([ghost(1, "create", { dataBlockId: 101, damageState: 2 })]),
      packet([ghost(1, "update", { damageState: 0 })]),
      packet([ghost(1, "create", { dataBlockId: 102, damageState: 0 })]),
      packet([ghost(1, "update", { damageState: 2 })]),
      packet([ghost(2, "create", { dataBlockId: 100, damageState: 0 })]),
      packet([], [{ type: "GhostingMessageEvent", message: 2 }]),
      packet([ghost(2, "update", { damageState: 2 })]),
      packet([ghost(2, "create", { dataBlockId: 100, damageState: 2 })]),
      packet([ghost(2, "update", { damageState: 0 })]),
    ];
    expect(
      (await scanDemoTimeline(new ArrayBuffer(0), null)).events.map(
        (e) => e.type,
      ),
    ).toEqual(["generator-online", "generator-online"]);
  });

  it("learns streamed datablocks and scope-always generators, with sparse target metadata", async () => {
    scan.dataBlocks.clear();
    scan.initialGhosts = [];
    scan.targetEntries = [];
    scan.blocks = [
      packet(
        [],
        [
          {
            type: "SimDataBlockEvent",
            objectId: 103,
            dataBlockData: {
              dynamicTypeField: 0x40002000,
              shapeName: "custom.dts",
            },
          },
          { type: "TargetInfoEvent", targetId: 60, nameTag: 5, sensorGroup: 2 },
          {
            type: "GhostAlwaysObjectEvent",
            ghostIndex: 5,
            classId: 39,
            objectData: { dataBlockId: 103, targetId: 60, damageState: 0 },
          },
        ],
      ),
      packet(
        [],
        [
          // Name can arrive after TargetInfo; later sparse updates keep the team.
          { type: "NetStringEvent", id: 5, value: "Rear" },
          { type: "TargetInfoEvent", targetId: 60, renderFlags: 0 },
        ],
      ),
      advance(),
      packet([ghost(5, "update", { damageState: 2 })]),
      packet([], [{ type: "TargetFreeEvent", targetId: 60 }]),
      advance(),
      packet([ghost(5, "update", { damageState: 0 })]),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
    expect(events.map((e) => e.description)).toEqual([
      "Team 2 generator offline",
      "Generator online",
    ]);
  });

  it.each([false, true])(
    "does not credit a beam first seen in the online packet (reverse=%s)",
    async (reverse) => {
      const updates = [
        ghost(1, "update", { damageState: 0 }),
        beam(),
        player(),
      ];
      scan.blocks = [
        packet([ghost(1, "update", { damageState: 1 })]),
        advance(),
        packet(reverse ? updates.reverse() : updates),
      ];
      const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
      expect(events).toHaveLength(2);
      expect(events[0].actor).toBeUndefined();
      expect(events[1]).toMatchObject({
        timeSec: 0.032,
        type: "generator-online",
      });
      expect(events[1].actor).toBeUndefined();
    },
  );

  it("seeds initial players/beams and counts duplicate beams from one repairer once", async () => {
    scan.initialGhosts.push(beam(), player());
    scan.blocks = [
      packet([ghost(1, "update", { damageState: 1 })]),
      advance(),
      packet([beam(4), ghost(1, "update", { damageState: 0 })]),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      actor: "Alice.TAG",
      raw: { actor: "\x10\bAlice\x0b.TAG\x11" },
      description: "Alice.TAG repaired the Team 1 generator",
    });
  });

  it.each([2, 3])(
    "emits a separate entry for all %i repairers when the generator comes online",
    async (count) => {
      scan.targetEntries.push({ targetId: 62, name: "Carol", sensorGroup: 1 });
      scan.initialGhosts = [
        ghost(1, "create", { dataBlockId: 100, targetId: 50, damageState: 1 }),
      ];
      const repairGhosts = [
        player(),
        beam(),
        player(4, 61),
        beam(5, 4),
        beam(6, 2),
        // A beam on another generator must not receive credit.
        player(7, 62),
        beam(8, 7, 99),
        ...(count === 3 ? [beam(9, 7)] : []),
      ];
      scan.blocks = [
        packet(repairGhosts),
        advance(),
        packet([ghost(1, "update", { damageState: 0 })]),
      ];
      const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
      const actors = ["Alice.TAG", "Bob", ...(count === 3 ? ["Carol"] : [])];
      expect(events).toHaveLength(count);
      expect(events.map((event) => event.actor)).toEqual(actors);
      for (const [i, event] of events.entries()) {
        expect(event).toMatchObject({
          type: "generator-online",
          timeSec: 0.032,
          description: `${actors[i]} repaired the Team 1 generator`,
          raw: { actor: i === 0 ? "\x10\bAlice\x0b.TAG\x11" : actors[i] },
        });
      }
    },
  );

  it("keeps known repairers when other beams have missing sources or names", async () => {
    scan.initialGhosts.push(player(), beam());
    scan.blocks = [
      packet([
        ghost(1, "update", { damageState: 1 }),
        beam(5, 99),
        player(6, 62),
        beam(7, 6),
      ]),
      packet([ghost(1, "update", { damageState: 0 })]),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      actor: "Alice.TAG",
      raw: { actor: "\x10\bAlice\x0b.TAG\x11" },
    });
  });

  it.each([false, true])(
    "rejects handoff participants but keeps stable contributors (reverse=%s)",
    async (reverse) => {
      scan.targetEntries.push({ targetId: 62, name: "Carol", sensorGroup: 1 });
      scan.initialGhosts.push(
        player(),
        beam(),
        player(4, 61),
        player(6, 62),
        beam(7, 6),
      );
      const updates = [
        ghost(1, "update", { damageState: 0 }),
        ghost(3, "delete"),
        beam(5, 4),
      ];
      scan.blocks = [
        packet([ghost(1, "update", { damageState: 1 })]),
        advance(),
        packet(reverse ? updates.reverse() : updates),
      ];
      const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
      expect(events).toHaveLength(2);
      expect(events[1]).toMatchObject({
        actor: "Carol",
        raw: { actor: "Carol" },
      });
    },
  );

  it("rejects a source that changes target identity without being deleted", async () => {
    scan.initialGhosts.push(player(), beam());
    scan.blocks = [
      packet([ghost(1, "update", { damageState: 1 })]),
      packet([
        ghost(2, "update", { targetId: 61 }),
        ghost(1, "update", { damageState: 0 }),
      ]),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
    expect(events[1].actor).toBeUndefined();
  });

  it("does not treat a stopped and restarted beam as continuous repair", async () => {
    scan.initialGhosts.push(player(), beam());
    scan.blocks = [
      packet([ghost(1, "update", { damageState: 1 })]),
      packet([
        ghost(3, "delete"),
        beam(),
        ghost(1, "update", { damageState: 0 }),
      ]),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
    expect(events[1].actor).toBeUndefined();
  });

  it.each([
    "unknown source",
    "deleted beam",
    "reused player",
    "reused generator",
    "new mission",
  ])("does not guess a repairer with %s", async (scenario) => {
    scan.initialGhosts.push(beam(), player());
    const updates =
      scenario === "unknown source"
        ? [ghost(3, "delete"), beam(5, 99)]
        : scenario === "deleted beam"
          ? [ghost(3, "delete")]
          : scenario === "reused player"
            ? [ghost(2, "delete"), player(2, 61)]
            : [
                ghost(1, "create", {
                  dataBlockId: 100,
                  targetId: 50,
                  damageState: 1,
                }),
              ];
    scan.blocks = [
      packet([ghost(1, "update", { damageState: 1 })]),
      ...(scenario === "new mission"
        ? [packet([], [{ type: "GhostingMessageEvent", message: 2 }])]
        : []),
      packet(updates),
      advance(),
      packet([ghost(1, "update", { damageState: 0 })]),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
    expect(events.at(-1)?.type).toBe("generator-online");
    expect(events.at(-1)?.actor).toBeUndefined();
  });

  it("resolves deferred player names and does not borrow a recycled target's name", async () => {
    scan.initialGhosts.push(player(), beam());
    scan.blocks = [
      packet(
        [ghost(1, "update", { damageState: 1 })],
        [{ type: "TargetInfoEvent", targetId: 60, nameTag: 10 }],
      ),
      packet(
        [ghost(1, "update", { damageState: 0 })],
        [{ type: "NetStringEvent", id: 10, value: "Renamed" }],
      ),
      packet([ghost(1, "update", { damageState: 1 })]),
      packet(
        [],
        [
          { type: "TargetFreeEvent", targetId: 60 },
          { type: "TargetInfoEvent", targetId: 60, nameTag: 11 },
          { type: "NetStringEvent", id: 11, value: "Someone else" },
        ],
      ),
      packet([ghost(1, "update", { damageState: 0 })]),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
    expect(events[1]).toMatchObject({
      actor: "Renamed",
      raw: { actor: "Renamed" },
    });
    expect(events[3].actor).toBeUndefined();
  });

  it.each([false, true])(
    "retains resolved target strings when network slots are reused (deferred=%s)",
    async (deferred) => {
      scan.initialGhosts.push(player(), beam());
      const strings = [
        { type: "NetStringEvent", id: 10, value: "Main" },
        { type: "NetStringEvent", id: 11, value: "Generator" },
        { type: "NetStringEvent", id: 12, value: "Alice" },
      ];
      const targets = [
        { type: "TargetInfoEvent", targetId: 50, nameTag: 10, typeTag: 11 },
        { type: "TargetInfoEvent", targetId: 60, nameTag: 12 },
      ];
      scan.blocks = [
        packet(
          [],
          deferred ? [...targets, ...strings] : [...strings, ...targets],
        ),
        packet(
          [],
          [
            { type: "NetStringEvent", id: 10, value: "Backup" },
            { type: "NetStringEvent", id: 11, value: "Turret" },
            { type: "NetStringEvent", id: 12, value: "Bob" },
          ],
        ),
        packet(
          [ghost(1, "update", { damageState: 2 })],
          [destroyMessage("Alice")],
        ),
        packet([ghost(1, "update", { damageState: 0 })]),
        // An explicit target update still adopts the new string-slot contents.
        packet([ghost(1, "update", { damageState: 1 })], targets),
        packet([ghost(1, "update", { damageState: 0 })]),
      ];
      const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
      expect(events[0]).toMatchObject({
        description: "Alice destroyed the Team 1 generator",
        actor: "Alice",
      });
      expect(events[1]).toMatchObject({
        actor: "Alice",
        raw: { actor: "Alice" },
      });
      expect(events[2].description).toBe("Team 1 generator offline");
      expect(events[3]).toMatchObject({ actor: "Bob", raw: { actor: "Bob" } });
    },
  );

  it("clears unresolved target tags without resurrecting them when strings arrive", async () => {
    scan.initialGhosts.push(player(), beam());
    scan.blocks = [
      packet(
        [],
        [
          { type: "TargetInfoEvent", targetId: 50, nameTag: 10 },
          { type: "TargetInfoEvent", targetId: 60, nameTag: 12 },
          { type: "TargetInfoEvent", targetId: 50, nameTag: 0x400 },
          { type: "TargetInfoEvent", targetId: 60, nameTag: 0x400 },
          { type: "NetStringEvent", id: 10, value: "Backup" },
          { type: "NetStringEvent", id: 12, value: "Bob" },
        ],
      ),
      packet([ghost(1, "update", { damageState: 1 })]),
      packet([ghost(1, "update", { damageState: 0 })]),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
    expect(events[0].description).toBe("Team 1 generator offline");
    expect(events[1].actor).toBeUndefined();
  });

  it.each(["before", "after", "same packet"])(
    "associates a named destruction message %s the full destruction",
    async (order) => {
      scan.blocks = [
        packet([ghost(1, "update", { damageState: 1 })]),
        advance(),
      ];
      const fullDestruction = ghost(1, "update", { damageState: 2 });
      if (order === "same packet")
        scan.blocks.push(packet([fullDestruction], [destroyMessage()]));
      else {
        const parts = [
          packet([], [destroyMessage()]),
          advance(),
          packet([fullDestruction]),
        ];
        scan.blocks.push(...(order === "after" ? parts.reverse() : parts));
      }
      const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        timeSec: 0,
        type: "generator-offline",
        actor: "Alice.TAG",
        description: "Alice.TAG destroyed the Team 1 generator",
        raw: { actor: "\x10\bAlice\x0b.TAG\x11" },
      });
    },
  );

  it.each([
    "two generators",
    "two credits",
    "wrong kind",
    "wrong label",
    "no full destruction",
    "late destruction",
    "late message",
    "anonymous",
    "new mission",
  ])("leaves destruction unnamed for %s", async (scenario) => {
    if (scenario === "two generators")
      scan.initialGhosts.push(
        ghost(4, "create", { dataBlockId: 100, targetId: 50, damageState: 0 }),
      );
    scan.blocks = [packet([ghost(1, "update", { damageState: 1 })])];
    if (scenario === "late destruction")
      scan.blocks.push(...Array.from({ length: 40 }, advance));
    if (scenario === "new mission")
      scan.blocks.push(
        packet([], [{ type: "GhostingMessageEvent", message: 2 }]),
      );
    if (scenario !== "no full destruction")
      scan.blocks.push(
        packet([
          ghost(1, "update", { damageState: 2 }),
          ...(scenario === "two generators"
            ? [ghost(4, "update", { damageState: 2 })]
            : []),
        ]),
      );
    if (scenario === "late message")
      scan.blocks.push(...Array.from({ length: 40 }, advance));
    scan.blocks.push(
      packet(
        [],
        [
          destroyMessage(
            scenario === "anonymous" ? "A teammate" : "Alice",
            scenario === "wrong label" ? "Backup" : "Main",
            scenario === "wrong kind" ? "Solar Panel" : "Generator",
          ),
          ...(scenario === "two credits" ? [destroyMessage("Bob")] : []),
        ],
      ),
    );
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => !event.actor)).toBe(true);
  });

  it("does not replace the first destruction's credit during an incomplete repair", async () => {
    scan.blocks = [
      packet(
        [ghost(1, "update", { damageState: 2 })],
        [destroyMessage("Alice")],
      ),
      ...Array.from({ length: 40 }, advance),
      packet([ghost(1, "update", { damageState: 1 })]),
      packet([ghost(1, "update", { damageState: 2 })], [destroyMessage("Bob")]),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
    expect(events).toHaveLength(1);
    expect(events[0].actor).toBe("Alice");
  });

  it("uses the target's team and type to disambiguate identical location labels", async () => {
    scan.demoValues = [
      "",
      "1",
      "Alice\t123\t100\t32\t1\t0\t50\t0",
      "readplayerinfo",
      "1\t100\tAlice\tStorm\t123",
    ];
    scan.targetEntries.push(
      {
        targetId: 51,
        name: "Main",
        typeDescription: "Generator",
        sensorGroup: 2,
      },
      {
        targetId: 52,
        name: "Main",
        typeDescription: "Solar Panel",
        sensorGroup: 2,
      },
    );
    scan.initialGhosts.push(
      ghost(4, "create", { dataBlockId: 100, targetId: 51, damageState: 0 }),
      ghost(5, "create", { dataBlockId: 101, targetId: 52, damageState: 0 }),
    );
    scan.blocks = [
      packet(
        [1, 4, 5].map((id) => ghost(id, "update", { damageState: 2 })),
        [
          destroyMessage("Alice"),
          destroyMessage("Alice", "Main", "Solar Panel"),
        ],
      ),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), "Alice");
    expect(events.map((event) => [event.teamAffinity, event.actor])).toEqual([
      ["friendly", undefined],
      ["enemy", "Alice"],
      ["enemy", "Alice"],
    ]);
  });

  it("retains completed credits when the mission changes", async () => {
    scan.blocks = [
      packet(
        [ghost(1, "update", { damageState: 2 })],
        [destroyMessage("Alice")],
      ),
      packet([], [{ type: "GhostingMessageEvent", message: 2 }]),
      packet([
        ghost(1, "create", { dataBlockId: 100, targetId: 50, damageState: 0 }),
      ]),
      packet([ghost(1, "update", { damageState: 2 })], [destroyMessage("Bob")]),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
    expect(events.map((event) => event.actor)).toEqual(["Alice", "Bob"]);
  });

  it.each(["same label outside scope", "unknown label", "unknown type"])(
    "rejects a superficially unique destruction with %s",
    async (scenario) => {
      scan.targetEntries.push({
        targetId: 51,
        dataBlockRef: 100,
        sensorGroup: 1,
        ...(scenario !== "unknown label" ? { name: "Main" } : {}),
        ...(scenario !== "unknown type"
          ? { typeDescription: "Generator" }
          : {}),
      });
      scan.blocks = [
        packet([ghost(1, "update", { damageState: 2 })], [destroyMessage()]),
      ];
      const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
      expect(events[0].actor).toBeUndefined();
    },
  );

  it("rejects ambiguity introduced between the message and destruction", async () => {
    scan.blocks = [
      packet([], [destroyMessage()]),
      packet(
        [],
        [
          { type: "NetStringEvent", id: 10, value: "Main" },
          { type: "NetStringEvent", id: 11, value: "Generator" },
          {
            type: "TargetInfoEvent",
            targetId: 51,
            nameTag: 10,
            typeTag: 11,
            sensorGroup: 1,
          },
        ],
      ),
      packet([ghost(1, "update", { damageState: 2 })]),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
    expect(events[0].actor).toBeUndefined();
  });

  it.each(["a", "an enemy"])(
    "supports the verified 'destroyed %s' wording and duplicate credits",
    async (article) => {
      const message = destroyMessage();
      message.args[1] = `\x07%1 destroyed ${article} %2 Generator!`;
      scan.blocks = [
        packet([ghost(1, "update", { damageState: 2 })], [message, message]),
      ];
      const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
      expect(events[0].actor).toBe("Alice.TAG");
    },
  );

  it("does not treat an unresolved actor string as a numeric player name", async () => {
    scan.blocks = [
      packet(
        [ghost(1, "update", { damageState: 2 })],
        [destroyMessage("\x0110")],
      ),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
    expect(events[0].actor).toBeUndefined();
  });

  it("filters a global destruction credit for another player, even for the recorder's generator", async () => {
    scan.demoValues = [
      "",
      "1",
      "Recorder\t123\t100\t32\t1\t0\t50\t0",
      "readplayerinfo",
      "1\t100\tRecorder\tStorm\t123",
    ];
    scan.targetEntries.push(
      {
        targetId: 51,
        name: "Main",
        typeDescription: "Generator",
        sensorGroup: 2,
      },
      {
        targetId: 62,
        name: "Enemy",
        typeDescription: "_ClientConnection",
        sensorGroup: 2,
      },
    );
    const message = destroyMessage("Enemy");
    message.funcName = "ServerMessage";
    scan.blocks = [packet([ghost(1, "update", { damageState: 2 })], [message])];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), "Recorder");
    expect(events).toEqual([]);
  });

  it.each(["generator", "solar panel"])(
    "uses the recorder's current tagged name for a private %s bonus",
    async (kind) => {
      scan.demoValues = [
        "",
        "1",
        "Old\t123\t100\t32\t2\t0\t50\t0",
        "readplayerinfo",
        "1\t100\tOld\tInferno\t123",
      ];
      if (kind === "solar panel") {
        scan.targetEntries = [
          {
            targetId: 50,
            name: "Main",
            typeDescription: "Solar Panel",
            sensorGroup: 1,
          },
        ];
        scan.initialGhosts = [
          ghost(1, "create", {
            dataBlockId: 101,
            targetId: 50,
            damageState: 0,
          }),
        ];
      }
      const rawName = "\x10\bRenamed\x0b.TAG\x11";
      scan.blocks = [
        packet(
          [],
          [
            {
              type: "RemoteCommandEvent",
              funcName: "ServerMessage",
              args: ["MsgClientNameChanged", "", "Old", rawName, "100"],
            },
          ],
        ),
        packet(
          [ghost(1, "update", { damageState: 2 })],
          [
            {
              type: "RemoteCommandEvent",
              funcName: "ServerMessage",
              args: [
                kind === "generator" ? "msgGenDes" : "msgSolarDes",
                `You received a %1 point bonus for destroying an enemy ${kind}.`,
                "5",
              ],
            },
          ],
        ),
      ];
      const { events } = await scanDemoTimeline(new ArrayBuffer(0), "Old");
      expect(
        events.find((event) => event.type === "generator-offline"),
      ).toMatchObject({ actor: "Renamed.TAG", raw: { actor: rawName } });
    },
  );

  it.each([
    "ambiguous location",
    "neutral alternative",
    "observer",
    "wrong template",
  ])("does not guess a private bonus target for %s", async (scenario) => {
    scan.demoValues = [
      "",
      "1",
      "Recorder\t123\t100\t32\t2\t0\t50\t0",
      "readplayerinfo",
      "1\t100\tRecorder\tInferno\t123",
    ];
    if (scenario === "ambiguous location" || scenario === "neutral alternative")
      scan.targetEntries.push({
        targetId: 51,
        name: "Backup",
        typeDescription: "Generator",
        sensorGroup: scenario === "neutral alternative" ? 0 : 1,
      });
    if (scenario === "observer") scan.demoValues = [];
    scan.blocks = [
      packet(
        [ghost(1, "update", { damageState: 2 })],
        [
          {
            type: "RemoteCommandEvent",
            funcName: "ServerMessage",
            args: [
              "msgGenDes",
              scenario === "wrong template"
                ? "Teammate %1 destroyed a generator."
                : "You received a %1 point bonus for destroying an enemy generator.",
              "5",
            ],
          },
        ],
      ),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), "Recorder");
    expect(events[0].actor).toBeUndefined();
  });
});

describe("timeline scan failures", () => {
  beforeEach(() => {
    scan.blocks = [
      {
        type: BlockTypePacket,
        parsed: {
          events: [
            {
              parsedData: {
                type: "RemoteCommandEvent",
                funcName: "ServerMessage",
                args: ["MsgMissionStart", "Match started!"],
              },
            },
          ],
        },
      },
      { type: BlockTypeMove },
    ];
    scan.next.mockImplementation(() => scan.blocks.shift());
  });

  it.each([
    { parsed: { parseFault: { stage: "ghost", message: "bad ghost" } } },
    { parseError: "bad block" },
  ])("rejects incomplete events when a later block fails", async (fault) => {
    scan.blocks.push({ type: BlockTypePacket, ...fault });
    const progress = vi.fn();
    await expect(
      scanDemoTimeline(new ArrayBuffer(0), null, progress),
    ).rejects.toThrow(/Demo parsing failed at 0\.032s: bad/);
    expect(progress).not.toHaveBeenCalledWith(1);
  });

  it("propagates unexpected parser exceptions", async () => {
    scan.next.mockImplementation(() => {
      throw new Error("read failed");
    });
    await expect(scanDemoTimeline(new ArrayBuffer(0), null)).rejects.toThrow(
      "read failed",
    );
  });
});

describe("confirmed kickoffs", () => {
  const message = (...args: string[]) => ({
    type: BlockTypePacket,
    parsed: {
      events: [
        {
          parsedData: {
            type: "RemoteCommandEvent",
            funcName: "ServerMessage",
            args,
          },
        },
      ],
    },
  });

  it("skips welcome debrief messages and retains the real game-over announcement", async () => {
    scan.blocks = [
      message("MsgMissionStart", "Match started!"),
      { type: BlockTypeMove },
      message("MsgGameOver"),
      message("MsgGameOver", ""),
      message("MsgGameOver", "\x02<font:Arial:16>  "),
      message("MsgGameOver", "~wvoice/announcer/ann.gameover.wav"),
      message("MsgClearDebrief"),
      message("MsgDebriefResult", "", "CLASSIC"),
      { type: BlockTypeMove },
      message("MsgGameOver", "Match has ended."),
    ];
    const result = await scanDemoTimeline(new ArrayBuffer(0), null);
    expect(
      result.events.map(({ type, timeSec }) => ({ type, timeSec })),
    ).toEqual([
      { type: "match-start", timeSec: 0 },
      { type: "match-end", timeSec: 0.064 },
    ]);
  });
  it("does not turn an abandoned countdown into a match start", async () => {
    scan.blocks = [
      message("MsgMissionStart", "The admin has forced the match to start."),
      { type: BlockTypeMove },
    ];
    const result = await scanDemoTimeline(new ArrayBuffer(0), null);
    expect(result.events.map((event) => event.type)).toEqual([
      "match-countdown",
    ]);
  });
  it("includes real kickoffs on later maps even when a vote bypassed game over", async () => {
    scan.blocks = [
      message("MsgMissionStart", "The admin has forced the match to start."),
      { type: BlockTypeMove },
      message("MsgMissionStart", "Match started!"),
      {
        type: BlockTypePacket,
        parsed: {
          events: [
            { parsedData: { type: "GhostingMessageEvent", message: 2 } },
          ],
        },
      },
      { type: BlockTypeMove },
      message("MsgMissionStart", "Match started!"),
    ];
    const result = await scanDemoTimeline(new ArrayBuffer(0), null);
    expect(result.events.map((event) => [event.type, event.timeSec])).toEqual([
      ["match-start", 0.032],
      ["match-start", 0.064],
    ]);
  });
  it("keeps a recording which began mid-match free of inferred kickoffs", async () => {
    scan.blocks = [
      { type: BlockTypeMove },
      message("MsgClientJoin", "Welcome"),
    ];
    expect((await scanDemoTimeline(new ArrayBuffer(0), null)).events).toEqual(
      [],
    );
  });
});

describe("recorder identity", () => {
  const tagged = "\x10\x0bTAG|\x08Runner\x11";
  function packet(...args: string[]) {
    return {
      type: BlockTypePacket,
      parsed: {
        events: [
          {
            parsedData: {
              type: "RemoteCommandEvent",
              funcName: "ServerMessage",
              args,
            },
          },
        ],
      },
    };
  }
  function kill(killer: string, victim = "Opponent") {
    return packet(
      "MsgLegitKill",
      "",
      victim,
      "",
      "",
      killer,
      "",
      "",
      "",
      "disc",
    );
  }
  beforeEach(() => {
    scan.demoValues = [
      "",
      "1",
      `${tagged}\t123\t100\t32\t1\t0\t50\t0`,
      "readplayerinfo",
      "1\t100\tRunner\tStorm\t123",
    ];
    scan.blocks = [];
  });

  it("matches the recorder's full roster name when metadata omits the tag", async () => {
    scan.blocks = [
      kill(tagged),
      kill("Opponent", tagged),
      kill("OTHER|Runner"),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), "Runner");
    expect(events.map((e) => e.type)).toEqual(["kill", "death"]);
    expect(events.map((e) => e.isRecorder)).toEqual([true, false]);
  });

  it("marks the navigation target across flag, death, rename and global events", async () => {
    scan.blocks = [
      packet("MsgCTFFlagTaken", "", tagged, "Inferno"),
      packet("MsgCTFFlagDropped", "You dropped the %2 flag", "0", "0"),
      packet("MsgCTFFlagReturned", "", tagged, "Storm"),
      packet("MsgCTFFlagCapped", "", tagged, "Inferno"),
      packet("MsgCTFFlagCapped", "", "Opponent", "Storm"),
      packet("MsgSelfKill", "", tagged, "", "", tagged),
      kill("", tagged),
      kill(tagged, tagged),
      packet("MsgClientNameChanged", "", tagged, "New name", "100"),
      packet("MsgCTFFlagCapped", "", tagged, "Inferno"),
      packet("MsgCTFFlagCapped", "", "New name", "Inferno"),
      packet("MsgClientNameChanged", "", "Opponent", "New name", "200"),
      packet("MsgMissionStart", "Match started!"),
      packet("MsgGameOver", "Match has ended."),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), "Runner");
    expect(events.map(({ type, isRecorder }) => [type, isRecorder])).toEqual([
      ["flag-grab", true],
      ["flag-drop", true],
      ["flag-return", true],
      ["flag-cap", true],
      ["flag-cap", false],
      ["death", true],
      ["death", true],
      ["death", true],
      ["rename", true],
      ["flag-cap", false],
      ["flag-cap", true],
      ["rename", false],
      ["match-start", false],
      ["match-end", false],
    ]);
  });

  it.each([
    ["MsgClientNameChanged", "", tagged, "NEW|Runner", "100"],
    ["MsgClientJoin", "", "NEW|Runner", "100"],
    ["MsgClientJoinTeam", "", "NEW|Runner", "Storm", "100", "1"],
  ])(
    "tracks recorder renames and rejoins by client ID (%s)",
    async (...args) => {
      scan.blocks = [packet(...args), kill("NEW|Runner"), kill(tagged)];
      const { events } = await scanDemoTimeline(new ArrayBuffer(0), "Runner");
      expect(events.filter((e) => e.type === "kill")).toHaveLength(1);
      expect(events.find((e) => e.type === "kill")?.killer).toBe("NEW|Runner");
      expect(events.every((e) => e.isRecorder)).toBe(true);
    },
  );
});
