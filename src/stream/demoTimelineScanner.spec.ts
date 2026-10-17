import { beforeEach, describe, expect, it, vi } from "vitest";

const scan = vi.hoisted(() => ({
  blocks: [] as unknown[],
  demoValues: [] as string[],
  taggedStrings: new Map<number, string>(),
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
          taggedStrings: scan.taggedStrings,
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

import { BlockTypeMove, BlockTypePacket, DemoParser } from "t2-demo-parser";
import {
  scanDemoTimeline,
  scanDemoTimelineParser,
} from "./demoTimelineScanner";

beforeEach(() => {
  scan.demoValues = [];
  scan.taggedStrings = new Map();
  scan.dataBlocks = new Map();
  scan.initialGhosts = [];
  scan.targetEntries = [];
  scan.next.mockImplementation(() => scan.blocks.shift());
});

describe("server metadata discovered during the timeline scan", () => {
  const message = (args: string[], funcName = "ServerMessage") => ({
    type: BlockTypePacket,
    parsed: {
      events: [{ parsedData: { type: "RemoteCommandEvent", funcName, args } }],
    },
  });
  const dropInfo = (server: string) =>
    message(["MsgMissionDropInfo", "", "Surreal", "Capture the Flag", server]);

  beforeEach(() => {
    scan.blocks = [];
    scan.next.mockClear();
  });

  it("resolves initial tagged message strings and strips server markup", async () => {
    scan.taggedStrings = new Map([
      [10, "ServerMessage"],
      [11, "MsgMissionDropInfo"],
      [12, "  \x10\x0bRapture Competition East\x11  "],
    ]);
    scan.blocks = [
      message(
        ["\x0111", "", "Surreal", "Capture the Flag", "\x0112"],
        "\x0110",
      ),
    ];
    const onServerName = vi.fn();
    const result = await scanDemoTimeline(
      new ArrayBuffer(0),
      null,
      undefined,
      undefined,
      onServerName,
    );
    expect(onServerName).toHaveBeenCalledExactlyOnceWith(
      "Rapture Competition East",
    );
    expect(result.events).toEqual([]);
  });

  it("discovers a late Classic server in the existing parser pass", async () => {
    scan.blocks = [
      ...Array.from({ length: 2_000 }, () => ({ type: BlockTypeMove })),
      {
        type: BlockTypePacket,
        parsed: {
          events: [
            {
              parsedData: {
                type: "NetStringEvent",
                id: 10,
                value: "Classic  1.3",
              },
            },
            {
              parsedData: {
                type: "NetStringEvent",
                id: 11,
                value: "\x0bLate Server",
              },
            },
            {
              parsedData: {
                type: "RemoteCommandEvent",
                funcName: "ServerMessage",
                args: ["MsgLoadInfo", "", "Surreal", "\x0110", "\x0111"],
              },
            },
          ],
        },
      },
    ];
    const onServerName = vi.fn();
    await scanDemoTimelineParser(
      new DemoParser(new Uint8Array(0)),
      null,
      undefined,
      undefined,
      onServerName,
    );
    expect(onServerName).toHaveBeenCalledExactlyOnceWith("Late Server");
    expect(scan.next).toHaveBeenCalledTimes(2_002);
  });

  it("ignores empty values and reports only the first nonempty server", async () => {
    scan.blocks = [
      dropInfo("  \x10\x0b\x11  "),
      dropInfo("First Server"),
      message(["MsgLoadInfo", "", "Surreal", "Classic  1.3", "Later Server"]),
      dropInfo("Last Server"),
    ];
    const onServerName = vi.fn();
    await scanDemoTimeline(
      new ArrayBuffer(0),
      null,
      undefined,
      undefined,
      onServerName,
    );
    expect(onServerName).toHaveBeenCalledExactlyOnceWith("First Server");
  });

  it("waits for a resolved server name after an unknown tagged reference", async () => {
    scan.blocks = [dropInfo("\x0199"), dropInfo("Known Server")];
    const onServerName = vi.fn();
    await scanDemoTimeline(
      new ArrayBuffer(0),
      null,
      undefined,
      undefined,
      onServerName,
    );
    expect(onServerName).toHaveBeenCalledExactlyOnceWith("Known Server");
  });

  it.each([
    ["MsgLoadInfo", "", "Surreal", "Classic Ruins", "Capture the Flag"],
    ["MsgLoadInfo", "", "Surreal", "Classic  1.3 Ruins", "Capture the Flag"],
    ["MsgLoadInfo", "", "Surreal", "Classic 1.3", "Capture the Flag"],
    ["MsgLoadInfo", "Loading", "Surreal", "Classic  1.3", "Server"],
    ["MsgLoadInfo", "", "Surreal", "Classic  1.3", "  "],
  ])("does not infer a server from %j", async (...args) => {
    scan.blocks = [message(args)];
    const onServerName = vi.fn();
    await scanDemoTimeline(
      new ArrayBuffer(0),
      null,
      undefined,
      undefined,
      onServerName,
    );
    expect(onServerName).not.toHaveBeenCalled();
  });

  it("publishes metadata before a later parser fault rejects the scan", async () => {
    scan.blocks = [
      dropInfo("Known Server"),
      { type: BlockTypeMove },
      { type: BlockTypePacket, parseError: "bad later block" },
    ];
    const onServerName = vi.fn();
    await expect(
      scanDemoTimeline(
        new ArrayBuffer(0),
        null,
        undefined,
        undefined,
        onServerName,
      ),
    ).rejects.toThrow("Demo parsing failed at 0.032s: bad later block");
    expect(onServerName).toHaveBeenCalledExactlyOnceWith("Known Server");
  });

  it("does not inspect metadata when the scan was already aborted", async () => {
    scan.blocks = [dropInfo("Unseen Server")];
    const controller = new AbortController();
    controller.abort();
    const onServerName = vi.fn();
    await expect(
      scanDemoTimeline(
        new ArrayBuffer(0),
        null,
        undefined,
        controller.signal,
        onServerName,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(scan.next).not.toHaveBeenCalled();
    expect(onServerName).not.toHaveBeenCalled();
  });

  it("retains discovery and stops before later blocks when aborted", async () => {
    scan.blocks = [dropInfo("Found Server"), dropInfo("Unseen Server")];
    const controller = new AbortController();
    const onServerName = vi.fn(() => controller.abort());
    await expect(
      scanDemoTimeline(
        new ArrayBuffer(0),
        null,
        undefined,
        controller.signal,
        onServerName,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(onServerName).toHaveBeenCalledExactlyOnceWith("Found Server");
    expect(scan.next).toHaveBeenCalledOnce();
  });
});

describe("original timeline messages", () => {
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

  it.each([
    ["match-start", ["MsgMissionStart", "Match started!"]],
    [
      "match-countdown",
      ["MsgMissionStart", "The admin has forced the match to start."],
    ],
    ["match-end", ["MsgGameOver", "Match has ended."]],
    [
      "rename",
      ["MsgClientNameChanged", "%1 changed name to %2.", "Alice", "Bob", "100"],
    ],
    [
      "flag-grab",
      ["MsgCTFFlagTaken", "%1 has taken the %2 flag!", "Alice", "Storm", "1"],
    ],
    [
      "flag-drop",
      ["MsgCTFFlagDropped", "You dropped the flag!", "0", "0", "1"],
    ],
    [
      "flag-return",
      [
        "MsgCTFFlagReturned",
        "The %2 flag was returned to base.",
        "0",
        "Storm",
        "1",
      ],
    ],
    [
      "flag-cap",
      ["MsgCTFFlagCapped", "You captured the %2 flag!", "0", "Storm", "1", "2"],
    ],
    [
      "kill",
      [
        "MsgLegitKill",
        "%1 ate %4's disc.",
        "Bob",
        "him",
        "his",
        "Alice",
        "her",
        "her",
        "",
        "disc",
      ],
    ],
    [
      "death",
      [
        "MsgSelfKill",
        "%1 blew %2self up.",
        "Alice",
        "her",
        "her",
        "Alice",
        "her",
        "her",
        "",
        "mortar",
      ],
    ],
  ])("keeps the server's original wording for %s", async (type, args) => {
    const expected = args[1]
      .replaceAll("%1", args[2] ?? "")
      .replaceAll("%2", args[3] ?? "")
      .replaceAll("%4", args[5] ?? "");
    scan.blocks = [message(...args)];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), "Alice");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type, originalMessage: expected });
  });

  it("resolves the original message at event time and strips color and sound cues", async () => {
    scan.taggedStrings = new Map([
      [10, "\x07%1 caught a disc from %4!~wvoice/announcer/test.wav"],
      [11, "\x10\bAlice\x0b.TAG\x11"],
      [12, "Bob"],
    ]);
    const kill = message(
      "MsgLegitKill",
      "\x0110",
      "\x0111",
      "her",
      "her",
      "\x0112",
    );
    scan.blocks = [
      kill,
      {
        type: BlockTypePacket,
        parsed: {
          events: [
            { parsedData: { type: "NetStringEvent", id: 12, value: "Carol" } },
          ],
        },
      },
      kill,
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
    expect(events.map((event) => event.originalMessage)).toEqual([
      "Alice.TAG caught a disc from Bob!",
      "Alice.TAG caught a disc from Carol!",
    ]);
  });

  it.each([undefined, "", "\x07  ", "~wvoice/announcer/test.wav"])(
    "has no original message for a silent capture (%s)",
    async (template) => {
      scan.blocks = [
        message("MsgCTFFlagCapped", ...(template == null ? [] : [template])),
      ];
      const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
      expect(events).toHaveLength(1);
      expect(events[0].originalMessage).toBeUndefined();
    },
  );
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

  describe("recorder attribution", () => {
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

    it("keeps everyone's destruction and repair, including shared repairs and unattributed transitions", async () => {
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

      expect(
        genEvents(result.events).map(({ type, actor, isRecorder }) => [
          type,
          actor,
          isRecorder,
        ]),
      ).toEqual([
        ["generator-offline", "ALICE.TAG", true],
        ["generator-online", "Alice.TAG", true],
        ["generator-online", "Bob", false],
        ["generator-offline", "Bob", false],
        ["generator-online", undefined, false],
        ["generator-offline", undefined, false],
      ]);
      expect(
        genEvents(result.events).map((event) => event.originalMessage),
      ).toEqual([
        "ALICE.TAG destroyed an enemy Main Generator!",
        undefined,
        undefined,
        "Bob destroyed an enemy Main Generator!",
        undefined,
        undefined,
      ]);
    });

    it.each([
      ["spectator", "Spectator", 0, undefined],
      ["MapGenius observer", "MapGenius", 0, undefined],
      ["later joins a team", "Alice", 0, 1],
      ["ends as an observer", "Alice", 1, 0],
      ["MapGenius-named player", "MapGenius", 1, undefined],
    ] as const)(
      "keeps all generator events when the recorder %s",
      async (_scenario, name, startTeam, endTeam) => {
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

        expect(genEvents(result.events).map((event) => event.actor)).toEqual([
          "Alice.TAG",
          undefined,
          "Bob",
        ]);
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
          "Alice.TAG",
        ]);
        expect(genEvents(events).map((event) => event.isRecorder)).toEqual([
          true,
          false,
          true,
          false,
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
      const event = (await scanOffline())[0];
      expect(event).toMatchObject({
        actor: "Alice.TAG",
        actorInferred: true,
        description: "Alice.TAG destroyed the Team 1 generator",
      });
      expect(event.originalMessage).toBeUndefined();
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
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);

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
        originalMessage: "Alice.TAG destroyed an enemy Main Generator!",
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
    expect(events.every((event) => !event.originalMessage)).toBe(true);
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

  it("keeps a global destruction credit for another player with its attribution", async () => {
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
    expect(events).toMatchObject([
      { type: "generator-offline", actor: "Enemy", isRecorder: false },
    ]);
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
      ).toMatchObject({
        actor: "Renamed.TAG",
        raw: { actor: rawName },
        originalMessage: `You received a 5 point bonus for destroying an enemy ${kind}.`,
      });
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

describe("self-weapon deaths and character pronouns", () => {
  const death = (
    type: string,
    weapon: string,
    pronoun = "him",
    killer = "Player",
  ) => ({
    type: BlockTypePacket,
    parsed: {
      events: [
        {
          parsedData: {
            type: "RemoteCommandEvent",
            funcName: "ServerMessage",
            args: [type, "", "Player", pronoun, "", killer, "", "", "", weapon],
          },
        },
      ],
    },
  });

  it.each([
    ["MsgSelfKill", "disc"],
    ["MsgSelfKill", "mortar"],
    ["MsgSelfKill", "plasma"],
    ["MsgSelfKill", "chaingun"],
    ["MsgSelfKill", "satchelcharge"],
    ["MsgTurretSelfKill", "turret"],
    ["MsgCTurretKill", "spike turret"],
    ["MsgExplosionKill", "explosion"],
  ])("identifies own-weapon damage from %s (%s)", async (type, weapon) => {
    scan.blocks = [death(type, weapon)];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), "Player");
    expect(events).toMatchObject([
      {
        type: "death",
        deathMessage: type.toLowerCase(),
        selfKill: true,
        victimPronoun: "him",
        isRecorder: true,
        weapon,
      },
    ]);
  });

  it("retains event-time pronouns without needing a roster or player body", async () => {
    scan.taggedStrings.set(10, "him");
    scan.taggedStrings.set(11, "her");
    scan.blocks = [
      death("MsgSelfKill", "disc", "\x0110", ""),
      death("MsgSelfKill", "mortar", "\x0111", ""),
      death("MsgSelfKill", "mine", "him"),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
    expect(
      events.map(({ victimPronoun, selfKill }) => [victimPronoun, selfKill]),
    ).toEqual([
      ["him", true],
      ["her", true],
      ["him", true],
    ]);
  });

  it("uses female character pronouns even with the shared male heavy armor model", async () => {
    scan.dataBlocks.set(100, { data: { shapeName: "heavy_male.dts" } });
    scan.targetEntries = [{ targetId: 60, name: "Player", dataBlockId: 100 }];
    scan.initialGhosts = [
      {
        index: 2,
        type: "create",
        classId: 25,
        parsedData: { targetId: 60, dataBlockId: 100 },
      },
    ];
    scan.blocks = [death("MsgSelfKill", "disc", "her")];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
    expect(events).toMatchObject([{ selfKill: true, victimPronoun: "her" }]);
  });

  it.each([
    ["MsgSelfKill", "ground"],
    ["MsgSelfKill", "default"],
    ["MsgSuicide", "suicide"],
    ["MsgVehicleSpawnKill", "vehicle spawn"],
    ["MsgVehicleCrash", "crash"],
    ["MsgLavaKill", "lava"],
  ])("keeps %s (%s) separate from own-weapon deaths", async (type, weapon) => {
    scan.blocks = [death(type, weapon)];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
    expect(events).toMatchObject([{ type: "death", selfKill: false }]);
  });

  it("does not turn a missing killer or a different player into a self kill", async () => {
    scan.blocks = [
      death("MsgTurretKill", "turret", "her", ""),
      death("MsgExplosionKill", "explosion", "her", "Other"),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
    expect(events).toMatchObject([
      { type: "death", selfKill: false, victimPronoun: "her" },
      { type: "kill", killer: "Other", victim: "Player", victimPronoun: "her" },
    ]);
  });

  it("distinguishes force-field powerups from vehicle spawns sharing the same message type", async () => {
    scan.blocks = [
      death("MsgVehicleSpawnKill", "ForceField"),
      death("MsgVehicleSpawnKill", "default"),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
    expect(events.map((event) => event.description)).toEqual([
      "Player was caught in a force field",
      "Player was in a vehicle spawn field",
    ]);
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
  const death = (victim: string, killer = "", damage = "default") =>
    message("MsgLegitKill", "", victim, "", "", killer, "", "", "", damage);

  it("omits pre-match spawn-selection deaths but keeps player kills and post-start deaths", async () => {
    scan.blocks = [
      death("Spawn selector"),
      message("MsgMissionStart", "The admin has forced the match to start."),
      death("Self", "Self"),
      message("msgSuicide", "", "Suicide", "", "", "Suicide"),
      death("Victim", "Killer", "disc"),
      message("MsgMissionStart", "Match starts in 2 seconds."),
      death("Another spawn selector"),
      message("MsgMissionStart", "Match started!"),
      death("After kickoff"),
      message("MsgVehicleSpawnKill", "", "Spawn collision", "", "", ""),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
    expect(events).toMatchObject([
      { type: "kill", killer: "Killer", victim: "Victim" },
      { type: "match-start" },
      {
        type: "death",
        victim: "After kickoff",
        description: "After kickoff died",
      },
      {
        type: "death",
        victim: "Spawn collision",
        description: "Spawn collision was in a vehicle spawn field",
      },
    ]);
  });

  it("preserves deaths in recordings that begin mid-match without a kickoff", async () => {
    scan.blocks = [
      death("Unknown cause", "", "Default"),
      death("Turret victim", "", "turret"),
      death("Player victim", "Killer", "default"),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
    expect(events).toMatchObject([
      {
        type: "death",
        victim: "Unknown cause",
        description: "Unknown cause died",
        weapon: undefined,
      },
      {
        type: "death",
        victim: "Turret victim",
        description: "Turret victim was shot by a base turret",
      },
      {
        type: "kill",
        killer: "Killer",
        victim: "Player victim",
        weapon: undefined,
      },
    ]);
    expect(events.some((event) => event.description.includes("default"))).toBe(
      false,
    );
  });

  it.each(["game over", "mission change"])(
    "only removes the next warmup's deaths after %s",
    async (boundary) => {
      scan.blocks = [
        // This mission was already underway when recording began.
        death("Earlier match"),
        boundary === "game over"
          ? message("MsgGameOver", "Match has ended.")
          : {
              type: BlockTypePacket,
              parsed: {
                events: [
                  { parsedData: { type: "GhostingMessageEvent", message: 2 } },
                ],
              },
            },
        death("Next warmup"),
        message("MsgMissionStart", "Match started!"),
        death("Next match"),
      ];
      const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
      expect(
        events
          .filter((event) => event.type === "death")
          .map((event) => event.victim),
      ).toEqual(["Earlier match", "Next match"]);
    },
  );

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

describe("flag team metadata", () => {
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
  function recorder(teamId: number) {
    scan.demoValues = [
      "",
      "1",
      `Runner\t123\t100\t32\t${teamId}\t0\t50\t0`,
      "readplayerinfo",
      "1\t100\tRunner\tTeam\t123",
    ];
  }

  it.each([
    ["MsgCTFFlagReturned", "You returned your flag.", "flag-return"],
    ["MsgCTFFlagDropped", "You dropped the flag.", "flag-drop"],
    [
      "MsgCTFFlagDropped",
      "You have left the mission area and lost the flag.",
      "flag-drop",
    ],
    ["MsgCTFFlagCapped", "You captured the flag!", "flag-cap"],
  ])(
    "attributes the recorder's private %s after a rename (%s)",
    async (message, body, type) => {
      recorder(1);
      const rawName = "\x10\bNewName\x0b.TAG\x11";
      scan.taggedStrings.set(10, `\x02${body}~wfx/misc/flag_return.wav`);
      scan.blocks = [
        packet("MsgClientNameChanged", "", "Runner", rawName, "100"),
        ...["0", ""].map((actor) =>
          packet(message, "\x0110", actor, "Storm", "1", "1"),
        ),
      ];
      const { events } = await scanDemoTimeline(new ArrayBuffer(0), "Runner");
      expect(events.slice(1)).toHaveLength(2);
      for (const event of events.slice(1)) {
        expect(event).toMatchObject({
          type,
          isRecorder: true,
          originalMessage: body,
        });
        expect(type === "flag-cap" ? event.capturer : event.actor).toBe(
          "NewName.TAG",
        );
        expect(
          type === "flag-cap" ? event.raw?.capturer : event.raw?.actor,
        ).toBe(rawName);
      }
    },
  );

  it("distinguishes own actions from automatic returns even without a recorder name", async () => {
    scan.blocks = [
      packet(
        "MsgCTFFlagReturned",
        "You returned your flag.",
        "0",
        "Storm",
        "1",
      ),
      packet(
        "MsgCTFFlagReturned",
        "Your flag was returned.",
        "0",
        "Storm",
        "1",
      ),
      packet(
        "MsgCTFFlagReturned",
        "The Storm flag was returned to base.",
        "0",
        "Storm",
        "1",
      ),
      packet(
        "MsgCTFFlagDropped",
        "You have left the mission area and lost the flag.",
        "0",
        "Inferno",
        "2",
      ),
      packet("MsgCTFFlagCapped", "You captured the flag!", "0", "Inferno", "2"),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
    expect(events.map((event) => event.isRecorder)).toEqual([
      true,
      false,
      false,
      true,
      true,
    ]);
    expect(
      events.every(
        (event) =>
          event.actor == null && event.capturer == null && event.raw == null,
      ),
    ).toBe(true);
  });

  it("uses event-time team metadata for omitted names on every flag action", async () => {
    recorder(1);
    scan.taggedStrings.set(10, "1");
    scan.taggedStrings.set(11, "0");
    scan.blocks = [
      packet("MsgCTFAddTeam", "", "1", "\x0bBlood Eagle", "<At Base>", "0"),
      packet(
        "MsgCTFFlagTaken",
        "Your flag has been taken by %1!",
        "Enemy",
        "\x0111",
        "\x0110",
      ),
      packet(
        "MsgCTFFlagDropped",
        "Your flag has been dropped by %1!",
        "Enemy",
        "0",
        "1",
      ),
      packet(
        "MsgCTFFlagReturned",
        "Teammate %1 returned your flag to base.",
        "Ally",
        "0",
        "1",
      ),
      packet("MsgCTFFlagReturned", "Your flag was returned.", "0", "0", "1"),
      packet(
        "MsgCTFFlagCapped",
        "Your flag was captured by %1.",
        "Enemy",
        "0",
        "1",
        "2",
      ),
      packet("MsgCTFAddTeam", "", "1", "Starwolf", "<At Base>", "0"),
      packet("MsgCTFFlagReturned", "", "Ally", "", "1"),
      packet("MsgCTFFlagReturned", "", "Ally", "Custom", "1"),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), "Runner");
    expect(events.map((event) => event.flagTeamName)).toEqual([
      "Blood Eagle",
      "Blood Eagle",
      "Blood Eagle",
      "Blood Eagle",
      "Blood Eagle",
      "Starwolf",
      "Custom",
    ]);
    expect(events[3]).toMatchObject({
      description: "The Blood Eagle flag was returned",
      isRecorder: false,
    });
    expect(events[3].actor).toBeUndefined();
    expect(events[3].raw).toBeUndefined();
  });

  it.each(["0", "3", "unknown"])(
    "does not invent a name for unknown or teamless flag %s",
    async (team) => {
      scan.blocks = [
        packet("MsgCTFAddTeam", "", "0", "Observers", "", "0"),
        packet("MsgCTFFlagReturned", "The flag was returned.", "0", "0", team),
      ];
      const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
      expect(events[0].flagTeamName).toBeUndefined();
      expect(events[0].description).toBe("The flag was returned");
    },
  );

  it("resolves every observer flag action's team, including automatic returns", async () => {
    recorder(0);
    scan.taggedStrings.set(10, "2");
    scan.blocks = [
      packet("MsgCTFFlagTaken", "", "Player", "Custom A", "1"),
      packet("MsgCTFFlagDropped", "", "Player", "Custom A", "1"),
      packet("MsgCTFFlagReturned", "", "0", "Custom A", "1"),
      packet("MsgCTFFlagCapped", "", "Player", "Custom A", "1", "2"),
      packet("MsgCTFFlagTaken", "", "Player", "Custom B", "\x0110"),
      packet("MsgCTFFlagDropped", "", "Player", "Custom B", "2"),
      packet("MsgCTFFlagReturned", "", "Player", "Custom B", "2"),
      packet("MsgCTFFlagCapped", "", "Player", "Custom B", "2", "1"),
    ];
    const result = await scanDemoTimeline(new ArrayBuffer(0), "Runner");

    expect(
      result.events.map(({ type, flagTeamId, actorTeamId }) => [
        type,
        flagTeamId,
        actorTeamId,
      ]),
    ).toEqual([
      ["flag-grab", 1, 2],
      ["flag-drop", 1, 2],
      ["flag-return", 1, 1],
      ["flag-cap", 1, 2],
      ["flag-grab", 2, 1],
      ["flag-drop", 2, 1],
      ["flag-return", 2, 2],
      ["flag-cap", 2, 1],
    ]);
  });

  it("classifies player flag events by the actor's team", async () => {
    recorder(1);
    scan.blocks = [
      packet("MsgCTFFlagTaken", "", "Runner", "Inferno", "2"),
      packet("MsgCTFFlagDropped", "You dropped the flag", "0", "0", "2"),
      packet("MsgCTFFlagReturned", "", "Runner", "Storm", "1"),
      packet("MsgCTFFlagCapped", "", "Teammate", "Inferno", "2", "1"),
      packet("MsgCTFFlagCapped", "", "Opponent", "Storm", "1", "2"),
    ];
    const result = await scanDemoTimeline(new ArrayBuffer(0), "Runner");

    expect(
      result.events.map(({ type, flagTeamId, teamAffinity }) => [
        type,
        flagTeamId,
        teamAffinity,
      ]),
    ).toEqual([
      ["flag-grab", 2, "friendly"],
      ["flag-drop", 2, "friendly"],
      ["flag-return", 1, "friendly"],
      ["flag-cap", 2, "friendly"],
      ["flag-cap", 1, "enemy"],
    ]);
    expect(result.events.slice(-2).map((event) => event.teamAffinity)).toEqual([
      "friendly",
      "enemy",
    ]);
  });

  it("freezes each action's affinity before the recorder changes teams or enters observer mode", async () => {
    recorder(1);
    scan.blocks = [
      packet("MsgCTFFlagCapped", "", "Opponent", "Storm", "1", "2"),
      packet("MsgClientJoinTeam", "", "Runner", "Inferno", "100", "2"),
      packet("MsgCTFFlagCapped", "", "Runner", "Storm", "1", "2"),
      packet("MsgClientJoinTeam", "", "Runner", "Observer", "100", "0"),
      packet("MsgCTFFlagCapped", "", "Opponent", "Storm", "1", "2"),
    ];
    const result = await scanDemoTimeline(new ArrayBuffer(0), "Runner");

    expect(result.events.map((event) => event.teamAffinity)).toEqual([
      "enemy",
      "friendly",
      "neutral",
    ]);
  });

  it("keeps everyone's flag actions before, during and after playing through team changes", async () => {
    recorder(0);
    const actions = () => [
      packet("MsgCTFFlagTaken", "", "Other", "Inferno", "2"),
      packet("MsgCTFFlagDropped", "", "Other", "Inferno", "2"),
      packet("MsgCTFFlagReturned", "", "Other", "Inferno", "2"),
    ];
    scan.blocks = [
      ...actions(),
      packet("MsgCTFFlagCapped", "", "Other", "Inferno", "2", "1"),
      { type: BlockTypeMove },
      packet("MsgClientJoinTeam", "", "Runner", "Storm", "100", "1"),
      ...actions(),
      packet("MsgCTFFlagCapped", "", "Other", "Inferno", "2", "1"),
      packet("MsgCTFFlagCapped", "", "Opponent", "Storm", "1", "2"),
      { type: BlockTypeMove },
      packet("MsgClientJoinTeam", "", "Runner", "Observer", "100", "0"),
      ...actions(),
      packet("MsgCTFFlagCapped", "", "Opponent", "Storm", "1", "2"),
      { type: BlockTypeMove },
      packet("MsgClientJoinTeam", "", "Runner", "Inferno", "100", "2"),
      packet("MsgCTFFlagCapped", "", "Opponent", "Storm", "1", "2"),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), "Runner");

    const flagActions = events.filter((event) => event.type !== "flag-cap");
    expect(flagActions.map(({ type, timeSec }) => [type, timeSec])).toEqual([
      ["flag-grab", 0],
      ["flag-drop", 0],
      ["flag-return", 0],
      ["flag-grab", 0.032],
      ["flag-drop", 0.032],
      ["flag-return", 0.032],
      ["flag-grab", 0.064],
      ["flag-drop", 0.064],
      ["flag-return", 0.064],
    ]);
    const caps = events.filter((event) => event.type === "flag-cap");
    expect(
      caps.map(({ timeSec, teamAffinity }) => [timeSec, teamAffinity]),
    ).toEqual([
      [0, "neutral"],
      [0.032, "friendly"],
      [0.032, "enemy"],
      [0.064, "neutral"],
      [0.096, "friendly"],
    ]);
    expect(caps.map((event) => event.actorTeamId)).toEqual([1, 1, 2, 2, 2]);
  });

  it.each(["MsgClientJoin", "MsgClientDrop"])(
    "clears the recorder's old team on %s without losing or recoloring caps",
    async (msgType) => {
      recorder(1);
      scan.blocks = [
        packet("MsgCTFFlagCapped", "", "Other", "Inferno", "2", "1"),
        packet(msgType, "", "Runner", "100"),
        packet("MsgCTFFlagCapped", "", "Other", "Inferno", "2", "1"),
        packet("MsgCTFFlagCapped", "", "Opponent", "Storm", "1", "2"),
        packet("MsgCTFFlagTaken", "", "Other", "Inferno", "2"),
        packet("MsgClientJoinTeam", "", "Runner", "Inferno", "100", "2"),
        packet("MsgCTFFlagCapped", "", "Other", "Inferno", "2", "1"),
      ];
      const { events } = await scanDemoTimeline(new ArrayBuffer(0), "Runner");
      expect(events.find((event) => event.type === "flag-grab")).toMatchObject({
        actor: "Other",
        teamAffinity: "neutral",
      });
      const caps = events.filter((event) => event.type === "flag-cap");
      expect(caps.map((event) => event.teamAffinity)).toEqual([
        "friendly",
        "neutral",
        "neutral",
        "enemy",
      ]);
      expect(caps.map((event) => event.actorTeamId)).toEqual([1, 1, 2, 1]);
    },
  );

  it("uses the wire order within a packet for caps around a roster rejoin", async () => {
    recorder(1);
    const command = (block: ReturnType<typeof packet>) =>
      block.parsed.events[0];
    scan.blocks = [
      {
        type: BlockTypePacket,
        parsed: {
          events: [
            command(
              packet("MsgCTFFlagCapped", "", "Other", "Inferno", "2", "1"),
            ),
            command(packet("MsgClientJoin", "", "Runner", "100")),
            command(
              packet("MsgCTFFlagCapped", "", "Other", "Inferno", "2", "1"),
            ),
            command(
              packet("MsgClientJoinTeam", "", "Runner", "Inferno", "100", "2"),
            ),
            command(
              packet("MsgCTFFlagCapped", "", "Other", "Inferno", "2", "1"),
            ),
          ],
        },
      },
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), "Runner");
    expect(events.map((event) => event.timeSec)).toEqual([0, 0, 0]);
    expect(events.map((event) => event.teamAffinity)).toEqual([
      "friendly",
      "neutral",
      "enemy",
    ]);
  });

  it.each([0, 1])(
    "keeps caps with missing optional fields when the recorder is on team %i",
    async (teamId) => {
      recorder(teamId);
      scan.taggedStrings.set(10, "MsgCTFFlagCapped");
      scan.blocks = [
        packet("MsgCTFFlagCapped"),
        packet("MsgCTFFlagCapped", ""),
        packet("\x0110", "", "Unknown", "Inferno", "2"),
      ];
      const { events } = await scanDemoTimeline(new ArrayBuffer(0), "Runner");
      expect(events).toHaveLength(3);
      expect(events.every((event) => event.type === "flag-cap")).toBe(true);
      expect(events.map((event) => event.description)).toEqual([
        "Flag captured",
        "Flag captured",
        "Flag captured",
      ]);
      expect(events[2]).toMatchObject({ actorTeamId: 1, flagTeamId: 2 });
      expect(events[2].teamAffinity).toBe(
        teamId === 1 ? "friendly" : "neutral",
      );
    },
  );

  it("colors the action owner's team even when flag team metadata is missing or teamless", async () => {
    recorder(1);
    scan.blocks = [
      packet("MsgCTFFlagTaken", "", "Runner", "Inferno"),
      packet("MsgCTFFlagDropped", "You dropped the flag", "0", "0", "unknown"),
      packet("MsgCTFFlagReturned", "", "Runner", "Storm"),
      packet("MsgCTFFlagCapped", "", "Teammate", "Inferno", "", "1"),
      packet("MsgCTFFlagCapped", "", "Opponent", "Storm", "", "2"),
      packet("MsgCTFFlagTaken", "", "Runner", "Rabbit", "0"),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), "Runner");
    expect(events.map((event) => event.teamAffinity)).toEqual([
      "friendly",
      "friendly",
      "friendly",
      "friendly",
      "enemy",
      "friendly",
    ]);
    expect(events.map((event) => event.flagTeamId)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      0,
    ]);
  });

  it("tracks action owners through roster renames, team changes, disconnects, and reused client IDs", async () => {
    recorder(0);
    scan.demoValues[1] = "2";
    scan.demoValues.splice(3, 0, "\x0bTAG|Player\t456\t200\t33\t2\t0\t50\t0");
    scan.taggedStrings.set(11, "Renamed");
    scan.taggedStrings.set(12, "1");
    scan.blocks = [
      packet("MsgCTFFlagTaken", "", "TAG|Player", "Teamless", "0"),
      packet("MsgClientNameChanged", "", "TAG|Player", "\x0111", "200"),
      packet("MsgCTFFlagDropped", "", "Renamed", "Teamless", "0"),
      packet("MsgClientJoinTeam", "", "Renamed", "Storm", "200", "\x0112"),
      packet("MsgCTFFlagTaken", "", "Renamed", "Teamless", "0"),
      packet("MsgClientDrop", "", "Renamed", "200"),
      packet("MsgCTFFlagTaken", "", "Renamed", "Teamless", "0"),
      packet("MsgClientJoin", "", "Replacement", "200", "33"),
      packet("MsgClientJoinTeam", "", "Replacement", "Inferno", "200", "2"),
      packet("MsgCTFFlagReturned", "", "Replacement", "Teamless", "0"),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), "Runner");
    expect(
      events
        .filter((event) => event.type.startsWith("flag-"))
        .map((event) => event.actorTeamId),
    ).toEqual([2, 2, 1, undefined, 2]);
  });

  it("prefers the capturer's wire team, then the roster, before inferring from the flag", async () => {
    recorder(0);
    scan.demoValues[1] = "2";
    scan.demoValues.splice(3, 0, "Player\t456\t200\t33\t1\t0\t50\t0");
    scan.blocks = [
      packet("MsgCTFFlagCapped", "", "Player", "Custom", "3", "2"),
      packet("MsgCTFFlagCapped", "", "Player", "Custom", "3", "unknown"),
      packet("MsgCTFFlagCapped", "", "Unknown", "Inferno", "2"),
      packet("MsgCTFFlagCapped", "", "Unknown", "Custom", "unknown"),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), "Runner");
    expect(events.map((event) => event.actorTeamId)).toEqual([
      2,
      1,
      1,
      undefined,
    ]);
  });

  it("preserves custom scoring team names at the capture time", async () => {
    recorder(0);
    scan.blocks = [
      packet("MsgCTFAddTeam", "", "1", "\x0bRambo", "<At Base>", "0"),
      packet("MsgCTFFlagCapped", "", "Player", "Inferno", "2", "1"),
      packet("MsgCTFAddTeam", "", "1", "Storm", "<At Base>", "0"),
      packet("MsgCTFFlagCapped", "", "Player", "Inferno", "2", "1"),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), "Runner");
    expect(events.map((event) => event.actorTeamName)).toEqual([
      "Rambo",
      "Storm",
    ]);
  });

  it("names the recorder when their capture message omits the capper", async () => {
    recorder(1);
    scan.blocks = [
      packet(
        "MsgCTFFlagCapped",
        "You captured the %2 flag",
        "0",
        "Inferno",
        "2",
        "1",
      ),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), "Runner");
    expect(events).toMatchObject([
      {
        type: "flag-cap",
        capturer: "Runner",
        isRecorder: true,
        actorTeamName: "Storm",
      },
    ]);
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

  it.each(["missing", "invalid"])(
    "recovers a stock recorder's client and team when PJ metadata is %s",
    async (metadata) => {
      scan.demoValues = scan.demoValues.slice(0, 3);
      if (metadata === "invalid") {
        scan.demoValues.push(
          "readplayerinfo",
          "1\tunknown\tRunner\tStorm\t123",
        );
      }
      scan.blocks = [kill(tagged), kill("Opponent")];
      const result = await scanDemoTimeline(
        new ArrayBuffer(0),
        "  \x0btag|runner  ",
      );

      expect(result.events).toMatchObject([
        {
          type: "kill",
          killer: "TAG|Runner",
          isRecorder: true,
          victimIsRecorder: false,
        },
        { type: "death", victim: "Opponent", isRecorder: false },
      ]);
    },
  );

  it("does not guess a stock recorder client when normalized roster names are ambiguous", async () => {
    scan.demoValues = [
      "",
      "2",
      `${tagged}\t123\t100\t32\t1\t0\t50\t0`,
      "  \x0btag|runner  \t456\t200\t33\t2\t0\t50\t0",
    ];
    scan.blocks = [
      packet("MsgClientNameChanged", "", tagged, "Renamed", "100"),
      packet("MsgClientJoinTeam", "", "Renamed", "Storm", "100", "1"),
    ];
    const result = await scanDemoTimeline(new ArrayBuffer(0), "TAG|Runner");

    expect(result.events).toMatchObject([
      { type: "rename", isRecorder: false },
    ]);
  });

  it("recovers a recorder's welcome connection before its roster and team arrive", async () => {
    scan.demoValues = ["", "0"];
    scan.taggedStrings = new Map([
      [10, "\x0bWelcome to Tribes, %1!"],
      [11, tagged],
      [12, "100"],
    ]);
    scan.blocks = [
      packet("MsgClientJoin", "\x0110", "\x0111", "\x0112"),
      packet("MsgClientJoinTeam", "", tagged, "Storm", "100", "1"),
      packet("MsgClientNameChanged", "", tagged, "NEW|Runner", "100"),
      kill("NEW|Runner"),
      kill("Opponent"),
    ];
    const result = await scanDemoTimeline(new ArrayBuffer(0), "  tag|runner  ");

    expect(
      result.events.map(({ type, isRecorder }) => [type, isRecorder]),
    ).toEqual([
      ["rename", true],
      ["kill", true],
      ["death", false],
    ]);
    expect(result.events.find((event) => event.type === "kill")?.killer).toBe(
      "NEW|Runner",
    );
  });

  it.each([
    {
      description: "a silent roster join",
      format: "",
      player: tagged,
      clientId: "100",
      recorder: "TAG|Runner",
    },
    {
      description: "another player's welcome",
      format: "Welcome to Tribes",
      player: "Opponent",
      clientId: "100",
      recorder: "TAG|Runner",
    },
    {
      description: "an invalid client ID",
      format: "Welcome to Tribes",
      player: tagged,
      clientId: "unknown",
      recorder: "TAG|Runner",
    },
    {
      description: "an unresolved player name",
      format: "Welcome to Tribes",
      player: "\x0199",
      clientId: "100",
      recorder: "99",
    },
  ])("does not infer a welcome connection from $description", async (entry) => {
    scan.demoValues = ["", "0"];
    scan.blocks = [
      packet("MsgClientJoin", entry.format, entry.player, entry.clientId),
      packet(
        "MsgClientJoinTeam",
        "",
        entry.player,
        "Storm",
        entry.clientId,
        "1",
      ),
      packet(
        "MsgClientNameChanged",
        "",
        entry.player,
        "Renamed",
        entry.clientId,
      ),
    ];
    const result = await scanDemoTimeline(new ArrayBuffer(0), entry.recorder);

    expect(result.events).toMatchObject([
      { type: "rename", isRecorder: false },
    ]);
  });

  it("tracks the recovered stock client through its rename without adopting another client's name", async () => {
    scan.demoValues = scan.demoValues.slice(0, 3);
    scan.blocks = [
      packet("MsgClientNameChanged", "", tagged, "NEW|Runner", "100"),
      packet("MsgClientNameChanged", "", "Opponent", "OTHER|Runner", "200"),
      kill("NEW|Runner"),
      kill(tagged),
      kill("OTHER|Runner"),
    ];
    const result = await scanDemoTimeline(new ArrayBuffer(0), "TAG|Runner");

    expect(
      result.events.map(({ type, isRecorder }) => [type, isRecorder]),
    ).toEqual([
      ["rename", true],
      ["rename", false],
      ["kill", true],
      ["kill", false],
      ["kill", false],
    ]);
    expect(result.events.find((event) => event.type === "kill")?.killer).toBe(
      "NEW|Runner",
    );
  });

  it("matches the recorder's full roster name when metadata omits the tag", async () => {
    scan.blocks = [
      kill(tagged),
      kill("Opponent", tagged),
      kill("OTHER|Runner"),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), "Runner");
    expect(events.map((e) => e.type)).toEqual(["kill", "kill", "kill"]);
    expect(events.map((e) => e.isRecorder)).toEqual([true, false, false]);
    expect(events.map((e) => e.victimIsRecorder)).toEqual([false, true, false]);
  });

  it("keeps every kill and death through observer periods and renames", async () => {
    scan.blocks = [
      kill(tagged),
      packet("MsgClientJoinTeam", "", tagged, "Observer", "100", "0"),
      kill("Other", "Opponent"),
      packet("MsgClientNameChanged", "", tagged, "NEW|Runner", "100"),
      kill("Opponent", "NEW|Runner"),
      packet("MsgSelfKill", "", "Other", "", "", "Other", "", "", "", "ground"),
      packet("MsgSuicide", "", "NEW|Runner", "", "", "NEW|Runner"),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), "Runner");
    expect(events).toMatchObject([
      {
        type: "kill",
        killer: "TAG|Runner",
        victim: "Opponent",
        isRecorder: true,
        victimIsRecorder: false,
      },
      {
        type: "kill",
        killer: "Other",
        victim: "Opponent",
        isRecorder: false,
        victimIsRecorder: false,
      },
      { type: "rename", isRecorder: true },
      {
        type: "kill",
        killer: "Opponent",
        victim: "NEW|Runner",
        isRecorder: false,
        victimIsRecorder: true,
      },
      {
        type: "death",
        victim: "Other",
        description: "Other cratered",
        isRecorder: false,
      },
      {
        type: "death",
        victim: "NEW|Runner",
        description: "NEW|Runner suicided",
        isRecorder: true,
      },
    ]);
  });

  it("keeps everyone's combat events when the recorder is unknown", async () => {
    scan.demoValues = [];
    scan.blocks = [kill("Alice", "Bob"), packet("MsgLavaKill", "", "Carol")];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), null);
    expect(events).toMatchObject([
      {
        type: "kill",
        killer: "Alice",
        victim: "Bob",
        isRecorder: false,
        victimIsRecorder: false,
      },
      {
        type: "death",
        victim: "Carol",
        isRecorder: false,
        description: "Carol died in lava",
      },
    ]);
  });

  it("marks the navigation target across flag, death, rename and global events", async () => {
    scan.blocks = [
      packet("MsgMissionStart", "Match started!"),
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
      packet("MsgGameOver", "Match has ended."),
    ];
    const { events } = await scanDemoTimeline(new ArrayBuffer(0), "Runner");
    expect(events.map(({ type, isRecorder }) => [type, isRecorder])).toEqual([
      ["match-start", false],
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
      expect(events.filter((e) => e.type === "kill")).toMatchObject([
        { killer: "NEW|Runner", isRecorder: true },
        { killer: "TAG|Runner", isRecorder: false },
      ]);
    },
  );
});
