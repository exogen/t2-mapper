import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createRuntime } from "./runtime";
import { registerEngineStubs } from "./engineMethods";
import type { TorqueRuntime } from "./types";
import {
  precipitationPercentage,
  resolveMissionPrecipitation,
} from "../weather/data";

let runtime: TorqueRuntime;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  runtime = createRuntime();
  registerEngineStubs(runtime);
  const script = await runtime.loadFromSource(`
    datablock PrecipitationData(Rain) { type = 0; materialList = "raindrops.dml"; };
    datablock LightningData(StormData) {};
    new Precipitation(Weather) { dataBlock = "Rain"; percentage = 1; };
    new Lightning(Storm) { dataBlock = "StormData"; };
    new Item(Target) {};
  `);
  script.execute();
});

afterEach(() => {
  runtime.destroy();
  vi.useRealTimers();
});

function weather() {
  return runtime.getObjectByName("Weather")!;
}

function config() {
  return resolveMissionPrecipitation(
    weather(),
    runtime,
    (Date.now() - runtime.state.startTime) / 1000,
  )!;
}

it("applies native percentage validation and reactive storm visibility", () => {
  const changes: string[] = [];
  runtime.subscribeRuntimeEvents((event) => {
    if (event.type === "field.changed") changes.push(event.field);
  });
  runtime.$.call(weather(), "setPercentage", 0.4);
  expect(config().percentage).toBe(0.4);
  runtime.$.call(weather(), "setPercentage", 2);
  expect(config().percentage).toBe(0.4);
  runtime.$.call(weather(), "stormShow", "false");
  expect(config().enabled).toBe(false);
  runtime.$.call(weather(), "stormShow", "true");
  expect(config().enabled).toBe(true);
  expect(changes).toContain("percentage");
  expect(changes).toContain("_weatherenabled");
});

it("fades on the runtime clock using the retail 32-tick authored second", () => {
  runtime.$.call(weather(), "setPercentage", 0);
  runtime.$.call(weather(), "stormPrecipitation", 1, 2);
  const initial = config();
  expect(initial.storm).toMatchObject({
    startTime: 0,
    duration: 2.048,
    startPercentage: 0,
    endPercentage: 1,
  });
  vi.setSystemTime(1024);
  expect(precipitationPercentage(config(), 1.024)).toBeCloseTo(0.5);
  runtime.$.call(weather(), "setPercentage", 0.25);
  // A direct percentage update preserves the running storm's native slope.
  vi.setSystemTime(1536);
  expect(precipitationPercentage(config(), 1.536)).toBeCloseTo(0.5);
  vi.setSystemTime(4096);
  expect(precipitationPercentage(config(), 4.096)).toBe(1);
});

it("retains multiple explicit strikes in one batch and expires old requests", () => {
  const storm = runtime.getObjectByName("Storm")!;
  runtime.$.call(storm, "strikeRandomPoint");
  runtime.$.call(storm, "strikeRandomPoint");
  expect(storm._weatherstrikes).toEqual([
    { sequence: 1, time: 0 },
    { sequence: 2, time: 0 },
  ]);
  vi.setSystemTime(31000);
  runtime.$.call(storm, "strikeRandomPoint");
  expect(storm._weatherstrikes).toEqual([{ sequence: 3, time: 31 }]);
  runtime.$.call(storm, "strikeObject", runtime.getObjectByName("Target"));
  // The retail strikeObject implementation is an empty native function.
  expect(storm._weatherstrikes).toEqual([{ sequence: 3, time: 31 }]);
});

it("keeps direct density and visibility changes from reviving a completed storm", () => {
  runtime.$.call(weather(), "setPercentage", 0.5);
  runtime.$.call(weather(), "stormPrecipitation", 1, 1);
  vi.setSystemTime(2048);
  runtime.$.call(weather(), "setPercentage", 0.25);
  expect(config().storm).toBeUndefined();
  vi.setSystemTime(4096);
  expect(config().percentage).toBe(0.25);
  expect(config().spawnCount).toBe(2000);
  runtime.$.call(weather(), "stormShow", false);
  runtime.$.call(weather(), "stormShow", true);
  vi.setSystemTime(8192);
  expect(config().storm).toBeUndefined();
  expect(config().percentage).toBe(0);
  expect(config().spawnCount).toBe(2000);
});
