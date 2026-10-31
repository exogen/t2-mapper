import { expect, it } from "vitest";
import { createLiveParser, GhostStateAccumulator } from "t2-demo-parser";
import type { PacketData, ParsedData } from "t2-demo-parser";
import { WatchStateAccumulator } from "../../relay/watchState";
import { GAME_PROTOCOL_VERSION } from "../../relay/shared";
import {
  decodedPacket,
  testCatchupPayload,
} from "../../relay/serverPacketFixtures";
import { TestLiveStream } from "./streamTestFixtures";

const dataBlocks: Array<[number, ParsedData]> = [
  [1, { shapeName: "light_male.dts" }],
  [2, { shapeName: "flag.dts", mountPoint: 2 }],
];

class ImageStream extends TestLiveStream {
  override getDataBlockData(id: number) {
    return dataBlocks.find(([blockId]) => blockId === id)?.[1];
  }
  receive(packet: PacketData) {
    for (const event of packet.events) this.processEvent(event, undefined);
    for (const ghost of packet.ghosts) this.processGhostUpdate(ghost);
  }
  image() {
    return this.buildEntityList()[0].imageSlots?.[3];
  }
}

it.each(["baseb", "beagle", "base", "customTeamSkin", ""])(
  "retains the carried flag skin %s when a late viewer joins after string-slot reuse",
  (originalSkin) => {
    const early = new ImageStream();
    const ghostState = new GhostStateAccumulator();
    const watchState = new WatchStateAccumulator();
    const { packetParser, registry } = createLiveParser({
      protocolVersion: GAME_PROTOCOL_VERSION,
      dataBlocks,
    });
    const receive = (packet: PacketData) => {
      watchState.applyPacket(packet);
      ghostState.applyPacket(packet);
      early.receive(packet);
    };
    const stringPacket = (value?: string) =>
      decodedPacket({
        type: "NetStringEvent",
        id: 10,
        hasValue: value !== undefined,
        value,
      });
    const imagePacket = (dataBlockId: number) =>
      ({
        gameState: {},
        events: [],
        ghosts: [
          {
            index: 0,
            type: "update",
            parsedData: {
              images: [
                {
                  index: 3,
                  dataBlockId,
                  ...(dataBlockId ? { skinTagIndex: 10 } : {}),
                },
              ],
            },
          },
        ],
      }) as unknown as PacketData;
    receive(stringPacket(originalSkin));
    receive({
      gameState: {},
      events: [],
      ghosts: [
        {
          index: 0,
          type: "create",
          classId: registry.getGhostClassId("Player"),
          parsedData: {
            dataBlockId: 1,
            targetId: 32,
            images: [{ index: 3, dataBlockId: 2, skinTagIndex: 10 }],
          },
        },
      ],
    } as unknown as PacketData);
    receive(stringPacket("reused"));
    const late = new ImageStream();
    late.hydrate(testCatchupPayload({ packetParser, ghostState, watchState }));
    expect(early.image()).toMatchObject({
      shapeName: "flag.dts",
      skinName: originalSkin || undefined,
    });
    expect(late.image()).toMatchObject({
      shapeName: "flag.dts",
      skinName: originalSkin || undefined,
    });

    // Both viewers adopt the current string only when another image update arrives.
    receive(imagePacket(2));
    late.receive(imagePacket(2));
    expect(early.image()?.skinName).toBe("reused");
    expect(late.image()?.skinName).toBe("reused");
    receive(stringPacket());
    late.receive(stringPacket());
    receive(imagePacket(2));
    late.receive(imagePacket(2));
    expect(early.image()?.skinName).toBeUndefined();
    expect(late.image()?.skinName).toBeUndefined();
    receive(imagePacket(0));
    late.receive(imagePacket(0));
    expect(early.image()).toBeUndefined();
    expect(late.image()).toBeUndefined();
  },
);
