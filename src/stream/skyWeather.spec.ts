import { expect, it } from "vitest";
import { skyFogPercentage } from "../scene/skyWeather";
import {
  streamEntityToGameEntity,
  updateGameEntityFromStream,
} from "./entityBridge";
import { TestLiveStream } from "./streamTestFixtures";

class SkyStream extends TestLiveStream {
  constructor() {
    super("watch", () => "Sky");
  }

  time(seconds: number) {
    this.tickCount = seconds / 0.032;
  }
}

it("publishes sparse Sky updates and restores the source-time weather and wind cache", () => {
  const stream = new SkyStream();
  const north = { x: 0, y: 1, z: 3 };
  const west = { x: -1, y: 0, z: 4 };
  const east = { x: 1, y: 0, z: 0 };
  stream.createGhost(1, 1, {
    materialList: "sky.dml",
    visibleDistance: 1000,
    fogDistance: 250,
    windVelocity: east,
    fogVolumes: [
      {
        visibleDistance: 100,
        minHeight: 0,
        maxHeight: 200,
        color: { r: 1, g: 1, b: 1 },
      },
    ],
  });
  const view = streamEntityToGameEntity(stream.entityAt(1)!);
  if (view.renderType !== "Sky") throw new Error("Expected a Sky entity");
  const initial = view.skyData;

  stream.updateGhost(1, {});
  expect(updateGameEntityFromStream(view, stream.entityAt(1)!)).toBe(false);
  stream.time(10);
  stream.updateGhost(1, {
    stormTimeline: { startPct: 0, duration: 2, indexOrMode: -1 },
    stormType: 2,
    stormMagnitude: 3,
    windVelocity: north,
  });
  expect(updateGameEntityFromStream(view, stream.entityAt(1)!)).toBe(true);
  expect(view.skyData).toMatchObject({
    materialList: "sky.dml",
    fogDistance: 250,
    windVelocity: north,
    weather: { renderWind: east, cloudStorm: { state: 2, startTime: 10 } },
  });
  expect(view.skyData.fogVolumes).toBe(initial.fogVolumes);
  expect(skyFogPercentage(view.skyData.weather, 0, 1, 11.024)).toBeCloseTo(0.5);

  stream.roundTripCheckpoint();
  const restored = stream.entityAt(1)!.sceneData;
  expect(restored).toEqual(view.skyData);

  // DistanceMask refreshes the cached horizontal wind before WindMask.
  stream.updateGhost(1, {
    visibleDistance: 700,
    fogDistance: 100,
    windVelocity: west,
  });
  expect(updateGameEntityFromStream(view, stream.entityAt(1)!)).toBe(true);
  expect(view.skyData).toMatchObject({
    visibleDistance: 700,
    fogDistance: 100,
    windVelocity: west,
    weather: { renderWind: north },
  });
  stream.updateGhost(1, { visibleDistance: 700, fogDistance: 100 });
  expect(updateGameEntityFromStream(view, stream.entityAt(1)!)).toBe(true);
  expect(view.skyData.weather?.renderWind).toBeUndefined();
});
