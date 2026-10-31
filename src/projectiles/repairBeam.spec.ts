import { expect, it, vi } from "vitest";
import { Vector3 } from "three";
import { RepairBeamEndpoint, repairBeamWithinCutoff } from "./repairBeam";

it("snaps to the first contact, then chases new contacts at the engine's 2*dt rate", () => {
  const beam = new RepairBeamEndpoint();
  const hit = new Vector3(10, 0, 0);
  const cast = (out: Vector3) => {
    out.copy(hit);
    return true;
  };
  expect(beam.update("target", 100, cast)).toBe(true);
  expect(beam.current.toArray()).toEqual([10, 0, 0]);
  hit.set(20, 10, 0);
  beam.update("target", 100.125, cast);
  expect(beam.current.toArray()).toEqual([12.5, 2.5, 0]);
  // A miss keeps the last *world* hit; movement of the target does not drag it.
  beam.update("target", 100.25, () => false);
  expect(beam.current.toArray()).toEqual([14.375, 4.375, 0]);
  expect(beam.desired.toArray()).toEqual([20, 10, 0]);
});

it("uses demo time for slow playback and does no repeated work while paused", () => {
  const beam = new RepairBeamEndpoint();
  const hit = new Vector3(1, 0, 0);
  const cast = vi.fn((out: Vector3) => {
    out.copy(hit);
    return true;
  });
  beam.update("a", 0, cast);
  hit.x = 2;
  for (let i = 0; i < 60; i++) beam.update("a", 0, cast);
  expect(cast).toHaveBeenCalledOnce();
  expect(beam.current.x).toBe(1);
  // One 16 ms frame at quarter speed advances effect time by 4 ms.
  beam.update("a", 0.004, cast);
  expect(beam.current.x).toBeCloseTo(1.008);
});

it("retries until a valid contact and clears history on retarget, seek, and pool reuse", () => {
  const beam = new RepairBeamEndpoint();
  const hit = (out: Vector3) => {
    out.set(5, 0, 0);
    return true;
  };
  expect(beam.update("a", 10, () => false)).toBe(false);
  expect(beam.update("a", 10, hit)).toBe(true);
  expect(beam.update("b", 11, () => false)).toBe(false);
  expect(beam.update("b", 11, hit)).toBe(true);
  expect(beam.update("b", 5, () => false)).toBe(false);
  expect(beam.update("b", 5, hit)).toBe(true);
  beam.reset(); // ProjectilePool also resets on forward seeks.
  expect(beam.update("b", 200, () => false)).toBe(false);
});

it("uses the native dot-product cutoff rather than an angular approximation", () => {
  const start = new Vector3(),
    aim = new Vector3(1, 0, 0);
  const end = new Vector3(Math.cos(Math.PI / 4), Math.sin(Math.PI / 4), 0);
  // 45 degrees is accepted at cutoff 40: 90*(1-cos(45)) = 26.36.
  expect(repairBeamWithinCutoff(start, end, aim, 40)).toBe(true);
  expect(repairBeamWithinCutoff(start, new Vector3(0, 1, 0), aim, 40)).toBe(
    false,
  );
  expect(repairBeamWithinCutoff(start, start, aim, 40)).toBe(false);
});
