import { describe, expect, it } from "vitest";
import { bearingYaw } from "./geometry";
import { orbitPullbackDir } from "../stream/streamHelpers";
import { Vector3 } from "three";

describe("bearingYaw", () => {
  // The convention that matters: feeding bearingYaw's result to
  // orbitPullbackDir must put the camera BEHIND `from` relative to
  // `to`, facing toward `to` — the whole point of a "toward" aim.
  // A hand-rolled atan2 with swapped arguments passes a naive
  // "returns an angle" test while flipping the camera up to 180°
  // (the mortar-crew shot that framed the sheller's face).
  it.each([
    ["north", [0, 100, 0]],
    ["east", [100, 0, 0]],
    ["northwest", [-100, 100, 0]],
    ["southeast", [70, -160, 0]],
  ] as const)("faces the target when looking %s", (_label, to) => {
    const yaw = bearingYaw([0, 0, 0], [to[0], to[1], to[2]]);
    const pullback = orbitPullbackDir(yaw, 0, new Vector3());
    // Camera offset in Torque terms: x = Three z, y = Three x. It must
    // point AWAY from the target (camera on the far side of `from`).
    const dot = pullback.z * to[0] + pullback.x * to[1];
    expect(dot, `pullback ${pullback.toArray().join(",")}`).toBeLessThan(0);
    // And squarely away, not off at a reflected diagonal.
    const mag = Math.hypot(pullback.x, pullback.z) * Math.hypot(to[0], to[1]);
    expect(-dot / mag).toBeGreaterThan(0.99);
  });
});
