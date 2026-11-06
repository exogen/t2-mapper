import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  Box3,
  Group,
  Mesh,
  PerspectiveCamera,
  Points,
  Scene,
  Vector3,
  Vector4,
  type BufferGeometry,
  type ShaderMaterial,
} from "three";
import type { PrecipitationConfig } from "../weather/types";
import type { PrecipitationEntity } from "../state/gameEntityTypes";
import type { StreamSnapshot } from "../stream/types";
import { clearShapeBounds, registerShapeBounds } from "../stream/shapeBounds";
import { createPrecipitationView } from "./precipitationView";
import type { GameEngine } from "./gameEngine";
import { FrameScheduler } from "./frameScheduler";
import type { EntityView } from "./entityViews";
import type { DIFVisibilityRect } from "../dif/difVisibility";

const state = vi.hoisted(() => ({
  playback: {
    recording: null as {
      streamingPlayback: {
        worldGeneration: number;
        playbackRevision?: number;
        getDataBlockData?: (id: number) => unknown;
      };
    } | null,
    status: "stopped",
    rate: 1,
    seekNonce: 0,
  },
  material: vi.fn(async () => ["precipitation/atlas"]),
  textureLoads: vi.fn(),
  audio: vi.fn(),
  audioEnabled: false,
  audioCallbacks: [] as ((buffer: AudioBuffer) => void)[],
  soundGeneration: 0,
  soundPlays: vi.fn(),
  soundBuffers: vi.fn(),
  soundStops: vi.fn(),
  soundTracking: vi.fn(),
  commandCircuit: false,
  exterior: [-1, -1, 1, 1] as DIFVisibilityRect | null,
  cameraMode: "freeFly",
  worldTime: 10,
  water: vi.fn((_box: Box3): number | undefined => undefined),
  sky: null as {
    windVelocity: { x: number; y: number; z: number };
    windEffectPrecipitation: boolean;
  } | null,
}));
vi.mock("../loaders", () => ({
  loadDetailMapList: state.material,
  textureToUrl: (name: string) => name,
  audioToUrl: (name: string) => name,
}));
vi.mock("../textureUtils", async () => {
  const { Texture } = await import("three");
  return {
    loadTexture: (
      url: string,
      onLoad: (texture: import("three").Texture) => void,
    ) => {
      state.textureLoads(url);
      const texture = new Texture({
        width: 256,
        height: 256,
      } as TexImageSource);
      onLoad(texture);
      return texture;
    },
  };
});
vi.mock("../state/engineStore", () => ({
  engineStore: {
    getState: () => ({ playback: state.playback, runtime: { runtime: null } }),
  },
  worldDeltaSec: (delta: number) =>
    !state.playback.recording
      ? delta
      : state.playback.status === "playing"
        ? delta * state.playback.rate
        : 0,
}));
vi.mock("../state/streamPlaybackStore", () => ({
  streamClock: {
    get worldTime() {
      return state.worldTime;
    },
  },
  streamPlaybackStore: { getState: () => ({ cameraMode: state.cameraMode }) },
}));
vi.mock("../state/gameEntityStore", () => ({
  gameEntityStore: { getState: () => ({ streamEntities: new Map() }) },
  selectSkyData: () => state.sky,
}));
vi.mock("../state/settingsStore", () => ({
  settingsStore: { getState: () => ({ audioEnabled: state.audioEnabled }) },
}));
vi.mock("../state/commandCircuitStore", () => ({
  commandCircuitStore: { getState: () => ({ active: state.commandCircuit }) },
}));
vi.mock("../collision/waterLevel", () => ({
  waterSurfaceForBounds: (box: Box3) => state.water(box.clone()),
}));
vi.mock("./exteriorVisibility", () => ({
  exteriorViewRect: () => state.exterior,
}));
vi.mock("./audioGraph", () => ({ getAudioGraph: state.audio }));
vi.mock("./soundEffects", async () => {
  const { Group } = await import("three");
  return {
    createPositionalAudio: () =>
      Object.assign(new Group(), {
        setVolume: vi.fn(),
        setLoop: vi.fn(),
        setBuffer: state.soundBuffers,
        setPlaybackRate: vi.fn(),
        play: state.soundPlays,
      }),
    getCachedAudioBuffer: (
      _url: string,
      _loader: unknown,
      callback: (buffer: AudioBuffer) => void,
    ) => {
      state.audioCallbacks.push(callback);
    },
    getEffectiveSoundRate: () => 1,
    getSoundGeneration: () => state.soundGeneration,
    stopAndDetachSound: state.soundStops,
    trackSound: state.soundTracking,
  };
});

function config(
  overrides: Partial<PrecipitationConfig> = {},
): PrecipitationConfig {
  return {
    type: 0,
    materialList: "view-test-rain.dml",
    maxSize: 1,
    sizeX: 0.2,
    sizeY: 0.45,
    movingBoxPer: 0.35,
    divHeightVal: 1.5,
    sizeBigBox: 1,
    topBoxSpeed: 20,
    frontBoxSpeed: 30,
    topBoxDrawPer: 0.5,
    bottomDrawHeight: 40,
    skipIfPer: -0.3,
    bottomSpeedPer: 1,
    frontSpeedPer: 1.5,
    frontRadiusPer: 0.5,
    percentage: 1,
    enabled: true,
    colors: [[0.6, 0.6, 0.6, 1]],
    offsetSpeed: 0.25,
    minVelocity: 1.25,
    maxVelocity: 4,
    maxDrops: 2,
    maxRadius: 80,
    ...overrides,
  };
}

const views: EntityView[] = [];
function world(precipitation = config()) {
  const scheduler = new FrameScheduler();
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  const engine = {
    scheduler,
    invalidate: vi.fn(),
    streamSnapshot: { current: null },
  } as unknown as GameEngine;
  const entity: PrecipitationEntity = {
    id: "rain",
    className: "Precipitation",
    renderType: "Precipitation",
    precipitation,
  };
  const view = createPrecipitationView(entity, engine);
  views.push(view);
  scene.add(view.root);
  let elapsed = 0;
  return {
    entity,
    engine,
    view,
    camera,
    mesh: view.root.children.find((child) => child instanceof Mesh) as Mesh<
      BufferGeometry,
      ShaderMaterial
    >,
    points: view.root.children.find(
      (child) => child instanceof Points,
    ) as Points<BufferGeometry, ShaderMaterial>,
    frame(delta = 1 / 60) {
      elapsed += delta;
      scheduler.runAll({
        delta,
        elapsed,
        frame: 1,
        camera,
        scene,
        renderer: {} as import("three").WebGLRenderer,
      });
    },
  };
}

beforeEach(() => {
  state.playback = {
    recording: null,
    status: "stopped",
    rate: 1,
    seekNonce: 0,
  };
  state.sky = null;
  state.audio.mockClear();
  state.audio.mockReturnValue({ audioLoader: {}, audioListener: {} });
  state.audioEnabled = false;
  state.audioCallbacks.length = 0;
  state.soundGeneration = 0;
  state.soundPlays.mockClear();
  state.soundBuffers.mockClear();
  state.soundStops.mockClear();
  state.soundTracking.mockClear();
  state.commandCircuit = false;
  state.exterior = [-1, -1, 1, 1];
  state.cameraMode = "freeFly";
  state.worldTime = 10;
  state.water.mockReset();
  state.textureLoads.mockClear();
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => {
  for (const view of views.splice(0)) view.dispose();
  clearShapeBounds();
  vi.restoreAllMocks();
});

it("loads the authored material atlas and renders a camera-following field without audio initialization", async () => {
  const w = world();
  w.camera.position.set(1000, 200, -500);
  w.frame();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  w.frame();
  expect(w.mesh.visible).toBe(true);
  expect(w.points.visible).toBe(false);
  expect(w.mesh.geometry.drawRange.count).toBe(12);
  expect(w.mesh.material.depthWrite).toBe(true);
  expect(w.points.material.depthWrite).toBe(true);
  expect(w.mesh.renderOrder).toBe(51);
  expect(w.points.renderOrder).toBe(w.mesh.renderOrder);
  expect(w.mesh.material.fog).toBe(false);
  expect(w.mesh.material.uniforms.weatherTexture.value.image.width).toBe(256);
  expect(state.audio).not.toHaveBeenCalled();
  // The field follows this camera, despite no mission-object transform.
  const position = w.mesh.geometry.getAttribute("position");
  expect(position.getX(0)).toBeGreaterThan(900);
  expect(position.getZ(0)).toBeLessThan(-400);
});

it("uses vertical fall ribbons for rain and camera-facing quads for snow", () => {
  const w = world();
  w.camera.rotation.x = 0.5;
  w.frame();
  let positions = w.mesh.geometry.getAttribute("position");
  expect(positions.getY(0) - positions.getY(1)).toBeCloseTo(0.9);
  expect(positions.getZ(0) - positions.getZ(1)).toBeCloseTo(0);
  expect(
    w.view.update!({
      ...w.entity,
      precipitation: config({ type: 1, sizeY: 0.2 }),
    }),
  ).toBe(true);
  w.frame();
  positions = w.mesh.geometry.getAttribute("position");
  expect(positions.getY(0) - positions.getY(1)).toBeCloseTo(
    Math.cos(0.5) * 0.4,
  );
  expect(positions.getZ(0) - positions.getZ(1)).toBeCloseTo(
    Math.sin(0.5) * 0.4,
  );
});

it.each([0, 1, 2] as const)(
  "suppresses type %i in enclosed views and restores weather through exterior portals while paused",
  async (type) => {
    const w = world(config({ type }));
    state.playback.recording = { streamingPlayback: { worldGeneration: 0 } };
    state.playback.status = "paused";
    w.frame();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    w.frame();
    const target = type === 2 ? w.points : w.mesh;
    expect(target.visible).toBe(true);
    const original = Array.from(target.geometry.getAttribute("position").array);
    state.exterior = null;
    w.frame();
    expect(w.mesh.visible).toBe(false);
    expect(w.points.visible).toBe(false);
    expect(Array.from(target.geometry.getAttribute("position").array)).toEqual(
      original,
    );
    state.exterior = [-0.5, -0.25, 0.5, 0.75];
    w.frame();
    expect(target.visible).toBe(true);
    const renderer = {
      getCurrentViewport: (out: Vector4) => out.set(20, 30, 800, 600),
    } as import("three").WebGLRenderer;
    target.onBeforeRender(
      renderer,
      new Scene(),
      w.camera,
      target.geometry,
      target.material,
      new Group(),
    );
    const clip = target.material.uniforms.weatherClipRect.value as Vector4;
    // Actual physical viewport coordinates, including its nonzero origin.
    expect(clip.x).toBeLessThanOrEqual(220);
    expect(clip.y).toBeLessThanOrEqual(255);
    expect(clip.z).toBeGreaterThanOrEqual(620);
    expect(clip.w).toBeGreaterThanOrEqual(555);
    expect(clip.x).toBeGreaterThan(200);
    expect(clip.z).toBeLessThan(640);
    expect(target.material.fragmentShader).toContain("gl_FragCoord");
    state.exterior = [-1, -1, 1, 1];
    w.frame();
    target.onBeforeRender(
      renderer,
      new Scene(),
      w.camera,
      target.geometry,
      target.material,
      new Group(),
    );
    expect(clip.toArray()).toEqual([20, 30, 820, 630]);
  },
);

it("freezes simulation while paused and respects rate, enable changes and seeks", () => {
  const w = world();
  state.playback.recording = { streamingPlayback: { worldGeneration: 0 } };
  state.playback.status = "paused";
  w.frame();
  const first = w.mesh.geometry.getAttribute("position").getY(1);
  w.frame();
  expect(w.mesh.geometry.getAttribute("position").getY(1)).toBe(first);
  state.playback.status = "playing";
  state.playback.rate = 2;
  w.frame();
  expect(w.mesh.geometry.getAttribute("position").getY(1)).toBeCloseTo(
    first - 5.25,
  );
  state.playback.status = "seeking";
  state.playback.seekNonce++;
  w.frame();
  expect(w.mesh.visible).toBe(false);
  state.playback.status = "paused";
  w.frame();
  expect(w.mesh.geometry.getAttribute("position").getY(1)).toBeCloseTo(first);
  w.view.update!({ ...w.entity, precipitation: config({ enabled: false }) });
  w.frame();
  expect(w.mesh.geometry.drawRange.count).toBe(0);
  expect(w.points.visible).toBe(false);
});

it("applies sky wind only when requested and hides the field in the command circuit", () => {
  state.sky = {
    windVelocity: { x: 10, y: 0, z: 100 },
    windEffectPrecipitation: false,
  };
  const noWind = world();
  noWind.frame();
  const before = noWind.mesh.geometry.getAttribute("position").getZ(1);
  noWind.frame();
  expect(noWind.mesh.geometry.getAttribute("position").getZ(1)).toBe(before);
  state.sky.windEffectPrecipitation = true;
  const windy = world();
  windy.frame();
  expect(windy.mesh.geometry.getAttribute("position").getZ(1)).toBeCloseTo(
    before + 20,
  );
  windy.frame();
  expect(windy.mesh.geometry.getAttribute("position").getZ(1)).toBeCloseTo(
    before + 20 - 2.625 * 0.25,
  );
  state.commandCircuit = true;
  windy.frame();
  expect(windy.mesh.visible).toBe(false);
  expect(windy.points.visible).toBe(false);
});

it("uses current control poses, PlayerData box size and vehicle bounds for precipitation", () => {
  const w = world();
  const getDataBlockData = vi.fn(() => ({ boxSize: { x: 4, y: 2, z: 3 } }));
  state.playback.recording = {
    streamingPlayback: { worldGeneration: 0, getDataBlockData },
  };
  state.playback.status = "playing";
  state.cameraMode = "original";
  const player = {
    id: "player",
    type: "Player",
    dataBlockId: 4,
    position: [1, 2, 3],
    velocity: [0, 0, 0],
  };
  w.engine.streamSnapshot.current = {
    camera: { controlEntityId: "player" },
    entities: [player],
  } as unknown as StreamSnapshot;
  w.frame();
  const before = w.mesh.geometry.getAttribute("position").getY(1);
  // gameEntityStore intentionally has no Player: structural store fields
  // lag the moving stream snapshot and cannot supply this context.
  w.engine.streamSnapshot.current = {
    camera: { controlEntityId: "player" },
    entities: [{ ...player, position: [4, 5, 6], velocity: [0, 0, -50] }],
  } as unknown as StreamSnapshot;
  state.worldTime += 0.1;
  w.frame();
  expect(w.mesh.geometry.getAttribute("position").getY(1)).toBeCloseTo(
    before - 6.25,
  );
  expect(getDataBlockData).toHaveBeenLastCalledWith(4);
  expect(state.water).toHaveBeenLastCalledWith(
    new Box3(new Vector3(4, 6, 2), new Vector3(6, 9, 6)),
  );
  state.water.mockReturnValue(10);
  w.frame();
  expect(w.mesh.geometry.getAttribute("position").getY(1)).toBeGreaterThan(10);
  registerShapeBounds("vehicle.dts", { min: [0, -1, -2], max: [4, 1, 1] });
  w.engine.streamSnapshot.current = {
    camera: { controlEntityId: "vehicle" },
    entities: [
      {
        id: "vehicle",
        type: "Vehicle",
        shapeHint: "vehicle.dts",
        position: [7, 8, 9],
        rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
        scale: [2, 3, 1],
        velocity: [0, 0, -100],
      },
    ],
  } as unknown as StreamSnapshot;
  w.frame();
  const [box] = state.water.mock.lastCall!;
  const actual = [...box.min.toArray(), ...box.max.toArray()];
  [8, 3, 5, 12, 12, 9].forEach((value, i) =>
    expect(actual[i]).toBeCloseTo(value),
  );
  const calls = state.water.mock.calls.length;
  state.cameraMode = "orbit";
  w.frame();
  expect(state.water).toHaveBeenCalledTimes(calls);
});

it("cannot revive a disposed, replaced-world or seeking weather sound from an async load", () => {
  state.audioEnabled = true;
  const w = world(
    config({
      sound: {
        filename: "rain.wav",
        is3D: true,
        isLooping: true,
        refDist: 1,
        maxDist: 100,
        volume: 1,
      },
    }),
  );
  w.frame();
  const first = state.audioCallbacks[0];
  state.soundGeneration++;
  first({} as AudioBuffer);
  expect(state.soundPlays).not.toHaveBeenCalled();
  state.playback.status = "seeking";
  state.playback.seekNonce++;
  w.frame();
  expect(state.audioCallbacks).toHaveLength(1);
  expect(state.soundStops).toHaveBeenCalledOnce();
  state.playback.status = "paused";
  w.frame();
  expect(state.audioCallbacks).toHaveLength(2);
  state.audioCallbacks[1]({} as AudioBuffer);
  expect(state.soundPlays).toHaveBeenCalledOnce();
  // Native portal visibility suppresses drawing, independently of its loop.
  state.exterior = null;
  w.frame();
  expect(w.mesh.visible).toBe(false);
  expect(w.points.visible).toBe(false);
  expect(state.soundStops).toHaveBeenCalledOnce();
  state.exterior = [-1, -1, 1, 1];
  // stormShow only hides weather in retail; it keeps the authored loop.
  w.view.update!({
    ...w.entity,
    precipitation: { ...w.entity.precipitation, enabled: false },
  });
  w.frame();
  expect(state.soundStops).toHaveBeenCalledOnce();
  w.view.dispose();
  views.splice(views.indexOf(w.view), 1);
  state.audioCallbacks[1]({} as AudioBuffer);
  expect(state.soundPlays).toHaveBeenCalledOnce();
  expect(state.soundBuffers).toHaveBeenCalledOnce();
});

it("resets particles and restarts the loop when the same stream receives an authoritative revision", () => {
  state.audioEnabled = true;
  const recording = {
    streamingPlayback: { worldGeneration: 0, playbackRevision: 0 },
  };
  state.playback.recording = recording;
  state.playback.status = "playing";
  const w = world(
    config({
      sound: {
        filename: "rain.wav",
        is3D: true,
        isLooping: true,
        refDist: 1,
        maxDist: 100,
        volume: 1,
      },
    }),
  );
  w.frame();
  state.audioCallbacks[0]({} as AudioBuffer);
  const initial = w.mesh.geometry.getAttribute("position").getY(1);
  w.frame();
  expect(w.mesh.geometry.getAttribute("position").getY(1)).toBeCloseTo(
    initial - 2.625,
  );
  // Hydration changes revision without changing recording, world or seek.
  state.soundGeneration++;
  recording.streamingPlayback.playbackRevision++;
  w.frame();
  expect(state.playback.recording).toBe(recording);
  expect(recording.streamingPlayback.worldGeneration).toBe(0);
  expect(state.playback.seekNonce).toBe(0);
  expect(w.mesh.geometry.getAttribute("position").getY(1)).toBeCloseTo(initial);
  expect(state.soundStops).toHaveBeenCalledOnce();
  expect(state.audioCallbacks).toHaveLength(2);
  state.audioCallbacks[1]({} as AudioBuffer);
  expect(state.soundPlays).toHaveBeenCalledTimes(2);
});

it("disposes buffers/materials and ignores a material-list callback after teardown", async () => {
  let finish!: (entries: string[]) => void;
  state.material.mockImplementationOnce(
    () =>
      new Promise<string[]>((resolve) => {
        finish = resolve;
      }),
  );
  const w = world(config({ materialList: "pending-view-test.dml" }));
  w.frame();
  const geometryDisposed = vi.spyOn(w.mesh.geometry, "dispose");
  const materialDisposed = vi.spyOn(w.mesh.material, "dispose");
  w.view.dispose();
  views.splice(views.indexOf(w.view), 1);
  const loads = state.textureLoads.mock.calls.length;
  finish(["after-disposal"]);
  await Promise.resolve();
  await Promise.resolve();
  expect(state.textureLoads).toHaveBeenCalledTimes(loads);
  expect(geometryDisposed).toHaveBeenCalledOnce();
  expect(materialDisposed).toHaveBeenCalledOnce();
});
