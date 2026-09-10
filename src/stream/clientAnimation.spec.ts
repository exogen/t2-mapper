import { expect, it } from "vitest";
import {
  sampleJetTimeline,
  updateClientAnimation,
  type JetPose,
  type JetTimeline,
} from "./clientAnimation";
import { shapeThreadTime } from "./shapeThreads";
import { samplePlayerPose } from "./playerAnimation";

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
  expect(sample(15)).toEqual([{ name: "run", position: 0.5, weight: 1 }]);
  const wire = { actionAnim: 9, actionTimeSec: 11 };
  expect(sample(11.5, wire)).toEqual([
    { name: "action", position: 0.5, weight: 1 },
  ]);
  expect(sample(13, wire)).toEqual([{ name: "run", position: 0.5, weight: 1 }]);
  expect(sample(100, wire, true)).toEqual([
    { name: "action", position: 1, weight: 1 },
  ]);
  expect(sample(100, { ...wire, damageState: 1 })).toEqual([
    { name: "action", position: 1, weight: 1 },
  ]);
  expect(sample(11.075, wire)[0].weight).toBeCloseTo(0.5);
});
