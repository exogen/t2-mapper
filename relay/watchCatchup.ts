import type {
  GhostStateAccumulator,
  PacketParser,
  ParsedData,
} from "t2-demo-parser";
import type { WatchStateAccumulator } from "./watchState.js";
import type { WatchCatchupPayload } from "./types.js";

/**
 * Assemble a catch-up payload from the relay's parsed state at the
 * current packet boundary. Pure snapshot — shared by WatchSession and
 * the demo-driven equivalence tests.
 */
export function buildCatchupPayload(options: {
  packetParser: PacketParser;
  ghostState: GhostStateAccumulator;
  watchState: WatchStateAccumulator;
  epoch: number;
  serverAddress: string;
}): WatchCatchupPayload {
  const { packetParser, ghostState, watchState, epoch, serverAddress } =
    options;
  const dbMap =
    packetParser.getDataBlockDataMap() ?? new Map<number, ParsedData>();
  return {
    epoch,
    serverAddress,
    taggedStrings: watchState.getTaggedStrings(),
    dataBlocks: [...dbMap.entries()].map(([objectId, blockData]) => [
      objectId,
      {
        className: watchState.dataBlockClassNames.get(objectId) ?? "",
        data: blockData,
      },
    ]),
    targetEntries: watchState.getTargetEntries(),
    sensorGroupColors: watchState.getSensorGroupColors(),
    connectionState: packetParser.getConnectionProtocolState(),
    nextRecvEventSeq: packetParser.getNextRecvEventSeq(),
    initialGhosts: ghostState.toInitialGhosts(),
    controlObjectGhostIndex: watchState.controlObjectGhostIndex,
    controlObjectData: watchState.controlObjectData,
    missionName: watchState.missionName,
    compressionPoint: { ...packetParser.getCompressionPoint() },
    pendingGuaranteedEvents: packetParser.getPendingGuaranteedEvents(),
    playerSensorGroup: watchState.playerSensorGroup,
    hudState: watchState.getHudState(),
  };
}
