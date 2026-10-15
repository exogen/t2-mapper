/**
 * Where a relay recording starts. The recorder buffers the connection from
 * its first packet, but a TribesNext server opens every connection with
 * its in-band T2CSRI handshake, which a TribesNext client replaying the
 * demo fails, then disconnects. Retail recordings never contain it (F3
 * only works in-game), so the recording starts at the first packet
 * boundary after the handshake, from the state Tribes2.exe saves when
 * startRecord (FUN_005c3050) runs there.
 */
import {
  createLiveParser,
  freshConnectionProtocolState,
  type GravityEventData,
  type NetStringEventData,
  type PacketParser,
  type RemoteCommandEventData,
  type SetSensorGroupEventData,
} from "t2-demo-parser";
import { ClientScriptState } from "./clientScriptState.js";
import type { DemoScriptState, DemoStartState } from "./demoWriter.js";
import { MOVE_TICK_MS } from "./moveList.js";
import {
  AUTH_COMMANDS,
  GAME_PROTOCOL_VERSION,
  NetStringTable,
} from "./shared.js";

/**
 * A recorded connection entry, in the order the connection saw it.
 */
export type DemoStreamEntry =
  | { kind: "packet"; data: Uint8Array; dispatched: boolean }
  | { kind: "sent" | "move" };

export interface DemoStartPlan {
  /** Leading entries the recording leaves out. */
  skip: number;
  /** The connection's state after them; absent to record from connect. */
  start?: DemoStartState;
  /** World gravity at the start, from the connection's GravityEvent. */
  gravity?: number;
  /** Script state the left-out remote commands leave, for the demo values. */
  script?: DemoScriptState;
  /** Why a handshake stays in the recording, or the entries look wrong. */
  fallback?: string;
}

/** The server's last T2CSRI command; its stock connect flow follows. */
const HANDSHAKE_END = "t2csri_decryptChallenge";

/**
 * Events a start block can carry without datablocks, targets or ghosts:
 * the string table, gravity (the GRAVITY demo value), the sensor group,
 * and remote commands, whose saved script state the demo values carry.
 */
const START_BLOCK_EVENTS = new Set([
  "GravityEvent",
  "NetStringEvent",
  "RemoteCommandEvent",
  "SetSensorGroupEvent",
]);

/**
 * Events a start block can leave out because they leave nothing behind
 * this early: sounds and lightning strikes, whose AudioProfile datablock
 * and Lightning ghost the connection doesn't have yet, and frees of
 * target slots it holds nothing in (target info before the start is
 * unrepresentable, so none was sent).
 */
const STATELESS_EVENTS = new Set([
  "LightningStrikeEvent",
  "Sim2DAudioEvent",
  "Sim3DAudioEvent",
  "TargetFreeEvent",
]);

/**
 * checkPacketSend (FUN_005877e0) sends no data packet with more than this
 * many in flight, so playback would skip a marker past it.
 */
const MAX_IN_FLIGHT = 0x1d;

/** Packets the parser has read past the dnet header. */
function dispatchedCount(parser: PacketParser): number {
  return (
    parser.packetsParsed - parser.protocolRejected - parser.protocolNoDispatch
  );
}

/**
 * Find where a recording of these buffered entries starts: after the first
 * dispatched packet, once the handshake has ended, that leaves no
 * guaranteed event waiting. The entries replay through a client-side
 * parser from a fresh connection, as playback of the whole stream would,
 * and the recording stays from-connect if they reach anything the start
 * block can't carry or that disagrees with the connection's own record;
 * `fallback` says why when that keeps a handshake in the file or the
 * record itself looks wrong.
 */
export function planDemoStart(
  entries: readonly DemoStreamEntry[],
  connectSequence: number,
): DemoStartPlan {
  const { packetParser } = createLiveParser({
    protocolVersion: GAME_PROTOCOL_VERSION,
    connectionProtocolState: freshConnectionProtocolState(connectSequence),
  });
  const taggedStrings = new NetStringTable();
  const script = new ClientScriptState();
  let elapsedMs = 0;
  let gravity: number | undefined;
  let sensorGroup = 0;
  let lastMoveAck = 0;
  let lastClientMove = 0;
  let firstMoveIndex = 0;
  let queuedMoves = 0;
  let handshakeSeen = false;
  let handshakeEnded = false;
  // The stream reached state no start block can carry. Before any
  // handshake command, that means the server's stock connect flow began
  // without one, so there is nothing to leave out.
  const unrepresentable = (reason: string): DemoStartPlan =>
    handshakeSeen ? { skip: 0, fallback: reason } : { skip: 0 };

  for (const [index, entry] of entries.entries()) {
    if (entry.kind !== "packet") {
      if (entry.kind === "move") {
        queuedMoves++;
        elapsedMs += MOVE_TICK_MS;
      } else {
        const { lastSendSeq, highestAckedSeq } =
          packetParser.getConnectionProtocolState();
        if (lastSendSeq - highestAckedSeq > MAX_IN_FLIGHT)
          return { skip: 0, fallback: "a packet sent past a full window" };
        packetParser.onSendPacketTrigger();
      }
      continue;
    }

    const before = dispatchedCount(packetParser);
    let packet;
    try {
      packet = packetParser.parsePacket(entry.data);
    } catch (err) {
      return { skip: 0, fallback: `packet ${index} failed to parse: ${err}` };
    }
    const dispatched = dispatchedCount(packetParser) > before;
    if (dispatched !== entry.dispatched)
      return {
        skip: 0,
        fallback: `packet ${index} dispatch differs from the connection's`,
      };
    if (!dispatched) continue;
    if (packet.parseFault)
      return { skip: 0, fallback: `parse fault: ${packet.parseFault.message}` };
    const { gameState } = packet;
    if (
      packet.ghosts.length > 0 ||
      gameState.controlObjectGhostIndex !== undefined ||
      gameState.compressionPoint !== undefined
    )
      return unrepresentable("ghost state before the start");

    // GameConnection::readPacket (FUN_005fb9f0): the ack clamps to the
    // first queued move and raises lastClientMove, then each acked move
    // pops with no empty check.
    lastMoveAck = Math.max(gameState.lastMoveAck >>> 0, firstMoveIndex);
    lastClientMove = Math.max(lastClientMove, lastMoveAck);
    if (lastMoveAck - firstMoveIndex > queuedMoves)
      return { skip: 0, fallback: "an ack for moves never queued" };
    queuedMoves -= lastMoveAck - firstMoveIndex;
    firstMoveIndex = lastMoveAck;

    for (const { classId, parsedData } of packet.events) {
      const type = parsedData?.type;
      const name = typeof type === "string" ? type : `event class ${classId}`;
      if (STATELESS_EVENTS.has(name)) continue;
      if (!START_BLOCK_EVENTS.has(name))
        return unrepresentable(`${name} before the start`);
      if (name === "GravityEvent") {
        gravity = (parsedData as GravityEventData).gravity;
      } else if (name === "SetSensorGroupEvent") {
        sensorGroup = (parsedData as SetSensorGroupEventData).sensorGroup;
      } else if (name === "NetStringEvent") {
        taggedStrings.apply(parsedData as NetStringEventData);
      } else {
        const { argv, funcName } = parsedData as RemoteCommandEventData;
        const command = taggedStrings.resolve(funcName);
        if (AUTH_COMMANDS.includes(command)) handshakeSeen = true;
        if (command === HANDSHAKE_END) handshakeEnded = true;
        script.apply(argv, taggedStrings, elapsedMs);
      }
    }

    if (
      handshakeEnded &&
      packetParser.getPendingGuaranteedEvents().length === 0
    ) {
      return {
        skip: index + 1,
        gravity,
        script: script.save(elapsedMs),
        start: {
          taggedStrings: new Map(taggedStrings),
          lastMoveAck,
          lastClientMove,
          firstMoveIndex,
          sensorGroup,
          queuedMoves,
          protocol: packetParser.getConnectionProtocolState(),
          nextRecvEventSeq: packetParser.getNextRecvEventSeq(),
        },
      };
    }
  }
  if (handshakeEnded)
    return { skip: 0, fallback: "guaranteed events still waiting" };
  if (handshakeSeen) return { skip: 0, fallback: "the handshake never ended" };
  return { skip: 0 };
}
