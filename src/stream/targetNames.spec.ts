import { afterEach, describe, expect, it } from "vitest";
import {
  BlockTypeMove,
  GhostStateAccumulator,
  createLiveParser,
  type DemoParser,
  type PacketData,
  type ParsedData,
} from "t2-demo-parser";
import { WatchStateAccumulator } from "../../relay/watchState";
import { buildCatchupPayload } from "../../relay/watchCatchup";
import {
  deserializeCatchupPayload,
  serializeCatchupPayload,
} from "../../relay/watchSerialize";
import { LiveStreamAdapter } from "./liveStreaming";
import { createRecordingFromParser } from "./demoStreaming";
import { streamEntityToGameEntity } from "./entityBridge";
import type { RelayClient } from "./relayClient";
import type { StreamSnapshot } from "./types";
import { flagLabel } from "../state/flagTeam";
import { setStreamSnapshot } from "../state/streamSnapshotStore";

afterEach(() => setStreamSnapshot(null));

const names = [
  { name: "TAG|Alice", raw: "\x10\x0bTAG|\x08Alice\x11" },
  { name: "Smurf", raw: "\x0cSmurf" },
  { name: "Bot", raw: "\x0eBot" },
];

function packet(...events: ParsedData[]): PacketData {
  return {
    gameState: {},
    ghosts: [],
    events: events.map((parsedData) => ({ parsedData })),
  } as unknown as PacketData;
}

function fixture() {
  const kit = createLiveParser({
    dataBlocks: [[1, { shapeName: "light_male.dts" }]],
  });
  const watchState = new WatchStateAccumulator();
  const ghostState = new GhostStateAccumulator();
  watchState.dataBlockClassNames.set(1, "PlayerData");
  ghostState.applyPacket({
    ...packet(),
    ghosts: names.map((_, index) => ({
      index,
      type: "create",
      classId: kit.registry.getGhostClassId("Player")!,
      updateBitsStart: 0,
      updateBitsEnd: 0,
      parsedData: {
        dataBlockId: 1,
        targetId: 32 + index,
        position: { x: index, y: 0, z: 100 },
      },
    })),
  });
  watchState.applyPacket(
    packet({ type: "NetStringEvent", id: 20, value: "_ClientConnection" }),
  );
  // Exercise both immediate and deferred string resolution at the relay.
  names.forEach(({ raw }, index) => {
    const string = { type: "NetStringEvent", id: index, value: raw };
    const target = {
      type: "TargetInfoEvent",
      targetId: 32 + index,
      nameTag: index,
      typeTag: 20,
      sensorGroup: 1,
      renderFlags: 0,
    };
    watchState.applyPacket(
      packet(...(index % 2 ? [target, string] : [string, target])),
    );
  });
  const payload = () =>
    deserializeCatchupPayload(
      serializeCatchupPayload(
        buildCatchupPayload({
          packetParser: kit.packetParser,
          watchState,
          ghostState,
          epoch: 1,
          serverAddress: "test:28000",
        }),
      ),
    );
  return { kit, watchState, ghostState, payload };
}

function expectNames(snapshot: StreamSnapshot) {
  for (const [index, { name, raw }] of names.entries()) {
    const entity = snapshot.entities.find((e) => e.targetId === 32 + index);
    expect(entity).toMatchObject({
      playerName: name,
      playerRawName: raw,
      targetTypeName: "_ClientConnection",
    });
    expect(streamEntityToGameEntity(entity!)).toMatchObject({
      renderType: "Player",
      playerName: name,
      playerRawName: raw,
      targetTypeName: "_ClientConnection",
    });
  }
}

describe("initial target names", () => {
  it("retains the original flag target when catch-up only contains its carrier's ghost", () => {
    const { watchState, payload } = fixture();
    watchState.applyPacket(
      packet(
        { type: "NetStringEvent", id: 30, value: "Storm" },
        { type: "NetStringEvent", id: 31, value: "Flag" },
        {
          type: "TargetInfoEvent",
          targetId: 40,
          nameTag: 30,
          typeTag: 31,
          renderFlags: 2,
          sensorGroup: 1,
        },
        { type: "TargetInfoEvent", targetId: 32, renderFlags: 2 },
      ),
    );
    const stream = new LiveStreamAdapter({} as RelayClient, { mode: "watch" });
    stream.hydrate(payload());
    const snapshot = stream.getSnapshot();
    expect(snapshot.flagTargets).toEqual([
      {
        targetId: 40,
        name: "Storm",
        typeName: "Flag",
        skinName: undefined,
        teamId: 1,
      },
    ]);
    expect(snapshot.entities.some((entity) => entity.targetId === 40)).toBe(
      false,
    );
    setStreamSnapshot(snapshot);
    const carrier = streamEntityToGameEntity(
      snapshot.entities.find((entity) => entity.targetId === 32)!,
    );
    expect(flagLabel(carrier, "original", {})).toBe("Storm Flag");
    expect(flagLabel(carrier, "contextual", {})).toBe("TAG|Alice");
  });
  it("does not reattach a freed ghost to a reissued target during relay catch-up", () => {
    const { ghostState, watchState, payload } = fixture();
    const updates = packet(
      { type: "TargetFreeEvent", targetId: 32 },
      { type: "TargetInfoEvent", targetId: 32, nameTag: 1, typeTag: 20 },
    );
    ghostState.applyPacket(updates);
    watchState.applyPacket(updates);
    const stream = new LiveStreamAdapter({} as RelayClient, { mode: "watch" });
    stream.hydrate(payload());
    const entity = stream
      .getSnapshot()
      .entities.find((entity) => entity.ghostIndex === 0)!;
    expect(entity.targetId).toBe(-1);
    expect(entity.playerName).toBeUndefined();
    expect(entity.targetTypeName).toBeUndefined();
  });
  it("retains colors through relay catch-up, serialization and reconnects", () => {
    const { payload } = fixture();
    const stream = new LiveStreamAdapter({} as RelayClient, { mode: "watch" });
    for (const epoch of [1, 2]) {
      stream.hydrate({ ...payload(), epoch });
      expectNames(stream.getSnapshot());
    }
  });

  it("preserves colors when a recorded demo already has players at its start", () => {
    const { kit, watchState, payload } = fixture();
    watchState.applyPacket(
      packet(
        { type: "NetStringEvent", id: 30, value: "Flag" },
        {
          type: "TargetInfoEvent",
          targetId: 40,
          typeTag: 30,
          renderFlags: 2,
          sensorGroup: 0,
        },
        { type: "TargetInfoEvent", targetId: 32, renderFlags: 2 },
      ),
    );
    const initial = payload();
    let cursor = 0;
    const parser = {
      header: { demoLengthMs: 1000 },
      initialBlock: {
        ...initial,
        dataBlocks: new Map(initial.dataBlocks),
        taggedStrings: new Map(initial.taggedStrings),
        initialEvents: [],
        demoValues: [],
        firstPerson: true,
        connectionFields: [0, 0, 0, 0, 0, 0],
        moves: [],
      },
      getRegistry: () => kit.registry,
      getGhostTracker: () => kit.ghostTracker,
      getPacketParser: () => kit.packetParser,
      reset: () => {
        cursor = 0;
      },
      nextBlock: () =>
        cursor++ < 32
          ? {
              type: BlockTypeMove,
              parsed: { yaw: 0, pitch: 0, x: 0, y: 0, z: 0, trigger: [] },
            }
          : undefined,
      decompressedByteLength: 1,
      bufferedMoveTicks: 32,
      isComplete: true,
    } as unknown as DemoParser;
    const stream = createRecordingFromParser(parser, {
      checkpoints: false,
    }).streamingPlayback;
    for (const time of [0, 0.64, 0.16]) {
      const snapshot = stream.stepToTime(time);
      expectNames(snapshot);
      expect(snapshot.flagTargets).toEqual([
        {
          targetId: 40,
          name: undefined,
          typeName: "Flag",
          skinName: undefined,
          teamId: 0,
        },
      ]);
    }
    stream.reset();
    expectNames(stream.getSnapshot());
  });

  it("keeps renamed target colors and forgets freed target slots", () => {
    const { watchState, payload } = fixture();
    const changed = "\x10\x0bNEW|\x0cAlice\x11";
    watchState.applyPacket(
      packet(
        {
          type: "RemoteCommandEvent",
          funcName: "ServerMessage",
          args: [
            "MsgClientJoin",
            "",
            names[0].raw,
            "7",
            "32",
            "0",
            "0",
            "0",
            "0",
            "12345",
          ],
        },
        {
          type: "RemoteCommandEvent",
          funcName: "ServerMessage",
          args: ["MsgClientNameChanged", "", names[0].raw, changed, "7"],
        },
      ),
    );
    const stream = new LiveStreamAdapter({} as RelayClient, { mode: "watch" });
    stream.hydrate(payload());
    expect(stream.getSnapshot().playerRoster[0]).toMatchObject({
      clientId: 7,
      guid: "12345",
      targetId: 32,
    });
    expect(
      stream.getSnapshot().entities.find((e) => e.targetId === 32),
    ).toMatchObject({
      playerName: "NEW|Alice",
      playerRawName: changed,
    });
    watchState.applyPacket(packet({ type: "TargetFreeEvent", targetId: 32 }));
    expect(payload().targetEntries.some((entry) => entry.targetId === 32)).toBe(
      false,
    );
  });
});
