/**
 * A server's welcome page can strand Tribes2.exe playback of a relay
 * recording. Classic servers show it on the debrief screen: an empty
 * MsgGameOver, whose handleGameOverMessage switches to DebriefGui, then
 * the page as debrief lines. Only GameConnection::initialControlSet
 * switches back, and GameConnection::readPacket (FUN_005fb9f0) calls it
 * only when a packet sets the control object while there is none. A
 * client still loading the mission gets its camera after the page; the
 * relay loads faster, and when its camera wins the race playback stays on
 * the debrief screen to the end (Esc stops playback). Within the first 30
 * seconds of a recording, such a page's message type is swapped in place
 * for the command's own name, which no message callback handles.
 */
import {
  BitStream,
  createLiveParser,
  freshConnectionProtocolState,
  type GhostingMessageEventData,
  type NetEventInfo,
  type NetStringEventData,
  type PacketParser,
  type RemoteCommandEventData,
} from "t2-demo-parser";
import type { DemoStreamEntry } from "./demoStart.js";
import type { DemoStartState } from "./demoWriter.js";
import { MOVE_TICK_MS } from "./moveList.js";
import { writeBits } from "./protocol.js";
import { isServerMessageCommand } from "./serverMessageDecode.js";
import {
  GAME_PROTOCOL_VERSION,
  NetStringTable,
  hasGameOverAnnouncement,
} from "./shared.js";

/**
 * How far into a recording a welcome page is rewritten.
 */
export const JOIN_GAME_OVER_WINDOW_MS = 30_000;

/**
 * GhostingMessageEvent's EndGhosting: every ghost is deleted, the control
 * object with them.
 */
export const END_GHOSTING = 2;

/**
 * RemoteCommandEvent::unpack (FUN_005bfda0) reads argc (5 bits), then each
 * argument; a tag is code 2 (2 bits) and its id (10 bits). A ServerMessage's
 * message type id follows argc and its tagged command name.
 */
export const TAG_ID_BITS = 10;
export const MESSAGE_TYPE_ID_OFFSET = 5 + (2 + TAG_ID_BITS) + 2;

/**
 * Whether a remote command, its arguments resolved, is a MsgGameOver,
 * which switches the client to the debrief screen.
 */
export function isGameOverMessage(
  command: string | undefined,
  msgType: string | undefined,
): boolean {
  return (
    isServerMessageCommand(command ?? "") &&
    msgType?.toLowerCase() === "msggameover"
  );
}

/**
 * What the filter made of a recording entry: a welcome page rewritten, one
 * it had to leave as it is, or a stream it stopped following.
 */
export type JoinGameOverOutcome = "rewritten" | "left" | "stopped";

/**
 * Where a recording's stream starts: the connection state its start block
 * holds.
 */
export type JoinGameOverStart = Pick<
  DemoStartState,
  "taggedStrings" | "protocol" | "nextRecvEventSeq"
>;

export class JoinGameOverFilter {
  /**
   * Follows the stream until the window closes or the stream stops
   * parsing.
   */
  private parser: PacketParser | null;
  private readonly taggedStrings: NetStringTable;
  private elapsedMs = 0;
  private hasCamera = false;

  /**
   * Filter a recording that starts from `start`, or from connect.
   */
  static forRecording(
    start: JoinGameOverStart | undefined,
    connectSequence: number,
  ): JoinGameOverFilter {
    const { packetParser } = createLiveParser({
      protocolVersion: GAME_PROTOCOL_VERSION,
      connectionProtocolState: start
        ? { ...start.protocol, connectSequence }
        : freshConnectionProtocolState(connectSequence),
      nextRecvEventSeq: start?.nextRecvEventSeq,
    });
    return new JoinGameOverFilter(packetParser, start?.taggedStrings);
  }

  private constructor(
    parser: PacketParser,
    taggedStrings: ReadonlyMap<number, string> = new Map(),
  ) {
    this.parser = parser;
    this.taggedStrings = new NetStringTable(taggedStrings);
  }

  /**
   * Take the recording's next entry, rewriting a packet in place when it
   * carries a welcome page that would strand playback. A page is left when
   * its event arrived out of order, in a packet already recorded, or isn't
   * packed as tags.
   */
  apply(entry: DemoStreamEntry): JoinGameOverOutcome | undefined {
    const parser = this.parser;
    if (!parser) return undefined;
    if (entry.kind !== "packet") {
      if (entry.kind === "sent") {
        parser.onSendPacketTrigger();
      } else {
        this.elapsedMs += MOVE_TICK_MS;
        if (this.elapsedMs >= JOIN_GAME_OVER_WINDOW_MS) this.parser = null;
      }
      return undefined;
    }
    try {
      return this.applyPacket(parser, entry.data);
    } catch {
      // A stream the parser can't follow is recorded as it is.
      this.parser = null;
      return "stopped";
    }
  }

  private applyPacket(
    parser: PacketParser,
    data: Uint8Array,
  ): JoinGameOverOutcome | undefined {
    // Guaranteed events released from the queue were read from earlier
    // packets, whose bits are already recorded.
    const queued = new Set<NetEventInfo>(
      parser.getPendingGuaranteedEvents().map(({ event }) => event),
    );
    const packet = parser.parsePacket(data);
    if (packet.parseFault) {
      this.parser = null;
      return "stopped";
    }
    // The control object is read before the packet's events.
    if (packet.gameState.controlObjectGhostIndex !== undefined)
      this.hasCamera = true;
    let outcome: JoinGameOverOutcome | undefined;
    for (const event of packet.events) {
      const parsed = event.parsedData;
      if (parsed?.type === "NetStringEvent") {
        this.taggedStrings.apply(parsed as NetStringEventData);
      } else if (
        parsed?.type === "GhostingMessageEvent" &&
        (parsed as GhostingMessageEventData).message === END_GHOSTING
      ) {
        this.hasCamera = false;
      } else if (
        parsed?.type === "RemoteCommandEvent" &&
        this.hasCamera &&
        this.isWelcomePage(parsed as RemoteCommandEventData)
      ) {
        const rewritten =
          !queued.has(event) &&
          swapMessageType(
            data,
            event.dataBitsStart,
            parsed as RemoteCommandEventData,
          );
        if (rewritten) outcome ??= "rewritten";
        else outcome = "left";
      }
    }
    return outcome;
  }

  private isWelcomePage({ argv }: RemoteCommandEventData): boolean {
    const [command, msgType, body] = argv.map((arg) =>
      this.taggedStrings.resolve(arg),
    );
    return (
      isGameOverMessage(command, msgType) && !hasGameOverAnnouncement(body)
    );
  }
}

/**
 * Give a ServerMessage the message type its command is named by: both are
 * tags of the same width, so only the type's id changes.
 */
function swapMessageType(
  data: Uint8Array,
  eventStart: number,
  { argv }: RemoteCommandEventData,
): boolean {
  const [command, msgType] = argv;
  if (command?.charCodeAt(0) !== 1 || msgType?.charCodeAt(0) !== 1)
    return false;
  const typeIdAt = eventStart + MESSAGE_TYPE_ID_OFFSET;
  const typeId = parseInt(msgType.slice(1), 10);
  if (new BitStream(data, typeIdAt).readInt(TAG_ID_BITS) !== typeId)
    return false;
  writeBits(data, typeIdAt, parseInt(command.slice(1), 10), TAG_ID_BITS);
  return true;
}
