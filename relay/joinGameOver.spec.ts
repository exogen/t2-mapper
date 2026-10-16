import {
  createLiveParser,
  freshConnectionProtocolState,
  type RemoteCommandEventData,
} from "t2-demo-parser";
import { describe, expect, it } from "vitest";
import type { DemoStreamEntry } from "./demoStart.js";
import {
  JOIN_GAME_OVER_WINDOW_MS,
  JoinGameOverFilter,
  type JoinGameOverOutcome,
} from "./joinGameOver.js";
import { MOVE_TICK_MS } from "./moveList.js";
import {
  CONNECT_SEQUENCE,
  cameraGhost,
  command,
  netString,
  serverPacket,
  type ServerEvent,
} from "./serverPacketFixtures.js";
import { GAME_PROTOCOL_VERSION } from "./shared.js";

type PacketEntry = Extract<DemoStreamEntry, { kind: "packet" }>;

const endGhosting = (seq: number): ServerEvent => ({
  seq,
  className: "GhostingMessageEvent",
  write(bs) {
    bs.writeU32(1);
    bs.writeInt(2, 3);
    bs.writeInt(0, 11);
  },
});

/**
 * A server packet as the connection received it, dispatched.
 */
const received = (
  seq: number,
  opts?: Parameters<typeof serverPacket>[1],
): PacketEntry => ({
  kind: "packet",
  data: serverPacket(seq, opts),
  dispatched: true,
});

const MOVE: DemoStreamEntry = { kind: "move" };
const WINDOW_MOVES: DemoStreamEntry[] = Array(
  Math.ceil(JOIN_GAME_OVER_WINDOW_MS / MOVE_TICK_MS),
).fill(MOVE);

/**
 * Classic's welcome page as it begins: an empty MsgGameOver.
 */
const welcomePage = (seq: number): ServerEvent[] => [
  netString(seq, 0, "ServerMessage"),
  netString(seq + 1, 1, "MsgGameOver"),
  command(seq + 2, 0, "\x011"),
];

function filter(
  entries: DemoStreamEntry[],
): (JoinGameOverOutcome | undefined)[] {
  const join = JoinGameOverFilter.forRecording(undefined, CONNECT_SEQUENCE);
  return entries.map((entry) => join.apply(entry));
}

/**
 * Every remote command in the entries, as a fresh client parses them.
 */
function commands(entries: DemoStreamEntry[]): string[][] {
  const { packetParser } = createLiveParser({
    protocolVersion: GAME_PROTOCOL_VERSION,
    connectionProtocolState: freshConnectionProtocolState(CONNECT_SEQUENCE),
  });
  const argvs: string[][] = [];
  for (const entry of entries) {
    if (entry.kind !== "packet") continue;
    for (const { parsedData } of packetParser.parsePacket(entry.data).events)
      if (parsedData?.type === "RemoteCommandEvent")
        argvs.push((parsedData as RemoteCommandEventData).argv);
  }
  return argvs;
}

function changedBits(before: Uint8Array, after: Uint8Array): number[] {
  const bits: number[] = [];
  for (let i = 0; i < before.length; i++) {
    for (let bit = 0; bit < 8; bit++)
      if ((before[i] ^ after[i]) & (1 << bit)) bits.push(i * 8 + bit);
  }
  return bits;
}

describe("JoinGameOverFilter", () => {
  it("rewrites a welcome page that arrives after the camera", () => {
    const page = received(3, { camera: true, events: welcomePage(1) });
    const before = page.data.slice();
    const entries = [
      received(1, { events: [cameraGhost(0)] }),
      received(2, { camera: true }),
      MOVE,
      page,
    ];
    expect(filter(entries)).toEqual([
      undefined,
      undefined,
      undefined,
      "rewritten",
    ]);
    // The message type is now the command's own tag, ServerMessage.
    expect(commands(entries)).toEqual([["\x010", "\x010"]]);
    const changed = changedBits(before, page.data);
    expect(changed.length).toBeGreaterThan(0);
    expect(changed[changed.length - 1] - changed[0]).toBeLessThan(10);
  });

  it("counts a camera set by the packet that carries the page", () => {
    const entries = [
      received(1, { events: [cameraGhost(0)] }),
      received(2, { camera: true, events: welcomePage(1) }),
    ];
    expect(filter(entries)).toEqual([undefined, "rewritten"]);
  });

  it("leaves a welcome page that arrives before the camera", () => {
    const entries = [
      received(1, { events: [cameraGhost(0), ...welcomePage(1)] }),
      received(2, { camera: true }),
    ];
    expect(filter(entries)).toEqual([undefined, undefined]);
    expect(commands(entries)).toEqual([["\x010", "\x011"]]);
  });

  it("leaves a game over that announces the end of the match", () => {
    const entries = [
      received(1, { events: [cameraGhost(0)] }),
      received(2, {
        camera: true,
        events: [
          netString(1, 0, "ServerMessage"),
          netString(2, 1, "MsgGameOver"),
          command(
            3,
            0,
            "\x011",
            "Match has ended.~wvoice/announcer/ann.gameover.wav",
          ),
        ],
      }),
    ];
    expect(filter(entries)).toEqual([undefined, undefined]);
  });

  it("leaves a welcome page after the first 30 seconds", () => {
    const entries = [
      received(1, { events: [cameraGhost(0)] }),
      received(2, { camera: true }),
      ...WINDOW_MOVES,
      received(3, { camera: true, events: welcomePage(1) }),
    ];
    expect(filter(entries).some(Boolean)).toBe(false);
  });

  it("leaves a welcome page once EndGhosting has cleared the camera", () => {
    const entries = [
      received(1, { events: [cameraGhost(0)] }),
      received(2, { camera: true, events: [endGhosting(1)] }),
      received(3, { events: welcomePage(2) }),
    ];
    expect(filter(entries)).toEqual([undefined, undefined, undefined]);
  });

  it("reports a page that a later packet releases from the event queue as left", () => {
    // Event 3 arrives before event 2; its bits stay in the earlier packet.
    const early = received(3, {
      camera: true,
      events: [command(3, 0, "\x011")],
    });
    const late = received(4, {
      camera: true,
      events: [netString(2, 1, "MsgGameOver")],
    });
    const entries = [
      received(1, { events: [cameraGhost(0)] }),
      received(2, {
        camera: true,
        events: [netString(1, 0, "ServerMessage")],
      }),
      early,
      late,
    ];
    expect(filter(entries)).toEqual([undefined, undefined, undefined, "left"]);
    expect(commands(entries)).toEqual([["\x010", "\x011"]]);
  });

  it("stops at a packet it can't parse and records the rest as it is", () => {
    const page = received(3, { camera: true, events: welcomePage(1) });
    const before = page.data.slice();
    const entries: DemoStreamEntry[] = [
      received(1, { events: [cameraGhost(0)] }),
      {
        kind: "packet",
        // Cut through the welcome page's command.
        data: serverPacket(2, { camera: true, events: welcomePage(1) }).slice(
          0,
          -2,
        ),
        dispatched: true,
      },
      page,
    ];
    expect(filter(entries)).toEqual([undefined, "stopped", undefined]);
    expect(page.data).toEqual(before);
  });
});
