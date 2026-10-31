import type { Camera, Scene, WebGLRenderer } from "three";
import { FramePriority } from "./framePriority";
import { FrameScheduler, type FrameContext } from "./frameScheduler";
import { TickClock } from "./tickClock";
import { InputQueue } from "./inputQueue";
import { CameraRig } from "./cameraRig";
import { EntityViewRegistry } from "./entityViews";
import { createCameraView, createWayPointView } from "./markerViews";
import { createForceFieldView } from "./forceFieldView";
import { createAudioEmitterView } from "./audioEmitterView";
import { createInteriorView } from "./interiorView";
import { createTerrainView } from "./terrainView";
import { createWaterView } from "./waterView";
import { createSkyView } from "./skyView";
import { createPlayerView, createShapeView } from "./shapeViews";
import type { Cleanup } from "./storeReaction";
import type { StreamSnapshot } from "../stream/types";

/** What renders the engine's scene (see mountEngineCanvas). */
export interface EngineHost {
  renderer: WebGLRenderer;
  scene: Scene;
  /** Render another frame even when the loop only renders on demand. */
  invalidate(): void;
  /** Whether three's loaders are busy (asset downloads in flight). */
  assetsLoading(): boolean;
}

/** Runs inside the scene's render, after its matrices are updated. */
export type RenderHook = (
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
) => void;

/** A system started with withHost, and its cleanup for the current host. */
interface HostUser {
  start: (host: EngineHost) => Cleanup;
  cleanup: Cleanup;
}

/** Opt-in features, read once from the page URL. */
export interface EngineFeatures {
  /** Player chest physics. */
  jiggle: boolean;
}

/**
 * The game canvas's runtime, independent of React: the frame scheduler
 * its systems run on, the tick clock, and the hooks around each render
 * of the scene. One per canvas; mountEngineCanvas runs its frames.
 */
export class GameEngine {
  readonly scheduler = new FrameScheduler();
  readonly ticks = new TickClock();
  /** Camera input reported this frame, for the input consumer. */
  readonly input = new InputQueue();
  readonly cameras = new CameraRig();
  /** The game's entities, as engine-drawn views. */
  readonly entities = new EntityViewRegistry({
    Camera: createCameraView,
    WayPoint: createWayPointView,
    ForceFieldBare: createForceFieldView,
    AudioEmitter: createAudioEmitterView,
    InteriorInstance: createInteriorView,
    TerrainBlock: createTerrainView,
    WaterBlock: createWaterView,
    Sky: createSkyView,
    Shape: createShapeView,
    Player: createPlayerView,
  });
  /** The frame in progress (or the last one, between frames). */
  frame: FrameContext | null = null;
  /** The playing stream's latest snapshot, every tick (the store's
   *  published snapshot can lag it while assets load). */
  readonly streamSnapshot: { current: StreamSnapshot | null } = {
    current: null,
  };
  private frameCount = 0;
  private host: EngineHost | null = null;
  private readonly hostUsers = new Set<HostUser>();
  private frameStartHooks: readonly (() => void)[] = [];
  private frameEndHooks: readonly (() => void)[] = [];
  private beforeRenderHooks: readonly RenderHook[] = [];
  private afterRenderHooks: readonly RenderHook[] = [];

  readonly features: EngineFeatures;

  constructor(features: EngineFeatures = { jiggle: false }) {
    this.features = features;
    this.scheduler.add(FramePriority.Tick, (frame) =>
      this.ticks.advance(frame.delta),
    );
  }

  invalidate(): void {
    this.host?.invalidate();
  }

  assetsLoading(): boolean {
    return this.host?.assetsLoading() ?? false;
  }

  /**
   * Attach the engine to what renders it, routing the scene's render
   * callbacks through the engine's render hooks. Systems started with
   * withHost run for each host while it's connected; the returned
   * function disconnects it, cleaning them up.
   */
  connect(host: EngineHost): () => void {
    this.host = host;
    const { scene } = host;
    const before = scene.onBeforeRender;
    const after = scene.onAfterRender;
    scene.onBeforeRender = (...args: Parameters<Scene["onBeforeRender"]>) => {
      before.apply(scene, args);
      const [renderer, , camera] = args;
      for (const hook of this.beforeRenderHooks) hook(renderer, scene, camera);
    };
    scene.onAfterRender = (...args: Parameters<Scene["onAfterRender"]>) => {
      const [renderer, , camera] = args;
      for (const hook of this.afterRenderHooks) hook(renderer, scene, camera);
      after.apply(scene, args);
    };
    for (const user of [...this.hostUsers])
      user.cleanup = user.start(host) || undefined;
    return () => {
      if (this.host !== host) return;
      for (const user of [...this.hostUsers]) {
        user.cleanup?.();
        user.cleanup = undefined;
      }
      this.host = null;
      scene.onBeforeRender = before;
      scene.onAfterRender = after;
    };
  }

  /**
   * Run `start` whenever the engine has a renderer and scene (now, if it
   * already does), cleaning up when that host disconnects. The returned
   * function stops it, running its cleanup.
   */
  withHost(start: (host: EngineHost) => Cleanup): () => void {
    const user: HostUser = { start, cleanup: undefined };
    this.hostUsers.add(user);
    if (this.host) user.cleanup = start(this.host) || undefined;
    return () => {
      this.hostUsers.delete(user);
      user.cleanup?.();
      user.cleanup = undefined;
    };
  }

  /** The connected host, if any. */
  get currentHost(): EngineHost | null {
    return this.host;
  }

  /** The host, once the engine has one. */
  whenHost(): Promise<EngineHost> {
    if (this.host) return Promise.resolve(this.host);
    return new Promise((resolve) => {
      const stop = this.withHost((host) => {
        queueMicrotask(stop);
        resolve(host);
      });
    });
  }

  /** Run `hook` at the start of every frame, before its stages. */
  onFrameStart(hook: () => void): () => void {
    this.frameStartHooks = [...this.frameStartHooks, hook];
    return () => {
      this.frameStartHooks = this.frameStartHooks.filter((h) => h !== hook);
    };
  }

  /** Run `hook` at the end of every frame, once it has rendered. */
  onFrameEnd(hook: () => void): () => void {
    this.frameEndHooks = [...this.frameEndHooks, hook];
    return () => {
      this.frameEndHooks = this.frameEndHooks.filter((h) => h !== hook);
    };
  }

  /** Run `hook` before each render of the scene, after those added
   *  earlier. */
  onBeforeRender(hook: RenderHook): () => void {
    this.beforeRenderHooks = [...this.beforeRenderHooks, hook];
    return () => {
      this.beforeRenderHooks = this.beforeRenderHooks.filter((h) => h !== hook);
    };
  }

  /** Run `hook` after each render of the scene, after those added
   *  earlier. */
  onAfterRender(hook: RenderHook): () => void {
    this.afterRenderHooks = [...this.afterRenderHooks, hook];
    return () => {
      this.afterRenderHooks = this.afterRenderHooks.filter((h) => h !== hook);
    };
  }

  /** Start a frame: the context every stage of it shares. */
  beginFrame(frame: Omit<FrameContext, "frame">): FrameContext {
    for (const hook of this.frameStartHooks) hook();
    this.frame = { ...frame, frame: ++this.frameCount };
    return this.frame;
  }

  /** Run every stage of the frame. */
  runFrame(frame: FrameContext): void {
    this.scheduler.runAll(frame);
  }

  /** Finish the frame once it has rendered. */
  endFrame(): void {
    for (const hook of this.frameEndHooks) hook();
  }
}
