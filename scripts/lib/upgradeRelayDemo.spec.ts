import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BlockTypeInfo,
  BlockTypeMove,
  BlockTypePacket,
  BlockTypeSendPacket,
  DemoParser,
  type PacketData,
  type RemoteCommandEventData,
} from "t2-demo-parser";
import {
  DEMO_HEADER_SIZE,
  DEMO_LENGTH_MS_OFFSET,
  ZERO_MOVE,
  buildDemoValues,
  buildHeader,
  buildInfoBlock,
  buildInitialBlock,
} from "../../relay/demoWriter.js";
import {
  readPacketHeader,
  skipRateBlocks,
  writeBits,
} from "../../relay/protocol.js";
import {
  CONNECT_SEQUENCE,
  cameraGhost,
  command,
  gravityEvent,
  netString,
  serverPacket,
  type ServerEvent,
} from "../../relay/serverPacketFixtures.js";
import {
  readBlocks,
  readMoveAck,
  upgradeRelayDemo,
  type RecordedBlock,
} from "./upgradeRelayDemo";
import { validateRelayDemoUpgrade } from "./validateRelayDemoUpgrade";

interface Block {
  type: number;
  data?: Uint8Array;
}

const MOVE: Block = { type: BlockTypeMove, data: ZERO_MOVE };
const SENT: Block = { type: BlockTypeSendPacket };
/**
 * A received packet as relays before 2026-10-13 wrote it: Info after every one.
 */
const received = (data: Uint8Array): Block[] => [
  { type: BlockTypePacket, data },
  { type: BlockTypeInfo, data: buildInfoBlock() },
];

const POKE = serverPacket(1, {
  events: [
    gravityEvent(0, -26.9),
    netString(1, 0, "t2csri_pokeClient"),
    command(2, 0, "T2CSRI 1.5 - 08/09/2012"),
  ],
});
const CHALLENGE_EVENTS = [
  netString(3, 1, "t2csri_getChallengeChunk"),
  command(4, 1, "0123456789abcdef"),
  netString(5, 2, "t2csri_decryptChallenge"),
  command(6, 2),
];
/**
 * The server's private greeting, which names our client.
 */
const WELCOME_EVENTS = [
  netString(7, 3, "ServerMessage"),
  netString(8, 4, "MsgClientJoin"),
  netString(9, 5, "\x03Welcome to Tribes2 %1."),
  command(10, 3, "\x014", "\x015", "MapGenius", "4242", "7"),
];
/**
 * Classic's welcome page as it begins: an empty MsgGameOver.
 */
const welcomePage = (seq: number): ServerEvent[] => [
  netString(seq, 6, "MsgGameOver"),
  command(seq + 1, 3, "\x016"),
];

/**
 * The opening of a T2CSRI connection that sent no moves: the poke, three
 * ticks of wall-clock moves and our packets, the challenge (acking our
 * first two packets), then one more tick and the welcome.
 */
function legacyOpening(lastMoveAcks: [number, number] = [0, 0]): Block[] {
  return [
    ...received(POKE),
    MOVE,
    SENT,
    MOVE,
    SENT,
    MOVE,
    SENT,
    ...received(
      serverPacket(2, {
        ack: 2,
        lastMoveAck: lastMoveAcks[0],
        events: CHALLENGE_EVENTS,
      }),
    ),
    MOVE,
    SENT,
    ...received(
      serverPacket(3, {
        ack: 4,
        lastMoveAck: lastMoveAcks[1],
        events: WELCOME_EVENTS,
      }),
    ),
  ];
}

/**
 * A recording from connect, written the way relays before 2026-10-14 did.
 */
function oldRecording(
  blocks: Block[],
  start?: Parameters<typeof buildInitialBlock>[0]["start"],
): Uint8Array {
  const initialBlock = buildInitialBlock({
    connectSequence: CONNECT_SEQUENCE,
    missionName: "Slapdash_RV",
    demoValues: buildDemoValues({
      recorderName: "MapGenius",
      clientId: 0,
      serverName: "biergarten",
      serverAddress: "1.2.3.4:28000",
      date: new Date(Date.UTC(2026, 8, 1, 4, 12)),
      missionDisplayName: "Slapdash_RV",
      mod: "Classic",
      gameType: "Capture the Flag",
    }),
    start,
  });
  const frames = blocks.map(({ type, data = new Uint8Array(0) }) => {
    const frame = new Uint8Array(2 + data.length);
    frame[0] = data.length & 0xff;
    frame[1] = (type << 4) | (data.length >> 8);
    frame.set(data, 2);
    return frame;
  });
  const header = buildHeader(initialBlock.length);
  new DataView(header.buffer).setUint32(
    DEMO_LENGTH_MS_OFFSET,
    blocks.filter((block) => block.type === BlockTypeMove).length * 32,
    true,
  );
  return new Uint8Array(
    Buffer.concat([
      header,
      initialBlock,
      zlib.deflateRawSync(Buffer.concat(frames)),
    ]),
  );
}

let dir: string;
beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "upgrade-relay-demo-"));
});
afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

async function upgrade(bytes: Uint8Array) {
  const output = path.join(dir, `${Math.random().toString(36).slice(2)}.rec`);
  const report = await upgradeRelayDemo(bytes, output);
  return { report, output };
}

async function readDemo(file: string) {
  const bytes = new Uint8Array(await fs.readFile(file));
  const parser = new DemoParser(bytes);
  const { header, initialBlock } = await parser.load();
  const blocks = readBlocks(bytes, header.initialBlockSize);
  const packets: PacketData[] = [];
  for (let block = parser.nextBlock(); block; block = parser.nextBlock()) {
    if (
      block.type === BlockTypePacket &&
      block.parsed &&
      "events" in block.parsed
    )
      packets.push(block.parsed);
  }
  return { header, initialBlock, blocks, packets };
}

const remoteCommands = (packets: PacketData[]): string[][] =>
  packets.flatMap((packet) =>
    packet.events.flatMap(({ parsedData }) =>
      parsedData?.type === "RemoteCommandEvent"
        ? [(parsedData as RemoteCommandEventData).argv]
        : [],
    ),
  );

/**
 * Where today's relay starts a recording: after the handshake.
 */
const cutStart = (taggedStrings: Map<number, string>) => ({
  taggedStrings,
  lastMoveAck: 3,
  lastClientMove: 3,
  firstMoveIndex: 3,
  sensorGroup: 0,
  queuedMoves: 0,
  protocol: {
    lastSeqRecvdAtSend: Array(32).fill(0),
    lastSeqRecvd: 2,
    highestAckedSeq: 4,
    lastSendSeq: 4,
    ackMask: 3,
    lastRecvAckAck: 1,
    connectionEstablished: true,
  },
  nextRecvEventSeq: 7,
});

describe("upgradeRelayDemo", () => {
  it("acknowledges the moves a connection that sent none would have sent", async () => {
    const { report, output } = await upgrade(oldRecording(legacyOpening()));
    expect(report).toMatchObject({
      generation: "unacked-moves",
      cutMs: 96,
      droppedTicks: 0,
      ackedPackets: 3,
      newLengthMs: 32,
      clientId: { old: 0, new: 4242 },
    });
    const { header, initialBlock, blocks, packets } = await readDemo(output);
    expect(initialBlock.warnings).toEqual([]);
    // Our packets 1 and 2 carried moves 0–1, which the challenge acked.
    expect(initialBlock).toMatchObject({
      lastMoveAck: 2,
      firstMoveIndex: 2,
      nextRecvEventSeq: 7,
    });
    expect(initialBlock.moves).toHaveLength(1);
    expect(header.demoLengthMs).toBe(32);
    expect(blocks.map((block) => block.type)).toEqual([
      BlockTypeMove,
      BlockTypeSendPacket,
      BlockTypePacket,
      BlockTypeInfo,
    ]);
    // Packets 3 and 4 carried moves 0–3; the welcome acks all of them.
    expect(packets).toHaveLength(1);
    expect(packets[0].gameState.lastMoveAck).toBe(4);
    expect(initialBlock.demoValues).toContain("-26.9");
    expect(initialBlock.demoValues).toContain("1\t4242\tMapGenius\t\t0");
  });

  it("changes only the move ack in the packets it keeps", async () => {
    const { output } = await upgrade(oldRecording(legacyOpening()));
    const { blocks } = await readDemo(output);
    const kept = blocks.find((block) => block.type === BlockTypePacket)!.data;
    expect(readMoveAck(kept)).toBe(4);
    expect(Buffer.from(kept)).toEqual(
      Buffer.from(
        serverPacket(3, { ack: 4, lastMoveAck: 4, events: WELCOME_EVENTS }),
      ),
    );
  });

  it("acknowledges only the moves of packets the server received", async () => {
    // Our packet 4 (moves 2–3) is lost; packet 3 carried moves 0–2.
    const blocks = legacyOpening();
    blocks.splice(
      -2,
      2,
      ...received(
        serverPacket(3, { ack: 4, ackMask: 0b10, events: WELCOME_EVENTS }),
      ),
      MOVE,
      SENT,
      ...received(serverPacket(4, { ack: 5 })),
    );
    const { output } = await upgrade(oldRecording(blocks));
    const { packets } = await readDemo(output);
    // Packet 5 resent moves 3 and 4 after the ack of 3.
    expect(packets.map((packet) => packet.gameState.lastMoveAck)).toEqual([
      3, 5,
    ]);
  });

  it("drops the ticks a backlog of unacknowledged moves would stall", async () => {
    // The server falls silent: one move is unacked at the start, so 28
    // more queue before the relay stops collecting.
    const blocks = [...legacyOpening().slice(0, -4), ...Array(40).fill(MOVE)];
    const { report, output } = await upgrade(oldRecording(blocks));
    expect(report).toMatchObject({ droppedTicks: 12, newLengthMs: 28 * 32 });
    const { initialBlock } = await readDemo(output);
    expect(initialBlock.moves).toHaveLength(1);
  });

  it("only cuts a recording whose moves the server acknowledged", async () => {
    const original = oldRecording(legacyOpening([2, 3]));
    const { report, output } = await upgrade(original);
    expect(report).toMatchObject({
      generation: "from-connect",
      cutMs: 96,
      ackedPackets: 0,
    });
    const { initialBlock, blocks } = await readDemo(output);
    expect(initialBlock).toMatchObject({ lastMoveAck: 2, firstMoveIndex: 2 });
    const kept = blocks.find((block) => block.type === BlockTypePacket)!.data;
    expect(Buffer.from(kept)).toEqual(
      Buffer.from(
        serverPacket(3, { ack: 4, lastMoveAck: 3, events: WELCOME_EVENTS }),
      ),
    );
  });

  it("leaves a recording that already starts after the handshake", async () => {
    const original = oldRecording(
      [MOVE],
      cutStart(new Map([[0, "t2csri_pokeClient"]])),
    );
    const { report, output } = await upgrade(original);
    expect(report.generation).toBe("current");
    await expect(fs.access(output)).rejects.toThrow();
  });

  it("keeps the start of a server with no handshake, and leaves it once upgraded", async () => {
    const original = oldRecording([
      ...received(
        serverPacket(1, {
          events: [
            netString(0, 3, "ServerMessage"),
            netString(1, 4, "MsgClientJoin"),
            netString(2, 5, "\x03Welcome to Tribes2 %1."),
            command(3, 3, "\x014", "\x015", "MapGenius", "4242", "7"),
          ],
        }),
      ),
      MOVE,
      SENT,
      ...received(serverPacket(2, { ack: 1, lastMoveAck: 1 })),
    ]);
    const { report, output } = await upgrade(original);
    expect(report).toMatchObject({
      generation: "from-connect",
      cutMs: 0,
      clientId: { old: 0, new: 4242 },
    });
    const again = await upgrade(new Uint8Array(await fs.readFile(output)));
    expect(again.report.generation).toBe("current");
    await expect(fs.access(again.output)).rejects.toThrow();
  });

  it("rewrites a welcome page that arrives after the camera", async () => {
    const blocks = [
      ...legacyOpening(),
      MOVE,
      SENT,
      ...received(serverPacket(4, { ack: 5, events: [cameraGhost(11)] })),
      MOVE,
      SENT,
      ...received(
        serverPacket(5, { ack: 6, camera: true, events: welcomePage(12) }),
      ),
    ];
    const { report, output } = await upgrade(oldRecording(blocks));
    expect(report).toMatchObject({
      generation: "unacked-moves",
      gameOversRewritten: 1,
    });
    const { packets } = await readDemo(output);
    // The page's message type is now its command's tag, ServerMessage.
    expect(remoteCommands(packets).at(-1)).toEqual(["\x013", "\x013"]);
  });

  it("rewrites only the welcome page of a recording that already starts after the handshake", async () => {
    const blocks = [
      ...received(serverPacket(3, { ack: 4, events: [cameraGhost(7)] })),
      MOVE,
      ...received(
        serverPacket(4, { ack: 4, camera: true, events: welcomePage(8) }),
      ),
    ];
    const original = oldRecording(
      blocks,
      cutStart(new Map([[3, "ServerMessage"]])),
    );
    const { report, output } = await upgrade(original);
    expect(report).toMatchObject({
      generation: "current",
      gameOversRewritten: 1,
    });
    const { header, blocks: written, packets } = await readDemo(output);
    expect(remoteCommands(packets)).toEqual([["\x013", "\x013"]]);
    const { header: recordedHeader } = await new DemoParser(original).load();
    const initialEnd = DEMO_HEADER_SIZE + header.initialBlockSize;
    expect(header.demoLengthMs).toBe(recordedHeader.demoLengthMs);
    expect(
      Buffer.from((await fs.readFile(output)).subarray(0, initialEnd)),
    ).toEqual(Buffer.from(original.subarray(0, initialEnd)));
    const recorded = readBlocks(original, recordedHeader.initialBlockSize);
    expect(written.map((block) => block.type)).toEqual(
      recorded.map((block) => block.type),
    );
    const changed = written.filter(
      (block, i) => Buffer.compare(block.data, recorded[i].data) !== 0,
    );
    expect(changed).toHaveLength(1);
  });
});

/**
 * A recording from connect that gets a camera, then `ticks` ticks of
 * moves, each followed by our packet and the server's next.
 */
function cameraRecording(ticks: number): Uint8Array {
  const blocks = [
    ...legacyOpening(),
    MOVE,
    SENT,
    ...received(serverPacket(4, { ack: 5, events: [cameraGhost(11)] })),
  ];
  for (let i = 0; i < ticks; i++)
    blocks.push(
      MOVE,
      SENT,
      ...received(serverPacket(5 + i, { ack: 6 + i, camera: true })),
    );
  return oldRecording(blocks);
}

/**
 * The demo with its blocks changed by `change`.
 */
async function repack(
  bytes: Uint8Array,
  change: (blocks: RecordedBlock[]) => void,
): Promise<Uint8Array> {
  const { header } = await new DemoParser(bytes).load();
  const blocks = readBlocks(bytes, header.initialBlockSize).map((block) => ({
    ...block,
    data: block.data.slice(),
  }));
  change(blocks);
  const frames = blocks.map(({ type, data }) => {
    const frame = new Uint8Array(2 + data.length);
    frame[0] = data.length & 0xff;
    frame[1] = (type << 4) | (data.length >> 8);
    frame.set(data, 2);
    return frame;
  });
  const start = DEMO_HEADER_SIZE + header.initialBlockSize;
  return new Uint8Array(
    Buffer.concat([
      bytes.subarray(0, start),
      zlib.deflateRawSync(Buffer.concat(frames)),
    ]),
  );
}

describe("validateRelayDemoUpgrade", () => {
  async function upgradeCameraRecording() {
    const original = cameraRecording(40);
    const { report, output } = await upgrade(original);
    return {
      original,
      report,
      upgraded: new Uint8Array(await fs.readFile(output)),
    };
  }

  it("passes an upgrade Tribes2.exe plays to the end", async () => {
    const { original, report, upgraded } = await upgradeCameraRecording();
    const { problems, playback } = await validateRelayDemoUpgrade(
      original,
      upgraded,
      report,
      "camera.rec",
    );
    expect(problems).toEqual([]);
    expect(playback.firstControlMs).toBeDefined();
    expect(playback.playedMs).toBe(report.newLengthMs);
  });

  it("fails an upgrade that changed a packet beyond its move ack", async () => {
    const { original, report, upgraded } = await upgradeCameraRecording();
    const tampered = await repack(upgraded, (blocks) => {
      const packet = blocks.findLast(
        (block) => block.type === BlockTypePacket,
      )!;
      packet.data[packet.data.length - 1] ^= 0x80;
    });
    const { problems } = await validateRelayDemoUpgrade(
      original,
      tampered,
      report,
      "camera.rec",
    );
    expect(problems).toContainEqual(
      expect.stringMatching(/changed 1 bits outside the move ack/),
    );
  });

  it("fails an upgrade that playback would dispatch differently", async () => {
    const { original, report, upgraded } = await upgradeCameraRecording();
    const undispatched = await repack(upgraded, (blocks) => {
      blocks.splice(
        blocks.findLastIndex((block) => block.type === BlockTypeInfo),
        1,
      );
    });
    const { problems } = await validateRelayDemoUpgrade(
      original,
      undispatched,
      report,
      "camera.rec",
    );
    expect(problems).toContainEqual(
      expect.stringMatching(/^1 packets dispatched differently/),
    );
  });

  it("fails an upgrade whose move acks would still stall playback", async () => {
    const { original, report, upgraded } = await upgradeCameraRecording();
    const unacked = await repack(upgraded, (blocks) => {
      for (const [index, block] of blocks.entries()) {
        if (block.type !== BlockTypePacket) continue;
        if (blocks[index + 1]?.type !== BlockTypeInfo) continue;
        const { bs } = readPacketHeader(block.data)!;
        skipRateBlocks(bs);
        writeBits(block.data, bs.getCurPos(), 0, 32);
      }
    });
    const { problems } = await validateRelayDemoUpgrade(
      original,
      unacked,
      report,
      "camera.rec",
    );
    expect(problems).toContainEqual(expect.stringMatching(/^playback stalls/));
  });
});
