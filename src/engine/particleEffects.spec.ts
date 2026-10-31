import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  Mesh,
  PerspectiveCamera,
  ShaderMaterial,
  Sprite,
  type Group,
} from "three";
import type { StreamSnapshot, StreamingPlayback } from "../stream/types";
import { createParticleEffects } from "./particleEffects";
import type { GameEngine } from "./gameEngine";

const test = vi.hoisted(() => ({
  frame: null as ((frame: unknown) => void) | null,
  listeners: new Set<(state: unknown) => void>(),
  debugMode: true,
  now: 0,
  invalidate: vi.fn(),
  transport: {
    status: "paused",
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
vi.mock("../loaders", () => ({}));
vi.mock("../state/engineStore", () => ({
  engineStore: { getState: () => ({ playback: test.transport }) },
  effectNow: () => test.now,
  effectDeltaSec: () => 0,
}));

const engine = {
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
  2: { particles: [3], overrideAdvances: true },
  3: { lifetimeMS: 400 },
};
const playback = {
  getDataBlockData: (id: number) => blocks[id],
} as unknown as StreamingPlayback;
const snapshotRef = {
  current: {
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
  } as unknown as StreamSnapshot,
};
let root: Group;
let effects: ReturnType<typeof createParticleEffects> | null = null;

function frame() {
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
  ) as Mesh<import("three").BufferGeometry, ShaderMaterial>;
  const textureDisposed = vi.spyOn(label.material.map!, "dispose");
  const sharedGeometryDisposed = vi.spyOn(sphere.geometry, "dispose");
  return { label, sphere, particles, textureDisposed, sharedGeometryDisposed };
}

beforeEach(() => {
  test.frame = null;
  test.listeners.clear();
  test.debugMode = true;
  test.now = 0;
  test.transport = {
    status: "paused",
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
