import fs from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoxGeometry, Mesh } from "three";
import { DTSLoader } from "../dts/dtsLoader";
import { DTSShape, isDTSMesh } from "../dts/dtsModel";
import {
  DebrisSimulation,
  castDebrisRay,
  explosionDebris,
} from "./DebrisSimulation";
import { debrisParts } from "./debrisAssets";
import {
  DebrisHistory,
  debrisRetention,
  type DebrisEvent,
} from "../stream/debrisHistory";
import {
  clearWorldColliders,
  registerForceFieldCollider,
  registerInteriorCollider,
} from "../collision/worldCollision";
import { setTerrainCollisionData } from "../collision/terrainCollision";

const event = (overrides: Partial<DebrisEvent> = {}): DebrisEvent => ({
  id: 0,
  time: 0,
  expires: 30,
  kind: "shape",
  dataBlockId: 1,
  shape: "pieces.dts",
  position: [0, 0, 10],
  rotation: [0, 0, 0, 1],
  normal: [0, 0, 1],
  gravity: -9.81,
  ...overrides,
});
const parts = [{ index: 0, radius: 0.25, template: new DTSShape() }];
const blocks: Record<number, Record<string, unknown>> = {
  1: {
    lifetime: 25,
    numBounces: 10,
    staticOnMaxBounce: true,
    velocity: 17,
    velocityVariance: 7,
    minSpinSpeed: 60,
    maxSpinSpeed: 600,
  },
  2: {
    debris: 3,
    debrisMinVelocity: 3,
    debrisMaxVelocity: 1,
    debrisNum: 200,
    debrisVariance: 50,
    debrisThetaMin: 0,
    debrisThetaMax: 60,
  },
  3: {
    lifetime: 10,
    numBounces: 0,
    explodeOnMaxBounce: true,
    explosion: 4,
    emitter0: 5,
    emitter1: 5,
  },
  4: {
    dtsFileName: "effect_plasma_explosion.dts",
    lifetimeMS: 31,
    particleEmitter: 5,
    particleDensity: 5,
  },
  5: {
    particles: [6],
    ejectionPeriodMS: 10,
    ejectionVelocity: 0,
    useEmitterSizes: true,
  },
  6: {
    lifetimeMS: 31,
    gravityCoefficient: 0,
    keys: [
      { r: 1, g: 1, b: 1, a: 1, size: 0.2, time: 0 },
      { r: 1, g: 1, b: 1, a: 0, size: 0.4, time: 1 },
    ],
  },
};
const get = (id: number) => blocks[id];
const plane = (start: number[], end: number[]) =>
  end[2] < 0 && start[2] >= 0
    ? {
        t: start[2] / (start[2] - end[2]),
        normal: [0, 0, 1] as [number, number, number],
      }
    : null;
const state = (sim: DebrisSimulation) => ({
  bodies: [...sim.bodies.values()].map((b) => ({
    id: b.id,
    p: b.position,
    v: b.velocity,
    q: b.rotation.toArray(),
    end: b.end,
    bounces: b.bounces,
  })),
  particles: [...sim.emitters].map((e) =>
    e.particles.map((p) => ({ pos: p.pos, size: p.size, age: p.currentAge })),
  ),
  impacts: [...sim.impacts.keys()],
});

describe("debris playback", () => {
  it("decodes wire count and speed independently (VehicleExplosion makes 2–4 fireballs, not 200)", () => {
    expect(explosionDebris(blocks[2])).toEqual({
      count: 3,
      variance: 1,
      speed: 20,
      speedVariance: 5,
    });
    const sim = new DebrisSimulation(
      get,
      () => parts,
      () => null,
    );
    sim.update(0, [event({ kind: "explosion", dataBlockId: 2 })]);
    expect(sim.bodies.size).toBeGreaterThanOrEqual(2);
    expect(sim.bodies.size).toBeLessThanOrEqual(4);
    for (const body of sim.bodies.values()) {
      expect(Math.hypot(...body.velocity)).toBeGreaterThanOrEqual(15);
      expect(Math.hypot(...body.velocity)).toBeLessThanOrEqual(25);
      expect(body.position[2]).toBe(10.5);
    }
  });
  it("reconstructs the same motion and trails on seeks, independent of render cadence and retained-history prefix", () => {
    const events = [
      event({ expires: 0.1 }),
      event({ id: 1, time: 0.071, kind: "explosion", dataBlockId: 2 }),
    ];
    const normal = new DebrisSimulation(get, () => parts, plane);
    for (let t = 0; t <= 2; t += 1 / 60) normal.update(t, events);
    normal.update(2, events);
    const seek = new DebrisSimulation(get, () => parts, plane);
    // Reconstruct from a later event, as happens once earlier effects expire.
    while (!seek.update(2, events.slice(1), 3)) {
      /* bounded catchup */
    }
    const reference = state(normal);
    reference.bodies = reference.bodies.filter(
      (b) => !b.id.startsWith("debris_0"),
    );
    expect(state(seek)).toEqual(reference);
    const paused = structuredClone(state(seek));
    for (let i = 0; i < 100; i++) seek.update(2, events.slice(1));
    expect(state(seek)).toEqual(paused);
    seek.clear();
    seek.update(0, events);
    expect(seek.impacts.size).toBe(0);
    expect(seek.emitters.size).toBe(0);
  });
  it("emits trails along the actual segment, then keeps them alive after a first-bounce fireball explodes", () => {
    const sim = new DebrisSimulation(get, () => parts, plane);
    const events = [
      event({
        kind: "explosion",
        dataBlockId: 2,
        normal: [0, 0, -1],
        position: [100, 50, 0.2],
      }),
    ];
    sim.update(0.032, events);
    expect(
      [...sim.emitters].some((e) =>
        e.particles.some((p) => p.pos[0] > 90 && p.pos[1] > 40),
      ),
    ).toBe(true);
    sim.update(0.3, events);
    expect(sim.bodies.size).toBe(0);
    expect(sim.impacts.size).toBeGreaterThan(0);
    expect([...sim.emitters].some((e) => e.particles.length > 0)).toBe(true);
    sim.update(3, events);
    expect(sim.bodies.size + sim.impacts.size + sim.emitters.size).toBe(0);
  });
  it("stops collision work after exhausting bounces and expires without a parent ghost", () => {
    const cast = vi.fn(() => ({
      t: 0.5,
      normal: [0, 0, 1] as [number, number, number],
    }));
    const sim = new DebrisSimulation(get, () => parts, cast);
    sim.update(1, [event()]);
    expect(cast).toHaveBeenCalledTimes(10);
    expect([...sim.bodies.values()][0].stationary).toBe(true);
    while (!sim.update(26, [event()])) {
      /* catchup */
    }
    expect(sim.bodies.size).toBe(0);
  });
  it("uses the authored particle radius for debris impact explosions", () => {
    const data: Record<number, Record<string, unknown>> = {
      ...blocks,
      2: { ...blocks[2], debrisMinVelocity: 1, debrisMaxVelocity: 0 },
      3: { ...blocks[3], emitter0: null, emitter1: null },
      4: { ...blocks[4], particleRadius: 3, particleDensity: 4 },
    };
    const sim = new DebrisSimulation(
      (id) => data[id],
      () => parts,
      plane,
    );
    sim.update(0.032, [
      event({
        kind: "explosion",
        dataBlockId: 2,
        normal: [0, 0, -1],
        position: [100, 50, -0.49],
      }),
    ]);
    expect(sim.newImpacts).toHaveLength(1);
    const origin = sim.newImpacts[0].position!;
    const particles = [...sim.emitters][0].particles;
    expect(particles).toHaveLength(4);
    for (const { pos } of particles) {
      expect(pos).not.toEqual(origin);
      expect(Math.abs(pos[0] - origin[0])).toBeLessThanOrEqual(3);
      expect(Math.abs(pos[1] - origin[1])).toBeLessThanOrEqual(3);
      expect(pos[2] - origin[2]).toBeGreaterThanOrEqual(0);
      expect(pos[2] - origin[2]).toBeLessThanOrEqual(3);
    }
  });
  it("consumes appended events once even when pruning removes non-prefix entries", () => {
    const history = new DebrisHistory();
    history.add(event());
    history.add(event({ time: 0.032, expires: 0.04 }));
    history.add(event({ time: 0.064 }));
    const sim = new DebrisSimulation(
      get,
      () => parts,
      () => null,
    );
    sim.update(0.064, history.events);
    const original = [...sim.bodies.values()];
    history.prune(0.1);
    expect(history.events.map((e) => e.id)).toEqual([0, 2]);
    history.add(event({ time: 0.128 }));
    sim.update(0.128, history.events);
    expect([...sim.bodies.keys()]).toEqual([
      "debris_0_0",
      "debris_1_0",
      "debris_2_0",
      "debris_3_0",
    ]);
    for (const body of original) expect(sim.bodies.get(body.id)).toBe(body);
    const paused = structuredClone(state(sim));
    sim.update(0.128, history.events);
    expect(state(sim)).toEqual(paused);
    sim.clear();
    sim.update(0.128, history.events);
    expect([...sim.bodies.keys()]).toEqual([
      "debris_0_0",
      "debris_2_0",
      "debris_3_0",
    ]);
  });
  it("does not resurrect expired pieces when shape assets become available", () => {
    let ready = false;
    const sim = new DebrisSimulation(
      get,
      () => (ready ? parts : undefined),
      () => null,
    );
    const events = [event()];
    sim.update(0, events);
    expect(sim.missingShapes.has("pieces.dts")).toBe(true);
    ready = true;
    sim.clear();
    while (!sim.update(26, events)) {
      /* catchup */
    }
    expect(sim.bodies.size).toBe(0);
  });
  it("serializes spawn inputs and retains particle/secondary-explosion tails", () => {
    const history = new DebrisHistory();
    history.add(event({ expires: debrisRetention(2, get) }));
    const saved = structuredClone(history.save());
    history.prune(5);
    expect(history.events).toHaveLength(1);
    history.prune(100);
    expect(history.events).toHaveLength(0);
    history.restore(saved);
    history.add(event());
    expect(history.events.map((e) => e.id)).toEqual([0, 1]);
    expect(history.generation).toBe(1);
  });
});

describe("authored debris parts", () => {
  it.each([
    ["vehicle_air_scout_debris.dts", 7],
    ["debris_generic.dts", 13],
  ] as const)(
    "splits %s into %i independently drawable rigid objects sharing source geometry",
    async (name, count) => {
      const bytes = await fs.readFile(
        `docs/base/@vl2/shapes.vl2/shapes/${name}`,
      );
      const model = new DTSLoader().parse(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
      );
      const pieces = debrisParts(model);
      expect(pieces).toHaveLength(count);
      for (const part of pieces) {
        expect(part.radius).toBeGreaterThan(0);
        const clone = part.template.clone();
        clone.ensureDetail(0);
        const meshes: unknown[] = [];
        clone.traverse((node) => {
          if (isDTSMesh(node)) meshes.push(node.geometry);
        });
        expect(meshes.length).toBeGreaterThan(0);
        expect(new Set(clone.branches.map((b) => b.objectIndex))).toEqual(
          new Set([part.index]),
        );
        const source: unknown[] = [];
        model.scene.getShapeObject(part.index)!.traverse((node) => {
          if (isDTSMesh(node)) source.push(node.geometry);
        });
        for (const geo of meshes) expect(source).toContain(geo);
        clone.ensureAllDetails();
        expect(new Set(clone.branches.map((b) => b.objectIndex)).size).toBe(1);
      }
    },
  );
});

afterEach(() => {
  clearWorldColliders();
  setTerrainCollisionData(null);
});
it("collides with interiors but passes through forcefields, matching the retail debris mask", () => {
  const field = new Mesh(new BoxGeometry(2, 2, 2));
  field.position.set(0, 4, 0);
  field.updateMatrixWorld(true);
  field.geometry.computeBoundingBox();
  registerForceFieldCollider(
    "field",
    field.matrixWorld,
    field.geometry.boundingBox!,
    true,
  );
  expect(castDebrisRay([0, 0, 10], [0, 0, 0], false)).toBeNull();
  const interior = new Mesh(new BoxGeometry(2, 2, 2));
  interior.updateMatrixWorld(true);
  registerInteriorCollider("floor", [interior]);
  expect(castDebrisRay([0, 0, 10], [0, 0, -2], false)?.t).toBeCloseTo(0.75);
});

it("applies recorded gravity changes to existing bodies and their trails when replaying", () => {
  const sim = new DebrisSimulation(
    get,
    () => parts,
    () => null,
  );
  const events = [event({ kind: "explosion", dataBlockId: 2 })];
  const changes = [
    { time: 0.032, gravity: 0 },
    { time: 0.128, gravity: -20 },
  ];
  sim.update(0, events, 256, changes);
  const velocities = [...sim.bodies.values()].map((body) => body.velocity[2]);
  sim.update(0.096, events, 256, changes);
  expect([...sim.bodies.values()].map((body) => body.velocity[2])).toEqual(
    velocities,
  );
  expect([...sim.emitters].every((emitter) => emitter.worldGravity === 0)).toBe(
    true,
  );
  sim.update(0.16, events, 256, changes);
  expect([...sim.bodies.values()][0].velocity[2]).toBeCloseTo(
    velocities[0] - 20 * 0.064,
  );
  const replay = new DebrisSimulation(
    get,
    () => parts,
    () => null,
  );
  replay.update(0.16, events, 256, changes);
  expect(state(replay)).toEqual(state(sim));
});
