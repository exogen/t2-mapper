import { pickMoveAnimation, type MoveAnimationResult } from "./playerAnimation";
import { updateShapeThread } from "./shapeThreads";
import {
  THRUST_FORWARD,
  THRUST_DOWN,
  type StreamEntity,
  type ThreadState,
} from "./types";

export interface MoveAnimationTimeline extends MoveAnimationResult {
  timeSec: number;
  previous?: Omit<MoveAnimationTimeline, "previous">;
}

export interface JetTimeline {
  active: boolean;
  timeSec: number;
  previous?: JetTimeline;
}

export interface ClientAnimationState {
  move?: MoveAnimationTimeline;
  flare?: ThreadState;
  back?: JetTimeline;
  bottom?: JetTimeline;
}

type Inputs = Pick<
  StreamEntity,
  | "type"
  | "className"
  | "velocity"
  | "rotation"
  | "falling"
  | "jetting"
  | "damageState"
  | "thrustDirection"
> & {
  mountObjectGhostIndex?: number;
};

function jet(
  previous: JetTimeline | undefined,
  active: boolean,
  timeSec: number,
): JetTimeline {
  return previous?.active === active ? previous : { active, timeSec, previous };
}

/** Record client-derived animation changes on simulation ticks, even without
 * a renderer. Pose sampling later needs only these sparse time anchors. */
export function updateClientAnimation(
  previous: ClientAnimationState | undefined,
  input: Inputs,
  timeSec: number,
): ClientAnimationState | undefined {
  if (input.type === "Player") {
    const picked =
      input.mountObjectGhostIndex != null && input.mountObjectGhostIndex >= 0
        ? { animation: "root", timeScale: 1 }
        : pickMoveAnimation(
            input.velocity,
            input.rotation ?? [0, 0, 0, 1],
            input.falling,
            input.jetting,
          );
    let move = previous?.move;
    if (
      !move ||
      move.animation !== picked.animation ||
      move.timeScale !== picked.timeScale
    ) {
      move = {
        ...picked,
        timeSec,
        previous: move && {
          animation: move.animation,
          timeScale: move.timeScale,
          timeSec: move.timeSec,
        },
      };
    }
    const flare = updateShapeThread(
      previous?.flare,
      {
        index: 0,
        sequence: 0,
        state: 0,
        forward: !!input.jetting && (input.damageState ?? 0) < 1,
        atEnd: false,
      },
      timeSec,
    );
    return previous?.move === move && previous.flare === flare
      ? previous
      : { move, flare };
  }
  if (
    input.className === "FlyingVehicle" ||
    input.className === "HoverVehicle"
  ) {
    const thrust = input.thrustDirection ?? THRUST_FORWARD;
    const back = jet(previous?.back, thrust === THRUST_FORWARD, timeSec);
    const bottom = jet(
      previous?.bottom,
      thrust === THRUST_DOWN && !!input.jetting,
      timeSec,
    );
    return previous?.back === back && previous.bottom === bottom
      ? previous
      : { back, bottom };
  }
  return previous;
}

export interface JetPose {
  activatePosition: number;
  maintaining: boolean;
  maintainStartSec: number;
}
interface JetAnchor extends JetPose {
  duration: number;
  hasMaintain: boolean;
}
const jetAnchors = new WeakMap<JetTimeline, JetAnchor>();

function advanceJet(
  pose: JetPose,
  active: boolean,
  start: number,
  end: number,
  duration: number,
  hasMaintain: boolean,
): void {
  if (pose.maintaining) {
    if (active) return;
    pose.maintaining = false;
    pose.activatePosition = 1;
  }
  const dt = Math.max(0, end - start);
  if (
    active &&
    hasMaintain &&
    (!(duration > 0) || dt >= (1 - pose.activatePosition) * duration)
  ) {
    pose.maintainStartSec =
      start + (1 - pose.activatePosition) * Math.max(0, duration);
    pose.maintaining = true;
    pose.activatePosition = 0;
  } else {
    pose.activatePosition =
      duration > 0
        ? Math.max(
            0,
            Math.min(1, pose.activatePosition + (active ? dt : -dt) / duration),
          )
        : active
          ? 1
          : 0;
  }
}

/** Resolve Activate/Maintain transitions once per asset duration, with exact
 * crossing times. Sampling a frame never walks the entity's full history. */
export function sampleJetTimeline(
  timeline: JetTimeline,
  now: number,
  duration: number,
  hasMaintain: boolean,
  out: JetPose,
): void {
  const ready = jetAnchors.get(timeline);
  if (ready?.duration === duration && ready.hasMaintain === hasMaintain) {
    Object.assign(out, ready);
    advanceJet(
      out,
      timeline.active,
      timeline.timeSec,
      now,
      duration,
      hasMaintain,
    );
    return;
  }
  let current: JetTimeline | undefined = timeline;
  const pending: JetTimeline[] = [];
  let cached: JetAnchor | undefined;
  while (current) {
    cached = jetAnchors.get(current);
    if (cached?.duration === duration && cached.hasMaintain === hasMaintain)
      break;
    pending.push(current);
    current = current.previous;
  }
  Object.assign(
    out,
    current
      ? cached
      : { activatePosition: 0, maintaining: false, maintainStartSec: 0 },
  );
  for (let i = pending.length - 1; i >= 0; i--) {
    const next = pending[i];
    if (current)
      advanceJet(
        out,
        current.active,
        current.timeSec,
        next.timeSec,
        duration,
        hasMaintain,
      );
    // Changing direction seats the reverse thread immediately, before it advances.
    if (out.maintaining && !next.active) {
      out.maintaining = false;
      out.activatePosition = 1;
    }
    jetAnchors.set(next, { ...out, duration, hasMaintain });
    current = next;
  }
  advanceJet(
    out,
    timeline.active,
    timeline.timeSec,
    now,
    duration,
    hasMaintain,
  );
}
