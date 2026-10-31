import { OrthographicCamera, PerspectiveCamera, Vector2 } from "three";
import { cameraRegistry } from "../state/cameraRegistry";
import { settingsStore } from "../state/settingsStore";
import { updateObserverCameraFov } from "./cameraFov";
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

export class CameraRig {
  readonly perspective = new PerspectiveCamera();
  /** Frustum sized in pixels, so `zoom` is pixels per world unit. */
  readonly ortho = new OrthographicCamera();
  private activeCamera: RigCamera = this.perspective;
  private readonly listeners = new Set<(camera: RigCamera) => void>();
  private readonly size = new Vector2();

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

  setActive(camera: RigCamera): void {
    if (camera === this.activeCamera) return;
    this.activeCamera = camera;
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
    engine.scheduler.add(FramePriority.CameraProjection, () =>
      updateObserverCameraFov(
        cameras.perspective,
        settingsStore.getState().fov,
      ),
    ),
    // FOV is applied in the frame loop, so preference changes must wake
    // render-on-demand even though nothing else changed.
    reaction(
      settingsStore,
      (state) => state.fov,
      () => engine.invalidate(),
    ),
  );
}
