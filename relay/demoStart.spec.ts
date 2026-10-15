import { describe, expect, it } from "vitest";
import zlib from "node:zlib";
import {
  BlockTypeInfo,
  BlockTypeMove,
  BlockTypePacket,
  BlockTypeSendPacket,
  DemoParser,
  type NetEventInfo,
} from "t2-demo-parser";
import { planDemoStart, type DemoStreamEntry } from "./demoStart.js";
import {
  ZERO_MOVE,
  buildDemoValues,
  buildHeader,
  buildInfoBlock,
  buildInitialBlock,
} from "./demoWriter.js";
import {
  CONNECT_SEQUENCE,
  command,
  gravityEvent,
  netString,
  serverPacket,
  type ServerEvent,
} from "./serverPacketFixtures.js";

/**
 * A positional sound at an absolute position.
 */
const sound = (seq: number): ServerEvent => ({
  seq,
  className: "Sim3DAudioEvent",
  write(bs) {
    bs.writeInt(42, 11); // AudioProfile datablock
    bs.writeFlag(false); // no cone
    bs.writeInt(3, 2); // absolute position
    for (let i = 0; i < 3; i++) bs.writeU32(0);
  },
});

const targetFree = (seq: number): ServerEvent => ({
  seq,
  className: "TargetFreeEvent",
  write: (bs) => bs.writeInt(17, 9),
});

/**
 * A lightning strike with no strike data.
 */
const lightning = (seq: number): ServerEvent => ({
  seq,
  className: "LightningStrikeEvent",
  write: (bs) => bs.writeFlag(false),
});

const missionCRC = (seq: number, crc: number): ServerEvent => ({
  seq,
  className: "SetMissionCRCEvent",
  write: (bs) => bs.writeU32(crc),
});

const packet = (data: Uint8Array): DemoStreamEntry => ({
  kind: "packet",
  data,
  dispatched: true,
});
const MOVE: DemoStreamEntry = { kind: "move" };
const SENT: DemoStreamEntry = { kind: "sent" };

const POKE = packet(
  serverPacket(1, {
    events: [
      gravityEvent(0, -26.9),
      netString(1, 0, "t2csri_pokeClient"),
      command(2, 0, "T2CSRI 1.5 - 08/09/2012"),
    ],
  }),
);
const CHALLENGE_EVENTS = [
  netString(3, 1, "t2csri_getChallengeChunk"),
  command(4, 1, "0123456789abcdef"),
  netString(5, 2, "t2csri_decryptChallenge"),
  command(6, 2),
];

/**
 * A T2CSRI 1.5 connection's opening: the poke, three ticks of the relay's
 * moves and packets, then the challenge, which acks two of each.
 */
function handshake(
  challenge = CHALLENGE_EVENTS,
  poke = POKE,
): DemoStreamEntry[] {
  return [
    poke,
    MOVE,
    SENT,
    MOVE,
    SENT,
    MOVE,
    SENT,
    packet(serverPacket(2, { ack: 2, lastMoveAck: 2, events: challenge })),
  ];
}

/** The stock connect flow that follows the handshake. */
const AFTER_HANDSHAKE: DemoStreamEntry[] = [
  MOVE,
  SENT,
  packet(
    serverPacket(3, {
      ack: 4,
      lastMoveAck: 3,
      events: [
        missionCRC(7, 0x12345678),
        netString(8, 3, "MsgLoadInfo"),
        command(9, 3, "Slapdash_RV"),
      ],
    }),
  ),
];

/** The demo a recorder writes from the planned start onward. */
async function recordFromPlan(entries: DemoStreamEntry[]) {
  const plan = planDemoStart(entries, CONNECT_SEQUENCE);
  const initialBlock = buildInitialBlock({
    connectSequence: CONNECT_SEQUENCE,
    missionName: "Slapdash_RV",
    demoValues: buildDemoValues({
      recorderName: "Observer",
      serverName: "biergarten",
      serverAddress: "1.2.3.4:28000",
      date: new Date(0),
      missionDisplayName: "Slapdash",
      mod: "classic",
      gameType: "Capture the Flag",
      gravity: plan.gravity,
      script: plan.script,
    }),
    start: plan.start,
  });
  const frames: Uint8Array[] = [];
  const frame = (type: number, payload: Uint8Array = new Uint8Array(0)) => {
    const bytes = new Uint8Array(2 + payload.length);
    bytes[0] = payload.length & 0xff;
    bytes[1] = (type << 4) | (payload.length >> 8);
    bytes.set(payload, 2);
    frames.push(bytes);
  };
  for (const entry of entries.slice(plan.skip)) {
    if (entry.kind === "packet") {
      frame(BlockTypePacket, entry.data);
      if (entry.dispatched) frame(BlockTypeInfo, buildInfoBlock());
    } else if (entry.kind === "sent") frame(BlockTypeSendPacket);
    else frame(BlockTypeMove, ZERO_MOVE);
  }
  const stream = zlib.deflateRawSync(Buffer.concat(frames));
  const parser = new DemoParser(
    new Uint8Array(
      Buffer.concat([buildHeader(initialBlock.length), initialBlock, stream]),
    ),
  );
  const { initialBlock: parsed } = await parser.load();
  const events: NetEventInfo[] = [];
  for (let block = parser.nextBlock(); block; block = parser.nextBlock()) {
    if (block.type === BlockTypePacket && block.parsed)
      events.push(...(block.parsed as { events: NetEventInfo[] }).events);
  }
  return { plan, initialBlock: parsed, parser, events };
}

describe("planDemoStart", () => {
  it("starts after the packet that ends the T2CSRI handshake", () => {
    const entries = [...handshake(), ...AFTER_HANDSHAKE];
    const plan = planDemoStart(entries, CONNECT_SEQUENCE);
    expect(plan.fallback).toBeUndefined();
    expect(plan.skip).toBe(8);
    expect(plan.gravity).toBe(Math.fround(-26.9));
    expect(plan.start).toMatchObject({
      taggedStrings: new Map([
        [0, "t2csri_pokeClient"],
        [1, "t2csri_getChallengeChunk"],
        [2, "t2csri_decryptChallenge"],
      ]),
      // Two of the three queued moves acked.
      lastMoveAck: 2,
      lastClientMove: 2,
      firstMoveIndex: 2,
      queuedMoves: 1,
      sensorGroup: 0,
      nextRecvEventSeq: 7,
      protocol: {
        lastSeqRecvd: 2,
        highestAckedSeq: 2,
        lastSendSeq: 3,
        // All three of the relay's packets went out after the poke.
        lastSeqRecvdAtSend: [0, 1, 1, 1, ...Array(28).fill(0)],
      },
    });
  });

  it("leaves out sounds, lightning and target frees during the handshake", () => {
    const plan = planDemoStart(
      handshake([
        sound(3),
        lightning(4),
        targetFree(5),
        ...CHALLENGE_EVENTS.map((event) => ({ ...event, seq: event.seq + 3 })),
      ]),
      CONNECT_SEQUENCE,
    );
    expect(plan.fallback).toBeUndefined();
    expect(plan.skip).toBe(8);
    expect(plan.start?.nextRecvEventSeq).toBe(10);
  });

  it("writes a start block that the rest of the stream continues", async () => {
    const { initialBlock, parser, events } = await recordFromPlan([
      ...handshake(),
      ...AFTER_HANDSHAKE,
    ]);
    expect(initialBlock.warnings).toEqual([]);
    expect([...initialBlock.taggedStrings.values()]).toEqual([
      "t2csri_pokeClient",
      "t2csri_getChallengeChunk",
      "t2csri_decryptChallenge",
    ]);
    expect(initialBlock.moves).toHaveLength(1);
    expect(initialBlock.notifyCount).toBe(1);
    expect(initialBlock.demoValues).toContain("-26.9");
    // The stock flow resumes at event 7 with no auth command left.
    expect(events.map((event) => event.parsedData?.type)).toEqual([
      "SetMissionCRCEvent",
      "NetStringEvent",
      "RemoteCommandEvent",
    ]);
    expect(events[0].parsedData).toMatchObject({ crc: 0x12345678 });
    const packetParser = parser.getPacketParser();
    expect(packetParser.protocolRejected).toBe(0);
    expect(packetParser.getNextRecvEventSeq()).toBe(10);
    expect(packetParser.getConnectionProtocolState()).toMatchObject({
      lastSeqRecvd: 3,
      highestAckedSeq: 4,
      lastSendSeq: 4,
    });
  });

  it("waits for a packet boundary with no guaranteed event waiting", () => {
    // Event 7 was lost and resent: 8 waits behind it until it arrives.
    const entries = [
      ...handshake([...CHALLENGE_EVENTS, netString(8, 3, "MsgListenState")]),
      MOVE,
      packet(serverPacket(3, { ack: 3, events: [netString(7, 4, "late")] })),
    ];
    const plan = planDemoStart(entries, CONNECT_SEQUENCE);
    expect(plan.fallback).toBeUndefined();
    expect(plan.skip).toBe(10);
    expect(plan.start?.nextRecvEventSeq).toBe(9);
    expect(plan.start?.taggedStrings.get(3)).toBe("MsgListenState");
  });

  it("keeps what the commands it leaves out saved in the demo values", async () => {
    // A broadcast that reached the connection during the handshake, as on
    // tournament-server-1's beachblitz: a join, its tag, its voice state.
    const name = "\x10\x0b\x08Guardzilla\x11";
    const tagged = "\x10\x0bTDD|\x08Guardzilla\x11";
    const { plan, initialBlock } = await recordFromPlan(
      handshake([
        ...CHALLENGE_EVENTS,
        netString(7, 3, "ServerMessage"),
        netString(8, 4, "MsgClientJoin"),
        netString(9, 5, "\x03%1 joined the game."),
        netString(10, 6, name),
        command(
          11,
          3,
          "\x014",
          "\x015",
          "\x016",
          "26497",
          "",
          "0",
          "",
          "",
          "0",
          "4514538",
        ),
        netString(12, 7, "MsgClientNameChanged"),
        command(13, 3, "\x017", "", "\x016", tagged, "26497"),
        netString(14, 8, "MsgListenState"),
        command(15, 3, "\x018", "", "1", "26497"),
      ]),
    );
    expect(plan.fallback).toBeUndefined();
    expect(plan.skip).toBe(8);
    const row = `${tagged}\t4514538\t26497\t\t0\t0\t0\t0\t0\t0\t0\t1\t0\t\t\t0`;
    expect(initialBlock.demoValues.slice(1, 3)).toEqual(["1", row]);
    expect(initialBlock.demoValues.slice(9, 19)).toEqual([
      ...Array(9).fill("<BLANK>"),
      `\x03${name} joined the game.`,
    ]);
  });

  it("saves the clock where a time-left message set it", () => {
    const poke = packet(
      serverPacket(1, {
        events: [
          gravityEvent(0, -26.9),
          netString(1, 0, "t2csri_pokeClient"),
          command(2, 0, "T2CSRI 1.5 - 08/09/2012"),
          netString(3, 3, "ServerMessage"),
          netString(4, 4, "MsgSystemClock"),
          command(5, 3, "\x014", "", "20", "600000"),
        ],
      }),
    );
    const plan = planDemoStart(
      handshake(
        [
          netString(6, 1, "t2csri_getChallengeChunk"),
          command(7, 1, "0123456789abcdef"),
          netString(8, 2, "t2csri_decryptChallenge"),
          command(9, 2),
        ],
        poke,
      ),
      CONNECT_SEQUENCE,
    );
    // Three 32 ms ticks off ten minutes left.
    expect(plan.script?.clockMinutes).toBeCloseTo(599904 / 60000, 9);
    expect(plan.start?.nextRecvEventSeq).toBe(10);
  });

  it("records from connect without a handshake to leave out", () => {
    const entries = [
      packet(
        serverPacket(1, {
          events: [gravityEvent(0, -20), missionCRC(1, 1)],
        }),
      ),
    ];
    expect(planDemoStart(entries, CONNECT_SEQUENCE)).toEqual({ skip: 0 });
  });

  it.each([
    [
      "an event the start block cannot hold",
      () => handshake([missionCRC(3, 1)]),
      "SetMissionCRCEvent before the start",
    ],
    [
      "ghost state",
      () => [POKE, packet(serverPacket(2, { compressionPoint: true }))],
      "ghost state before the start",
    ],
    [
      "a dispatch the connection disagrees with",
      () => [{ ...POKE, dispatched: false }, ...handshake().slice(1)],
      "packet 0 dispatch differs",
    ],
    [
      "acks for moves never queued",
      () => [POKE, SENT, packet(serverPacket(2, { ack: 1, lastMoveAck: 1 }))],
      "an ack for moves never queued",
    ],
    [
      "a packet sent past a full send window",
      () => [POKE, ...Array<DemoStreamEntry>(31).fill(SENT)],
      "a packet sent past a full window",
    ],
    ["a handshake that never ends", () => [POKE], "the handshake never ended"],
    [
      "guaranteed events still waiting",
      () => handshake([...CHALLENGE_EVENTS, netString(8, 3, "early")]),
      "guaranteed events still waiting",
    ],
  ])("records from connect on %s", (_, build, fallback) => {
    const plan = planDemoStart(build(), CONNECT_SEQUENCE);
    expect(plan).toEqual({
      skip: 0,
      fallback: expect.stringContaining(fallback),
    });
  });
});
