import fs from "node:fs/promises";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { BoxGeometry, Mesh } from "three";
import { DTSLoader } from "../dts/dtsLoader";
import { DTSAnimationMixer } from "../dts/dtsAnimationMixer";
import { parseDSQ } from "../dts/dsq";
import {
  registerGroundEffectShape,
  getGroundEffectShape,
  groundActionName,
  groundWheels,
} from "./groundEffectAssets";
import { GroundEffectSimulation } from "./GroundEffectSimulation";
import type {
  GroundActor,
  GroundEffectFrame,
} from "../stream/groundEffectHistory";
import type { StreamingPlayback } from "../stream/types";
import { setTerrainCollisionData } from "../collision/terrainCollision";
import {
  clearWorldColliders,
  registerInteriorCollider,
} from "../collision/worldCollision";
import { setWaterInfo } from "../collision/waterLevel";

const blocks: Record<number, Record<string, unknown>> = {
  1: {
    shapeName: "light_male.dts",
    footPuffEmitter: 10,
    footPuffNumParts: 15,
    footPuffRadius: 0.25,
    decalData: 20,
    decalOffset: 0.25,
    dustEmitter: 11,
  },
  2: {
    shapeName: "vehicle_grav_scout.dts",
    dustEmitter: 11,
    triggerDustHeight: 2.5,
    dustHeight: 1,
    dustTrailEmitter: 12,
    triggerTrailHeight: 3.6,
    dustTrailFreqMod: 15,
    dustTrailOffset: { x: 0, y: -1, z: 0.5 },
  },
  3: { shapeName: "vehicle_land_mpbase.dts", tireRadius: 1.6, tireEmitter: 12 },
  10: { particles: [30], ejectionPeriodMS: 100, useEmitterColors: true },
  11: { particles: [30], ejectionPeriodMS: 5, useEmitterColors: true },
  12: { particles: [30], ejectionPeriodMS: 160, useEmitterColors: true },
  20: { sizeX: 0.125, sizeY: 0.25, textureName: "special/footprint" },
  30: {
    lifetimeMS: 15,
    gravityCoefficient: 0,
    keys: [
      { r: 1, g: 1, b: 1, a: 1, size: 0.02, time: 0 },
      { r: 1, g: 1, b: 1, a: 0, size: 0.04, time: 1 },
    ],
    spinRandomMin: 1000,
    spinRandomMax: 1000,
  },
};
const playback = {
  getDataBlockData: (id: number) => blocks[id],
  getShapeConstructorSequences: () => ["light_male_forward.dsq run"],
} as unknown as StreamingPlayback;
const player = (overrides: Partial<GroundActor> = {}): GroundActor => ({
  key: "1:1",
  ghostIndex: 1,
  spawnTick: 1,
  type: "Player",
  className: "Player",
  dataBlockId: 1,
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  velocity: [0, 4, 0],
  mounted: false,
  clientAnimation: { move: { animation: "run", timeSec: 0, timeScale: 1 } },
  ...overrides,
});
const frame = (
  timeSec: number,
  ...actors: GroundActor[]
): GroundEffectFrame => ({ timeSec, gravity: -9.81, actors });
const terrain = (name = "lushworld.grassdark") =>
  setTerrainCollisionData({
    heightMap: new Uint16Array(256 * 256),
    squareSize: 8,
    textureName: name,
  });
const root = "docs/base/@vl2/shapes.vl2/shapes/";
const read = async (p: string) => {
  const b = await fs.readFile(root + p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
beforeAll(async () => {
  const loader = new DTSLoader();
  const player = loader.parse(await read("light_male.dts"), [
    { name: "forward", data: parseDSQ(await read("light_male_forward.dsq")) },
  ]);
  registerGroundEffectShape("light_male.dts", player);
  const forward = parseDSQ(await read("light_male_forward.dsq"));
  registerGroundEffectShape(
    "aliased_player.dts",
    loader.parse(await read("light_male.dts"), [
      { name: "forward", data: forward },
      {
        name: "run",
        data: {
          ...forward,
          triggers: [],
          sequences: forward.sequences.map((s) => ({ ...s, numTriggers: 0 })),
        },
      },
    ]),
  );
  registerGroundEffectShape(
    "vehicle_land_mpbase.dts",
    loader.parse(await read("vehicle_land_mpbase.dts")),
  );
});
afterEach(() => {
  setTerrainCollisionData(null);
  setWaterInfo(null);
  clearWorldColliders();
});
it("takes footstep triggers from the mapped action even when a raw clip has its alias", () => {
  terrain();
  const mapped = {
    getDataBlockData: (id: number) =>
      id === 1 ? { ...blocks[1], shapeName: "aliased_player.dts" } : blocks[id],
    getShapeConstructorSequences: () => ["aliased_player_forward.dsq run"],
  } as unknown as StreamingPlayback;
  const shape = getGroundEffectShape("aliased_player.dts")!;
  expect(shape.clips.get("run")!.triggers).toHaveLength(0);
  const sim = new GroundEffectSimulation(mapped);
  sim.step(frame(0, player()));
  sim.step(frame(shape.clips.get("forward")!.duration, player()));
  expect(sim.decals).toHaveLength(1);
  expect(sim.emitters.get("foot:10")!.emitter.particles).toHaveLength(15);
});

it("uses stock DTS left/right triggers, foot offsets and the terrain property map", () => {
  terrain();
  const sim = new GroundEffectSimulation(playback);
  const shape = getGroundEffectShape("light_male.dts")!,
    clip = shape.clips.get("forward")!;
  expect(clip.triggers.length).toBe(2);
  const duration = clip.duration;
  sim.step(frame(0, player()));
  sim.step(frame(duration, player()));
  expect(sim.decals.length).toBe(1); // left wins when both trigger bits are set
  sim.step(frame(duration + 0.032, player()));
  expect(sim.decals.map((d) => d.point[0])).toEqual([-0.25, 0.25]);
  expect(sim.decals.every((d) => d.point[2] === 0)).toBe(true);
  const particles = sim.emitters.get("foot:10")!.emitter.particles;
  expect(particles.length).toBe(30);
  expect(particles[0].r).toBe(0.46);
  expect(particles[0].g).toBe(0.36);
  expect(particles[0].b).toBe(0.26);
});
it("skips foot dust and marks on interiors, in water, above the ground, and with no MPM", () => {
  const run = (actor = player()) => {
    const sim = new GroundEffectSimulation(playback);
    sim.step(frame(0, actor));
    sim.step(frame(0.8, actor));
    return sim;
  };
  terrain();
  expect(run(player({ position: [0, 0, 1.1] })).decals).toHaveLength(0);
  setWaterInfo({
    surfaceZ: 0.1,
    waveMagnitude: 0,
    liquidType: 0,
    minX: 0,
    minY: 0,
    sizeX: 2048,
    sizeY: 2048,
  });
  expect(run().decals).toHaveLength(0);
  setWaterInfo(null);
  const floor = new Mesh(new BoxGeometry(10, 0.1, 10));
  floor.position.y = 0.25;
  floor.updateMatrixWorld();
  registerInteriorCollider("floor", [floor]);
  expect(run(player({ position: [0, 0, 0.4] })).decals).toHaveLength(0);
  clearWorldColliders();
  terrain("unknown.custom");
  expect(run().emitters.size).toBe(0);
});
it("keeps wash independent of speed/jetting, but speed-scales the hover trail", () => {
  terrain();
  const vehicle = player({
    type: "Vehicle",
    className: "HoverVehicle",
    dataBlockId: 2,
    position: [0, 0, 2],
    velocity: [0, 0, 0],
  });
  const sim = new GroundEffectSimulation(playback);
  sim.step(frame(0, vehicle));
  sim.step(frame(0.032, vehicle));
  expect(sim.emitters.has("1:1:wash")).toBe(true);
  expect(sim.emitters.has("1:1:trail")).toBe(false);
  sim.step(frame(0.192, { ...vehicle, velocity: [15, 0, 0] }));
  const trail = sim.emitters.get("1:1:trail")!.emitter;
  expect(trail.particles).toHaveLength(1);
  // Offset is world-space, even with a rotated vehicle.
  expect(trail.particles[0].pos).toEqual([0, -1, 0.5]);
});
it("derives all six MPB spring contacts from the DTS and respects the frozen gate", () => {
  terrain();
  const shape = getGroundEffectShape("vehicle_land_mpbase.dts")!;
  const wheels = groundWheels(shape);
  expect(wheels).toHaveLength(6);
  expect(wheels[0].spring[2]).toBeCloseTo(-0.87);
  expect(wheels[1].position[0]).toBe(-wheels[0].position[0]);
  const vehicle = player({
    type: "Vehicle",
    className: "WheeledVehicle",
    dataBlockId: 3,
    position: [0, 0, 2.5],
    velocity: [0, 15, 0],
  });
  const sim = new GroundEffectSimulation(playback);
  sim.step(frame(0, vehicle));
  sim.step(frame(0.16, vehicle));
  expect(sim.emitters.size).toBe(6);
  for (const { emitter } of sim.emitters.values()) {
    expect(emitter.particles).toHaveLength(1);
    expect(emitter.particles[0].pos[2]).toBeCloseTo(0.5);
  }
  sim.step(frame(0.32, { ...vehicle, frozen: true }));
  for (const { emitter } of sim.emitters.values())
    expect(emitter.particles).toHaveLength(1);
});
it("replays recent inputs identically regardless of render frame grouping", () => {
  terrain();
  const frames = Array.from({ length: 220 }, (_, i) =>
    frame(i * 0.032, player({ position: [0, i * 0.03, 0] })),
  );
  const normal = new GroundEffectSimulation(playback),
    seek = new GroundEffectSimulation(playback);
  frames.forEach((f) => normal.step(f));
  frames.slice(0, 80).forEach((f) => seek.step(f));
  seek.clear();
  frames.forEach((f) => seek.step(f));
  expect(seek.decals).toEqual(normal.decals);
  expect([...seek.emitters.values()].map((e) => e.emitter.particles)).toEqual(
    [...normal.emitters.values()].map((e) => e.emitter.particles),
  );
  expect(seek.decals.every((d) => seek.timeSec - d.timeSec <= 5)).toBe(true);
});

it("reconstructs foot puffs identically from a shorter history window", () => {
  terrain();
  const frames = Array.from({ length: 500 }, (_, i) =>
    frame(i * 0.032, player({ position: [0, i * 0.03, 0] })),
  );
  const normal = new GroundEffectSimulation(playback),
    seek = new GroundEffectSimulation(playback);
  frames.forEach((f) => normal.step(f));
  frames.slice(250).forEach((f) => seek.step(f));
  // The pool's swap-removal order may differ; the live particle states must not.
  const particles = (sim: GroundEffectSimulation) =>
    sim.emitters
      .get("foot:10")!
      .emitter.particles.map((p) => JSON.stringify(p))
      .sort();
  expect(particles(seek)).toEqual(particles(normal));
});

it("refreshes reused datablock IDs and action aliases after a live world reset", () => {
  terrain();
  const data = structuredClone(blocks);
  let sequences = ["light_male_forward.dsq run"];
  const live = {
    getDataBlockData: (id: number) => data[id],
    getShapeConstructorSequences: () => sequences,
  } as unknown as StreamingPlayback;
  const sim = new GroundEffectSimulation(live);
  const actor = player({ jetting: true });
  sim.step(frame(0, actor));
  sim.step(frame(0.032, actor));
  const original = sim.emitters.get("1:1:jetDust")!.emitter.data;
  expect(original.ejectionPeriodMS).toBe(5);
  expect(original.particles.lifetimeMS).toBe(15 * 32);
  const shape = getGroundEffectShape("light_male.dts")!;
  expect(groundActionName(live, shape, "light_male.dts", 1)).toBe("forward");

  data[11] = { ...data[11], ejectionPeriodMS: 20 };
  data[30] = { ...data[30], lifetimeMS: 30 };
  sequences = ["light_male_forward.dsq side"];
  sim.clear();
  sim.step(frame(0, actor));
  sim.step(frame(0.032, actor));
  const refreshed = sim.emitters.get("1:1:jetDust")!.emitter.data;
  expect(refreshed.ejectionPeriodMS).toBe(20);
  expect(refreshed.particles.lifetimeMS).toBe(30 * 32);
  expect(groundActionName(live, shape, "light_male.dts", 1)).toBeUndefined();
  expect(groundActionName(live, shape, "light_male.dts", 3)).toBe("forward");
});

it("blocks ground effects against the vehicle's historical DTS collision details", async () => {
  const { GroundVehicleCollision } = await import("./groundVehicleCollision");
  const query = new GroundVehicleCollision(playback);
  const vehicle = player({
    type: "Vehicle",
    className: "WheeledVehicle",
    dataBlockId: 3,
    position: [0, 0, 2.5],
  });
  query.setFrame(frame(1, vehicle));
  expect(query.blocksRay([0, 0, 20], [0, 0, -1], 1)).toBe(true);
  expect(query.blocksRay([0, 0, 20], [0, 0, -1], 1, vehicle.key)).toBe(false);
  query.setFrame(frame(2, { ...vehicle, position: [100, 0, 2.5] }));
  expect(query.blocksRay([0, 0, 20], [0, 0, -1], 1)).toBe(false);
  query.setFrame(frame(1, vehicle));
  expect(query.blocksRay([0, 0, 20], [0, 0, -1], 1)).toBe(true);
});

it("rebuilds recent contacts when a hover vehicle's collision shape loads late", () => {
  terrain();
  const name = "late-ground-review-vehicle.dts";
  const sim = new GroundEffectSimulation({
    ...playback,
    getDataBlockData: () => ({ shapeName: name }),
  });
  sim.step(frame(0, player({ type: "Vehicle", className: "HoverVehicle" })));
  expect(sim.hasNewShapeAssets()).toBe(false);
  registerGroundEffectShape(
    name,
    getGroundEffectShape("vehicle_land_mpbase.dts")!.model,
  );
  expect(sim.hasNewShapeAssets()).toBe(true);
});

it("reuses repeated vehicle queries without sharing poses between actors or ticks", async () => {
  const { GroundVehicleCollision } = await import("./groundVehicleCollision");
  const query = new GroundVehicleCollision(playback);
  const first = player({
    type: "Vehicle",
    className: "WheeledVehicle",
    dataBlockId: 3,
    position: [0, 0, 2.5],
  });
  const second = {
    ...first,
    key: "2:1",
    position: [100, 0, 2.5] as [number, number, number],
  };
  const updates = vi.spyOn(DTSAnimationMixer.prototype, "update");
  try {
    query.setFrame(frame(1, first, second));
    expect(query.blocksRay([0, 0, 20], [0, 0, -1], 1)).toBe(true);
    const sampled = updates.mock.calls.length;
    for (let i = 0; i < 6; i++)
      expect(query.blocksRay([0, 0, 20], [0, 0, -1], 1)).toBe(true);
    expect(updates).toHaveBeenCalledTimes(sampled);
    expect(query.blocksRay([100, 0, 20], [100, 0, -1], 1)).toBe(true);
    expect(query.blocksRay([0, 0, 20], [0, 0, -1], 1)).toBe(true);
    expect(updates).toHaveBeenCalledTimes(sampled + 2);
    query.setFrame(frame(2, first));
    expect(query.blocksRay([0, 0, 20], [0, 0, -1], 1)).toBe(true);
    expect(updates).toHaveBeenCalledTimes(sampled + 3);
    // A replacement snapshot at the same timestamp must also invalidate it.
    query.setFrame(frame(2, { ...first, position: [50, 0, 2.5] }));
    expect(query.blocksRay([50, 0, 20], [50, 0, -1], 1)).toBe(true);
    expect(query.blocksRay([0, 0, 20], [0, 0, -1], 1)).toBe(false);
    query.setFrame(frame(1, first));
    expect(query.blocksRay([0, 0, 20], [0, 0, -1], 1)).toBe(true);
  } finally {
    updates.mockRestore();
  }
});
