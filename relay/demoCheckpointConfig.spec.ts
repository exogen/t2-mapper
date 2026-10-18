import { afterEach, expect, it, vi } from "vitest";
import {
  checkDemoCheckpointPlan,
  loadDemoCheckpointCount,
  loadDemoCheckpointHeapMB,
  loadDemoCheckpointInterval,
  loadDemoCheckpointPlan,
} from "./demoCheckpointConfig";

afterEach(() => vi.unstubAllEnvs());

it("defaults to one checkpoint and reads the environment on each call", () => {
  vi.stubEnv("DEMO_CHECKPOINT_COUNT", undefined);
  expect(loadDemoCheckpointCount()).toBe(1);
  vi.stubEnv("DEMO_CHECKPOINT_COUNT", "3");
  expect(loadDemoCheckpointCount()).toBe(3);
});

it.each(["0", "1", "3", " 12 ", 0, 3])("accepts count %s", (raw) => {
  expect(loadDemoCheckpointCount(raw)).toBe(Number(raw));
});

it.each([
  "",
  "-1",
  "1.5",
  "invalid",
  "Infinity",
  "9007199254740992",
  -1,
  1.5,
  NaN,
  Infinity,
  Number.MAX_SAFE_INTEGER + 1,
])("rejects invalid count %s", (raw) =>
  expect(() => loadDemoCheckpointCount(raw)).toThrow(
    "DEMO_CHECKPOINT_COUNT must be a non-negative integer",
  ),
);

it("defaults to 12-minute intervals and reads the environment on each call", () => {
  vi.stubEnv("DEMO_CHECKPOINT_INTERVAL_MINUTES", undefined);
  expect(loadDemoCheckpointInterval()).toBe(22_500);
  vi.stubEnv("DEMO_CHECKPOINT_INTERVAL_MINUTES", "9");
  expect(loadDemoCheckpointInterval()).toBe(16_875);
});

it.each([
  ["9", 16_875],
  [" 12 ", 22_500],
  ["7.5", 14_063],
  ["0.001", 2],
])("converts an interval of %s minutes to %i ticks", (raw, ticks) => {
  expect(loadDemoCheckpointInterval(raw)).toBe(ticks);
});

it.each([
  "",
  "0",
  "0.0001",
  "-1",
  ".5",
  "1e3",
  "invalid",
  "Infinity",
  "9".repeat(20),
])("rejects invalid interval %s", (raw) => {
  expect(() => loadDemoCheckpointInterval(raw)).toThrow(
    "DEMO_CHECKPOINT_INTERVAL_MINUTES must be a positive number of minutes",
  );
});

it("plans from the environment unless a script overrides it", () => {
  vi.stubEnv("DEMO_CHECKPOINT_INTERVAL_MINUTES", "9");
  vi.stubEnv("DEMO_CHECKPOINT_COUNT", "3");
  expect(loadDemoCheckpointPlan()).toEqual({
    intervalTicks: 16_875,
    maxCount: 3,
  });
  expect(loadDemoCheckpointPlan({ interval: "6", count: "0" })).toEqual({
    intervalTicks: 11_250,
    maxCount: 0,
  });
  expect(() => loadDemoCheckpointPlan({ interval: "soon" })).toThrow(
    "--interval must be a positive number of minutes",
  );
  expect(() => loadDemoCheckpointPlan({ count: "-1" })).toThrow(
    "--count must be a non-negative integer",
  );
});

it.each([
  [{ intervalTicks: 0, maxCount: 1 }, "interval"],
  [{ intervalTicks: 1.5, maxCount: 1 }, "interval"],
  [{ intervalTicks: NaN, maxCount: 1 }, "interval"],
  [{ intervalTicks: 22_500, maxCount: -1 }, "count"],
  [{ intervalTicks: 22_500, maxCount: NaN }, "count"],
])("rejects plan %o handed between processes", (plan, field) => {
  expect(() => checkDemoCheckpointPlan(plan)).toThrow(
    `Checkpoint ${field} must be`,
  );
});

it("defaults to a 256 MiB worker heap and reads the configured cap on each call", () => {
  vi.stubEnv("DEMO_CHECKPOINT_HEAP_MB", undefined);
  expect(loadDemoCheckpointHeapMB()).toBe(256);
  vi.stubEnv("DEMO_CHECKPOINT_HEAP_MB", "512");
  expect(loadDemoCheckpointHeapMB()).toBe(512);
});

it.each(["1", "128", "256", " 512 "])("accepts heap cap %s", (raw) => {
  expect(loadDemoCheckpointHeapMB(raw)).toBe(Number(raw));
});

it.each(["", "0", "-1", "1.5", "invalid", "Infinity", "9007199254740992"])(
  "rejects invalid heap cap %s",
  (raw) => {
    expect(() => loadDemoCheckpointHeapMB(raw)).toThrow(
      "DEMO_CHECKPOINT_HEAP_MB must be a positive integer",
    );
  },
);
