import type { Camera, Scene, WebGLRenderer } from "three";
import { FramePriority, type FrameStage } from "./framePriority";

/** What every frame callback gets: computed once per frame. */
export interface FrameContext {
  /** Seconds since the previous frame, capped so a stalled or hidden page
   *  resumes rather than fast-forwarding (see mountEngineCanvas). */
  delta: number;
  /** Seconds the renderer has run, not counting time the page was hidden. */
  elapsed: number;
  /** Frame counter, incremented once per rendered frame. */
  frame: number;
  /** The camera this frame renders through: the command circuit's
   *  orthographic rig while it's open, otherwise the perspective camera. */
  camera: Camera;
  renderer: WebGLRenderer;
  scene: Scene;
}

export type FrameCallback = (frame: FrameContext) => void;

const STAGES: readonly FrameStage[] = [
  ...new Set(Object.values(FramePriority)),
].sort((a, b) => a - b);

interface Subscription {
  callback: FrameCallback;
  removed: boolean;
}

/**
 * Runs frame callbacks stage by stage, and within a stage in the order
 * they were added. A callback added while its stage runs starts with the
 * next run; a removed one never runs again, even later in the same pass
 * (an earlier callback may have disposed what it updates).
 */
export class FrameScheduler {
  private readonly callbacks = new Map<FrameStage, readonly Subscription[]>();

  /** Every stage, lowest first. */
  static readonly stages = STAGES;

  add(stage: FrameStage, callback: FrameCallback): () => void {
    const subscription: Subscription = { callback, removed: false };
    this.callbacks.set(stage, [
      ...(this.callbacks.get(stage) ?? []),
      subscription,
    ]);
    return () => {
      if (subscription.removed) return;
      subscription.removed = true;
      const current = this.callbacks.get(stage);
      if (current)
        this.callbacks.set(
          stage,
          current.filter((s) => s !== subscription),
        );
    };
  }

  run(stage: FrameStage, frame: FrameContext): void {
    const subscriptions = this.callbacks.get(stage);
    if (!subscriptions) return;
    for (const subscription of subscriptions)
      if (!subscription.removed) subscription.callback(frame);
  }

  /** Every stage in order, as one frame. */
  runAll(frame: FrameContext): void {
    for (const stage of STAGES) this.run(stage, frame);
  }
}
