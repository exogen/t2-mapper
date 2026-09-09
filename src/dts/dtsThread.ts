import { LoopOnce, LoopRepeat, MathUtils, type AnimationAction } from "three";
import type { ThreadState } from "../stream/types";

/** A native sequence scrubbed by an external engine clock or jet state. */
export interface DtsThread {
  action: AnimationAction;
  duration: number;
  cyclic: boolean;
  appliedPosition: number;
}

export function createDtsThread(
  action: AnimationAction,
  cyclic: boolean,
): DtsThread {
  return {
    action,
    duration: action.getClip().duration,
    cyclic,
    appliedPosition: -1,
  };
}

export function dtsThreadPosition(
  thread: DtsThread,
  elapsedSec: number,
  forward = true,
): number {
  if (!(thread.duration > 0)) return 0;
  if (thread.cyclic)
    return (
      MathUtils.euclideanModulo(
        forward ? elapsedSec : -elapsedSec,
        thread.duration,
      ) / thread.duration
    );
  return MathUtils.clamp(
    forward ? elapsedSec / thread.duration : 1 - elapsedSec / thread.duration,
    0,
    1,
  );
}

/** Hold all native outputs at a normalized position, including object state. */
export function holdDtsAction(action: AnimationAction, position: number): void {
  action.play();
  action.enabled = true;
  action.paused = true;
  action.time = MathUtils.clamp(position, 0, 1) * action.getClip().duration;
}

/** ShapeBase::updateThread: direction changes speed, Stop holds zero, and
 * Pause preserves position. The caller creates/replaces the sequence itself. */
export function applyDtsThreadState(
  action: AnimationAction,
  state: Pick<ThreadState, "state" | "forward" | "atEnd">,
  cyclic: boolean,
): void {
  action.setLoop(cyclic ? LoopRepeat : LoopOnce, cyclic ? Infinity : 1);
  action.clampWhenFinished = !cyclic;
  action.enabled = true;
  if (state.state === 1) holdDtsAction(action, 0);
  else if (state.state === 2) action.paused = true;
  else if (state.atEnd) holdDtsAction(action, state.forward ? 1 : 0);
  else {
    action.play();
    action.paused = false;
    action.timeScale = state.forward ? 1 : -1;
  }
}

export function scrubDtsThread(thread: DtsThread, position: number): void {
  if (thread.appliedPosition === position && thread.action.isScheduled())
    return;
  thread.appliedPosition = position;
  holdDtsAction(thread.action, position);
}

/** Engine Stop holds the first key; deleting the thread restores defaults. */
export function resetDtsThread(thread: DtsThread): void {
  thread.appliedPosition = -1;
  scrubDtsThread(thread, 0);
}
export function destroyDtsThread(thread: DtsThread): void {
  thread.appliedPosition = -1;
  thread.action.stop();
}
