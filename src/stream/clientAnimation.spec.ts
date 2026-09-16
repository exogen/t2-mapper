import { expect, it } from "vitest";
import {
  sampleJetTimeline,
  updateClientAnimation,
  type JetPose,
  type JetTimeline,
} from "./clientAnimation";
import { shapeThreadTime } from "./shapeThreads";
import { samplePlayerPose } from "./playerAnimation";
import { playerYawToQuaternion } from "./streamHelpers";

it("keeps Side's direction until a different action is selected", () => {
  const player = {
    type: "Player" as const,
    velocity: [-10, 0, 0] as [number, number, number],
  };
  const left = updateClientAnimation(undefined, player, 5)!;
  const right = updateClientAnimation(
    left,
    { ...player, velocity: [10, 0, 0] },
    6,
  )!;
  expect(left.move).toMatchObject({ animation: "side", timeScale: 1 });
  expect(right.move).toBe(left.move);
  const idle = updateClientAnimation(
    right,
    { ...player, velocity: [0, 0, 0] },
    7,
  )!;
  const reverse = updateClientAnimation(
    idle,
    { ...player, velocity: [10, 0, 0] },
    8,
  )!;
  expect(reverse.move).toMatchObject({
    animation: "side",
    timeScale: -1,
    timeSec: 8,
  });
});

it("keeps the run cycle when forward motion turns with the player's body", () => {
  const player = {
    type: "Player" as const,
    rotation: playerYawToQuaternion(0),
    velocity: [0, 10, 0] as [number, number, number],
  };
  const initial = updateClientAnimation(undefined, player, 5)!;
  const turned = updateClientAnimation(
    initial,
    {
      ...player,
      rotation: playerYawToQuaternion(Math.PI / 2),
      velocity: [10, 0, 0],
    },
    6,
  )!;
  expect(initial.move?.animation).toBe("run");
  expect(turned.move).toBe(initial.move);
});

it("records movement and flare transitions independently of model load time", () => {
  const player = {
    type: "Player" as const,
    velocity: [0, 2, 0] as [number, number, number],
    jetting: false,
  };
  const a = updateClientAnimation(undefined, player, 5)!;
  expect(updateClientAnimation(a, player, 6)).toBe(a);
  const b = updateClientAnimation(a, { ...player, jetting: true }, 7)!;
  const c = updateClientAnimation(b, { ...player, velocity: [0, 0, 0] }, 8)!;
  expect(c.move?.previous?.animation).toBe("run");
  expect(shapeThreadTime(c.flare!, 8.1, 0.5, false)).toBeCloseTo(0.4);
  expect(shapeThreadTime(c.flare!, 10, 0.5, false)).toBe(0);
});

it("reconstructs vehicle Activate/Maintain with exact crossing times and reversals", () => {
  const a: JetTimeline = { active: true, timeSec: 5 };
  const b: JetTimeline = { active: false, timeSec: 10, previous: a };
  const c: JetTimeline = { active: true, timeSec: 10.25, previous: b };
  const out: JetPose = {
    activatePosition: 0,
    maintaining: false,
    maintainStartSec: 0,
  };
  sampleJetTimeline(a, 8, 1, true, out);
  expect(out).toEqual({
    activatePosition: 0,
    maintaining: true,
    maintainStartSec: 6,
  });
  sampleJetTimeline(b, 10.25, 1, true, out);
  expect(out.activatePosition).toBe(0.75);
  expect(out.maintaining).toBe(false);
  sampleJetTimeline(c, 11, 1, true, out);
  expect(out).toMatchObject({ maintaining: true, maintainStartSec: 10.5 });
  // Cached anchors can be sampled backwards without inheriting that last pose.
  sampleJetTimeline(b, 10.1, 1, true, out);
  expect(out.activatePosition).toBeCloseTo(0.9);
});

it("samples player movement, action completion, death and seated holds from the same absolute clock", () => {
  const move = { animation: "run", timeScale: 1, timeSec: 10 };
  const info = (name: string) => ({
    duration: name === "run" ? 2 : 1,
    cyclic: name === "run",
  });
  const sample = (t: number, wire = {}, mounted = false) =>
    samplePlayerPose(move, wire, mounted, t, 0.15, () => "action", info);
  expect(sample(15)).toEqual([
    { name: "run", position: 0.5, phase: 2.5, weight: 1 },
  ]);
  const wire = { actionAnim: 9, actionTimeSec: 11 };
  expect(sample(11.5, wire)).toEqual([
    { name: "action", position: 0.5, phase: 0.5, weight: 1 },
  ]);
  expect(sample(13, wire)).toEqual([
    { name: "run", position: 0.5, phase: 0.5, weight: 1 },
  ]);
  expect(sample(100, wire, true)).toEqual([
    { name: "action", position: 1, phase: 1, weight: 1 },
  ]);
  expect(sample(100, { ...wire, damageState: 1 })).toEqual([
    { name: "action", position: 1, phase: 1, weight: 1 },
  ]);
  expect(sample(11.075, wire)[0].weight).toBeCloseTo(0.5);
});
