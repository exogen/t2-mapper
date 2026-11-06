import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BufferGeometry,
  Group,
  Mesh,
  PerspectiveCamera,
  Scene,
  Texture,
  Vector3,
} from "three";
import type { LightningEntity, ShapeEntity } from "../state/gameEntityTypes";
import type {
  LightningConfig,
  LightningStrike,
  WeatherSound,
} from "../weather/types";
import { streamClock } from "../state/streamPlaybackStore";
import { TYPE_MASKS } from "../torqueScript/classHierarchy";
import type { EngineHost, GameEngine } from "./gameEngine";
import { FrameScheduler } from "./frameScheduler";
import { FramePriority } from "./framePriority";
import { createLightningView } from "./lightningView";
import {
  exploreLightningTarget,
  LightningEffects,
  lightningImpact,
  writeWeatherLightningGeometry,
} from "./lightningEffects";

const test = vi.hoisted(() => ({
  runtime: { state: { startTime: 0, datablocks: new Map() } },
  playback: {
    status: "playing",
    recording: null as null | {
      streamingPlayback: {
        worldGeneration: number;
        playbackRevision: number;
        lightningHistory: { events: LightningStrike[]; generation: number };
      };
    },
    seekNonce: 0,
    rate: 1,
  },
  world: {
    dataSource: "map",
    missionName: "storm",
    missionEntities: new Map(),
    streamEntities: new Map(),
  },
  settings: { audioEnabled: false, fogEnabled: true },
  commandMap: false,
  worldPaused: false,
  soundGeneration: 0,
  audioCallbacks: [] as ((buffer: AudioBuffer) => void)[],
  audio: [] as {
    play: ReturnType<typeof vi.fn>;
    position: Vector3;
    parent: unknown;
  }[],
  bounds: new Map<
    string,
    { min: [number, number, number]; max: [number, number, number] }
  >(),
  exposed: new Set<string>(),
  worldHit: null as null | { t: number; point: [number, number, number] },
  waterHit: null as null | { t: number; point: [number, number, number] },
  terrain: undefined as number | undefined,
  frozenCenter: undefined as [number, number, number] | undefined,
}));

vi.mock("three", async (importOriginal) => {
  const original = await importOriginal<typeof import("three")>();
  class Audio extends original.Group {
    play = vi.fn();
    onEnded = vi.fn();
    constructor() {
      super();
      test.audio.push(this);
    }
    setBuffer() {
      return this;
    }
    setVolume() {
      return this;
    }
    setLoop() {
      return this;
    }
    setPlaybackRate() {
      return this;
    }
  }
  return { ...original, Audio };
});
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
  gameEntityStore: { getState: () => test.world },
  isStreamingSource: (source: string) => source === "demo" || source === "live",
  selectSkyData: () => ({ fogColor: { r: 0.1, g: 0.2, b: 0.3 } }),
}));
vi.mock("../state/settingsStore", () => ({
  settingsStore: { getState: () => test.settings, subscribe: () => () => {} },
}));
vi.mock("../state/commandCircuitStore", () => ({
  commandCircuitStore: { getState: () => ({ active: test.commandMap }) },
}));
vi.mock("../loaders", () => ({ audioToUrl: (filename: string) => filename }));
vi.mock("../particles/particleRenderer", () => ({
  getParticleTexture: () => new Texture(),
  particleTexturesReady: new Set(),
}));
vi.mock("../collision/worldCollision", () => ({
  castWorldRay: vi.fn(() => test.worldHit),
}));
vi.mock("../collision/waterLevel", () => ({
  castWaterRay: vi.fn(() => test.waterHit),
}));
vi.mock("../collision/terrainCollision", () => ({
  terrainHeightAt: () => test.terrain,
}));
vi.mock("../collision/renderShapeRaycast", () => ({
  renderShapeRaycast: {
    lightningTargetExposed: (_from: unknown, _to: unknown, id: string) =>
      test.exposed.has(id),
  },
}));
vi.mock("../stream/shapeBounds", () => ({
  getShapeBounds: (name: string) => test.bounds.get(name),
  getShapeCenter: () => test.frozenCenter,
}));
vi.mock("./audioGraph", () => ({
  getAudioGraph: () => ({
    audioLoader: {},
    audioListener: {
      context: { state: "running" },
      getWorldPosition: (out: Vector3) => out.set(0, 0, 0),
    },
  }),
}));
vi.mock("./soundEffects", async () => {
  const { Audio } = await import("three");
  return {
    createPositionalAudio: () => new Audio({} as import("three").AudioListener),
    getCachedAudioBuffer: (
      _url: string,
      _loader: unknown,
      callback: (buffer: AudioBuffer) => void,
    ) => test.audioCallbacks.push(callback),
    getSoundGeneration: () => test.soundGeneration,
    getEffectiveSoundRate: () => 1,
    trackSound: vi.fn(),
    stopAndDetachSound: vi.fn((sound: Group) => sound.removeFromParent()),
  };
});

function config(overrides: Partial<LightningConfig> = {}): LightningConfig {
  return {
    position: [0, 0, 150],
    scale: [512, 512, 300],
    strikeWidth: 2.5,
    chanceToHitTarget: 0.5,
    strikeRadius: 20,
    boltStartRadius: 20,
    color: [1, 1, 1, 1],
    fadeColor: [0.1, 0.1, 1, 1],
    useFog: true,
    strikesPerMinute: 12,
    strikeTextures: ["lightning"],
    thunderSounds: [],
    ...overrides,
  };
}
function storm(lightning = config()): LightningEntity {
  return {
    id: "storm",
    className: "Lightning",
    renderType: "Lightning",
    lightning,
  };
}
function event(overrides: Partial<LightningStrike> = {}): LightningStrike {
  return {
    id: 1,
    time: 1,
    stormId: "storm",
    start: [0.5, 0.5],
    config: config(),
    ...overrides,
  };
}
function stream(events: LightningStrike[] = []) {
  test.world.dataSource = "demo";
  const source = {
    worldGeneration: 0,
    playbackRevision: 0,
    lightningHistory: { events, generation: 0 },
  };
  test.playback.recording = { streamingPlayback: source };
  return source;
}
const cleanups: (() => void)[] = [];
function harness(entity = storm()) {
  const scene = new Scene(),
    scheduler = new FrameScheduler();
  const camera = new PerspectiveCamera();
  const views = new Map<string, { root: Group }>();
  const engine = {
    scheduler,
    invalidate: vi.fn(),
    entities: { get: (id: string) => views.get(id) },
    cameras: { perspective: camera },
    withHost(start: (host: EngineHost) => () => void) {
      return start({ scene } as EngineHost);
    },
  } as unknown as GameEngine;
  const effects = new LightningEffects(engine);
  Object.assign(engine, { lightningEffects: effects });
  const uninstall = effects.install();
  const view = createLightningView(entity, engine);
  cleanups.push(() => {
    view.dispose();
    uninstall();
  });
  return {
    effects,
    view,
    views,
    engine,
    camera,
    uninstall,
    frame(time: number, delta = 0.1) {
      streamClock.time = time;
      vi.setSystemTime(time * 1000);
      scheduler.run(FramePriority.PostCamera, {
        delta,
        elapsed: time,
        frame: 1,
        camera,
        scene,
        renderer: {} as import("three").WebGLRenderer,
      });
    },
    meshes: () =>
      effects.group.children.filter((child) => child instanceof Mesh) as Mesh[],
  };
}
function positions(mesh: Mesh): number[] {
  return Array.from(mesh.geometry.getAttribute("position").array);
}
function sound(filename: string): WeatherSound {
  return {
    filename,
    is3D: true,
    isLooping: false,
    refDist: 20,
    maxDist: 5000,
    volume: 1,
  };
}
function finishAudio() {
  for (const callback of test.audioCallbacks.splice(0))
    callback({} as AudioBuffer);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  test.runtime = { state: { startTime: 0, datablocks: new Map() } };
  test.playback = { status: "playing", recording: null, seekNonce: 0, rate: 1 };
  test.world = {
    dataSource: "map",
    missionName: "storm",
    missionEntities: new Map(),
    streamEntities: new Map(),
  };
  test.settings = { audioEnabled: false, fogEnabled: true };
  test.commandMap = test.worldPaused = false;
  test.soundGeneration = 0;
  test.audio = [];
  test.audioCallbacks = [];
  test.bounds.clear();
  test.exposed.clear();
  test.worldHit = test.waterHit = null;
  test.terrain = undefined;
  test.frozenCenter = undefined;
  streamClock.time = 0;
  streamClock.matchEndedAtSec = null;
});
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.useRealTimers();
});

describe("lightning view/source ownership", () => {
  it("uses only server strike events in demo and live mode", () => {
    const source = stream(),
      world = harness();
    world.frame(0);
    world.frame(100, 100);
    expect(world.meshes()).toHaveLength(0);
    test.world.dataSource = "live";
    world.frame(101);
    expect(world.meshes()).toHaveLength(0);
    source.lightningHistory.events.push(event({ time: 101 }));
    world.frame(101.1);
    expect(world.meshes()).toHaveLength(1);
    world.frame(101.2);
    expect(world.meshes()).toHaveLength(1);
  });

  it("freezes pause, rebuilds a stable seek pose, and disposes expired ribbons", () => {
    stream([event()]);
    test.playback.status = "paused";
    const world = harness();
    world.frame(1.36);
    const before = positions(world.meshes()[0]);
    expect(before.length).toBeGreaterThan(0);
    world.frame(1.36);
    expect(positions(world.meshes()[0])).toEqual(before);
    const geometry = world.meshes()[0].geometry;
    const dispose = vi.spyOn(geometry, "dispose");
    test.playback.status = "seeking";
    test.playback.seekNonce++;
    world.frame(1.36);
    expect(dispose).toHaveBeenCalledOnce();
    expect(world.meshes()).toHaveLength(0);
    test.playback.status = "paused";
    world.frame(1.36);
    expect(positions(world.meshes()[0])).toEqual(before);
    test.playback.status = "playing";
    world.frame(2.61);
    expect(world.meshes()).toHaveLength(0);
  });

  it("keeps thunder after the bolt expires, then plays it at horizontal distance/330", () => {
    const source = stream();
    test.settings.audioEnabled = true;
    const lightning = config({
      strikeSound: sound("impact"),
      thunderSounds: [sound("thunder")],
    });
    const world = harness(storm(lightning));
    world.frame(0);
    source.lightningHistory.events.push(
      event({
        targetPosition: [990, 0, 0],
        config: lightning,
      }),
    );
    world.frame(1);
    finishAudio();
    expect(test.audio).toHaveLength(1);
    expect(test.audio[0].position.toArray()).toEqual([0, 0, 990]);
    expect(test.audio[0].play).toHaveBeenCalledOnce();
    world.frame(2.61);
    expect(world.meshes()).toHaveLength(0);
    test.playback.status = "paused";
    world.frame(4);
    expect(test.audioCallbacks).toHaveLength(0);
    test.playback.status = "playing";
    world.frame(4);
    finishAudio();
    expect(test.audio).toHaveLength(2);
    expect(test.audio[1].position.toArray()).toEqual([0, 0, 0]);
    world.frame(4.1);
    finishAudio();
    expect(test.audio).toHaveLength(2);
  });

  it.each(["demo", "live"])(
    "plays fresh %s thunder whose delay elapsed before the first rendered frame",
    (dataSource) => {
      const source = stream();
      test.world.dataSource = dataSource;
      test.settings.audioEnabled = true;
      const lightning = config({ thunderSounds: [sound("thunder")] });
      const world = harness(storm(lightning));
      world.frame(0.99);
      source.lightningHistory.events.push(
        event({ config: lightning, targetPosition: [12, 0, 0] }),
      );
      world.frame(1.05, 0.06);
      finishAudio();
      expect(test.audio).toHaveLength(1);
      expect(test.audio[0].play).toHaveBeenCalledOnce();

      world.frame(1.1, 0.05);
      finishAudio();
      expect(test.audio).toHaveLength(1);
    },
  );

  it.each(["seek", "generation", "stopAll", "dispose", "pause"])(
    "rejects an async sound after %s before another rendered frame",
    (change) => {
      const source = stream();
      test.settings.audioEnabled = true;
      const world = harness();
      world.frame(0);
      source.lightningHistory.events.push(
        event({ config: config({ strikeSound: sound("impact") }) }),
      );
      world.frame(1);
      expect(test.audioCallbacks).toHaveLength(1);
      if (change === "seek") test.playback.seekNonce++;
      if (change === "generation") source.worldGeneration++;
      if (change === "stopAll") test.soundGeneration++;
      if (change === "dispose") world.view.dispose();
      if (change === "pause") test.playback.status = "paused";
      finishAudio();
      expect(test.audio).toHaveLength(0);
    },
  );

  it("honors a non-positional impact profile without distance culling", () => {
    const source = stream();
    test.settings.audioEnabled = true;
    const world = harness();
    world.frame(0);
    source.lightningHistory.events.push(
      event({
        targetPosition: [10000, 0, 0],
        config: config({
          strikeSound: { ...sound("impact2d"), is3D: false, maxDist: 1 },
        }),
      }),
    );
    world.frame(1);
    finishAudio();
    expect(test.audio).toHaveLength(1);
    expect(test.audio[0].play).toHaveBeenCalledOnce();
  });

  it("does not replay impact or already-due thunder when opening a paused seek", () => {
    const lightning = config({
      strikeSound: sound("impact"),
      thunderSounds: [sound("thunder")],
    });
    stream([event({ config: lightning, targetPosition: [12, 0, 0] })]);
    test.playback.status = "paused";
    test.settings.audioEnabled = true;
    const world = harness(storm(lightning));
    world.frame(1.05);
    test.playback.status = "playing";
    world.frame(1.1);
    finishAudio();
    expect(test.audio).toHaveLength(0);
  });

  it("uses observer world position for thunder and hides ribbons in command circuit", () => {
    const source = stream();
    test.settings.audioEnabled = true;
    const lightning = config({ thunderSounds: [sound("thunder")] });
    const world = harness(storm(lightning)),
      parent = new Group();
    parent.position.z = 990;
    parent.add(world.camera);
    world.frame(0);
    source.lightningHistory.events.push(event({ config: lightning }));
    world.frame(1.36);
    test.commandMap = true;
    world.frame(2);
    expect(world.effects.group.visible).toBe(false);
    expect(test.audioCallbacks).toHaveLength(0);
    world.frame(4);
    finishAudio();
    expect(test.audio).toHaveLength(1);
    test.commandMap = false;
    world.frame(4.1);
    expect(world.effects.group.visible).toBe(true);
  });

  it("runs explore cadence and consumes each explicit script request once", () => {
    const entity = storm(config({ strikesPerMinute: 187.5 }));
    const world = harness(entity);
    world.frame(0, 0);
    world.frame(0.32, 0.32);
    expect(world.meshes()).toHaveLength(0);
    world.frame(0.352, 0.032);
    expect(world.meshes()).toHaveLength(1);
    world.view.update!({
      ...entity,
      lightningRequests: [
        { sequence: 1, time: 0.353 },
        { sequence: 2, time: 0.353 },
      ],
    });
    world.frame(0.36, 0.008);
    expect(world.meshes()).toHaveLength(3);
    world.frame(0.37, 0.01);
    expect(world.meshes()).toHaveLength(3);
  });

  it("reads current storm colours and fog while preserving a bolt's captured geometry", () => {
    stream([event()]);
    test.playback.status = "paused";
    const entity = storm(),
      world = harness(entity);
    world.frame(1.2);
    const mesh = world.meshes()[0],
      before = positions(mesh);
    expect(before.length).toBeGreaterThan(0);
    const lightning = config({
      color: [0.2, 0.3, 0.4, 0.5],
      fadeColor: [0.6, 0.7, 0.8, 0.9],
      strikeWidth: 999,
      useFog: false,
    });
    world.view.update!({ ...entity, lightning });
    world.frame(1.2);
    expect(positions(mesh)).toEqual(before);
    expect(
      Array.from(mesh.geometry.getAttribute("boltColor").array).slice(0, 4),
    ).toEqual(Array.from(new Float32Array(lightning.color)));
    expect(
      (mesh.material as import("three").ShaderMaterial).uniforms.useFog.value,
    ).toBe(false);
    // Every bolt has passed its delay+fade threshold by age 0.6s.
    test.playback.status = "playing";
    for (const time of [1.25, 1.3, 1.4, 1.5, 1.6]) world.frame(time);
    expect(
      Array.from(mesh.geometry.getAttribute("boltColor").array).slice(0, 3),
    ).toEqual(Array.from(new Float32Array(lightning.fadeColor.slice(0, 3))));
  });
});

describe("native lightning endpoints and ribbons", () => {
  it("keeps the event's captured target pose when a seek has moved the current entity", () => {
    const world = harness(),
      root = new Group();
    root.position.set(1000, 2000, 3000);
    world.views.set("target", { root });
    test.world.streamEntities.set("target", {
      renderType: "Shape",
      shapeName: "generator",
    });
    const strike = event({
      targetId: "target",
      targetTransform: { shapeName: "generator", position: [10, 20, 30] },
    });
    expect(lightningImpact(strike, world.engine)).toEqual([10, 20, 30]);
    test.frozenCenter = [11, 22, 33];
    expect(lightningImpact(strike, world.engine)).toEqual([11, 22, 33]);
    expect(
      lightningImpact({ ...strike, targetPosition: [5, 6, 7] }, world.engine),
    ).toEqual([5, 6, 7]);
  });

  it("chooses the nearest static/water hit and falls back to terrain height", () => {
    const world = harness();
    test.worldHit = { t: 0.6, point: [0, 0, 120] };
    test.waterHit = { t: 0.4, point: [0, 0, 180] };
    expect(lightningImpact(event(), world.engine)).toEqual([0, 0, 180]);
    test.worldHit.t = 0.2;
    expect(lightningImpact(event(), world.engine)).toEqual([0, 0, 120]);
    test.worldHit = test.waterHit = null;
    test.terrain = 45;
    expect(lightningImpact(event(), world.engine)).toEqual([0, 0, 45]);
  });

  it("selects the highest exposed damageable target in the square radius and honors native probability", () => {
    const world = harness();
    test.bounds.set("generator", { min: [-1, -1, -1], max: [1, 1, 1] });
    test.runtime.state.datablocks.set("GeneratorData", {
      _isDatablock: true,
      dynamictype: TYPE_MASKS.GeneratorObjectType,
    });
    for (const [id, height] of [
      ["low", 20],
      ["high", 30],
      ["covered", 40],
    ] as const) {
      const entity: ShapeEntity = {
        id,
        className: "StaticShape",
        renderType: "Shape",
        shapeName: "generator",
        dataBlock: "GeneratorData",
      };
      test.world.missionEntities.set(id, entity);
      const root = new Group();
      root.position.y = height;
      world.views.set(id, { root });
    }
    test.exposed.add("low");
    test.exposed.add("high");
    expect(
      exploreLightningTarget(
        config({ chanceToHitTarget: 0.4 }),
        [0.5, 0.5],
        () => 0.4,
        world.engine,
      ),
    ).toEqual({ targetId: "high", targetPosition: [0, 0, 30] });
    expect(
      exploreLightningTarget(
        config({ chanceToHitTarget: 0.4 }),
        [0.5, 0.5],
        () => 0.401,
        world.engine,
      ),
    ).toEqual({});
    expect(
      exploreLightningTarget(config(), [0, 0], () => 0, world.engine),
    ).toEqual({});
  });

  it("builds camera-facing native strips and releases replaced GPU buffer layouts", () => {
    const geometry = new BufferGeometry();
    const line = {
      points: [
        [0, 0, 0],
        [0, 0, 10],
      ] as [number, number, number][],
      u: [0, 1],
      width: 2,
      color: [1, 0.5, 0.25, 0.7] as [number, number, number, number],
    };
    writeWeatherLightningGeometry(geometry, [line], [10, 0, 0]);
    expect(Array.from(geometry.getAttribute("position").array)).toEqual([
      -1, 0, 0, 1, 0, 0, -1, 10, 0, 1, 10, 0,
    ]);
    expect(Array.from(geometry.getAttribute("uv").array)).toEqual([
      0, 1, 0, 0, 1, 1, 1, 0,
    ]);
    expect(Array.from(geometry.getIndex()!.array)).toEqual([0, 1, 2, 2, 1, 3]);
    const dispose = vi.spyOn(geometry, "dispose");
    writeWeatherLightningGeometry(geometry, [line, line], [10, 0, 0]);
    expect(dispose).toHaveBeenCalledOnce();
    geometry.dispose();
  });
});
