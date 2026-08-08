import { describe, it, expect } from "vitest";
import { computeCommandCircuitFrame } from "./commandCircuitFrame";
import type { SceneMissionArea } from "../scene/types";

function makeMissionArea(area: SceneMissionArea["area"]): SceneMissionArea {
  return {
    className: "MissionArea",
    ghostIndex: -1,
    area,
    flightCeiling: 2000,
    flightCeilingRange: 50,
  };
}

describe("computeCommandCircuitFrame", () => {
  it("maps Torque area axes to Three space (Torque Y→X, Torque X→Z)", () => {
    const frame = computeCommandCircuitFrame(
      makeMissionArea({ x: -100, y: -200, w: 400, h: 800 }),
    );
    // Three X spans Torque y..y+h, Three Z spans Torque x..x+w
    expect(frame.centerX).toBe(-200 + 800 / 2);
    expect(frame.centerZ).toBe(-100 + 400 / 2);
    expect(frame.width).toBeCloseTo(800 * 1.2);
    expect(frame.depth).toBeCloseTo(400 * 1.2);
  });

  it("adds 10% padding per side", () => {
    const frame = computeCommandCircuitFrame(
      makeMissionArea({ x: -512, y: -512, w: 1024, h: 1024 }),
    );
    expect(frame.centerX).toBe(0);
    expect(frame.centerZ).toBe(0);
    expect(frame.width).toBeCloseTo(1024 * 1.2);
    expect(frame.depth).toBeCloseTo(1024 * 1.2);
  });

  it("enforces a minimum span for degenerate areas", () => {
    const frame = computeCommandCircuitFrame(
      makeMissionArea({ x: 100, y: 200, w: 0, h: 0 }),
    );
    expect(frame.width).toBeGreaterThan(0);
    expect(frame.depth).toBeGreaterThan(0);
    expect(frame.centerX).toBe(200);
    expect(frame.centerZ).toBe(100);
  });

  it("falls back to the default terrain extent without a MissionArea", () => {
    const frame = computeCommandCircuitFrame(null);
    expect(frame.centerX).toBe(0);
    expect(frame.centerZ).toBe(0);
    expect(frame.width).toBeCloseTo(2048 * 1.2);
    expect(frame.depth).toBeCloseTo(2048 * 1.2);
  });
});
