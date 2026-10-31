import { describe, expect, it } from "vitest";
import type { GhostUpdate, PacketData, ParsedData } from "t2-demo-parser";
import {
  type ServerEvent,
  watchRelaySource,
} from "../../relay/serverPacketFixtures";
import { GhostMessage } from "./entityClassification";
import { latestAction } from "./actionSlot";
import { TestLiveStream } from "./streamTestFixtures";

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
    const source = watchRelaySource();
    const early = new TestLiveStream();
    early.hydrate(source.payload());
    const late = new TestLiveStream();
    const send = (message: number) => {
      const packet = source.send((seq) => ghostingEvent(seq, message));
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
    late.hydrate(watchRelaySource().payload());
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
    const source = watchRelaySource();
    const early = new TestLiveStream();
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
    const late = new TestLiveStream();
    late.hydrate(source.payload());
    const pose = (viewer: TestLiveStream) => {
      const player = viewer.getSnapshot().entities[0];
      return {
        mountObjectId: player.mountObjectId,
        mountNode: player.mountNode,
        action: latestAction(player.actionSlot),
      };
    };
    expect(pose(late)).toEqual(pose(early));
    if (update.mountObject === -1 && update.action === undefined)
      expect(pose(late).action).toBeUndefined();
  });
});
