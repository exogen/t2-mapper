import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  PerspectiveCamera,
  Scene,
  type BufferGeometry,
  type ShaderMaterial,
  type WebGLRenderer,
} from "three";
import { setTerrainCollisionData } from "../collision/terrainCollision";
import { engineStore } from "../state/engineStore";
import { streamClock } from "../state/streamPlaybackStore";
import {
  GroundEffectQueue,
  type GroundEffectFrame,
} from "../stream/groundEffectQueue";
import type { StreamRecording, StreamingPlayback } from "../stream/types";
import { GameEngine } from "./gameEngine";
import { installStreamEffects } from "./streamEffects";

interface Simulation {
  timeSec: number;
  emitters: Map<string, unknown>;
  clear: ReturnType<typeof vi.fn>;
  step: ReturnType<typeof vi.fn>;
}
const owners = vi.hoisted(() => ({
  simulations: [] as Simulation[],
  geometries: [] as BufferGeometry[],
  materials: [] as ShaderMaterial[],
}));

vi.mock("../particles/GroundEffectSimulation", () => ({
  GroundEffectSimulation: class {
    timeSec = -Infinity;
    emitters = new Map();
    decals = [];
    decalTimeoutSec = 5;
    clear = vi.fn((timeSec = -Infinity) => {
      this.timeSec = timeSec;
      this.emitters.clear();
    });
    step = vi.fn((frame: GroundEffectFrame) => {
      this.timeSec = frame.timeSec;
      if (!this.emitters.size)
        this.emitters.set("dust", {
          emitter: {
            particles: [{}],
            maxParticles: 1,
            data: {
              particles: { textureName: "dust", useInvAlpha: false },
              orientParticles: false,
            },
          },
        });
    });
    constructor() {
      owners.simulations.push(this);
    }
  },
}));
vi.mock("../particles/WorldDecalRenderer", () => ({
  WorldDecalRenderer: class {
    dispose = vi.fn();
    update = vi.fn();
    updateTextureVisibility = vi.fn();
  },
}));
vi.mock("../particles/particleRenderer", async () => {
  const { BufferGeometry, ShaderMaterial, Texture } = await import("three");
  const texture = new Texture();
  return {
    getParticleTexture: () => texture,
    particleTexturesReady: new Set([texture]),
    syncBuffers: vi.fn(),
    createParticleGeometry: () => {
      const geometry = new BufferGeometry();
      vi.spyOn(geometry, "dispose");
      owners.geometries.push(geometry);
      return geometry;
    },
    createParticleMaterial: () => {
      const material = new ShaderMaterial({
        uniforms: {
          particleTexture: { value: texture },
          renderDelta: { value: 0 },
        },
      });
      vi.spyOn(material, "dispose");
      owners.materials.push(material);
      return material;
    },
  };
});
vi.mock("./particleEffects", async () => {
  const { Group } = await import("three");
  return {
    createParticleEffects: () => ({ group: new Group(), dispose() {} }),
  };
});
vi.mock("./audioGraph", () => ({ getAudioGraph: () => ({}) }));

const savedPlayback = engineStore.getState().playback;
const savedClock = {
  time: streamClock.time,
  matchEndedAtSec: streamClock.matchEndedAtSec,
};
let visibility: DocumentVisibilityState;
let documentEvents: EventTarget;
let stop: (() => void) | undefined;
let disconnectHost: (() => void) | undefined;

beforeEach(() => {
  owners.simulations.length =
    owners.geometries.length =
    owners.materials.length =
      0;
  visibility = "visible";
  documentEvents = new EventTarget();
  Object.defineProperty(documentEvents, "visibilityState", {
    get: () => visibility,
  });
  vi.spyOn(documentEvents, "addEventListener");
  vi.spyOn(documentEvents, "removeEventListener");
  vi.stubGlobal("document", documentEvents);
  setTerrainCollisionData({
    heightMap: new Uint16Array(256 * 256),
    squareSize: 8,
    textureName: "lushworld.grassdark",
  });
  streamClock.time = 0;
  streamClock.matchEndedAtSec = null;
});

afterEach(() => {
  stop?.();
  stop = undefined;
  disconnectHost?.();
  disconnectHost = undefined;
  engineStore.setState({ playback: savedPlayback });
  Object.assign(streamClock, savedClock);
  setTerrainCollisionData(null);
  vi.unstubAllGlobals();
});

function recording(queue = new GroundEffectQueue()) {
  return {
    source: "demo",
    streamingPlayback: { groundEffectQueue: queue } as StreamingPlayback,
  } as StreamRecording;
}

function transport(update: Partial<typeof savedPlayback>) {
  engineStore.setState({
    playback: { ...engineStore.getState().playback, ...update },
  });
}

function fixture() {
  const source = recording();
  transport({ recording: source, status: "playing", seekNonce: 0 });
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  const renderer = {} as WebGLRenderer;
  const engine = new GameEngine();
  disconnectHost = engine.connect({
    scene,
    renderer,
    invalidate: vi.fn(),
    assetsLoading: () => false,
  });
  stop = installStreamEffects(engine);
  const frame = (timeSec: number) => {
    streamClock.time = timeSec;
    engine.scheduler.runAll({
      frame: 1,
      delta: 0.032,
      elapsed: timeSec,
      scene,
      renderer,
      camera,
    });
  };
  const append = (queue: GroundEffectQueue, timeSec: number) => {
    if (queue.capturing) queue.append({ timeSec, gravity: -9.81, actors: [] });
  };
  const queue = source.streamingPlayback.groundEffectQueue!;
  frame(0);
  append(queue, 0.032);
  frame(0.032);
  expect(owners.geometries).toHaveLength(1);
  return {
    source,
    queue,
    engine,
    scene,
    frame,
    append,
    simulation: owners.simulations[0],
  };
}

function setVisibility(value: DocumentVisibilityState) {
  visibility = value;
  documentEvents.dispatchEvent(new Event("visibilitychange"));
}

it("immediately releases hidden-page CPU and GPU effects without a frame, then accepts only future resumed inputs", () => {
  const f = fixture();
  const geometry = owners.geometries[0],
    material = owners.materials[0];
  f.append(f.queue, 0.064);
  setVisibility("hidden");
  expect(f.queue.capturing).toBe(false);
  expect(f.queue.getMetrics().groundEffectPendingFrames).toBe(0);
  expect(f.simulation.emitters.size).toBe(0);
  expect(geometry.dispose).toHaveBeenCalledOnce();
  expect(material.dispose).toHaveBeenCalledOnce();
  expect(f.scene.children.every((group) => group.children.length === 0)).toBe(
    true,
  );
  f.append(f.queue, 100);
  expect(f.queue.getMetrics().groundEffectPendingFrames).toBe(0);

  setVisibility("visible");
  expect(f.queue.capturing).toBe(true);
  f.append(f.queue, 0.064);
  f.append(f.queue, 0.096);
  f.frame(0.064);
  expect(f.queue.oldestTimeSec).toBe(0.096);
  expect(owners.geometries).toHaveLength(1);
  f.frame(0.096);
  expect(owners.geometries).toHaveLength(2);
  expect(f.simulation.step.mock.calls.map(([frame]) => frame.timeSec)).toEqual([
    0.032, 0.096,
  ]);
});

it("preserves paused visible effects but clears immediately when transport enters a seek", () => {
  const f = fixture();
  const geometry = owners.geometries[0],
    material = owners.materials[0];
  const clears = f.simulation.clear.mock.calls.length;
  transport({ status: "paused" });
  f.frame(0.032);
  expect(f.simulation.emitters.size).toBe(1);
  expect(f.simulation.clear).toHaveBeenCalledTimes(clears);
  expect(geometry.dispose).not.toHaveBeenCalled();
  expect(material.dispose).not.toHaveBeenCalled();
  transport({ status: "seeking", seekNonce: 1 });
  expect(f.queue.capturing).toBe(false);
  expect(f.simulation.emitters.size).toBe(0);
  expect(geometry.dispose).toHaveBeenCalledOnce();
  expect(material.dispose).toHaveBeenCalledOnce();
});

it("disposes outgoing effects before their scene assets and resumes on the new scene", async () => {
  const f = fixture();
  const geometry = owners.geometries[0];
  const assets = f.engine.sceneAssets;
  const disposeAsset = vi.fn(() => {
    expect(geometry.dispose).toHaveBeenCalledOnce();
    expect(f.scene.children).toHaveLength(0);
  });
  assets.cache<object, object>({}, disposeAsset).set({}, {});

  f.engine.releaseSceneAssets();
  expect(disposeAsset).toHaveBeenCalledOnce();
  expect(f.queue.capturing).toBe(false);
  expect(f.simulation.emitters.size).toBe(0);

  await Promise.resolve();
  expect(f.engine.sceneAssets).not.toBe(assets);
  f.frame(0.064);
  f.append(f.queue, 0.096);
  f.frame(0.096);
  expect(owners.geometries).toHaveLength(2);
  expect(owners.simulations[1].step).toHaveBeenCalledOnce();
});

it("retires replaced recordings and removes transport, visibility and scheduler work on disposal", () => {
  const f = fixture();
  const next = recording();
  transport({ recording: next });
  expect(f.queue.capturing).toBe(false);
  expect(f.simulation.emitters.size).toBe(0);
  const oldClears = f.simulation.clear.mock.calls.length;
  const nextQueue = next.streamingPlayback.groundEffectQueue!;
  f.frame(0.032);
  expect(nextQueue.capturing).toBe(true);
  f.append(nextQueue, 0.064);
  f.frame(0.064);
  expect(owners.geometries).toHaveLength(2);
  expect(f.simulation.clear).toHaveBeenCalledTimes(oldClears);
  stop!();
  stop = undefined;
  expect(nextQueue.capturing).toBe(false);
  expect(f.scene.children).toHaveLength(0);
  const latest = owners.simulations[1];
  const clears = latest.clear.mock.calls.length,
    steps = latest.step.mock.calls.length;
  setVisibility("hidden");
  transport({ status: "seeking", seekNonce: 2 });
  f.frame(0.096);
  expect(latest.clear).toHaveBeenCalledTimes(clears);
  expect(latest.step).toHaveBeenCalledTimes(steps);
  const added = vi
    .mocked(documentEvents.addEventListener)
    .mock.calls.filter(([type]) => type === "visibilitychange");
  const removed = vi
    .mocked(documentEvents.removeEventListener)
    .mock.calls.filter(([type]) => type === "visibilitychange");
  expect(removed.map(([, listener]) => listener)).toEqual(
    added.map(([, listener]) => listener),
  );
});

it("does not let an older installation disable its replacement's shared queue", () => {
  const f = fixture();
  const stopOld = stop!;
  stop = installStreamEffects(f.engine);
  f.frame(0.032);
  expect(f.queue.capturing).toBe(true);
  stopOld();
  expect(f.queue.capturing).toBe(true);
  f.append(f.queue, 0.064);
  f.frame(0.064);
  expect(owners.simulations[1].step).toHaveBeenCalledOnce();
  expect(owners.simulations[1].timeSec).toBe(0.064);
  expect(f.queue.getMetrics().groundEffectPendingFrames).toBe(0);
});
