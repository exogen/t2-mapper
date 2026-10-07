import { afterEach, expect, it, vi } from "vitest";
import {
  loadDemoCheckpointCount,
  loadDemoCheckpointHeapMB,
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
