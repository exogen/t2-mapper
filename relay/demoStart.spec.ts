import { describe, expect, it } from "vitest";
import zlib from "node:zlib";
import {
  BlockTypeInfo,
  BlockTypeMove,
  BlockTypePacket,
  BlockTypeSendPacket,
  DemoParser,
  NetEventClassFirst,
  createDefaultRegistry,
  type NetEventInfo,
} from "t2-demo-parser";
import { BitStreamWriter } from "./BitStreamWriter.js";
import { packNetString, writeString } from "./HuffmanWriter.js";
import { planDemoStart, type DemoStreamEntry } from "./demoStart.js";
import {
  ZERO_MOVE,
  buildDemoValues,
  buildHeader,
  buildInfoBlock,
  buildInitialBlock,
} from "./demoWriter.js";

const CONNECT_SEQUENCE = 0x0badf00d;
const registry = createDefaultRegistry();

interface ServerEvent {
  seq: number;
  className: string;
  write: (bs: BitStreamWriter) => void;
}

const netString = (seq: number, id: number, value: string): ServerEvent => ({
  seq,
  className: "NetStringEvent",
  write(bs) {
    bs.writeInt(id, 10);
    bs.writeFlag(true);
    writeString(bs, value, true);
  },
});

/** commandToClient with a tagged function name, as the server packs it. */
const command = (seq: number, tag: number, ...args: string[]): ServerEvent => ({
  seq,
  className: "RemoteCommandEvent",
  write(bs) {
    bs.writeInt(1 + args.length, 5);
    bs.writeInt(2, 2);
    bs.writeInt(tag, 10);
    for (const arg of args) packNetString(bs, arg, true);
  },
});

const gravityEvent = (seq: number, gravity: number): ServerEvent => ({
  seq,
  className: "GravityEvent",
  write(bs) {
    const view = new DataView(new ArrayBuffer(4));
    view.setFloat32(0, gravity, true);
    bs.writeU32(view.getUint32(0, true));
  },
});

const missionCRC = (seq: number, crc: number): ServerEvent => ({
  seq,
  className: "SetMissionCRCEvent",
  write: (bs) => bs.writeU32(crc),
});

/**
 * A server→client data packet: dnet header, rate info, the client half of
 * GameConnection::readPacket (FUN_005fb9f0), guaranteed events, no ghosts.
 */
function serverPacket(
  seq: number,
  opts: {
    /** Highest of our data packets acknowledged, all acked through it. */
    ack?: number;
    lastMoveAck?: number;
    events?: ServerEvent[];
    compressionPoint?: boolean;
  } = {},
): Uint8Array {
  const bs = new BitStreamWriter(1500);
  bs.writeFlag(true);
  bs.writeInt(CONNECT_SEQUENCE & 1, 1);
  bs.writeInt(seq & 0x1ff, 9);
  const ack = opts.ack ?? 0;
  bs.writeInt(ack & 0x1ff, 9);
  bs.writeInt(0, 2); // DataPacket
  const ackMask = ack ? (1 << Math.min(ack, 8)) - 1 : 0;
  bs.writeInt(ackMask ? 1 : 0, 3);
  if (ackMask) bs.writeInt(ackMask, 8);
  bs.writeFlag(false); // rate info
  bs.writeFlag(false);
  bs.writeU32(opts.lastMoveAck ?? 0);
  bs.writeFlag(false); // damage flash
  bs.writeFlag(false); // lock state
  bs.writeFlag(false); // seeker
  bs.writeFlag(false); // pinged
  bs.writeFlag(false); // jammed
  bs.writeFlag(opts.compressionPoint ?? false);
  if (opts.compressionPoint) {
    bs.writeFlag(false); // no control object: a compression point
    for (let i = 0; i < 3; i++) bs.writeU32(0);
  }
  bs.writeFlag(false); // target visibility
  bs.writeFlag(false); // fov
  bs.writeFlag(false); // no unguaranteed events
  for (const event of opts.events ?? []) {
    bs.writeFlag(true);
    bs.writeFlag(false); // explicit sequence number
    bs.writeInt(event.seq & 0x7f, 7);
    bs.writeInt(
      registry.getEventClassId(event.className)! - NetEventClassFirst,
      6,
    );
    event.write(bs);
  }
  bs.writeFlag(false);
  bs.writeFlag(false); // no ghosts
  return bs.getBuffer();
}

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
