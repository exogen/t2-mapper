import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Group,
  Mesh,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  Vector3,
  type BufferGeometry,
} from "three";
import type { EmitterDataResolved } from "../particles/types";
import type { ParticleEmissionDummyEntity } from "../state/gameEntityTypes";
import { streamClock } from "../state/streamPlaybackStore";
import type { EngineHost, GameEngine } from "./gameEngine";
import { FrameScheduler } from "./frameScheduler";
import { FramePriority } from "./framePriority";
import { EntityViewRegistry } from "./entityViews";
import { createParticleEmissionDummyView } from "./particleEmissionDummyView";
import {
  AmbientParticles,
  ambientParticleCapacity,
  emissionTimeMultiple,
  readEmissionTransform,
} from "./ambientParticles";

const test = vi.hoisted(() => ({
  runtime: {} as object,
  playback: {
    status: "paused",
    recording: null as {
      streamingPlayback: { worldGeneration: number };
    } | null,
    seekNonce: 0,
    rate: 1,
  },
  mission: { dataSource: "map", missionName: "woe" },
  worldPaused: false,
  debugMode: false,
}));

vi.mock("../state/engineStore", () => ({
  engineStore: {
    getState: () => ({
      runtime: { runtime: test.runtime },
      playback: test.playback,
    }),
  },
  worldDeltaSec: (delta: number) =>
    !test.playback.recording
      ? delta
      : test.playback.status === "playing" && !test.worldPaused
        ? delta * test.playback.rate
        : 0,
}));
vi.mock("../state/gameEntityStore", () => ({
  gameEntityStore: { getState: () => test.mission },
}));
vi.mock("../state/settingsStore", () => ({
  settingsStore: { getState: () => ({ debugMode: test.debugMode }) },
  selectDebugMode: (state: { debugMode: boolean }) => state.debugMode,
}));
vi.mock("../loaders", () => ({}));
vi.mock("./debugVisuals", () => ({
  showWhileDebugTourTarget: () => () => {},
}));
vi.mock("../particles/particleRenderer", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../particles/particleRenderer")>();
  const { Texture } = await import("three");
  return { ...original, getParticleTexture: () => new Texture() };
});

type ParticleMesh = Mesh<BufferGeometry, ShaderMaterial>;

function data(
  overrides: Partial<EmitterDataResolved> = {},
): EmitterDataResolved {
  return {
    ejectionPeriodMS: 100,
    periodVarianceMS: 0,
    ejectionVelocity: 10,
    velocityVariance: 0,
    ejectionOffset: 0,
    thetaMin: 0,
    thetaMax: 0,
    phiReferenceVel: 0,
    phiVariance: 0,
    overrideAdvances: true,
    orientParticles: false,
    orientOnVelocity: true,
    lifetimeMS: 0,
    lifetimeVarianceMS: 0,
    particles: {
      dragCoefficient: 0,
      windCoefficient: 0,
      gravityCoefficient: 0,
      inheritedVelFactor: 0,
      constantAcceleration: 0,
      lifetimeMS: 1000,
      lifetimeVarianceMS: 0,
      spinSpeed: 0,
      spinRandomMin: 0,
      spinRandomMax: 0,
      useInvAlpha: false,
      keys: [
        { r: 1, g: 1, b: 1, a: 1, size: 1, time: 0 },
        { r: 1, g: 1, b: 1, a: 1, size: 1, time: 1 },
      ],
      textureName: "test",
    },
    ...overrides,
  };
}

function entity(particleEmitter = data()): ParticleEmissionDummyEntity {
  return {
    id: "dummy",
    className: "ParticleEmissionDummy",
    renderType: "ParticleEmissionDummy",
    particleEmitter,
    emissionVelocity: 1,
    timeMultiple: 1,
  };
}

function harness() {
  const scene = new Scene();
  const scheduler = new FrameScheduler();
  const invalidate = vi.fn();
  const host = { scene } as EngineHost;
  type HostStart = (host: EngineHost) => void | (() => void);
  let hostStart: HostStart | undefined;
  let stopHost: (() => void) | undefined;
  const engine = {
    scheduler,
    invalidate,
    streamSnapshot: { current: { gravity: -9.81 } },
    withHost(start: HostStart) {
      hostStart = start;
      stopHost = start(host) || undefined;
      return () => {
        stopHost?.();
        stopHost = undefined;
        hostStart = undefined;
      };
    },
  } as unknown as GameEngine;
  const particles = new AmbientParticles(engine);
  Object.assign(engine, { ambientParticles: particles });
  const uninstall = particles.install();
  return {
    scene,
    particles,
    invalidate,
    engine,
    frame(delta = 0.1) {
      scheduler.run(FramePriority.PostCamera, {
        delta,
        elapsed: 0,
        frame: 1,
        scene,
        camera: new PerspectiveCamera(),
        renderer: {} as import("three").WebGLRenderer,
      });
    },
    meshes: () => particles.group.children as ParticleMesh[],
    disconnect() {
      stopHost?.();
      stopHost = undefined;
    },
    reconnect() {
      stopHost = hostStart?.(host) || undefined;
    },
    uninstall,
  };
}

function position(mesh: ParticleMesh, particle = 0): number[] {
  const attribute = mesh.geometry.getAttribute("position");
  return [
    attribute.getX(particle * 4),
    attribute.getY(particle * 4),
    attribute.getZ(particle * 4),
  ];
}

const cleanups: (() => void)[] = [];
function world() {
  const result = harness();
  cleanups.push(() => result.uninstall());
  return result;
}

beforeEach(() => {
  streamClock.time = 0;
  streamClock.matchEndedAtSec = null;
  test.runtime = {};
  test.playback = { status: "paused", recording: null, seekNonce: 0, rate: 1 };
  test.mission = { dataSource: "map", missionName: "woe" };
  test.worldPaused = false;
  test.debugMode = false;
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.restoreAllMocks();
});

describe("standalone world emission", () => {
  it("reads translated, rotated local +Z without scaling its ejection axis", () => {
    const parent = new Group();
    parent.position.set(15, 25, 35);
    parent.rotation.set(0.2, -0.4, 0.6);
    const anchor = new Group();
    anchor.position.set(10, 20, 30);
    anchor.rotation.set(-0.7, 0.3, -0.2);
    anchor.scale.set(2, 7, 4);
    parent.add(anchor);
    const origin: [number, number, number] = [0, 0, 0];
    const axis: [number, number, number] = [0, 0, 0];
    readEmissionTransform(anchor, origin, axis);
    const expectedOrigin = anchor.position
      .clone()
      .applyQuaternion(parent.quaternion)
      .add(parent.position);
    const expectedAxis = new Vector3(0, 1, 0)
      .applyQuaternion(anchor.quaternion)
      .applyQuaternion(parent.quaternion);
    expect(
      new Vector3(origin[1], origin[2], origin[0]).distanceTo(expectedOrigin),
    ).toBeLessThan(1e-10);
    expect(
      new Vector3(axis[1], axis[2], axis[0]).distanceTo(expectedAxis),
    ).toBeLessThan(1e-10);
  });

  it("emits at a world-space origin once, with rotated ejection and inherited velocity", () => {
    const w = world();
    const anchor = new Group();
    anchor.position.set(10, 20, 30);
    anchor.rotation.z = Math.PI / 2;
    anchor.scale.set(2, 7, 4);
    w.scene.add(anchor);
    const emitter = data();
    emitter.particles.inheritedVelFactor = 0.5;
    const driver = entity(emitter);
    driver.emissionVelocity = 3;
    w.particles.add(anchor, driver);
    w.frame();
    const mesh = w.meshes()[0];
    expect(mesh.parent).toBe(w.particles.group);
    expect(mesh.geometry.drawRange.count).toBe(6);
    // 10 m/s ejection + 0.5 * 3 m/s driver velocity, for 100 ms.
    const result = position(mesh);
    expect(result[0]).toBeCloseTo(10 - 1.15);
    expect(result[1]).toBeCloseTo(20);
    expect(result[2]).toBeCloseTo(30);
  });

  it.each([
    { name: "negative", scale: [-2, -7, -4] },
    { name: "zero", scale: [0, 0, 0] },
  ])("ignores $name scale when aiming particles", ({ scale }) => {
    const parent = new Group();
    parent.rotation.set(0.4, 0.2, -0.8);
    parent.scale.set(-3, 0, 4);
    const anchor = new Group();
    anchor.rotation.set(-0.3, -0.6, 0.5);
    anchor.scale.fromArray(scale);
    parent.add(anchor);
    const origin: [number, number, number] = [0, 0, 0];
    const axis: [number, number, number] = [0, 0, 0];
    readEmissionTransform(anchor, origin, axis);
    const expected = new Vector3(0, 1, 0)
      .applyQuaternion(anchor.quaternion)
      .applyQuaternion(parent.quaternion);
    expect(
      new Vector3(axis[1], axis[2], axis[0]).distanceTo(expected),
    ).toBeLessThan(1e-10);
  });

  it("aims WOE's upside-down rain and snow emitters downward", () => {
    const anchor = new Group();
    anchor.rotation.x = Math.PI;
    const origin: [number, number, number] = [0, 0, 0];
    const axis: [number, number, number] = [0, 0, 0];
    readEmissionTransform(anchor, origin, axis);
    expect(axis[2]).toBeCloseTo(-1);
    expect(Math.hypot(axis[0], axis[1])).toBeLessThan(1e-10);
  });

  it("timeMultiple increases births while particle movement and lifetime use real world time", () => {
    const w = world();
    const slow = entity();
    const fast = {
      ...entity(slow.particleEmitter),
      id: "fast",
      timeMultiple: 2,
    };
    w.particles.add(new Group(), slow);
    w.particles.add(new Group(), fast);
    w.frame();
    const [slowMesh, fastMesh] = w.meshes();
    expect(slowMesh.geometry.drawRange.count).toBe(6);
    expect(fastMesh.geometry.drawRange.count).toBe(12);
    expect(position(slowMesh)).toEqual([0, 1, 0]);
    expect(position(fastMesh)).toEqual([0, 1, 0]);
    expect(position(fastMesh, 1)).toEqual([0, 1, 0]);
  });

  it("changes timeMultiple without restarting existing particles or their ages", () => {
    const w = world();
    const driver = entity();
    const registration = w.particles.add(new Group(), driver);
    w.frame();
    const mesh = w.meshes()[0];
    registration.update({ ...driver, timeMultiple: 2 });
    w.frame();
    expect(w.meshes()).toEqual([mesh]);
    expect(mesh.geometry.drawRange.count).toBe(18);
    expect(position(mesh)).toEqual([0, 2, 0]);
    expect(position(mesh, 1)).toEqual([0, 1, 0]);
    registration.dispose(true);
    w.frame(0.8);
    // The original reaches its 1000 ms lifetime; the two later births are 900 ms old.
    expect(mesh.geometry.drawRange.count).toBe(12);
    expect(position(mesh)).toEqual([0, 9, 0]);
    expect(position(mesh, 1)).toEqual([0, 9, 0]);
  });

  it("grows GPU capacity for a large emission frame without clipping particles", () => {
    const w = world();
    const driver = entity(data({ ejectionPeriodMS: 10 }));
    const registration = w.particles.add(new Group(), driver);
    w.frame(0.01);
    const mesh = w.meshes()[0];
    const originalGeometry = mesh.geometry;
    expect(originalGeometry.getAttribute("position").count / 4).toBe(256);
    const disposed = vi.spyOn(originalGeometry, "dispose");
    registration.update({ ...driver, timeMultiple: 100 });
    w.frame(0.1);
    expect(w.meshes()).toEqual([mesh]);
    expect(mesh.geometry).not.toBe(originalGeometry);
    expect(disposed).toHaveBeenCalledOnce();
    expect(mesh.geometry.drawRange.count / 6).toBe(1001);
    expect(
      mesh.geometry.getAttribute("position").count / 4,
    ).toBeGreaterThanOrEqual(1001);
    expect(position(mesh)[1]).toBeCloseTo(1.1);
  });

  it("keeps a dense WOE haze alive beyond the old 256-particle limit", () => {
    const w = world();
    const haze = data({ ejectionPeriodMS: 2 });
    haze.particles.lifetimeMS = 3500;
    haze.particles.lifetimeVarianceMS = 500;
    w.particles.add(new Group(), entity(haze));
    for (let i = 0; i < 40; i++) w.frame(0.1);
    const mesh = w.meshes()[0];
    expect(mesh.geometry.drawRange.count / 6).toBeGreaterThan(1500);
    expect(mesh.geometry.getAttribute("position").count / 4).toBeGreaterThan(
      2000,
    );
    const maximum = ambientParticleCapacity(haze, 100);
    expect(maximum).toBe(16383);
    expect(emissionTimeMultiple(-1)).toBe(0.01);
    expect(emissionTimeMultiple(200)).toBe(100);
    expect(emissionTimeMultiple(NaN)).toBe(1);
  });

  it("keeps saturated geometry below WebGL's reserved Uint16 restart index", () => {
    const w = world();
    const dense = entity(data({ ejectionPeriodMS: 1 }));
    dense.timeMultiple = 100;
    w.particles.add(new Group(), dense);
    w.frame(0.25);
    const mesh = w.meshes()[0];
    expect(mesh.geometry.drawRange.count / 6).toBe(16383);
    const indices = mesh.geometry.getIndex()!;
    expect(indices.array).toBeInstanceOf(Uint16Array);
    expect(indices.getX(indices.count - 1)).toBeLessThan(65535);
  });

  it("animates exploration and honors demo pause, playback rate and server world pause", () => {
    const w = world();
    w.particles.add(new Group(), entity());
    w.frame();
    expect(w.meshes()[0].geometry.drawRange.count).toBe(6);
    test.playback.recording = { streamingPlayback: { worldGeneration: 0 } };
    test.playback.status = "playing";
    w.frame();
    const mesh = w.meshes()[0];
    const initial = Array.from(mesh.geometry.getAttribute("position").array);
    test.playback.status = "paused";
    w.frame(0.2);
    expect(Array.from(mesh.geometry.getAttribute("position").array)).toEqual(
      initial,
    );
    expect(mesh.geometry.drawRange.count).toBe(6);
    test.playback.status = "playing";
    test.playback.rate = 2;
    w.frame();
    expect(mesh.geometry.drawRange.count).toBe(18);
    expect(position(mesh)).toEqual([0, 3, 0]);
    test.worldPaused = true;
    w.frame();
    expect(mesh.geometry.drawRange.count).toBe(18);
    expect(position(mesh)).toEqual([0, 3, 0]);
  });

  it("clears a seek's old particles before waiting, then starts the new timeline", () => {
    const w = world();
    test.playback.recording = { streamingPlayback: { worldGeneration: 0 } };
    test.playback.status = "playing";
    w.particles.add(new Group(), entity());
    w.frame();
    const oldMesh = w.meshes()[0];
    const disposed = vi.spyOn(oldMesh.geometry, "dispose");
    test.playback.seekNonce++;
    test.playback.status = "seeking";
    w.frame();
    expect(w.meshes()).toHaveLength(0);
    expect(disposed).toHaveBeenCalledOnce();
    test.playback.status = "playing";
    w.frame();
    expect(w.meshes()).toHaveLength(1);
    expect(w.meshes()[0]).not.toBe(oldMesh);
    expect(w.meshes()[0].geometry.drawRange.count).toBe(6);
  });

  it("rebuilds ambient particles at a paused timestamp and after a paused seek", () => {
    const w = world();
    test.playback.recording = { streamingPlayback: { worldGeneration: 0 } };
    streamClock.time = 10;
    const driver = { ...entity(), spawnTime: 0 };
    w.particles.add(new Group(), driver);
    w.frame();
    const mesh = w.meshes()[0];
    expect(mesh.geometry.drawRange.count).toBeGreaterThan(0);
    expect(position(mesh)[1]).toBeGreaterThan(0);
    const initial = Array.from(mesh.geometry.getAttribute("position").array);
    w.frame();
    expect(Array.from(mesh.geometry.getAttribute("position").array)).toEqual(
      initial,
    );
    test.playback.seekNonce++;
    test.playback.status = "seeking";
    w.frame();
    expect(w.meshes()).toHaveLength(0);
    streamClock.time = 20;
    test.playback.status = "paused";
    w.frame();
    expect(w.meshes()).toHaveLength(1);
    expect(w.meshes()[0]).not.toBe(mesh);
    expect(w.meshes()[0].geometry.drawRange.count).toBeGreaterThan(0);
    // A later emitter configuration begins a new lifetime at the edit.
    driver.particleEmitter = data({ lifetimeMS: 100 });
    w.frame();
    expect(w.meshes()).toHaveLength(2);
    expect(w.meshes()[1].geometry.drawRange.count).toBe(0);
  });

  it("does not restart a finite effect that expired before the paused timestamp", () => {
    const w = world();
    test.playback.recording = { streamingPlayback: { worldGeneration: 0 } };
    streamClock.time = 10;
    w.particles.add(new Group(), {
      ...entity(data({ lifetimeMS: 100 })),
      spawnTime: 0,
    });
    w.frame();
    expect(w.meshes()).toHaveLength(0);
    w.frame();
    expect(w.meshes()).toHaveLength(0);
  });

  it("switches a live emitter reference while allowing the old particles to drain", () => {
    const w = world();
    const driver = entity();
    w.particles.add(new Group(), driver);
    w.frame();
    const oldMesh = w.meshes()[0];
    driver.particleEmitter = data({ ejectionVelocity: 20 });
    w.frame();
    expect(w.meshes()).toHaveLength(2);
    expect(oldMesh.geometry.drawRange.count).toBe(6);
    const newMesh = w.meshes()[1];
    expect(newMesh.geometry.drawRange.count).toBe(6);
    w.frame();
    expect(oldMesh.geometry.drawRange.count).toBe(6);
    expect(newMesh.geometry.drawRange.count).toBe(12);
    expect(position(oldMesh)).toEqual([0, 3, 0]);
    expect(position(newMesh)).toEqual([0, 4, 0]);
  });

  it("lets deleted dummies' particles finish, then releases their GPU resources", () => {
    const w = world();
    const registration = w.particles.add(new Group(), entity());
    w.frame();
    const mesh = w.meshes()[0];
    const geometryDisposed = vi.spyOn(mesh.geometry, "dispose");
    const materialDisposed = vi.spyOn(mesh.material, "dispose");
    registration.dispose(true);
    w.frame();
    expect(w.meshes()).toEqual([mesh]);
    expect(mesh.geometry.drawRange.count).toBe(6);
    expect(position(mesh)).toEqual([0, 2, 0]);
    w.frame(0.8);
    expect(w.meshes()).toHaveLength(0);
    expect(geometryDisposed).toHaveBeenCalledOnce();
    expect(materialDisposed).toHaveBeenCalledOnce();
    w.frame();
    expect(w.meshes()).toHaveLength(0);
  });

  it("hides current particles and older datablock tails immediately while paused", () => {
    const w = world();
    test.playback.recording = { streamingPlayback: { worldGeneration: 0 } };
    test.playback.status = "playing";
    const registry = new EntityViewRegistry({
      ParticleEmissionDummy: createParticleEmissionDummyView,
    });
    const driver = entity();
    registry.sync([driver], w.engine);
    w.frame();
    driver.particleEmitter = data({ ejectionVelocity: 20 });
    w.frame();
    expect(w.meshes()).toHaveLength(2);
    const disposals = w
      .meshes()
      .map((mesh) => vi.spyOn(mesh.geometry, "dispose"));
    test.playback.status = "paused";
    registry.sync([{ ...driver, debugHidden: true }], w.engine);
    expect(w.meshes()).toHaveLength(0);
    for (const disposed of disposals) expect(disposed).toHaveBeenCalledOnce();
    w.frame();
    expect(w.meshes()).toHaveLength(0);
    registry.dispose();
  });

  it("keeps native deletion tails but destroys them on a same-name world reset", () => {
    const w = world();
    const source = { worldGeneration: 0 };
    test.playback.recording = { streamingPlayback: source };
    test.playback.status = "playing";
    const registry = new EntityViewRegistry({
      ParticleEmissionDummy: createParticleEmissionDummyView,
    });
    registry.sync([entity()], w.engine);
    w.frame();
    const oldMesh = w.meshes()[0];
    const disposed = vi.spyOn(oldMesh.geometry, "dispose");
    registry.sync([], w.engine);
    w.frame();
    expect(w.meshes()).toEqual([oldMesh]);
    source.worldGeneration++;
    w.frame();
    expect(w.meshes()).toHaveLength(0);
    expect(disposed).toHaveBeenCalledOnce();
    registry.dispose();
  });

  it("releases a finished emitter without restarting it until its data changes", () => {
    const w = world();
    const driver = entity(data({ lifetimeMS: 100 }));
    driver.particleEmitter!.particles.lifetimeMS = 300;
    const anchor = new Group();
    w.particles.add(anchor, driver);
    w.frame();
    expect(w.meshes()).toHaveLength(1);
    for (let i = 0; i < 10; i++) w.frame();
    expect(w.meshes()).toHaveLength(0);
    const readTransform = vi.spyOn(anchor, "updateWorldMatrix");
    w.frame();
    expect(readTransform).not.toHaveBeenCalled();
    driver.particleEmitter = data();
    w.frame();
    expect(w.meshes()).toHaveLength(1);
    expect(w.meshes()[0].geometry.drawRange.count).toBe(6);
  });

  it("discards old-world tails on mission changes and fully cleans up on host disconnect", () => {
    const w = world();
    w.particles.add(new Group(), entity());
    w.frame();
    const oldMesh = w.meshes()[0];
    const oldDisposed = vi.spyOn(oldMesh.geometry, "dispose");
    test.mission.missionName = "Firestorm";
    w.frame();
    expect(oldDisposed).toHaveBeenCalledOnce();
    expect(w.meshes()).toHaveLength(1);
    const mesh = w.meshes()[0];
    expect(mesh).not.toBe(oldMesh);
    const geometryDisposed = vi.spyOn(mesh.geometry, "dispose");
    const materialDisposed = vi.spyOn(mesh.material, "dispose");
    w.invalidate.mockClear();
    w.disconnect();
    expect(w.particles.group.parent).toBeNull();
    expect(w.meshes()).toHaveLength(0);
    expect(geometryDisposed).toHaveBeenCalledOnce();
    expect(materialDisposed).toHaveBeenCalledOnce();
    w.frame();
    expect(w.meshes()).toHaveLength(0);
    expect(w.invalidate).not.toHaveBeenCalled();
    w.reconnect();
    w.frame();
    expect(w.particles.group.parent).toBe(w.scene);
    expect(w.meshes()).toHaveLength(1);
    expect(w.meshes()[0].geometry.drawRange.count).toBe(6);
    w.uninstall();
    w.reconnect();
    w.frame();
    expect(w.particles.group.parent).toBeNull();
    expect(w.meshes()).toHaveLength(0);
  });
});
