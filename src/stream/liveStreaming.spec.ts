import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLiveParser,
  GhostStateAccumulator,
  type GhostUpdate,
  type ParsedData,
} from "t2-demo-parser";
import {
  decodedPacket,
  testCatchupPayload,
} from "../../relay/serverPacketFixtures";
import { WatchStateAccumulator } from "../../relay/watchState";
import { skyFogPercentage } from "../scene/skyWeather";
import { precipitationPercentage } from "../weather/data";
import { LiveStreamAdapter } from "./liveStreaming";
import type { RelayClient } from "./relayClient";
import { ReplayStreamAdapter } from "./replayStreaming";

afterEach(() => vi.unstubAllGlobals());

it("constructs live and replay adapters on HTTP/LAN hosts without randomUUID", () => {
  let seed = 0;
  vi.stubGlobal("crypto", {
    getRandomValues: (bytes: Uint8Array) => bytes.fill(++seed),
  });
  const live = new LiveStreamAdapter({} as RelayClient, { mode: "watch" });
  const replay = new ReplayStreamAdapter({} as RelayClient);
  const scope = (adapter: LiveStreamAdapter) =>
    (adapter as unknown as { conn: { playerIdentity: { scope: string } } }).conn
      .playerIdentity.scope;
  expect(scope(live)).toBe("01".repeat(24));
  expect(scope(replay)).toBe("02".repeat(24));
});

function dataBlocks(live: LiveStreamAdapter): Map<number, ParsedData> {
  const { packetParser } = live as unknown as {
    packetParser: {
      getDataBlockDataMap(): Map<number, ParsedData> | undefined;
    };
  };
  return packetParser.getDataBlockDataMap()!;
}

describe("LiveStreamAdapter.getShapeConstructorSequences", () => {
  it("picks up TSShapeConstructor datablocks as they arrive", () => {
    const live = new LiveStreamAdapter({} as RelayClient, { mode: "watch" });
    expect(live.getShapeConstructorSequences("light_male.dts")).toBeUndefined();
    dataBlocks(live).set(10, {
      shape: "Light_Male.dts",
      sequences: ["root", "run"],
    });
    expect(live.getShapeConstructorSequences("light_male.dts")).toEqual([
      "root",
      "run",
    ]);
    dataBlocks(live).set(11, {
      shape: "heavy_male.dts",
      sequences: ["root"],
    });
    expect(live.getShapeConstructorSequences("HEAVY_MALE.dts")).toEqual([
      "root",
    ]);
  });

  it("rebuilds after a catch-up replaces the datablock map", () => {
    const live = new LiveStreamAdapter({} as RelayClient, { mode: "watch" });
    dataBlocks(live).set(10, { shape: "a.dts", sequences: ["old"] });
    expect(live.getShapeConstructorSequences("a.dts")).toEqual(["old"]);
    const internals = live as unknown as {
      packetParser: { getDataBlockDataMap(): Map<number, ParsedData> };
    };
    const replacement = new Map<number, ParsedData>([
      [10, { shape: "a.dts", sequences: ["new"] }],
    ]);
    internals.packetParser = { getDataBlockDataMap: () => replacement };
    expect(live.getShapeConstructorSequences("a.dts")).toEqual(["new"]);
  });
});

describe("LiveStreamAdapter.getEffectShapes", () => {
  it("picks up explosion and debris datablocks as they arrive", () => {
    const live = new LiveStreamAdapter({} as RelayClient, { mode: "watch" });
    expect(live.getEffectShapes()).toEqual([]);
    dataBlocks(live).set(10, { explosion: 11 });
    dataBlocks(live).set(11, { dtsFileName: "effect_plasma_explosion.dts" });
    dataBlocks(live).set(12, { debrisShapeName: "debris_generic.dts" });
    expect(live.getEffectShapes()).toEqual([
      "effect_plasma_explosion.dts",
      "debris_generic.dts",
    ]);
  });
});

function weatherRelay(now: () => number) {
  const { registry, packetParser } = createLiveParser({
    dataBlocks: [[1025, { type: 0 }]],
  });
  const watchState = new WatchStateAccumulator(undefined, { now });
  const ghostState = new GhostStateAccumulator();
  return {
    registry,
    apply(ghosts: GhostUpdate[], time?: number) {
      const packet = { ...decodedPacket(), ghosts };
      watchState.applyPacket(packet, undefined, undefined, time);
      ghostState.applyPacket(packet);
    },
    payload: () => testCatchupPayload({ watchState, ghostState, packetParser }),
  };
}

describe("weather catch-up", () => {
  it.each(["live", "delayed"])(
    "continues a precipitation fade across a %s snapshot and keeps a completed fade settled",
    (channel) => {
      let clock = 0;
      const relay = weatherRelay(() => clock);
      const classId = relay.registry.getGhostClassId("Precipitation")!;
      const packet = (
        time: number,
        parsedData?: ParsedData,
        create = false,
      ) => {
        clock = channel === "delayed" ? time + 120 : time;
        relay.apply(
          parsedData
            ? [
                {
                  index: 7,
                  type: create ? "create" : "update",
                  classId,
                  parsedData,
                  updateBitsStart: 0,
                  updateBitsEnd: 0,
                },
              ]
            : [],
          channel === "delayed" ? time : undefined,
        );
      };
      packet(100, { dataBlockId: 1025, percentage: 0.25, maxDrops: 100 }, true);
      packet(100, { stormUpdate: { endPercentage: 0.75, durationSeconds: 4 } });
      packet(101.024, { percentageUpdate: 0.5 });
      packet(102.048);

      const live = new LiveStreamAdapter({} as RelayClient, { mode: "watch" });
      live.hydrate(relay.payload());
      const rain = live.getSnapshot().entities[0].precipitation!;
      expect(rain.storm!.startTime).toBeCloseTo(-1.024);
      expect(precipitationPercentage(rain, 0)).toBeCloseTo(0.625);
      expect(rain).toMatchObject({ drawCount: 50, spawnCount: 62 });
      const after = live.stepToTime(0.512);
      expect(
        precipitationPercentage(
          after.entities[0].precipitation!,
          after.timeSec,
        ),
      ).toBeCloseTo(0.6875);

      packet(104);
      live.hydrate(relay.payload());
      const settled = live.getSnapshot().entities[0].precipitation!;
      expect(settled.storm).toBeUndefined();
      expect(settled).toMatchObject({
        percentage: 0.75,
        drawCount: 50,
        spawnCount: 75,
      });
    },
  );

  it("keeps Sky cloud toggles and rebases all fade clocks when hydrating", () => {
    const relay = weatherRelay(() => 0);
    const classId = relay.registry.getGhostClassId("Sky")!;
    const apply = (
      type: GhostUpdate["type"],
      time: number,
      parsedData: ParsedData,
    ) =>
      relay.apply(
        [
          {
            index: 8,
            classId,
            type,
            parsedData,
            updateBitsStart: 0,
            updateBitsEnd: 0,
          },
        ],
        time,
      );
    apply("create", 100, { fogVolumes: [{}, {}] });
    apply("update", 101, {
      stormType: 1,
      stormMagnitude: 4,
      stormTimeline: { duration: 4, indexOrMode: -1, startPct: 0 },
      stormCloudProfile: {
        enabled: true,
        value0: 0.8,
        value1: 0.2,
        value2: 0.05,
      },
    });
    apply("update", 101.512, { stormCloudsOn: false });
    relay.apply([], 102.024);

    const live = new LiveStreamAdapter({} as RelayClient, { mode: "watch" });
    live.hydrate(relay.payload());
    const sky = live.getSnapshot().entities[0].sceneData;
    if (sky?.className !== "Sky") throw new Error("Missing Sky ghost");
    const weather = sky.weather!;
    expect(weather.cloudsOn).toBe(false);
    expect(weather.cloudStorm!.startTime).toBeCloseTo(-1.024);
    expect(weather.realFog!.startTime).toBeCloseTo(-1.024);
    expect(weather.fog!.map((band) => band.startTime)).toEqual([
      expect.closeTo(1.024),
      expect.closeTo(-1.024),
    ]);
    expect(skyFogPercentage(weather, 1, 2, 0)).toBeCloseTo(0.5);
    expect(skyFogPercentage(weather, 1, 2, 0.512)).toBeCloseTo(0.25);
  });
});
