/**
 * Rewrite a recording made by an older relay as the file today's relay
 * writes from the same connection, so recordings from before the
 * Tribes2.exe compatibility fixes play there too. Received packets keep
 * their bytes (but for the move ack and the control object below); the
 * start, the moves and the demo values come from the relay's own
 * recording code:
 *
 * - Until 2026-10-12 the relay sent the server no moves, and the recorder
 *   wrote a Move block per 32 ms of wall clock that no lastMoveAck ever
 *   popped. Tribes2.exe playback backlogs (FUN_00601e50) once its control
 *   object has processed 30 of them, and then never reads another block.
 *   The connection is replayed as if it had generated and sent its moves
 *   the way gameConnection.ts does, and each dispatched packet gets the
 *   move ack the server would have written for them and the control
 *   object state their ticks would have left (legacyControlObject.ts).
 * - Until 2026-10-14 every recording began at the connection's first
 *   packet, T2CSRI handshake included. It now starts where planDemoStart
 *   puts it.
 * - A server's welcome page that arrives after the camera, early in the
 *   recording, gets the rewrite JoinGameOverFilter gives it, in recordings
 *   that already start where today's relay starts them too.
 */
import { setTimeout as sleep } from "node:timers/promises";
import zlib from "node:zlib";
import {
  BitStream,
  BlockTypeInfo,
  BlockTypeMove,
  BlockTypePacket,
  BlockTypeSendPacket,
  DemoParser,
  type InitialBlockData,
} from "t2-demo-parser";
import { planDemoStart, type DemoStreamEntry } from "../../relay/demoStart.js";
import {
  DEMO_HEADER_SIZE,
  DEMO_TICK_MS,
  DemoFileWriter,
  ZERO_MOVE,
  buildDemoValues,
  buildInfoBlock,
  buildInitialBlock,
  formatDemoDate,
  type DemoValuesInfo,
} from "../../relay/demoWriter.js";
import { JoinGameOverFilter } from "../../relay/joinGameOver.js";
import {
  ClientMoveList,
  GENERATED_MOVE_BACKLOG,
  NEUTRAL_MOVE,
} from "../../relay/moveList.js";
import {
  ConnectionProtocol,
  readPacketHeader,
  skipRateBlocks,
  writeBits,
} from "../../relay/protocol.js";
import { WatchStateAccumulator } from "../../relay/watchState.js";
import { parseDemoHeaderDate } from "../../src/stream/demoDate";
import { extractMissionInfo } from "../../src/stream/demoStreaming";
import {
  LegacyControlObject,
  controlObjectLayouts,
  type ControlObjectLayout,
} from "./legacyControlObject.js";

/**
 * Which relay wrote a recording, by what it left in the file: from
 * connect with wall-clock moves no packet acknowledges, from connect with
 * the moves the connection sent, or already starting where today's relay
 * starts it (rewritten only for its welcome page).
 */
export type RelayDemoGeneration = "unacked-moves" | "from-connect" | "current";

/**
 * What a rewrite did to one recording.
 */
export interface RelayDemoUpgrade {
  generation: RelayDemoGeneration;
  oldLengthMs: number;
  newLengthMs: number;
  /**
   * Demo time the new start leaves out (the handshake).
   */
  cutMs: number;
  /**
   * Recorded ticks that queue no move because GENERATED_MOVE_BACKLOG moves
   * are unacknowledged.
   */
  droppedTicks: number;
  /**
   * Where those ticks were, as runs on the original's clock.
   */
  droppedRuns: DroppedRun[];
  /**
   * Dispatched packets given the move ack their sender would have written.
   */
  ackedPackets: number;
  /**
   * Camera packets given the pitch the server's ticks would have clamped.
   */
  clampedPitches: number;
  /**
   * Player packets whose velocity, set by a hit no tick spent, was zeroed.
   */
  zeroedVelocities: number;
  /**
   * Player packets reduced to the compression point, their state the one
   * the client last received.
   */
  omittedPlayerStates: number;
  /**
   * Welcome pages rewritten so playback leaves the debrief screen.
   */
  gameOversRewritten: number;
  /**
   * Why the recording still starts at the connection's first packet.
   */
  fallback?: string;
  /**
   * The recorder's client id in the demo values, before and after.
   */
  clientId: { old: number; new: number };
}

/**
 * Consecutive dropped ticks: `ms` of the original's demo time from
 * `fromMs`.
 */
export interface DroppedRun {
  fromMs: number;
  ms: number;
}

/**
 * Where a moment of the original recording falls in the upgraded one:
 * the cut moves everything earlier, and a dropped tick everything after
 * it.
 */
export function upgradedTimeMs(
  upgrade: Pick<RelayDemoUpgrade, "cutMs" | "droppedRuns">,
  originalMs: number,
): number {
  let droppedMs = 0;
  for (const { fromMs, ms } of upgrade.droppedRuns) {
    if (fromMs >= originalMs) break;
    droppedMs += Math.min(ms, originalMs - fromMs);
  }
  return Math.max(0, originalMs - droppedMs - upgrade.cutMs);
}

/**
 * Demo time as m:ss.
 */
export function formatDemoTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * A block of the recorded stream.
 */
export interface RecordedBlock {
  type: number;
  data: Uint8Array;
}

/**
 * The block stream: one raw DEFLATE stream of U16 (type << 12 | size)
 * framed blocks after the header and initial block.
 */
export function readBlocks(
  bytes: Uint8Array,
  initialBlockSize: number,
): RecordedBlock[] {
  const inflated = zlib.inflateRawSync(
    bytes.subarray(DEMO_HEADER_SIZE + initialBlockSize),
  );
  // A plain Uint8Array, whose slice() copies (a Buffer's returns a view).
  const stream = new Uint8Array(
    inflated.buffer,
    inflated.byteOffset,
    inflated.byteLength,
  );
  const blocks: RecordedBlock[] = [];
  let offset = 0;
  while (offset + 2 <= stream.length) {
    const typeSize = stream[offset] | (stream[offset + 1] << 8);
    const end = offset + 2 + (typeSize & 0xfff);
    if (end > stream.length) throw new Error("Truncated block stream");
    blocks.push({
      type: typeSize >> 12,
      data: stream.subarray(offset + 2, end),
    });
    offset = end;
  }
  return blocks;
}

/**
 * A recording's entries as its blocks hold them, each packet dispatched
 * when an Info block follows it, as relay recordings write them. Packet
 * entries share the blocks' bytes.
 */
export function recordedEntries(
  blocks: readonly RecordedBlock[],
): DemoStreamEntry[] {
  const entries: DemoStreamEntry[] = [];
  for (const [index, block] of blocks.entries()) {
    if (block.type === BlockTypeMove) entries.push({ kind: "move" });
    else if (block.type === BlockTypeSendPacket) entries.push({ kind: "sent" });
    else if (block.type === BlockTypePacket)
      entries.push({
        kind: "packet",
        data: block.data,
        dispatched: blocks[index + 1]?.type === BlockTypeInfo,
      });
  }
  return entries;
}

/**
 * Bit offset of a dispatched packet's move ack.
 */
export function moveAckOffset(data: Uint8Array): number {
  const { bs } = readPacketHeader(data)!;
  skipRateBlocks(bs);
  return bs.getCurPos();
}

export function readMoveAck(data: Uint8Array): number {
  return new BitStream(data, moveAckOffset(data)).readInt(32) >>> 0;
}

interface Replay {
  entries: DemoStreamEntry[];
  /**
   * The highest move ack in any dispatched packet.
   */
  maxAck: number;
  moves: number;
  droppedTicks: number;
  droppedRuns: DroppedRun[];
  ackedPackets: number;
  clampedPitches: number;
  zeroedVelocities: number;
  omittedPlayerStates: number;
}

/**
 * The connection's entries as the relay's recorder buffers them, each
 * packet marked dispatched as GameConnection decides it (the protocol
 * state of a fresh connection, advanced by every packet sent and
 * received). Info blocks are left out: the writer derives them.
 *
 * With `sendMoves`, the connection is replayed as if it had sent its
 * moves (gameConnection.ts since 2026-10-12): each recorded tick queues a
 * neutral move unless GENERATED_MOVE_BACKLOG are unacknowledged, each
 * data packet carries the moves moveWritePacket picks, and each
 * dispatched packet acknowledges what the server had received when it
 * wrote it: the moves of every packet its header reports delivered
 * (moveReadPacket, FUN_00601f30), none left queued. The control object
 * those moves ticked (`controlObjects`, its layouts by block index) is
 * then what LegacyControlObject leaves of it.
 */
function replayConnection(
  blocks: readonly RecordedBlock[],
  connectSequence: number,
  sendMoves: boolean,
  controlObjects: ReadonlyMap<number, ControlObjectLayout> = new Map(),
): Replay {
  const protocol = new ConnectionProtocol();
  protocol.connectSequence = connectSequence;
  const moveList = new ClientMoveList();
  const sentMoves = new Map<number, { start: number; end: number }>();
  let serverAck = 0;
  protocol.onNotify = (seq, delivered) => {
    const sent = sentMoves.get(seq);
    sentMoves.delete(seq);
    // A start past the ack jumps it over moves that never arrived, so the
    // ack ends at the packet's last move either way.
    if (delivered && sent && sent.end > serverAck) serverAck = sent.end;
  };
  const replay: Replay = {
    entries: [],
    maxAck: 0,
    moves: 0,
    droppedTicks: 0,
    droppedRuns: [],
    ackedPackets: 0,
    clampedPitches: 0,
    zeroedVelocities: 0,
    omittedPlayerStates: 0,
  };
  const controlObject = new LegacyControlObject();
  let recordedMs = 0;
  for (const [index, block] of blocks.entries()) {
    if (block.type === BlockTypeMove) {
      const atMs = recordedMs;
      recordedMs += DEMO_TICK_MS;
      if (sendMoves) {
        if (moveList.size >= GENERATED_MOVE_BACKLOG) {
          replay.droppedTicks++;
          const run = replay.droppedRuns.at(-1);
          if (run && run.fromMs + run.ms === atMs) run.ms += DEMO_TICK_MS;
          else replay.droppedRuns.push({ fromMs: atMs, ms: DEMO_TICK_MS });
          continue;
        }
        moveList.push(NEUTRAL_MOVE);
      }
      replay.moves++;
      replay.entries.push({ kind: "move" });
    } else if (block.type === BlockTypeSendPacket) {
      protocol.buildSendPacketHeader();
      if (sendMoves) {
        const { start, moves } = moveList.takePacketMoves();
        sentMoves.set(protocol.lastSendSeq, {
          start,
          end: start + moves.length,
        });
      }
      replay.entries.push({ kind: "sent" });
    } else if (block.type === BlockTypePacket) {
      let data: Uint8Array = block.data.slice();
      const received = readPacketHeader(data);
      const dispatched =
        !!received &&
        protocol.processReceivedHeader(received.header).dispatchData;
      if (dispatched) {
        if (sendMoves) {
          writeBits(data, moveAckOffset(data), serverAck, 32);
          moveList.acknowledge(serverAck);
          replay.ackedPackets++;
          const ticked = controlObject.tick(data, controlObjects.get(index));
          data = ticked.data;
          if (ticked.clampedPitch) replay.clampedPitches++;
          if (ticked.zeroedVelocity) replay.zeroedVelocities++;
          if (ticked.omittedState) replay.omittedPlayerStates++;
        }
        replay.maxAck = Math.max(replay.maxAck, readMoveAck(data));
      }
      replay.entries.push({ kind: "packet", data, dispatched });
    }
  }
  return replay;
}

/**
 * The recorder's client id, for demo values that lack it: the relay reads
 * it from ConnectAccept, which no recording holds, but the server's
 * welcome MsgClientJoin names the same client before the mission loads.
 */
function findRecorderClientId(
  parser: DemoParser,
  initialBlock: InitialBlockData,
): number | undefined {
  const watchState = new WatchStateAccumulator();
  for (const [id, value] of initialBlock.taggedStrings)
    watchState.netStrings.set(id, value);
  for (let block = parser.nextBlock(); block; block = parser.nextBlock()) {
    const parsed = block.type === BlockTypePacket ? block.parsed : undefined;
    if (!parsed || !("events" in parsed)) continue;
    watchState.applyPacket(parsed);
    if (watchState.selfClientId != null) return watchState.selfClientId;
    if (parsed.gameState.controlObjectGhostIndex !== undefined) return;
  }
}

/**
 * The demo values' recording facts, as the recorder passed them to
 * buildDemoValues. Throws unless rebuilding them reproduces the
 * recording's PJ rows exactly.
 */
function recordedDemoValuesInfo(
  demoValues: string[],
): DemoValuesInfo & { clientId: number } {
  const info = extractMissionInfo(demoValues);
  const iso = info.recordingDate && parseDemoHeaderDate(info.recordingDate);
  if (!iso || !info.recorderName || !info.serverAddress)
    throw new Error("Not a relay recording's demo values");
  const recorded = {
    recorderName: info.recorderName,
    clientId: info.recorderClientId ?? 0,
    serverName: info.serverDisplayName ?? "",
    serverAddress: info.serverAddress,
    date: new Date(iso),
    missionDisplayName: info.missionDisplayName ?? "",
    mod: info.mod ?? "",
    gameType: info.missionType ?? "",
  };
  const tail = demoValues.slice(demoValues.indexOf("NewDemoData"));
  const rebuilt = buildDemoValues(recorded);
  if (
    formatDemoDate(recorded.date) !== info.recordingDate ||
    JSON.stringify(rebuilt.slice(rebuilt.indexOf("NewDemoData"))) !==
      JSON.stringify(tail)
  )
    throw new Error("Unrecognized relay demo values");
  return recorded;
}

/**
 * The writer's deflate backlog that pauses the rewrite until it drains.
 */
const MAX_WRITE_BACKLOG = 16 * 1024 * 1024;

/**
 * Write a demo file item by item, letting the writer's deflate backlog
 * drain as it goes; nothing is left behind if writing fails.
 */
async function writeDemoFile<T>(
  outputPath: string,
  initialBlock: Uint8Array,
  lengthMs: number,
  items: Iterable<T>,
  write: (writer: DemoFileWriter, item: T) => void,
): Promise<void> {
  const writer = new DemoFileWriter(outputPath, { flushIntervalMs: 0 });
  writer.begin(initialBlock);
  try {
    for (const item of items) {
      write(writer, item);
      while (writer.bufferedBytes > MAX_WRITE_BACKLOG) await sleep(1);
      if (writer.failed) throw writer.failed;
    }
    await writer.finalize(lengthMs);
  } catch (err) {
    await writer.abort();
    throw err;
  }
}

/**
 * Upgrade one relay recording, writing the result to `outputPath` unless
 * it is already current.
 */
export async function upgradeRelayDemo(
  bytes: Uint8Array,
  outputPath: string,
): Promise<RelayDemoUpgrade> {
  const parser = new DemoParser(bytes);
  const { header, initialBlock } = await parser.load();
  const { connectSequence, lastSeqRecvd } = initialBlock.connectionState;
  const recorded = recordedDemoValuesInfo(initialBlock.demoValues);
  const report: RelayDemoUpgrade = {
    generation: "current",
    oldLengthMs: header.demoLengthMs,
    newLengthMs: header.demoLengthMs,
    cutMs: 0,
    droppedTicks: 0,
    droppedRuns: [],
    ackedPackets: 0,
    clampedPitches: 0,
    zeroedVelocities: 0,
    omittedPlayerStates: 0,
    gameOversRewritten: 0,
    clientId: { old: recorded.clientId, new: recorded.clientId },
  };
  const recordedInitial = bytes.subarray(
    DEMO_HEADER_SIZE,
    DEMO_HEADER_SIZE + header.initialBlockSize,
  );
  const blocks = readBlocks(bytes, header.initialBlockSize);
  // A recording from connect starts with no connection state at all.
  const fromConnect =
    lastSeqRecvd === 0 &&
    initialBlock.nextRecvEventSeq === 0 &&
    initialBlock.taggedStrings.size === 0;
  if (!fromConnect)
    return rewriteWelcomePages(
      initialBlock,
      recordedInitial,
      blocks,
      report,
      outputPath,
    );

  let replay = replayConnection(blocks, connectSequence, false);
  report.generation = "from-connect";
  if (replay.maxAck === 0 && replay.moves > 0) {
    replay = replayConnection(
      blocks,
      connectSequence,
      true,
      await controlObjectLayouts(bytes),
    );
    report.generation = "unacked-moves";
    report.droppedTicks = replay.droppedTicks;
    report.droppedRuns = replay.droppedRuns;
    report.ackedPackets = replay.ackedPackets;
    report.clampedPitches = replay.clampedPitches;
    report.zeroedVelocities = replay.zeroedVelocities;
    report.omittedPlayerStates = replay.omittedPlayerStates;
  }

  const plan = planDemoStart(replay.entries, connectSequence);
  report.fallback = plan.fallback;
  const clientId =
    recorded.clientId || findRecorderClientId(parser, initialBlock);
  report.clientId.new = clientId ?? 0;
  const initial = buildInitialBlock({
    connectSequence,
    missionName: initialBlock.missionName,
    demoValues: buildDemoValues({
      ...recorded,
      clientId,
      gravity: plan.gravity,
      script: plan.script,
    }),
    start: plan.start,
  });

  const kept = replay.entries.slice(plan.skip);
  for (const entry of replay.entries.slice(0, plan.skip))
    if (entry.kind === "move") report.cutMs += DEMO_TICK_MS;
  const joinGameOver = JoinGameOverFilter.forRecording(
    plan.start,
    connectSequence,
  );
  for (const entry of kept)
    if (joinGameOver.apply(entry) === "rewritten") report.gameOversRewritten++;
  report.newLengthMs =
    kept.filter((entry) => entry.kind === "move").length * DEMO_TICK_MS;

  // A server with no handshake, recorded by a relay that sent its moves,
  // is already recorded from connect as today's relay records it.
  if (
    header.demoLengthMs === report.newLengthMs &&
    writesSameFile(recordedInitial, blocks, initial, kept)
  ) {
    return {
      ...report,
      generation: "current",
      droppedTicks: 0,
      droppedRuns: [],
      ackedPackets: 0,
      clampedPitches: 0,
      zeroedVelocities: 0,
      omittedPlayerStates: 0,
    };
  }

  await writeDemoFile(
    outputPath,
    initial,
    report.newLengthMs,
    kept,
    (writer, entry) => writer.writeEntry(entry),
  );
  return report;
}

/**
 * A recording that already starts where today's relay starts it: only its
 * welcome page can need rewriting, and every other byte stays.
 */
async function rewriteWelcomePages(
  initialBlock: InitialBlockData,
  recordedInitial: Uint8Array,
  blocks: readonly RecordedBlock[],
  report: RelayDemoUpgrade,
  outputPath: string,
): Promise<RelayDemoUpgrade> {
  const joinGameOver = JoinGameOverFilter.forRecording(
    {
      taggedStrings: initialBlock.taggedStrings,
      protocol: initialBlock.connectionState,
      nextRecvEventSeq: initialBlock.nextRecvEventSeq,
    },
    initialBlock.connectionState.connectSequence,
  );
  // The entries share the blocks' bytes, so a rewrite lands in the blocks.
  for (const entry of recordedEntries(blocks))
    if (joinGameOver.apply(entry) === "rewritten") report.gameOversRewritten++;
  if (report.gameOversRewritten === 0) return report;
  await writeDemoFile(
    outputPath,
    recordedInitial,
    report.oldLengthMs,
    blocks,
    (writer, block) => writer.writeBlock(block.type, block.data),
  );
  return report;
}

/**
 * Whether writing `initial` and `entries` reproduces the recording's
 * initial block and blocks exactly.
 */
function writesSameFile(
  recordedInitial: Uint8Array,
  blocks: readonly RecordedBlock[],
  initial: Uint8Array,
  entries: readonly DemoStreamEntry[],
): boolean {
  if (Buffer.compare(recordedInitial, initial) !== 0) return false;
  const info = buildInfoBlock();
  const written: RecordedBlock[] = [];
  for (const entry of entries) {
    if (entry.kind === "packet") {
      written.push({ type: BlockTypePacket, data: entry.data });
      if (entry.dispatched) written.push({ type: BlockTypeInfo, data: info });
    } else if (entry.kind === "move") {
      written.push({ type: BlockTypeMove, data: ZERO_MOVE });
    } else {
      written.push({ type: BlockTypeSendPacket, data: new Uint8Array(0) });
    }
  }
  return (
    written.length === blocks.length &&
    written.every(
      (block, i) =>
        block.type === blocks[i].type &&
        Buffer.compare(block.data, blocks[i].data) === 0,
    )
  );
}
