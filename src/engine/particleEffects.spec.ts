import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  Mesh,
  Object3D,
  PerspectiveCamera,
  ShaderMaterial,
  Sprite,
  type Group,
  type InstancedBufferGeometry,
} from "three";
import type { StreamSnapshot, StreamingPlayback } from "../stream/types";
import { createParticleEffects } from "./particleEffects";
import type { GameEngine } from "./gameEngine";
import { streamClock } from "../state/streamPlaybackStore";
import { streamRenderFrame } from "../stream/interpolateEntity";
import { ProjectileTrailHistory } from "../stream/projectileTrailHistory";
import { registerImageMuzzle } from "./weaponMuzzle";
import { addNodeEmitter, removeNodeEmitter } from "./nodeEmitters";
import { readResourceMetrics } from "../diagnostics/resourceMetricRegistry";

const test = vi.hoisted(() => ({
  frame: null as ((frame: unknown) => void) | null,
  listeners: new Set<(state: unknown) => void>(),
  debugMode: true,
  now: 0,
  delta: 0,
  invalidate: vi.fn(),
  viewRoots: new Map<string, import("three").Object3D>(),
  transport: {
    status: "paused",
    seekNonce: 0,
    recording: null as { streamingPlayback: StreamingPlayback } | null,
  },
}));

vi.mock("../state/settingsStore", () => ({
  settingsStore: {
    getState: () => ({ debugMode: test.debugMode, audioEnabled: false }),
    subscribe: (listener: (state: unknown) => void) => {
      test.listeners.add(listener);
      return () => test.listeners.delete(listener);
    },
  },
  selectDebugMode: (state: { debugMode: boolean }) => state.debugMode,
}));
vi.mock("./audioGraph", () => ({ getAudioGraph: () => ({}) }));
vi.mock("./soundEffects", () => ({}));
vi.mock("./projectileAudio", () => ({
  createProjectileAudio: () => ({
    update: vi.fn(),
    reset: vi.fn(),
    dispose: vi.fn(),
  }),
}));
vi.mock("../loaders", () => ({}));
vi.mock("../state/engineStore", () => ({
  engineStore: { getState: () => ({ playback: test.transport }) },
  effectNow: () => test.now,
}));

const engine = {
  entities: { get: (id: string) => ({ root: test.viewRoots.get(id) }) },
  scheduler: {
    add: (_stage: number, frame: (frame: unknown) => void) => {
      test.frame = frame;
      return () => {
        test.frame = null;
      };
    },
  },
  invalidate: test.invalidate,
} as unknown as GameEngine;

const blocks: Record<number, Record<string, unknown>> = {
  1: { particleEmitter: 2, particleDensity: 1, particleRadius: 4 },
  2: { particles: [3], overrideAdvances: true, ejectionPeriodMS: 8 },
  3: { lifetimeMS: 400 },
  4: { lifetimeMS: 400, emitters: [2], ejectionFreq: 0.0001 },
  5: {
    particles: [3],
    ejectionPeriodMS: 8,
    ejectionVelocity: 0,
    velocityVariance: 0,
  },
  6: {
    particles: [7],
    ejectionPeriodMS: 8,
    ejectionVelocity: 0,
    velocityVariance: 0,
  },
  7: { lifetimeMS: 400, inheritedVelFactor: 1 },
};
let projectileTrailHistory: ProjectileTrailHistory | undefined;
const playback = {
  getDataBlockData: (id: number) => blocks[id],
  get projectileTrailHistory() {
    return projectileTrailHistory;
  },
} as unknown as StreamingPlayback;
const initialSnapshot = {
  entities: [
    {
      id: "explosion",
      type: "Explosion",
      position: [0, 0, 0],
      explosionDataBlockId: 1,
    },
  ],
  gravity: -9.81,
  audioEvents: [],
} as unknown as StreamSnapshot;
const snapshotRef = { current: initialSnapshot };
let root: Group;
let effects: ReturnType<typeof createParticleEffects> | null = null;
type ParticleMesh = Mesh<InstancedBufferGeometry, ShaderMaterial>;

function frame(elapsedSec = test.delta) {
  test.now += elapsedSec * 1000;
  test.frame!({
    delta: 1 / 60,
    camera: new PerspectiveCamera(),
    renderer: { properties: { get: () => ({}) } },
  });
}

function setDebugMode(debugMode: boolean) {
  test.debugMode = debugMode;
  for (const listener of test.listeners)
    listener({ debugMode, audioEnabled: false });
}

function unmount() {
  effects?.dispose();
  effects = null;
}

function spawnExplosion() {
  effects = createParticleEffects(engine, playback, snapshotRef);
  root = effects.group;
  frame();
  const label = root.children.find((child) => child instanceof Sprite)!;
  const sphere = root.children.find(
    (child) =>
      child instanceof Mesh && child.geometry.type === "SphereGeometry",
  ) as Mesh;
  const particles = root.children.find(
    (child) =>
      child instanceof Mesh && child.material instanceof ShaderMaterial,
  ) as ParticleMesh;
  const textureDisposed = vi.spyOn(label.material.map!, "dispose");
  const sharedGeometryDisposed = vi.spyOn(sphere.geometry, "dispose");
  return { label, sphere, particles, textureDisposed, sharedGeometryDisposed };
}

beforeEach(() => {
  test.frame = null;
  test.listeners.clear();
  test.debugMode = true;
  test.now = 0;
  test.delta = 0;
  test.viewRoots.clear();
  projectileTrailHistory = undefined;
  streamClock.time = 0;
  streamClock.matchEndedAtSec = null;
  snapshotRef.current = initialSnapshot;
  test.transport = {
    status: "paused",
    seekNonce: 0,
    recording: { streamingPlayback: playback },
  };
  test.invalidate.mockClear();
  vi.stubGlobal("document", {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        measureText: () => ({ width: 200 }),
        fillText() {},
      }),
    }),
  });
});

afterEach(() => {
  unmount();
  streamRenderFrame.current = streamRenderFrame.previous = null;
  streamRenderFrame.interpT = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("spreads explosion bursts over their authored particle radius", () => {
  vi.spyOn(Math, "random").mockReturnValue(0.25);
  const { particles } = spawnExplosion();
  const position = particles.geometry.getAttribute("position");
  // Radius 4, random 0.25: Torque (-2, -2, 1), converted to Three axes.
  expect([position.getX(0), position.getY(0), position.getZ(0)]).toEqual([
    -2, 1, -2,
  ]);
});

it("counts owned particle arrays without shared quad data, then unregisters on disposal", () => {
  const { particles } = spawnExplosion();
  const geometry = particles.geometry;
  const bytes = Object.entries(geometry.attributes)
    .filter(([name]) => name !== "quadCorner")
    .reduce((total, [, attribute]) => total + attribute.array.byteLength, 0);
  const metrics = readResourceMetrics();
  expect(metrics).toMatchObject({
    "streamParticleEffects.activeEmitters": 1,
    "streamParticleEffects.peakActiveEmitters": 1,
    "streamParticleEffects.ownedGeometryArrayBytes": bytes,
    "streamParticleEffects.peakOwnedGeometryArrayBytes": bytes,
    "streamParticleEffects.createdEmittersLifetime": 1,
    "streamParticleEffects.disposedEmittersLifetime": 0,
  });
  expect(metrics["streamParticleEffects.ownedParticleSlots"]).toBeGreaterThan(
    0,
  );
  expect(metrics["streamParticleEffects.ownedParticleSlots"]).toBe(
    metrics["streamParticleEffects.liveParticles"]! +
      metrics["streamParticleEffects.freeParticleSlots"]!,
  );
  frame(13);
  expect(readResourceMetrics()).toMatchObject({
    "streamParticleEffects.activeEmitters": 0,
    "streamParticleEffects.ownedParticleSlots": 0,
    "streamParticleEffects.liveParticles": 0,
    "streamParticleEffects.freeParticleSlots": 0,
    "streamParticleEffects.ownedGeometryArrayBytes": 0,
    "streamParticleEffects.peakOwnedGeometryArrayBytes": bytes,
    "streamParticleEffects.createdEmittersLifetime": 1,
    "streamParticleEffects.disposedEmittersLifetime": 1,
    "streamParticleEffects.createdParticleSlotsLifetime":
      metrics["streamParticleEffects.createdParticleSlotsLifetime"],
  });
  unmount();
  expect(
    Object.keys(readResourceMetrics()).some((key) =>
      key.startsWith("streamParticleEffects."),
    ),
  ).toBe(false);
});

it.each(["paused", "seeking"])(
  "removes all particle debug visuals when disabled while %s, without waiting for a frame",
  (status) => {
    const {
      label,
      sphere,
      particles,
      textureDisposed,
      sharedGeometryDisposed,
    } = spawnExplosion();
    expect(root.children.length).toBeGreaterThan(3);
    test.transport.status = status;
    setDebugMode(false);
    expect(root.children).toHaveLength(1);
    expect(root.children[0]).toBe(particles);
    expect(label.parent).toBeNull();
    expect(sphere.parent).toBeNull();
    expect(particles.material.uniforms.debugOpacity.value).toBe(1);
    expect(textureDisposed).toHaveBeenCalledOnce();
    expect(sharedGeometryDisposed).not.toHaveBeenCalled();
    expect(test.invalidate).toHaveBeenCalled();
    unmount();
    expect(textureDisposed).toHaveBeenCalledOnce();
  },
);

it("disposes the explosion label texture when its debug sphere expires", () => {
  const { label, sphere, textureDisposed, sharedGeometryDisposed } =
    spawnExplosion();
  test.now = 3000;
  frame();
  expect(label.parent).toBeNull();
  expect(sphere.parent).toBeNull();
  expect(textureDisposed).toHaveBeenCalledOnce();
  expect(sharedGeometryDisposed).not.toHaveBeenCalled();
  unmount();
  expect(textureDisposed).toHaveBeenCalledOnce();
});

it("disposes the explosion label texture on unmount, preserving the shared sphere geometry", () => {
  const { label, sphere, textureDisposed, sharedGeometryDisposed } =
    spawnExplosion();
  unmount();
  expect(root.children).toHaveLength(0);
  expect(label.parent).toBeNull();
  expect(sphere.parent).toBeNull();
  expect(textureDisposed).toHaveBeenCalledOnce();
  expect(sharedGeometryDisposed).not.toHaveBeenCalled();
});

it("starts a splash on its stream tick and rebuilds its particles after a seek", () => {
  setDebugMode(false);
  snapshotRef.current = {
    ...initialSnapshot,
    entities: [
      {
        id: "splash",
        type: "Splash",
        dataBlockId: 4,
        position: [4, 6, 20],
        spawnTimeSec: 1,
      },
    ],
  };
  effects = createParticleEffects(engine, playback, snapshotRef);
  streamClock.time = 0.99;
  frame();
  expect(effects.group.children).toHaveLength(0);

  // The same snapshot is still current when the render clock reaches it.
  streamClock.time = 1.064;
  frame();
  const particles = effects.group.children[0] as ParticleMesh;
  expect(particles.geometry.instanceCount).toBeGreaterThan(0);
  const positions = particles.geometry.getAttribute("position").array.slice();
  test.transport.seekNonce++;
  frame();
  const restored = effects.group.children[0] as ParticleMesh;
  expect(particles.parent).toBeNull();
  expect(restored.geometry.getAttribute("position").array).toEqual(positions);
  expect(effects.group.children).toHaveLength(1);
});

it("emits air and bubble trails only in their own medium and resumes on exit", () => {
  setDebugMode(false);
  test.transport.status = "playing";
  test.delta = 0.032;
  const projectile = {
    id: "mortar",
    type: "Projectile",
    maintainEmitterId: 2,
    bubbleEmitterId: 2,
    position: [0, 0, 1],
    velocity: [0, 0, -10],
  } as const;
  const publish = (projectileInWater: boolean, z: number) => {
    streamClock.time += test.delta;
    snapshotRef.current = {
      ...initialSnapshot,
      entities: [
        {
          ...projectile,
          position: [0, 0, z],
          velocity: [0, 0, -10],
          projectileInWater,
        },
      ],
    };
    frame();
  };
  effects = createParticleEffects(engine, playback, snapshotRef);
  publish(false, 1);
  const air = effects.group.children[0] as ParticleMesh;
  const dryCount = air.geometry.instanceCount;
  expect(dryCount).toBeGreaterThan(0);

  publish(true, -0.1);
  const bubbles = effects.group.children[1] as ParticleMesh;
  const wetCount = bubbles.geometry.instanceCount;
  expect(wetCount).toBeGreaterThan(0);
  expect(air.geometry.instanceCount).toBe(dryCount);

  publish(false, 0.1);
  expect(air.geometry.instanceCount).toBeGreaterThan(dryCount);
  expect(bubbles.geometry.instanceCount).toBe(wetCount);
});

it("starts and moves trail particles at the interpolated projectile position, including after a seek", () => {
  setDebugMode(false);
  test.transport.status = "playing";
  test.delta = 0.008;
  snapshotRef.current = {
    ...initialSnapshot,
    entities: [
      {
        id: "mortar",
        type: "Projectile",
        maintainEmitterId: 5,
        position: [0, 0, 0],
        velocity: [0, 0, -10],
      },
    ],
  };
  const projectile = snapshotRef.current.entities[0];
  streamRenderFrame.current = new Map([[projectile.id, projectile]]);
  streamRenderFrame.previous = new Map([
    [projectile.id, { ...projectile, position: [0, 0, 1] }],
  ]);
  effects = createParticleEffects(engine, playback, snapshotRef);

  streamRenderFrame.interpT = 0.25;
  frame();
  const trail = effects.group.children[0] as ParticleMesh;
  const positions = trail.geometry.getAttribute("position");
  expect(trail.geometry.instanceCount).toBe(1);
  expect(positions.getY(0)).toBeCloseTo(0.75);

  streamRenderFrame.interpT = 0.5;
  frame();
  expect(trail.geometry.instanceCount).toBe(2);
  expect(positions.getY(1)).toBeCloseTo(0.5);

  test.transport.seekNonce++;
  streamRenderFrame.interpT = 0.875;
  frame();
  const restored = effects.group.children[0] as ParticleMesh;
  expect(trail.parent).toBeNull();
  expect(restored.geometry.instanceCount).toBe(0);
  frame();
  expect(restored.geometry.instanceCount).toBe(1);
  expect(restored.geometry.getAttribute("position").getY(0)).toBeCloseTo(0.125);
});

it("emits a missile from its current render position back to its previous one", () => {
  setDebugMode(false);
  test.transport.status = "playing";
  test.delta = 0.008;
  const missile = {
    id: "missile",
    type: "Projectile",
    projectileTrailMode: "seeker",
    maintainEmitterId: 5,
    position: [4, 0, 0],
    velocity: [125, 0, 0],
  } as const;
  snapshotRef.current = {
    ...initialSnapshot,
    entities: [
      {
        ...missile,
        position: [...missile.position],
        velocity: [...missile.velocity],
      },
    ],
  };
  const shot = snapshotRef.current.entities[0];
  streamRenderFrame.current = new Map([[shot.id, shot]]);
  streamRenderFrame.previous = new Map([
    [shot.id, { ...shot, position: [0, 0, 0] }],
  ]);
  streamRenderFrame.interpT = 0.25;
  effects = createParticleEffects(engine, playback, snapshotRef);
  frame();
  const trail = effects.group.children[0] as ParticleMesh;
  const positions = trail.geometry.getAttribute("position");

  streamRenderFrame.interpT = 0.5;
  frame();
  expect(trail.geometry.instanceCount).toBe(2);
  expect(positions.getZ(0)).toBeCloseTo(1);
  expect(positions.getZ(1)).toBeCloseTo(1);
});

it("holds forward-moving particles when playback time is frozen", () => {
  setDebugMode(false);
  test.transport.status = "playing";
  test.delta = 0.008;
  snapshotRef.current = {
    ...initialSnapshot,
    entities: [
      {
        id: "missile",
        type: "Projectile",
        projectileTrailMode: "seeker",
        maintainEmitterId: 6,
        position: [0, 0, 0],
        velocity: [90, 0, 0],
      },
    ],
  };
  effects = createParticleEffects(engine, playback, snapshotRef);
  frame();
  const trail = effects.group.children[0] as ParticleMesh;
  const positions = trail.geometry.getAttribute("position");
  const initial = positions.getZ(0);
  expect(initial).toBeGreaterThan(0);
  for (let i = 0; i < 6; i++) frame(0);
  expect(trail.geometry.instanceCount).toBe(1);
  expect(positions.getZ(0)).toBe(initial);

  frame();
  expect(trail.geometry.instanceCount).toBe(2);
  expect(positions.getZ(0)).toBeGreaterThan(initial);
});

it("emits each published trail tick once and warms retained ticks after a seek", () => {
  setDebugMode(false);
  test.transport.status = "playing";
  test.delta = 0.008;
  projectileTrailHistory = new ProjectileTrailHistory(
    playback.getDataBlockData,
  );
  const record = (tick: number) =>
    projectileTrailHistory!.add({
      projectileId: "mortar",
      emitterId: 5,
      slot: "base",
      tick,
      from: [(tick - 1) * 4, 0, 0],
      to: [tick * 4, 0, 0],
      velocity: [125, 0, 0],
    });
  const publish = (tick: number, renderTime: number) => {
    streamClock.time = renderTime;
    snapshotRef.current = {
      ...initialSnapshot,
      timeSec: tick * 0.032,
      entities: [
        {
          id: "mortar",
          type: "Projectile",
          projectileTrailMode: "tick",
          maintainEmitterId: 5,
          position: [tick * 4, 0, 0],
        },
      ],
    };
  };

  record(1);
  publish(1, 0.008);
  effects = createParticleEffects(engine, playback, snapshotRef);
  frame();
  const trail = effects.group.children[0] as ParticleMesh;
  expect(effects.group.children).toHaveLength(1);
  expect(trail.geometry.instanceCount).toBe(4);
  const positions = trail.geometry.getAttribute("position");
  expect(positions.getZ(3)).toBeCloseTo(4);
  frame(0);
  expect(trail.geometry.instanceCount).toBe(4);

  record(2);
  record(3);
  frame(0);
  expect(trail.geometry.instanceCount).toBe(4);
  publish(3, 0.08);
  frame(0.072);
  expect(trail.geometry.instanceCount).toBe(12);

  test.transport.seekNonce++;
  publish(2, 0.05);
  frame(0);
  const restored = effects.group.children[0] as ParticleMesh;
  expect(trail.parent).toBeNull();
  expect(restored.geometry.instanceCount).toBe(8);
});

it("starts bubbles at the previous rendered pose and ends at the current simulation pose", () => {
  setDebugMode(false);
  test.transport.status = "playing";
  test.delta = 0.016;
  const publish = (z: number, projectileInWater: boolean) => {
    snapshotRef.current = {
      ...initialSnapshot,
      entities: [
        {
          id: "grenade",
          type: "Projectile",
          projectileTrailMode: "tick",
          bubbleEmitterId: 5,
          position: [0, 0, z],
          projectileInWater,
        },
      ],
    };
    const entity = snapshotRef.current.entities[0];
    streamRenderFrame.previous = streamRenderFrame.current;
    streamRenderFrame.current = new Map([[entity.id, entity]]);
    streamRenderFrame.interpT = 0.25;
  };
  effects = createParticleEffects(engine, playback, snapshotRef);
  publish(2, false);
  frame();
  expect(effects.group.children).toHaveLength(0);
  publish(-2, true);
  frame();
  const bubbles = effects.group.children[0] as ParticleMesh;
  const positions = bubbles.geometry.getAttribute("position");
  expect(bubbles.geometry.instanceCount).toBe(2);
  expect(positions.getY(0)).toBeCloseTo(0);
  expect(positions.getY(1)).toBeCloseTo(-2);
});

it("plays one flechette ignition puff and delays both authored trails", () => {
  setDebugMode(false);
  test.transport.status = "playing";
  test.delta = 0.032;
  snapshotRef.current = {
    ...initialSnapshot,
    entities: [
      {
        id: "missile",
        type: "Projectile",
        spawnTimeSec: 1,
        position: [0, 0, 2],
        maintainEmitterId: 2,
        seekerLaunch: {
          casingSplitAtSec: 1.256,
          puffPosition: [0, 0, 1],
          puffEmitterId: 2,
          trailStartsAtSec: 1.544,
          delayEmitterId: 2,
          delayEmitterStartsAtSec: 1.544,
        },
      },
    ],
  };
  effects = createParticleEffects(engine, playback, snapshotRef);
  streamClock.time = 1.224;
  frame();
  const trails = effects.group.children.slice() as ParticleMesh[];
  expect(trails).toHaveLength(2);
  expect(trails.every((trail) => trail.geometry.instanceCount === 0)).toBe(
    true,
  );

  // The split occurred partway through the frame. Direct seeks to the
  // same timestamp must give the puff the same age.
  streamClock.time = 1.264;
  frame();
  const puff = effects.group.children[2] as ParticleMesh;
  expect(puff.geometry.instanceCount).toBeGreaterThan(0);
  const positions = puff.geometry.getAttribute("position").array.slice();
  frame();
  expect(effects.group.children).toHaveLength(3);
  expect(puff.geometry.getAttribute("position").array).toEqual(positions);

  streamClock.time = 1.576;
  frame();
  expect(trails.every((trail) => trail.geometry.instanceCount > 0)).toBe(true);
  test.transport.seekNonce++;
  test.transport.status = "paused";
  test.delta = 0;
  streamClock.time = 1.264;
  frame();
  const restoredPuff = effects.group.children.find(
    (child) => (child as ParticleMesh).geometry.instanceCount > 0,
  ) as ParticleMesh;
  expect(restoredPuff.geometry.getAttribute("position").array).toEqual(
    positions,
  );
  test.transport.seekNonce++;
  streamClock.time = 1.224;
  frame();
  expect(effects.group.children).toHaveLength(2);
  expect(puff.parent).toBeNull();
});

it("clears point-emitted sparks on a seek and resumes at the new contact", () => {
  setDebugMode(false);
  test.transport.status = "playing";
  test.delta = 0.032;
  streamClock.time = 1;
  snapshotRef.current = { ...initialSnapshot, entities: [] };
  const node = {
    ownerId: "elf",
    dataBlockId: 5,
    anchor: new Object3D(),
    frame: { velocity: [0, 0, 0] as [number, number, number], dtScale: 1 },
    emitAtPoint: true,
  };
  addNodeEmitter(node);
  try {
    effects = createParticleEffects(engine, playback, snapshotRef);
    frame();
    const oldSparks = effects.group.children[0] as ParticleMesh;
    expect(oldSparks.geometry.instanceCount).toBeGreaterThan(0);

    test.transport.seekNonce++;
    test.transport.status = "paused";
    test.delta = 0;
    streamClock.time = 5;
    node.anchor.position.x = 20;
    frame();
    expect(oldSparks.parent).toBeNull();
    const newSparks = effects.group.children[0] as ParticleMesh;
    expect(newSparks.geometry.instanceCount).toBe(0);

    test.transport.status = "playing";
    test.delta = 0.032;
    streamClock.time += test.delta;
    frame();
    expect(newSparks.geometry.instanceCount).toBeGreaterThan(0);
    expect(newSparks.geometry.getAttribute("position").getX(0)).toBeCloseTo(20);
  } finally {
    removeNodeEmitter(node);
  }
});

it("emits launcher backblast at the named node and stops on its authored boundary", () => {
  setDebugMode(false);
  test.transport.status = "playing";
  test.delta = 0.032;
  const owner = new Object3D();
  const image = new Object3D();
  const nozzle = new Object3D();
  nozzle.name = "muzzlePoint1";
  nozzle.position.set(2, 3, 4);
  image.add(nozzle);
  owner.add(image);
  test.viewRoots.set("shooter", owner);
  const unregister = registerImageMuzzle("shooter", 0, image);
  try {
    snapshotRef.current = {
      ...initialSnapshot,
      entities: [
        { id: "shooter", type: "Player" },
        {
          id: "missile",
          type: "Projectile",
          spawnTimeSec: 1,
          sourceSlot: 0,
          position: [20, 20, 20],
          seekerLaunch: {
            sourceId: "shooter",
            exhaustEmitterId: 5,
            exhaustNodeName: "muzzlePoint1",
            exhaustUntilSec: 1.064,
          },
        },
      ],
    };
    effects = createParticleEffects(engine, playback, snapshotRef);
    streamClock.time = 1.032;
    frame();
    const exhaust = effects.group.children[0] as ParticleMesh;
    expect(exhaust.geometry.instanceCount).toBeGreaterThan(0);
    const position = exhaust.geometry.getAttribute("position");
    expect(position.getX(0)).toBeCloseTo(2);
    expect(position.getY(0)).toBeCloseTo(3);
    expect(position.getZ(0)).toBeCloseTo(4);

    streamClock.time = 1.064;
    frame();
    const count = exhaust.geometry.instanceCount;
    streamClock.time = 1.096;
    frame();
    expect(exhaust.geometry.instanceCount).toBe(count);
  } finally {
    unregister();
  }
});
