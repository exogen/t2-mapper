import { describe, expect, it } from "vitest";
import {
  createLiveParser,
  GhostStateAccumulator,
  passiveObserverProtocolState,
  type GhostUpdate,
  type PacketData,
  type ParsedData,
} from "t2-demo-parser";
import {
  serverPacket,
  type ServerEvent,
} from "../../relay/serverPacketFixtures";
import { GAME_PROTOCOL_VERSION } from "../../relay/shared";
import { buildCatchupPayload } from "../../relay/watchCatchup";
import {
  deserializeCatchupPayload,
  serializeCatchupPayload,
} from "../../relay/watchSerialize";
import { WatchStateAccumulator } from "../../relay/watchState";
import { GhostMessage } from "./entityClassification";
import { LiveStreamAdapter } from "./liveStreaming";
import type { RelayClient } from "./relayClient";

class Viewer extends LiveStreamAdapter {
  constructor() {
    super({} as RelayClient, { mode: "watch" });
  }
  ghost(update: GhostUpdate) {
    this.processGhostUpdate(update);
  }
}

function relay() {
  const kit = createLiveParser({ protocolVersion: GAME_PROTOCOL_VERSION });
  kit.packetParser.setConnectionProtocolState(
    passiveObserverProtocolState(serverPacket(1)[0]),
  );
  const ghostState = new GhostStateAccumulator();
  const watchState = new WatchStateAccumulator();
  return {
    ...kit,
    ghostState,
    watchState,
    payload() {
      return deserializeCatchupPayload(
        serializeCatchupPayload(
          buildCatchupPayload({
            packetParser: kit.packetParser,
            ghostState,
            watchState,
            epoch: 1,
            serverAddress: "test:28000",
          }),
        ),
      );
    },
  };
}

const ghostingEvent = (seq: number, message: number): ServerEvent => ({
  seq,
  className: "GhostingMessageEvent",
  write(bs) {
    bs.writeU32(1);
    bs.writeInt(message, 3);
    bs.writeInt(0, 11);
  },
});

describe("watch world readiness", () => {
  it("restores completion and clears it on EndGhosting, mission change and reconnect", () => {
    const source = relay();
    const early = new Viewer();
    early.hydrate(source.payload());
    const late = new Viewer();
    let sequence = 0;
    const send = (message: number) => {
      const packet = serverPacket(sequence + 1, {
        events: [ghostingEvent(sequence++, message)],
      });
      const parsed = source.packetParser.parsePacket(packet);
      expect(parsed.parseFault).toBeUndefined();
      source.watchState.applyPacket(parsed);
      source.ghostState.applyPacket(parsed);
      early.feedPacket(packet);
      late.hydrate(source.payload());
      expect(late.getSnapshot().ghostAlwaysDoneSec).toBe(
        early.getSnapshot().ghostAlwaysDoneSec,
      );
    };

    late.hydrate(source.payload());
    expect(late.getSnapshot().ghostAlwaysDoneSec).toBeNull();
    send(GhostMessage.GhostAlwaysDone);
    expect(late.getSnapshot().ghostAlwaysDoneSec).toBe(0);
    send(GhostMessage.EndGhosting);
    expect(late.getSnapshot().ghostAlwaysDoneSec).toBeNull();
    send(GhostMessage.GhostAlwaysDone);

    source.watchState.applyMissionStart("MissionStartPhase1", [
      "2",
      "Katabatic",
    ]);
    late.hydrate(source.payload());
    expect(late.getSnapshot().ghostAlwaysDoneSec).toBeNull();
    send(GhostMessage.GhostAlwaysDone);
    late.hydrate(relay().payload());
    expect(late.getSnapshot().ghostAlwaysDoneSec).toBeNull();

    const oldRelay = source.payload();
    delete oldRelay.ghostingComplete;
    late.hydrate(oldRelay);
    expect(late.getSnapshot().ghostAlwaysDoneSec).toBeNull();
  });
});

describe("watch player actions", () => {
  it.each([
    { name: "unmount", update: { mountObject: -1 } },
    {
      name: "unmount with a new pose",
      update: {
        mountObject: -1,
        action: 20,
        actionAtEnd: false,
        actionHoldAtEnd: true,
      },
    },
    {
      name: "new action without a position",
      update: { action: 35, actionAtEnd: false, actionHoldAtEnd: false },
    },
    {
      name: "new action at position zero",
      update: {
        action: 35,
        actionAnimPos: 0,
        actionAtEnd: false,
        actionHoldAtEnd: false,
      },
    },
  ])("matches uninterrupted playback after $name", ({ update }) => {
    const source = relay();
    const early = new Viewer();
    early.hydrate(source.payload());
    const apply = (type: "create" | "update", parsedData: ParsedData) => {
      const ghost: GhostUpdate = {
        index: 1,
        type,
        classId: source.registry.getGhostClassId("Player"),
        updateBitsStart: 0,
        updateBitsEnd: 0,
        parsedData,
      };
      source.ghostState.applyPacket({
        events: [],
        ghosts: [ghost],
      } as unknown as PacketData);
      early.ghost(ghost);
    };
    apply("create", {
      mountObject: 4,
      mountNode: 2,
      action: 16,
      actionAtEnd: true,
      actionHoldAtEnd: true,
      actionAnimPos: 0.5,
    });
    apply("update", update);
    const late = new Viewer();
    late.hydrate(source.payload());
    const pose = (viewer: Viewer) => {
      const player = viewer.getSnapshot().entities[0];
      return {
        mountObjectId: player.mountObjectId,
        mountNode: player.mountNode,
        actionAnim: player.actionAnim,
        actionAtEnd: player.actionAtEnd,
        actionHoldAtEnd: player.actionHoldAtEnd,
        actionAnimPos: player.actionAnimPos,
      };
    };
    expect(pose(late)).toEqual(pose(early));
    if (update.mountObject === -1 && update.action === undefined)
      expect(pose(late).actionAnim).toBeUndefined();
  });
});
