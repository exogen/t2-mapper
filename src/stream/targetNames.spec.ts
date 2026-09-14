import { describe, expect, it } from "vitest";
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
  // Exercise both immediate and deferred string resolution at the relay.
  names.forEach(({ raw }, index) => {
    const string = { type: "NetStringEvent", id: index, value: raw };
    const target = {
      type: "TargetInfoEvent",
      targetId: 32 + index,
      nameTag: index,
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
  return { kit, watchState, payload };
}

function expectNames(snapshot: StreamSnapshot) {
  for (const [index, { name, raw }] of names.entries()) {
    const entity = snapshot.entities.find((e) => e.targetId === 32 + index);
    expect(entity).toMatchObject({ playerName: name, playerRawName: raw });
    expect(streamEntityToGameEntity(entity!)).toMatchObject({
      renderType: "Player",
      playerName: name,
      playerRawName: raw,
    });
  }
}

describe("initial target names", () => {
  it("retains colors through relay catch-up, serialization and reconnects", () => {
    const { payload } = fixture();
    const stream = new LiveStreamAdapter({} as RelayClient, { mode: "watch" });
    for (const epoch of [1, 2]) {
      stream.hydrate({ ...payload(), epoch });
      expectNames(stream.getSnapshot());
    }
  });

  it("preserves colors when a recorded demo already has players at its start", () => {
    const { kit, payload } = fixture();
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
      expectNames(stream.stepToTime(time));
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
          args: ["MsgClientJoin", "", names[0].raw, "7", "32"],
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
