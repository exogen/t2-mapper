import { afterEach, describe, expect, it, vi } from "vitest";

// A registry-only producer must never initialize a renderer dependency.
vi.mock("three", () => {
  throw new Error("The scalar registry must not import Three.js");
});
import {
  readResourceMetrics,
  registerMetricSource,
} from "./resourceMetricRegistry";

const cleanup: Array<() => void> = [];
afterEach(() => cleanup.splice(0).forEach((stop) => stop()));

it("works without Three.js and retains replacement-safe scalar sources", () => {
  const old = registerMetricSource("owner", () => ({ count: 1 }));
  cleanup.push(
    old,
    registerMetricSource("owner", () => ({ count: 2, bytes: NaN })),
  );
  old();
  expect(readResourceMetrics()).toEqual({
    "owner.count": 2,
    "owner.bytes": null,
  });
});

describe("numeric resource metrics", () => {
  it("reads current counters, isolates errors, and normalizes non-finite values", () => {
    let entries = 2;
    cleanup.push(
      registerMetricSource("cache", () => ({
        entries,
        unknown: null,
        bad: NaN,
      })),
      registerMetricSource("broken", () => {
        throw new Error("disposed");
      }),
    );
    entries = 3;
    expect(readResourceMetrics()).toEqual({
      "cache.entries": 3,
      "cache.unknown": null,
      "cache.bad": null,
      "broken.readError": 1,
    });
  });

  it("cleanups sources without removing a replacement registration", () => {
    const old = registerMetricSource("cache", () => ({ entries: 1 }));
    const current = registerMetricSource("cache", () => ({ entries: 2 }));
    cleanup.push(old, current);
    old();
    expect(readResourceMetrics()).toEqual({ "cache.entries": 2 });
    current();
    expect(readResourceMetrics()).toEqual({});
  });

  it("bounds total and per-source gauge counts and rejects oversized names", () => {
    const gauges = Object.fromEntries(
      Array.from({ length: 100 }, (_, index) => [`g${index}`, index]),
    );
    for (let i = 0; i < 100; i++)
      cleanup.push(registerMetricSource(`source${i}`, () => gauges));
    cleanup.push(registerMetricSource("x".repeat(100), () => ({ value: 1 })));
    const metrics = readResourceMetrics();
    expect(Object.keys(metrics)).toHaveLength(224);
    expect(metrics["source3.g31"]).toBe(31);
    expect(metrics["source3.g32"]).toBeUndefined();
    expect(metrics["source0.g64"]).toBeUndefined();
  });

  it("bounds source count and prefixed name lengths", () => {
    for (let i = 0; i < 100; i++)
      cleanup.push(registerMetricSource(`source${i}`, () => ({ value: i })));
    expect(Object.keys(readResourceMetrics())).toHaveLength(64);
    for (const remove of cleanup.splice(0)) remove();
    cleanup.push(
      registerMetricSource("x".repeat(80), () => ({
        ["y".repeat(15)]: 1,
        ["z".repeat(16)]: 2,
      })),
    );
    const keys = Object.keys(readResourceMetrics());
    expect(keys).toHaveLength(1);
    expect(keys[0]).toHaveLength(96);
  });
});
