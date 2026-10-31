import {
  DefaultLoadingManager,
  NoToneMapping,
  PCFShadowMap,
  SRGBColorSpace,
  Scene,
  Timer,
  WebGLRenderer,
} from "three";
import { settingsStore } from "../state/settingsStore";
import { setDTSCullCamera } from "../dts/dtsModel";
import { flushTransformChanges } from "../transformChanges";
import { registerShadowRenderer } from "./shadowControl";
import type { GameEngine } from "./gameEngine";

/** Frames an invalidate() keeps the on-demand loop running for, at most. */
const MAX_PENDING_FRAMES = 60;

/**
 * Longest frame step, in seconds. A stalled tab or long hitch resumes
 * where it left off instead of fast-forwarding through everything it
 * missed in one frame.
 */
const MAX_FRAME_DELTA = 0.25;

// Whether the default loading manager (every three.js loader that isn't
// given its own) has loads in flight.
let loadsActive = false;
DefaultLoadingManager.onStart = () => {
  loadsActive = true;
};
DefaultLoadingManager.onProgress = () => {
  loadsActive = true;
};
DefaultLoadingManager.onLoad = () => {
  loadsActive = false;
};

export interface EngineCanvasOptions {
  /** Device pixel ratio; the display's, capped at 2, by default. */
  dpr?: number;
}

export interface EngineCanvas {
  /** Change the render resolution without rebuilding the renderer. */
  setPixelRatio(dpr?: number): void;
  dispose(): void;
}

const defaultPixelRatio = () =>
  Math.min(Math.max(1, window.devicePixelRatio), 2);

/**
 * The engine's WebGL canvas in `container`: a renderer set up for
 * Tribes 2's pipeline (no tone mapping, sRGB output — Torque worked in
 * gamma space without HDR), sized to the container, and the frame loop
 * that runs the engine's stages and renders the scene through the active
 * camera. The loop runs every display frame; with render-on-demand it
 * runs only when invalidated, and with an FPS limit at that rate.
 */
export function mountEngineCanvas(
  engine: GameEngine,
  container: HTMLElement,
  options: EngineCanvasOptions = {},
): EngineCanvas {
  const renderer = new WebGLRenderer({
    powerPreference: "high-performance",
    antialias: true,
    alpha: true,
  });
  renderer.toneMapping = NoToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.setPixelRatio(options.dpr ?? defaultPixelRatio());
  // Count every pass of a frame (shadow and offscreen renders run inside
  // the scene's render), not just the last one.
  renderer.info.autoReset = false;
  const canvas = renderer.domElement;
  canvas.style.display = "block";
  container.appendChild(canvas);
  const scene = new Scene();
  // The scene never moves. Left on, its per-frame recompose would force a
  // world-matrix update of every object under it, every frame.
  scene.matrixAutoUpdate = false;

  let disposed = false;
  let raf = 0;
  let pendingFrames = 0;
  let lastLimitedFrame = 0;
  // Pauses while the page is hidden.
  const timer = new Timer();
  timer.connect(document);

  const renderFrame = () => {
    timer.update();
    renderer.info.reset();
    const frame = engine.beginFrame({
      delta: Math.min(timer.getDelta(), MAX_FRAME_DELTA),
      elapsed: timer.getElapsed(),
      camera: engine.cameras.active,
      renderer,
      scene,
    });
    engine.runFrame(frame);
    flushTransformChanges();
    // The command circuit can switch cameras mid-frame.
    const camera = engine.cameras.active;
    setDTSCullCamera(camera);
    try {
      renderer.render(scene, camera);
    } finally {
      setDTSCullCamera(null);
    }
    engine.endFrame();
  };

  const schedule = () => {
    if (!raf && !disposed) raf = requestAnimationFrame(tick);
  };

  function tick(time: number) {
    raf = 0;
    const { renderOnDemand, fpsLimit } = settingsStore.getState();
    if (renderOnDemand) {
      if (pendingFrames > 0) {
        pendingFrames--;
        renderFrame();
      }
      if (pendingFrames > 0) schedule();
      return;
    }
    pendingFrames = 0;
    if (fpsLimit != null) {
      const interval = 1000 / fpsLimit;
      if (time - lastLimitedFrame >= interval) {
        // Snap forward to avoid drift accumulation.
        lastLimitedFrame = time - ((time - lastLimitedFrame) % interval);
        renderFrame();
      }
    } else {
      renderFrame();
    }
    schedule();
  }

  const invalidate = () => {
    pendingFrames = Math.min(MAX_PENDING_FRAMES, pendingFrames + 1);
    schedule();
  };

  const resize = () => {
    const { width, height } = container.getBoundingClientRect();
    renderer.setSize(width, height);
    invalidate();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  // A loop paused for render-on-demand picks up when it's turned off.
  const unsubscribe = settingsStore.subscribe((state, previous) => {
    if (
      state.renderOnDemand !== previous.renderOnDemand ||
      state.fpsLimit !== previous.fpsLimit
    )
      invalidate();
  });

  registerShadowRenderer(renderer);
  const disconnect = engine.connect({
    renderer,
    scene,
    invalidate,
    assetsLoading: () => loadsActive,
  });
  schedule();

  return {
    setPixelRatio(dpr) {
      const ratio = dpr ?? defaultPixelRatio();
      if (ratio === renderer.getPixelRatio()) return;
      renderer.setPixelRatio(ratio);
      invalidate();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      timer.dispose();
      observer.disconnect();
      unsubscribe();
      disconnect();
      registerShadowRenderer(null);
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
