import {
  BlockTypeMove,
  BlockTypePacket,
  type DemoParser,
  type PacketData,
} from "t2-demo-parser";

/** One consumer's independent cursor over a completed demo. */
export interface DemoLookaheadFork {
  source: DemoParser;
  parser: DemoParser;
  rebase(): void;
}

export function forkDemoLookahead(
  source: DemoParser,
): DemoLookaheadFork | undefined {
  if (!source.isComplete || typeof source.fork !== "function") return;
  const parser = source.fork();
  const { owner } = parser.createCheckpoint();
  return {
    source,
    parser,
    rebase() {
      parser.restoreCheckpoint({ ...source.createCheckpoint(), owner });
    },
  };
}

/** Read one speculative block without applying rejected or non-dispatched packets.
 * Exceptions stay with the caller, which decides how long to abandon speculation. */
export function readDemoLookaheadBlock(
  parser: DemoParser,
  protocol: ReturnType<DemoParser["getPacketParser"]>,
): PacketData | "move" | "skip" | "stop" {
  const { protocolRejected, protocolNoDispatch } = protocol;
  const block = parser.nextBlock();
  if (!block || block.parseError) return "stop";
  if (block.type === BlockTypeMove) return "move";
  if (block.type !== BlockTypePacket) return "skip";
  const packet = block.parsed as PacketData | undefined;
  if (packet?.parseFault) return "stop";
  if (
    !packet ||
    protocol.protocolRejected > protocolRejected ||
    protocol.protocolNoDispatch > protocolNoDispatch
  )
    return "skip";
  return packet;
}
