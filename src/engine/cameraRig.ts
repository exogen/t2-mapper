import {
  MathUtils,
  OrthographicCamera,
  PerspectiveCamera,
  Vector2,
} from "three";
import { cameraRegistry } from "../state/cameraRegistry";
import { cameraZoomPreviewStore } from "../state/cameraZoomPreview";
import { clipStore } from "../state/clipStore";
import { settingsStore } from "../state/settingsStore";
import { applyHorizontalFov, resolveObserverFov } from "./cameraFov";
import { FramePriority } from "./framePriority";
import { combineCleanups, reaction } from "./storeReaction";
import type { GameEngine } from "./gameEngine";

/**
 * The canvas's two cameras: the observer's perspective camera, and the
 * command circuit's top-down orthographic one. Exactly one renders at a
 * time; code that positions a specific camera targets it directly
 * (cameraRegistry), not whichever happens to be rendering.
 */
export type RigCamera = PerspectiveCamera | OrthographicCamera;

// Retail hud.cs cycles through 45, 18, 9 and 4.5 at the stock 90° FOV.
// Tribes2.exe clamps the last step to the player datablock's 5° minimum.
const ZOOM_HORIZONTAL_FOVS = [45, 18, 9, 5] as const;
const ZOOM_PREVIEW_MS = 5_000;
const ZOOM_REFERENCE_FOV = 90;

export class CameraRig {
  readonly perspective = new PerspectiveCamera();
  /** Frustum sized in pixels, so `zoom` is pixels per world unit. */
  readonly ortho = new OrthographicCamera();
  private activeCamera: RigCamera = this.perspective;
  private readonly listeners = new Set<(camera: RigCamera) => void>();
  private readonly size = new Vector2();
  private zoomLevel = 0;
  private zoomPreviewTimer: ReturnType<typeof setTimeout> | undefined;
  private holdingZoom = false;
  private zoomUpdatedAt = 0;
  private animatedFov: number | undefined;
  private zoomAnimating = false;
  private observerFovFrame = -1;
  private observerFov = ZOOM_REFERENCE_FOV;

  constructor() {
    // Face Torque north (world +X; three's default −Z forward is west) so
    // the compass reads N until a mission camera takes over.
    this.perspective.position.set(0, 256, 0);
    this.perspective.rotation.set(0, -Math.PI / 2, 0);
  }

  /** The camera the scene renders through. */
  get active(): RigCamera {
    return this.activeCamera;
  }

  get zoomHeld(): boolean {
    return this.holdingZoom;
  }

  set zoomHeld(held: boolean) {
    if (held === this.holdingZoom) return;
    this.holdingZoom = held;
    this.zoomUpdatedAt = performance.now();
  }

  get zoomHorizontalFov(): number | undefined {
    if (this.zoomHeld && this.activeCamera === this.perspective)
      return ZOOM_HORIZONTAL_FOVS[this.zoomLevel];
  }

  cycleZoomLevel(): void {
    if (this.activeCamera !== this.perspective) return;
    this.zoomLevel = (this.zoomLevel + 1) % ZOOM_HORIZONTAL_FOVS.length;
    if (this.zoomHeld) {
      this.zoomUpdatedAt = performance.now();
      return;
    }
    clearTimeout(this.zoomPreviewTimer);
    this.zoomPreviewTimer = setTimeout(
      () => this.clearZoomPreview(),
      ZOOM_PREVIEW_MS,
    );
  }

  clearZoomPreview(): void {
    if (this.zoomPreviewTimer === undefined) return;
    clearTimeout(this.zoomPreviewTimer);
    this.zoomPreviewTimer = undefined;
    cameraZoomPreviewStore.setState({ scale: null });
  }

  updateZoomPreview(): void {
    if (this.zoomPreviewTimer === undefined) return;
    const { aspect, fov } = this.perspective;
    const target = MathUtils.degToRad(ZOOM_HORIZONTAL_FOVS[this.zoomLevel] / 2);
    // Perspective frustum dimensions scale with tan(half-FOV).
    const current = Math.tan(MathUtils.degToRad(fov / 2)) * aspect;
    const scale = Math.min(1, Math.tan(target) / current);
    if (scale !== cameraZoomPreviewStore.getState().scale)
      cameraZoomPreviewStore.setState({ scale });
  }

  resetZoom(): void {
    this.animatedFov = undefined;
    this.zoomAnimating = false;
    if (this.zoomHeld) this.zoomUpdatedAt = performance.now();
  }

  get hasViewerZoom(): boolean {
    return this.animatedFov !== undefined;
  }

  private advanceZoomFov(baseFov: number, allowViewerZoom: boolean): number {
    if (!allowViewerZoom || this.activeCamera !== this.perspective) {
      this.resetZoom();
      return baseFov;
    }
    const target = Math.min(baseFov, this.zoomHorizontalFov ?? baseFov);
    if (target === baseFov && this.animatedFov === undefined) return baseFov;

    const now = performance.now();
    const elapsedMs = now - this.zoomUpdatedAt;
    this.zoomUpdatedAt = now;
    const { zoomSpeedMs } = settingsStore.getState();
    const current = Math.min(baseFov, this.animatedFov ?? baseFov);
    const difference = target - current;
    // Retail moves a fixed number of horizontal degrees per millisecond.
    const maxStep =
      zoomSpeedMs > 0
        ? (elapsedMs * ZOOM_REFERENCE_FOV) / zoomSpeedMs
        : Infinity;
    const fov =
      Math.abs(difference) <= maxStep
        ? target
        : current + Math.sign(difference) * maxStep;
    this.animatedFov = fov === baseFov && !this.zoomHeld ? undefined : fov;
    this.zoomAnimating = fov !== target;
    return fov;
  }

  /** Mouse look and projection use the same sample, even on a zoom key edge. */
  sampleObserverFov(frame: number): number {
    if (this.observerFovFrame !== frame) {
      const { fov, allowViewerZoom } = resolveObserverFov(
        settingsStore.getState().fov,
      );
      this.observerFov = this.advanceZoomFov(fov, allowViewerZoom);
      this.observerFovFrame = frame;
    }
    return this.observerFov;
  }

  applyObserverFov(frame: number): void {
    applyHorizontalFov(this.perspective, this.sampleObserverFov(frame));
  }

  get isZoomAnimating(): boolean {
    return this.zoomAnimating;
  }

  setActive(camera: RigCamera): void {
    if (camera === this.activeCamera) return;
    this.activeCamera = camera;
    if (camera === this.ortho) {
      this.clearZoomPreview();
      this.resetZoom();
    } else if (this.zoomHeld) {
      this.zoomUpdatedAt = performance.now();
    }
    for (const listener of this.listeners) listener(camera);
  }

  onActiveChange(listener: (camera: RigCamera) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Fit both projections to the canvas size (CSS pixels). */
  resize(width: number, height: number): void {
    if (this.size.x === width && this.size.y === height) return;
    this.size.set(width, height);
    this.perspective.aspect = width / height;
    this.perspective.updateProjectionMatrix();
    this.ortho.left = width / -2;
    this.ortho.right = width / 2;
    this.ortho.top = height / 2;
    this.ortho.bottom = height / -2;
    this.ortho.updateProjectionMatrix();
  }

  /** The canvas size the projections were last fitted to. */
  get viewport(): Readonly<Vector2> {
    return this.size;
  }
}

const _size = new Vector2();

/**
 * Put the rig's cameras in the scene, register them, and keep their
 * projections fitted: canvas size each frame, observer FOV after every
 * camera-mode change.
 */
export function installCameraRig(engine: GameEngine): () => void {
  const { cameras } = engine;
  cameraRegistry.perspective = cameras.perspective;
  cameraRegistry.ortho = cameras.ortho;
  return combineCleanups(
    () => {
      cameras.clearZoomPreview();
      cameraRegistry.perspective = null;
      cameraRegistry.ortho = null;
    },
    engine.withHost(({ scene }) => {
      scene.add(cameras.perspective, cameras.ortho);
      return () => scene.remove(cameras.perspective, cameras.ortho);
    }),
    engine.scheduler.add(FramePriority.ShadowAtlas, ({ renderer }) => {
      renderer.getSize(_size);
      cameras.resize(_size.x, _size.y);
    }),
    engine.scheduler.add(FramePriority.CameraProjection, ({ frame }) => {
      // The clip camera applies its recorded framing at the next stage.
      if (clipStore.getState().active) return;
      cameras.applyObserverFov(frame);
    }),
    engine.scheduler.add(FramePriority.PostCamera, () => {
      cameras.updateZoomPreview();
      if (cameras.isZoomAnimating) engine.invalidate();
    }),
    // FOV is applied in the frame loop, so preference changes must wake
    // render-on-demand even though nothing else changed.
    reaction(
      settingsStore,
      (state) => state.fov,
      () => engine.invalidate(),
    ),
    reaction(
      settingsStore,
      (state) => state.zoomSpeedMs,
      () => engine.invalidate(),
    ),
  );
}
