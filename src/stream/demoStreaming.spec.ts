import { describe, expect, it } from "vitest";
import type { ParsedData } from "t2-demo-parser";
import { DemoStreamAdapter } from "./demoStreaming";
import { fakeDemoParser } from "./streamTestFixtures";

const dataBlocks: [number, string, ParsedData][] = [
  [10, "LinearFlareProjectileData", { explosion: 11 }],
  [11, "ExplosionData", { dtsFileName: "effect_plasma_explosion.dts" }],
  [12, "StaticShapeData", { debrisShapeName: "debris_generic.dts" }],
];

/**
 * A demo with no packets; the packet parser's datablock map is `packetMap`.
 */
function demo(
  initialDataBlocks: Map<number, { className: string; data: ParsedData }>,
  packetMap: Map<number, ParsedData>,
) {
  const parser = fakeDemoParser({
    demoLengthMs: 1000,
    initialBlock: { dataBlocks: initialDataBlocks },
    ghostTracker: { getGhost: () => undefined },
    packetParser: {
      protocolRejected: 0,
      protocolNoDispatch: 0,
      getDataBlockDataMap: () => packetMap,
    },
    bufferedMoveTicks: 0,
  });
  return new DemoStreamAdapter(parser, { checkpoints: false });
}

describe("DemoStreamAdapter.getEffectShapes", () => {
  it("includes datablocks that arrive in packets (from-connect recordings)", () => {
    const packetMap = new Map<number, ParsedData>();
    const stream = demo(new Map(), packetMap);
    expect(stream.getEffectShapes()).toEqual([]);
    for (const [id, , data] of dataBlocks) packetMap.set(id, data);
    expect(stream.getEffectShapes()).toEqual([
      "effect_plasma_explosion.dts",
      "debris_generic.dts",
    ]);
  });

  it("reads initial-block datablocks (mid-match recordings)", () => {
    const initial = new Map(
      dataBlocks.map(([id, className, data]) => [id, { className, data }]),
    );
    // The parser seeds its packet map with the initial block's datablocks.
    const stream = demo(
      initial,
      new Map(dataBlocks.map(([id, , data]) => [id, data])),
    );
    expect(stream.getEffectShapes()).toEqual([
      "effect_plasma_explosion.dts",
      "debris_generic.dts",
    ]);
  });
});
