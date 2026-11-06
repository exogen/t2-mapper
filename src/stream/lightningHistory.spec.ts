import { expect, it } from "vitest";
import { LightningHistory } from "./lightningHistory";
import { resolveStreamLightning } from "../weather/data";

it("keeps bounded thunder inputs for seek reconstruction after the bolt is gone", () => {
  const history = new LightningHistory();
  const config = resolveStreamLightning({}, {}, () => undefined);
  config.thunderSounds = [
    {
      filename: "thunder.wav",
      is3D: true,
      isLooping: false,
      refDist: 100,
      maxDist: 6400,
      volume: 1,
    },
  ];
  history.add({ stormId: "storm", time: 0, start: [0.5, 0.5], config });
  history.prune(5);
  expect(history.events).toHaveLength(1);
  const saved = history.save();
  history.restore(saved, () => "restored");
  expect(history.events[0].stormId).toBe("restored");
  history.prune(20);
  expect(history.events).toHaveLength(1);
  history.prune(30.1);
  expect(history.events).toHaveLength(0);
});

it("extends the seek window for long authored sound ranges and only keeps silent bolts while visible", () => {
  const history = new LightningHistory();
  const config = resolveStreamLightning({}, {}, () => undefined);
  history.add({ stormId: "silent", time: 0, start: [0.5, 0.5], config });
  history.add({
    stormId: "long-thunder",
    time: 0,
    start: [0.5, 0.5],
    config: {
      ...config,
      thunderSounds: [
        {
          filename: "thunder.wav",
          is3D: false,
          isLooping: false,
          refDist: 100,
          maxDist: 20000,
          volume: 1,
        },
      ],
    },
  });
  history.prune(2);
  expect(history.events.map((event) => event.stormId)).toEqual([
    "long-thunder",
  ]);
  history.prune(40);
  expect(history.events).toHaveLength(1);
  history.prune(61);
  expect(history.events).toHaveLength(0);
});
