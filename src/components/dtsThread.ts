import { LoopOnce, LoopRepeat, type AnimationAction } from "three";
import {
  applyVisAt,
  resetVisNode,
  restoreDefaultVis,
  visThreadPosition,
  type VisNode,
} from "./visSequences";

/**
 * A DTS sequence's outputs on a shape instance, as one TSThread drives
 * them: the sequence's node clip and morph-frame clips on the mixer, and
 * its vis-keyframed meshes. A thread's *position* (0..1 through the
 * sequence) comes from whatever owns it — a ghost thread mask, an image
 * state machine, a jet flag, a turret aim, a wheel speed — and is applied
 * here. Cyclic sequences wrap the position; one-shots clamp.
 */
export interface DtsThread {
  sequence: string;
  actions: AnimationAction[];
  visNodes: VisNode[];
  duration: number;
  cyclic: boolean;
  /** Position applied last frame, so an unchanged thread costs nothing. */
  appliedPosition: number;
}

export function createDtsThread(
  sequence: string,
  actions: AnimationAction[],
  visNodes: VisNode[],
  duration: number,
  cyclic: boolean,
): DtsThread {
  return {
    sequence,
    actions,
    visNodes,
    duration,
    cyclic,
    appliedPosition: -1,
  };
}

/**
 * Normalized position of a thread `elapsed` seconds into its sequence,
 * playing forward or backward at |timeScale| 1.
 */
export function dtsThreadPosition(
  thread: DtsThread,
  elapsedSec: number,
  forward = true,
): number {
  return visThreadPosition(elapsedSec, thread.duration, thread.cyclic, forward);
}

/** Hold every output at normalized position `pos` (a paused thread). */
export function scrubDtsThread(thread: DtsThread, pos: number): void {
  if (thread.appliedPosition === pos) return;
  thread.appliedPosition = pos;
  for (const action of thread.actions) {
    if (!action.isRunning()) {
      action.setLoop(
        thread.cyclic ? LoopRepeat : LoopOnce,
        thread.cyclic ? Infinity : 1,
      );
      action.clampWhenFinished = !thread.cyclic;
      action.play();
    }
    action.paused = true;
    action.time = pos * action.getClip().duration;
  }
  for (const node of thread.visNodes) applyVisAt(node, pos);
}

/**
 * Show the thread at position 0 with the shape's opaque material
 * settings: what a TSThread that exists but is stopped renders.
 */
export function resetDtsThread(thread: DtsThread): void {
  thread.appliedPosition = -1;
  for (const action of thread.actions) action.stop();
  for (const node of thread.visNodes) resetVisNode(node);
}

/**
 * Destroy the thread: its actions stop and its meshes fall back to the
 * shape's default visibility (TSShapeInstance::animateVisibility falls
 * back to the object state's vis when no thread drives a mesh).
 */
export function destroyDtsThread(thread: DtsThread): void {
  thread.appliedPosition = -1;
  for (const action of thread.actions) action.stop();
  for (const node of thread.visNodes) restoreDefaultVis(node);
}
