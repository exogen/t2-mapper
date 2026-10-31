import { describe, expect, it } from "vitest";
import type { ParsedData } from "t2-demo-parser";
import { LiveStreamAdapter } from "./liveStreaming";
import type { RelayClient } from "./relayClient";

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
