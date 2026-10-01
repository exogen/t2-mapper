import { beforeEach, describe, expect, it, vi } from "vitest";

const scan = vi.hoisted(() => ({
  blocks: [] as unknown[],
  demoValues: [] as string[],
  next: vi.fn(),
}));
vi.mock("t2-demo-parser", async (original) => ({
  ...(await original<typeof import("t2-demo-parser")>()),
  DemoParser: class {
    blockCount = 3;
    async load() {
      return {
        initialBlock: { taggedStrings: [], demoValues: scan.demoValues },
      };
    }
    getRegistry() {
      return { getEventParser: () => ({ name: "RemoteCommandEvent" }) };
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
  scan.next.mockImplementation(() => scan.blocks.shift());
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
    },
  );
});
