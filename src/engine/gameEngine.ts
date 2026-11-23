import type { Camera, Quaternion, Scene, Vector3, WebGLRenderer } from "three";
import { FramePriority } from "./framePriority";
import { FrameScheduler, type FrameContext } from "./frameScheduler";
import { TickClock } from "./tickClock";
import { InputQueue } from "./inputQueue";
import { CameraRig } from "./cameraRig";
import { EntityViewRegistry } from "./entityViews";
import { createCameraView, createWayPointView } from "./markerViews";
import { createForceFieldView } from "./forceFieldView";
import { createAudioEmitterView } from "./audioEmitterView";
import { createParticleEmissionDummyView } from "./particleEmissionDummyView";
import { AmbientParticles } from "./ambientParticles";
import { createPrecipitationView } from "./precipitationView";
import { createLightningView } from "./lightningView";
import { LightningEffects } from "./lightningEffects";
import { createInteriorView } from "./interiorView";
import { createTerrainView } from "./terrainView";
import { createWaterView } from "./waterView";
import { createSkyView } from "./skyView";
import { createPlayerView, createShapeView } from "./shapeViews";
import type { Cleanup } from "./storeReaction";
import type { StreamSnapshot } from "../stream/types";
import type { ClipCameraTransition, ClipSample } from "../../relay/clipTypes";
import { renderShapeRaycast } from "../collision/renderShapeRaycast";
import { createLogger } from "../logger";
import { runOwnedCleanups } from "./runOwnedCleanups";

const log = createLogger("GameEngine");

const weaponPoseBatch = {
  stage: FramePriority.WeaponPose,
  run: (callbacks: () => void) =>
    renderShapeRaycast.withWeaponRetractionBatch(callbacks),
};

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
  binding?: {
    connection: HostConnection;
    active: boolean;
    cleanup: Cleanup;
  };
}

interface HostConnection {
  host: EngineHost;
  disconnect(): void;
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
    ParticleEmissionDummy: createParticleEmissionDummyView,
    Precipitation: createPrecipitationView,
    Lightning: createLightningView,
    InteriorInstance: createInteriorView,
    TerrainBlock: createTerrainView,
    WaterBlock: createWaterView,
    Sky: createSkyView,
    Shape: createShapeView,
    Player: createPlayerView,
  });
  /** The frame in progress (or the last one, between frames). */
  frame: FrameContext | null = null;
  /** The clip view chosen for the current frame, before player animation. */
  clipCameraSample: ClipSample | null = null;
  clipCameraTransition: {
    from: ClipCameraTransition;
    fraction: number;
    aimFraction: number;
    origin?: { position: Vector3; quaternion: Quaternion };
  } | null = null;
  /** The stream's resolved follow pose for that clip frame, if available. */
  clipFollowCamera: {
    position: Vector3;
    quaternion: Quaternion;
    orbitTransition?: boolean;
  } | null = null;
  /** Follow camera data produced by the stream before clip capture. */
  recordingOrbitDistance: number | undefined;
  /** True at the follow eye, false while transitioning to or from it. */
  recordingFollowEye: boolean | undefined;
  /** The playing stream's latest snapshot, every tick (the store's
   *  published snapshot can lag it while assets load). */
  readonly streamSnapshot: { current: StreamSnapshot | null } = {
    current: null,
  };
  private frameCount = 0;
  private host: EngineHost | null = null;
  private connection?: HostConnection;
  private connectionRequest = 0;
  private readonly hostUsers = new Set<HostUser>();
  private frameStartHooks: readonly (() => void)[] = [];
  private frameEndHooks: readonly (() => void)[] = [];
  private beforeRenderHooks: readonly RenderHook[] = [];
  private afterRenderHooks: readonly RenderHook[] = [];

  readonly ambientParticles: AmbientParticles;
  readonly lightningEffects: LightningEffects;

  readonly features: EngineFeatures;

  constructor(features: EngineFeatures = { jiggle: false }) {
    this.features = features;
    this.ambientParticles = new AmbientParticles(this);
    this.lightningEffects = new LightningEffects(this);
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
    const request = ++this.connectionRequest;
    this.connection?.disconnect();
    // A previous owner's cleanup may synchronously connect a newer host.
    if (request !== this.connectionRequest) return () => {};
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
    const connection: HostConnection = { host, disconnect: () => {} };
    connection.disconnect = () => {
      if (this.connection !== connection) return;
      const bindings = [...this.hostUsers].map(
        (user) => [user, user.binding] as const,
      );
      this.connection = undefined;
      this.host = null;
      scene.onBeforeRender = before;
      scene.onAfterRender = after;
      runOwnedCleanups(
        bindings.map(([user, binding]) => () => {
          if (binding?.connection === connection)
            this.stopHostUser(user, binding);
        }),
      );
    };
    this.connection = connection;
    try {
      for (const user of [...this.hostUsers])
        this.startHostUser(user, connection);
    } catch (error) {
      connection.disconnect();
      throw error;
    }
    return connection.disconnect;
  }

  private stopHostUser(user: HostUser, binding = user.binding): void {
    if (!binding?.active) return;
    if (user.binding === binding) user.binding = undefined;
    binding.active = false;
    const cleanup = binding.cleanup;
    binding.cleanup = undefined;
    cleanup?.();
  }

  private startHostUser(user: HostUser, connection: HostConnection): void {
    if (this.connection !== connection || !this.hostUsers.has(user)) return;
    this.stopHostUser(user);
    if (this.connection !== connection || !this.hostUsers.has(user)) return;
    const binding = { connection, active: true, cleanup: undefined as Cleanup };
    user.binding = binding;
    const cleanup = user.start(connection.host) || undefined;
    if (binding.active && this.connection === connection)
      binding.cleanup = cleanup;
    else cleanup?.();
  }

  /**
   * Run `start` whenever the engine has a renderer and scene (now, if it
   * already does), cleaning up when that host disconnects. The returned
   * function stops it, running its cleanup.
   */
  withHost(start: (host: EngineHost) => Cleanup): () => void {
    const user: HostUser = { start };
    this.hostUsers.add(user);
    try {
      if (this.connection) this.startHostUser(user, this.connection);
    } catch (error) {
      this.hostUsers.delete(user);
      this.stopHostUser(user);
      throw error;
    }
    return () => {
      this.hostUsers.delete(user);
      this.stopHostUser(user);
    };
  }

  /** Prepare a view's assets for each connected host. Releasing the view or
   * disconnecting its host prevents further preparation/installation; shared
   * asset requests keep running for other owners. Installed view resources are
   * cleaned up before a replacement host starts its preparation. */
  prepareWithHost<T>(
    load: (host: EngineHost, signal: AbortSignal) => T | PromiseLike<T>,
    install: (value: T, host: EngineHost) => Cleanup,
    onError?: (error: unknown) => void,
  ): () => void {
    return this.withHost((host) => {
      const controller = new AbortController();
      const { signal } = controller;
      let cleanup: Cleanup;
      const failed = (error: unknown) => {
        if (signal.aborted) return;
        try {
          if (onError) onError(error);
          else log.error("Host preparation failed: %o", error);
        } catch (error) {
          log.error("Host preparation observer failed: %o", error);
        }
      };
      // Publish the host cleanup before calling user code: even a synchronous
      // load may release its view or disconnect the renderer reentrantly.
      void Promise.resolve()
        .then(async () => {
          if (signal.aborted) return;
          const value = await load(host, signal);
          if (signal.aborted) return;
          const installed = install(value, host);
          // Installation can synchronously release its own owner.
          if (signal.aborted) installed?.();
          else cleanup = installed;
        })
        .catch(failed);
      return () => {
        controller.abort();
        cleanup?.();
        cleanup = undefined;
      };
    });
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
    this.scheduler.runAll(frame, weaponPoseBatch);
  }

  /** Finish the frame once it has rendered. */
  endFrame(): void {
    for (const hook of this.frameEndHooks) hook();
  }
}
