import { LoopOnce, LoopRepeat, type AnimationAction } from "three";
import { applyVisAt, restoreDefaultVis, type VisNode } from "./visSequences";

/**
 * A jet flare thread's outputs: the sequence's mixer actions (node clip
 * plus morph frame clips) and its vis-keyframed meshes, all held at one
 * normalized position each frame like a paused TSThread.
 */
export interface JetSequence {
  actions: AnimationAction[];
  visNodes: VisNode[];
  duration: number;
  /** Position applied last frame, so an unchanged thread costs nothing. */
  appliedPosition: number;
}

export function createJetSequence(
  actions: AnimationAction[],
  visNodes: VisNode[],
  duration: number,
): JetSequence {
  return { actions, visNodes, duration, appliedPosition: -1 };
}

/** Hold the sequence at normalized position `pos`. */
export function scrubJetSequence(
  seq: JetSequence,
  pos: number,
  cyclic: boolean,
): void {
  if (seq.appliedPosition === pos) return;
  seq.appliedPosition = pos;
  for (const action of seq.actions) {
    if (!action.isRunning()) {
      action.setLoop(cyclic ? LoopRepeat : LoopOnce, cyclic ? Infinity : 1);
      action.clampWhenFinished = !cyclic;
      action.play();
    }
    action.paused = true;
    action.time = pos * action.getClip().duration;
  }
  for (const node of seq.visNodes) applyVisAt(node, pos);
}

/** Destroy the thread: its meshes fall back to the shape's default vis. */
export function stopJetSequence(seq: JetSequence): void {
  seq.appliedPosition = -1;
  for (const action of seq.actions) action.stop();
  for (const node of seq.visNodes) restoreDefaultVis(node);
}
