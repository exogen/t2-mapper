import fs from "node:fs/promises";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { BoxGeometry, Mesh } from "three";
import { DTSLoader } from "../dts/dtsLoader";
import { DTSAnimationMixer } from "../dts/dtsAnimationMixer";
import { DTSShape } from "../dts/dtsModel";
import { parseDSQ } from "../dts/dsq";
import {
  registerGroundEffectShape,
  getGroundEffectShape,
  groundActionName,
  groundWheels,
} from "./groundEffectAssets";
import { GroundEffectSimulation } from "./GroundEffectSimulation";
import { GroundVehicleCollision } from "./groundVehicleCollision";
import type {
  GroundActor,
  GroundEffectFrame,
} from "../stream/groundEffectQueue";
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
  moveAnimation: { animation: "run", timeSec: 0, timeScale: 1 },
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

it("retains action-slot footsteps when only the compact movement timeline is recorded", () => {
  terrain();
  const clip = getGroundEffectShape("light_male.dts")!.clips.get("forward")!;
  const triggerTime = (clip.triggers[0].position + 0.01) * clip.duration;
  const movement = player({
    moveAnimation: { animation: "run", timeSec: 1000, timeScale: 1 },
  });
  const action = {
    ...movement,
    actionSlot: { action: 1, calls: [{ timeSec: 0 }] },
  };
  const idle = new GroundEffectSimulation(playback);
  const acting = new GroundEffectSimulation(playback);
  try {
    for (const time of [0, triggerTime]) {
      idle.step(frame(time, movement));
      acting.step(frame(time, action));
    }
    expect(idle.decals).toHaveLength(0);
    expect(acting.decals).toHaveLength(1);
    expect(acting.emitters.get("foot:10")!.emitter.particles).toHaveLength(15);
  } finally {
    idle.clear();
    acting.clear();
  }
});

it("emits the first post-reset tick from the landing time without retaining actor inputs", () => {
  terrain();
  const clip = getGroundEffectShape("light_male.dts")!.clips.get("forward")!;
  const landing = clip.triggers[0].position * clip.duration - 0.016;
  const nextTick = landing + 0.032;
  const actor = player({ jetting: true });
  const baseline = new GroundEffectSimulation(playback);
  const seeded = new GroundEffectSimulation(playback);
  try {
    baseline.step(frame(landing, actor));
    baseline.step(frame(nextTick, actor));
    seeded.clear(landing);
    expect(seeded.timeSec).toBe(landing);
    expect(seeded.emitters.size).toBe(0);
    seeded.step(frame(nextTick, actor));
    expect(seeded.decals).toHaveLength(1);
    expect(seeded.decals).toEqual(baseline.decals);
    expect(seeded.emitters.get("foot:10")!.emitter.particles).toEqual(
      baseline.emitters.get("foot:10")!.emitter.particles,
    );
    expect(seeded.emitters.get("1:1:jetDust")!.emitter.particles).toEqual(
      baseline.emitters.get("1:1:jetDust")!.emitter.particles,
    );
    expect(seeded.emitters.get("1:1:jetDust")!.emitter.particles.length).toBe(
      6,
    );
  } finally {
    baseline.clear();
    seeded.clear();
  }
});

it("does not replay footstep triggers before a seeded landing or actor scope-in", () => {
  terrain();
  const clip = getGroundEffectShape("light_male.dts")!.clips.get("forward")!;
  const trigger = clip.triggers[0].position * clip.duration;
  const landed = new GroundEffectSimulation(playback);
  const scoped = new GroundEffectSimulation(playback);
  try {
    const landing = trigger + 0.016;
    landed.clear(landing);
    landed.step(frame(landing - 0.016, player({ jetting: true })));
    expect(landed.timeSec).toBe(landing);
    landed.step(frame(landing + 0.032, player({ jetting: true })));
    expect(landed.decals).toHaveLength(0);
    expect(landed.emitters.get("1:1:jetDust")!.emitter.particles).toHaveLength(
      6,
    );

    const spawnTick = Math.ceil(trigger / 0.032);
    const spawnedAt = spawnTick * 0.032;
    const actor = player({ key: `1:${spawnTick}`, spawnTick, jetting: true });
    scoped.clear(spawnedAt - 0.032);
    scoped.step(frame(spawnedAt, actor));
    expect(scoped.decals).toHaveLength(0);
    expect(scoped.emitters.size).toBe(0);
    scoped.step(frame(spawnedAt + 0.032, actor));
    expect(scoped.decals).toHaveLength(0);
    expect(
      scoped.emitters.get(`${actor.key}:jetDust`)!.emitter.particles,
    ).toHaveLength(6);
  } finally {
    landed.clear();
    scoped.clear();
  }
});

it("clamps reset clocks and ignores invalid ticks without consuming the baseline", () => {
  terrain();
  const sim = new GroundEffectSimulation(playback);
  try {
    for (const time of [undefined, NaN, Infinity, -Infinity]) {
      sim.clear(time);
      expect(sim.timeSec).toBe(-Infinity);
    }
    sim.clear(-5);
    expect(sim.timeSec).toBe(0);
    sim.step(frame(NaN, player()));
    sim.step(frame(Infinity, player()));
    expect(sim.timeSec).toBe(0);
    sim.step(frame(0.064, player({ key: "1:0", jetting: true, spawnTick: 0 })));
    expect(sim.emitters.get("1:0:jetDust")!.emitter.particles).toHaveLength(12);
  } finally {
    sim.clear();
  }
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
it("keeps foot, jet and wheel emissions identical across batched ticks and paused renders", () => {
  terrain();
  const normal = new GroundEffectSimulation(playback);
  const batched = new GroundEffectSimulation(playback);
  const frames = Array.from({ length: 240 }, (_, i) =>
    frame(
      i * 0.032,
      player({ position: [-12, i * 0.12, 0], jetting: i % 24 < 5 }),
      {
        key: "2:1",
        ghostIndex: 2,
        spawnTick: 1,
        type: "Vehicle",
        className: "WheeledVehicle",
        dataBlockId: 3,
        position: [12, i * 0.1, 2.5],
        rotation: [0, 0, 0, 1],
        velocity: [0, 15, 0],
        mounted: false,
        frozen: i % 70 >= 60,
      },
    ),
  );
  // Several complete simulation ticks can arrive before a rendered frame.
  // Empty renders while paused may then present the same endpoint again.
  const groupSizes = [1, 4, 17, 2, 8];
  const particles = (simulation: GroundEffectSimulation) =>
    [...simulation.emitters].map(([key, { emitter }]) => ({
      key,
      particles: structuredClone(emitter.particles),
    }));
  try {
    for (let start = 0, group = 0; start < frames.length; group++) {
      const end = Math.min(
        frames.length,
        start + groupSizes[group % groupSizes.length],
      );
      for (let i = start; i < end; i++) normal.step(frames[i]);
      for (const tick of frames.slice(start, end)) batched.step(tick);
      batched.step(frames[end - 1]);
      batched.step(frames[end - 1]);
      expect(batched.timeSec).toBe(normal.timeSec);
      expect(batched.decals).toEqual(normal.decals);
      // Full particle state includes RNG-dependent position/velocity/spin,
      // age, color, size and orientation, not merely an emission count.
      expect(particles(batched)).toEqual(particles(normal));
      start = end;
    }
    expect(normal.decals.length).toBeGreaterThan(0);
    expect(normal.emitters.has("foot:10")).toBe(true);
    expect(normal.emitters.has("1:1:jetDust")).toBe(true);
    expect(normal.emitters.has("2:1:wheel0")).toBe(true);
  } finally {
    normal.clear();
    batched.clear();
  }
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
  const originalEmitter = sim.emitters.get("1:1:jetDust")!.emitter;
  const original = originalEmitter.data;
  expect(original.ejectionPeriodMS).toBe(5);
  expect(original.particles.lifetimeMS).toBe(15 * 32);
  const shape = getGroundEffectShape("light_male.dts")!;
  expect(groundActionName(live, shape, "light_male.dts", 1)).toBe("forward");

  data[11] = { ...data[11], ejectionPeriodMS: 20 };
  data[30] = { ...data[30], lifetimeMS: 30 };
  sequences = ["light_male_forward.dsq side"];
  sim.clear();
  expect(originalEmitter.allocatedParticleSlots).toBe(0);
  expect(originalEmitter.isDead()).toBe(true);
  sim.step(frame(0, actor));
  sim.step(frame(0.032, actor));
  const refreshed = sim.emitters.get("1:1:jetDust")!.emitter.data;
  expect(refreshed.ejectionPeriodMS).toBe(20);
  expect(refreshed.particles.lifetimeMS).toBe(30 * 32);
  expect(groundActionName(live, shape, "light_male.dts", 1)).toBeUndefined();
  expect(groundActionName(live, shape, "light_male.dts", 3)).toBe("forward");
});

it("blocks ground effects against each tick's vehicle collision pose", async () => {
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

it("starts wheel effects on new ticks after the vehicle shape arrives", () => {
  terrain();
  const name = "late-ground-review-vehicle.dts";
  const actor = player({
    type: "Vehicle",
    className: "WheeledVehicle",
    dataBlockId: 3,
    position: [0, 0, 2.5],
    velocity: [0, 15, 0],
  });
  const sim = new GroundEffectSimulation({
    ...playback,
    getDataBlockData: (id: number) =>
      id === 3 ? { ...blocks[3], shapeName: name } : blocks[id],
  });
  try {
    sim.step(frame(0, actor));
    sim.step(frame(0.16, actor));
    expect(sim.emitters.size).toBe(0);
    registerGroundEffectShape(
      name,
      getGroundEffectShape("vehicle_land_mpbase.dts")!.model,
    );
    sim.step(frame(0.32, actor));
    expect(sim.emitters.size).toBe(6);
    for (const { emitter } of sim.emitters.values()) {
      expect(emitter.particles).toHaveLength(1);
      expect(emitter.particles[0].currentAge).toBe(0);
    }
    expect(sim.timeSec).toBe(0.32);
  } finally {
    sim.clear();
  }
});

it("starts late player assets at a fresh footstep baseline while preserving existing dust", () => {
  terrain();
  const name = "late-ground-movement-player.dts";
  const loaded = getGroundEffectShape("light_male.dts")!;
  const clip = loaded.clips.get("forward")!;
  const latePlayback = {
    ...playback,
    getDataBlockData: (id: number) =>
      id === 1 ? { ...blocks[1], shapeName: name } : blocks[id],
    getShapeConstructorSequences: () => [
      "late-ground-movement-player_forward.dsq run",
    ],
  } as StreamingPlayback;
  const late = new GroundEffectSimulation(latePlayback);
  const fresh = new GroundEffectSimulation(latePlayback);
  const actor = player({ jetting: true });
  const arrivedAt = (clip.triggers[0].position + 0.01) * clip.duration;
  const nextStep = (clip.triggers[1].position + 0.01) * clip.duration;
  try {
    late.clear(0);
    late.step(frame(0, actor));
    late.step(frame(0.032, actor));
    late.step(frame(0.064, actor));
    const dust = late.emitters.get("1:1:jetDust")!.emitter;
    registerGroundEffectShape(name, loaded.model);
    late.step(frame(arrivedAt, actor));
    // The missed first footstep is not replayed when the model arrives.
    expect(late.decals).toHaveLength(0);
    expect(late.emitters.has("foot:10")).toBe(false);
    expect(late.emitters.get("1:1:jetDust")!.emitter).toBe(dust);
    fresh.step(frame(arrivedAt, actor));
    late.step(frame(nextStep, actor));
    fresh.step(frame(nextStep, actor));
    expect(late.decals).toHaveLength(1);
    expect(late.decals).toEqual(fresh.decals);
    expect(late.emitters.get("foot:10")!.emitter.particles).toEqual(
      fresh.emitters.get("foot:10")!.emitter.particles,
    );
  } finally {
    late.clear();
    fresh.clear();
  }
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

it("releases consumed collision frames and recreates owned vehicle poses after reset", () => {
  const query = new GroundVehicleCollision(playback);
  const vehicle = player({
    type: "Vehicle",
    className: "WheeledVehicle",
    dataBlockId: 3,
    position: [0, 0, 2.5],
  });
  const updates = vi.spyOn(DTSAnimationMixer.prototype, "update");
  const roots = vi.spyOn(DTSShape.prototype, "prepareAnimationTargets");
  const blocked = () => query.blocksRay([0, 0, 20], [0, 0, -1], 1);
  try {
    query.setFrame(frame(1, vehicle));
    expect(blocked()).toBe(true);
    const sampled = updates.mock.calls.length;
    expect(blocked()).toBe(true);
    expect(updates).toHaveBeenCalledTimes(sampled);
    query.endFrame();
    expect(blocked()).toBe(false);

    // Even the same actor/time belongs to a fresh tick after endFrame: the
    // cached pose must not keep the consumed GroundActor and thread chain.
    query.setFrame(frame(1, vehicle));
    expect(blocked()).toBe(true);
    expect(updates).toHaveBeenCalledTimes(sampled + 1);
    const created = roots.mock.calls.length;
    query.clear();
    expect(blocked()).toBe(false);
    query.setFrame(frame(1, vehicle));
    expect(blocked()).toBe(true);
    expect(roots.mock.calls.length).toBeGreaterThan(created);
  } finally {
    query.clear();
    updates.mockRestore();
    roots.mockRestore();
  }
});

it("ends vehicle collision input ownership on successful and failed simulation ticks", () => {
  terrain();
  let failure = false;
  const simulation = new GroundEffectSimulation({
    ...playback,
    getDataBlockData(id: number) {
      if (failure) throw new Error("Missing ground-effect data");
      return blocks[id];
    },
  });
  const begin = vi.spyOn(GroundVehicleCollision.prototype, "setFrame");
  const clear = vi.spyOn(GroundVehicleCollision.prototype, "clear");
  const vehicle = player({
    type: "Vehicle",
    className: "WheeledVehicle",
    dataBlockId: 3,
    position: [0, 0, 2.5],
  });
  try {
    simulation.step(frame(0, vehicle));
    const query = begin.mock.contexts[0] as GroundVehicleCollision;
    expect(query.blocksRay([0, 0, 20], [0, 0, -1], 1)).toBe(false);
    failure = true;
    expect(() => simulation.step(frame(0.032, vehicle))).toThrow(
      "Missing ground-effect data",
    );
    failure = false;
    // A failed query batch must not keep that tick's actors either.
    expect(query.blocksRay([0, 0, 20], [0, 0, -1], 1)).toBe(false);
    simulation.clear();
    expect(clear).toHaveBeenCalledOnce();
  } finally {
    simulation.clear();
    begin.mockRestore();
    clear.mockRestore();
  }
});
