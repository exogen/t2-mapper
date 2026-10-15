/**
 * How Tribes2.exe would play a demo, as far as the parts that decide
 * whether it plays at all (binary-verified):
 *
 * - advanceTime (FUN_00602430) checks isBacklogged (FUN_00601e50) before
 *   each tick: all of the connection's queued moves processed and 30 or
 *   more of them. Backlogged, it reads no further blocks, so a backlog no
 *   block can clear stalls playback for good.
 * - Each tick reads blocks through the next Move block (processNextBlock,
 *   FUN_00588420). collectMove (FUN_00601ca0) then admits one recorded
 *   move while fewer than 46 are queued, and advanceObjects (FUN_00602720)
 *   processes every queued move once a control object exists.
 * - A SendPacket block sends only with the packet window open
 *   (checkPacketSend, FUN_005877e0); each send queues a notify, and
 *   handleNotify pops one per acknowledged packet with no empty check.
 * - GameConnection::readPacket (FUN_005fb9f0) clamps the move ack to the
 *   first queued move, raises lastClientMove, and pops each acknowledged
 *   move, from the recorded moves once the queue is empty, with no empty
 *   check. It reads the control object before the packet's events.
 * - A MsgGameOver switches the client to the debrief screen, and only
 *   initialControlSet switches back: when a packet sets the control object
 *   while there is none (EndGhosting clears it).
 */
import {
  BlockTypeInfo,
  BlockTypeMove,
  BlockTypePacket,
  BlockTypeSendPacket,
  DemoParser,
  type GhostingMessageEventData,
  type NetStringEventData,
  type RemoteCommandEventData,
} from "t2-demo-parser";
import { DEMO_TICK_MS } from "../../relay/demoWriter.js";
import { END_GHOSTING, isGameOverMessage } from "../../relay/joinGameOver.js";
import { ConnectionProtocol, readPacketHeader } from "../../relay/protocol.js";
import {
  AUTH_COMMANDS,
  NetStringTable,
  hasGameOverAnnouncement,
} from "../../relay/shared.js";

/**
 * isBacklogged's MaxMoveCount.
 */
const BACKLOG_MOVES = 30;
/**
 * collectMove admits recorded moves while fewer than this are queued.
 */
const MAX_QUEUED_MOVES = 0x2e;
/**
 * checkPacketSend sends nothing with more packets than this in flight.
 */
const MAX_IN_FLIGHT = 0x1d;

/**
 * What playback did, with demo times in ms on the move-tick clock.
 */
export interface Tribes2Playback {
  /**
   * Demo time played before stalling or running out of blocks.
   */
  playedMs: number;
  /**
   * When playback backlogged for good.
   */
  stalledAtMs?: number;
  firstControlMs?: number;
  maxQueuedMoves: number;
  /**
   * Packets the connection protocol rejects (duplicates, stale sequence).
   */
  rejectedPackets: number;
  /**
   * SendPacket blocks playback skips because the window is full.
   */
  blockedSends: number;
  /**
   * Dispatched packets the parser could not read.
   */
  parseFaults: number;
  /**
   * An acknowledged move popped from an empty queue (a crash).
   */
  moveUnderflowAtMs?: number;
  /**
   * An acknowledged packet with no notify queued (a crash).
   */
  notifyUnderflowAtMs?: number;
  /**
   * Packets playback dispatches differently from the recording, which
   * follows each packet it dispatched with an Info block: data playback
   * loses (or reads twice), as after a send past a full window.
   */
  dispatchMismatches: number;
  firstDispatchMismatchMs?: number;
  /**
   * Info blocks that follow no packet.
   */
  strayInfoBlocks: number;
  /**
   * T2CSRI commands, which a TribesNext client fails and disconnects on.
   */
  authCommands: string[];
  /**
   * A MsgGameOver that leaves the debrief screen up while a control object
   * exists: whether it announces the end of the match.
   */
  debriefScreens: { atMs: number; announced: boolean }[];
}

/**
 * Play a demo the way Tribes2.exe would, through its last block or until
 * it stalls.
 */
export async function playLikeTribes2(
  bytes: Uint8Array,
): Promise<Tribes2Playback> {
  const parser = new DemoParser(bytes);
  const { initialBlock } = await parser.load();
  const protocol = new ConnectionProtocol();
  Object.assign(protocol, {
    ...initialBlock.connectionState,
    lastSeqRecvdAtSend: initialBlock.connectionState.lastSeqRecvdAtSend.slice(),
  });
  const strings = new NetStringTable(initialBlock.taggedStrings);
  const result: Tribes2Playback = {
    playedMs: 0,
    maxQueuedMoves: initialBlock.moves.length,
    rejectedPackets: 0,
    blockedSends: 0,
    parseFaults: 0,
    dispatchMismatches: 0,
    strayInfoBlocks: 0,
    authCommands: [],
    debriefScreens: [],
  };
  let ticks = 0;
  const now = () => ticks * DEMO_TICK_MS;
  let notifies = initialBlock.notifyCount;
  protocol.onNotify = () => {
    if (--notifies < 0) result.notifyUnderflowAtMs ??= now();
  };
  let queued = initialBlock.moves.length;
  let recorded = 0;
  let first = initialBlock.firstMoveIndex >>> 0;
  let lastClientMove = initialBlock.lastClientMove >>> 0;
  let hasControl =
    initialBlock.controlObjectGhostIndex !== -1 &&
    initialBlock.controlObjectGhostIndex !== 0xffffffff;
  const authCommands = new Set<string>();
  let previousWasPacket = false;

  let block = parser.nextBlock();
  ticking: while (block) {
    if (lastClientMove - first === queued && queued >= BACKLOG_MOVES) {
      result.stalledAtMs = now();
      break;
    }
    for (;;) {
      if (!block) break ticking;
      const current = block;
      block = parser.nextBlock();
      if (current.type === BlockTypeInfo) {
        if (!previousWasPacket) result.strayInfoBlocks++;
        previousWasPacket = false;
        continue;
      }
      previousWasPacket = current.type === BlockTypePacket;
      if (current.type === BlockTypeMove) {
        recorded++;
        break;
      }
      if (current.type === BlockTypeSendPacket) {
        if (protocol.lastSendSeq - protocol.highestAckedSeq > MAX_IN_FLIGHT) {
          result.blockedSends++;
        } else {
          protocol.buildSendPacketHeader();
          notifies++;
        }
        continue;
      }
      if (current.type !== BlockTypePacket) continue;
      const received = readPacketHeader(current.data);
      const check = received
        ? protocol.processReceivedHeader(received.header)
        : { accepted: false, dispatchData: false };
      if (check.dispatchData !== (block?.type === BlockTypeInfo)) {
        result.dispatchMismatches++;
        result.firstDispatchMismatchMs ??= now();
      }
      if (!check.accepted) {
        result.rejectedPackets++;
        continue;
      }
      if (!check.dispatchData) continue;
      const packet = current.parsed;
      if (
        !packet ||
        !("events" in packet) ||
        packet.parseFault ||
        current.parseError
      ) {
        result.parseFaults++;
        continue;
      }
      let ack = packet.gameState.lastMoveAck >>> 0;
      if (ack < first) ack = first;
      if (lastClientMove < ack) lastClientMove = ack;
      for (; first < ack; first++) {
        if (queued > 0) queued--;
        else if (recorded > 0) recorded--;
        else result.moveUnderflowAtMs ??= now();
      }
      if (packet.gameState.controlObjectGhostIndex !== undefined) {
        hasControl = true;
        result.firstControlMs ??= now();
      }
      for (const { parsedData } of packet.events) {
        if (parsedData?.type === "NetStringEvent") {
          strings.apply(parsedData as NetStringEventData);
        } else if (
          parsedData?.type === "GhostingMessageEvent" &&
          (parsedData as GhostingMessageEventData).message === END_GHOSTING
        ) {
          hasControl = false;
        } else if (parsedData?.type === "RemoteCommandEvent") {
          const [command, msgType, body] = (
            parsedData as RemoteCommandEventData
          ).argv.map((arg) => strings.resolve(arg));
          if (AUTH_COMMANDS.includes(command)) authCommands.add(command);
          if (hasControl && isGameOverMessage(command, msgType))
            result.debriefScreens.push({
              atMs: now(),
              announced: hasGameOverAnnouncement(body),
            });
        }
      }
    }
    if (recorded > 0 && queued < MAX_QUEUED_MOVES) {
      queued++;
      recorded--;
    }
    if (hasControl) lastClientMove = first + queued;
    result.maxQueuedMoves = Math.max(result.maxQueuedMoves, queued);
    ticks++;
  }
  result.playedMs = now();
  result.authCommands = [...authCommands];
  return result;
}
