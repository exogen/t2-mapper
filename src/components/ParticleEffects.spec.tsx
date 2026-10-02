import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Group, Mesh, ShaderMaterial, Sprite } from "three";
import type { StreamSnapshot, StreamingPlayback } from "../stream/types";
import { ParticleEffects } from "./ParticleEffects";

const test = vi.hoisted(() => ({
  refs: [] as { current: unknown }[],
  refIndex: 0,
  effects: [] as {
    deps?: readonly unknown[];
    cleanup?: () => void;
  }[],
  effectIndex: 0,
  pending: [] as (() => void)[],
  frame: null as ((state: unknown, delta: number) => void) | null,
  debugMode: true,
  now: 0,
  invalidate: vi.fn(),
  transport: {
    status: "paused",
    recording: null as { streamingPlayback: StreamingPlayback } | null,
  },
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: (current: unknown) => (test.refs[test.refIndex++] ??= { current }),
  useMemo: (factory: () => unknown) => factory(),
  useEffect: (effect: () => void | (() => void), deps: readonly unknown[]) => {
    const slot = (test.effects[test.effectIndex++] ??= {});
    if (
      !slot.deps ||
      deps.some((value, index) => !Object.is(value, slot.deps![index]))
    ) {
      test.pending.push(() => {
        slot.cleanup?.();
        slot.cleanup = effect() || undefined;
      });
    }
    slot.deps = deps;
  },
}));
vi.mock("@react-three/fiber", () => ({
  useFrame: (frame: typeof test.frame) => {
    test.frame = frame;
  },
  useThree: (selector: (state: unknown) => unknown) =>
    selector({
      gl: { properties: { get: () => ({}) } },
      invalidate: test.invalidate,
    }),
}));
vi.mock("./SettingsProvider", () => ({
  useDebug: () => ({ debugMode: test.debugMode }),
  useSettings: () => ({ audioEnabled: false }),
}));
vi.mock("./AudioContext", () => ({ useAudio: () => ({}) }));
vi.mock("./AudioEmitter", () => ({}));
vi.mock("../loaders", () => ({}));
vi.mock("../state/engineStore", () => ({
  engineStore: { getState: () => ({ playback: test.transport }) },
  effectNow: () => test.now,
  effectDeltaSec: () => 0,
}));

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

function render() {
  test.refIndex = test.effectIndex = 0;
  const element = ParticleEffects({ playback, snapshotRef });
  element.props.ref.current = root;
  for (const effect of test.pending.splice(0)) effect();
}

function unmount() {
  for (const effect of test.effects) {
    effect.cleanup?.();
    effect.cleanup = undefined;
  }
}

function spawnExplosion() {
  render();
  test.frame!({}, 1 / 60);
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
  test.refs = [];
  test.effects = [];
  test.pending = [];
  test.frame = null;
  test.debugMode = true;
  test.now = 0;
  test.transport = {
    status: "paused",
    recording: { streamingPlayback: playback },
  };
  test.invalidate.mockClear();
  root = new Group();
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
    test.debugMode = false;
    render();
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
  test.frame!({}, 1 / 60);
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
