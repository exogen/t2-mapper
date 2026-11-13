import { LoopOnce, LoopRepeat, type AnimationAction } from "three";
import type { DTSAnimationMixer } from "../dts/dtsAnimationMixer";
import { holdDtsAction } from "../dts/dtsThread";
import { ANIM_TRANSITION_TIME } from "../stream/playbackUtils";
import { createAnimationPoseSnapshot } from "./animationPoseSnapshot";

/** Each model's constructor maps these fixed gesture slots to its own clips. */
export const PROFILE_GESTURE_ACTIONS = [
  "cel1",
  "cel2",
  "cel3",
  "cel4",
  "cel5",
  "cel6",
  "cel7",
  "cel8",
] as const;

export interface ProfileGestureAnimationsOptions {
  actions: ReadonlyMap<string | number, AnimationAction>;
  mixer: DTSAnimationMixer;
  armAction: string;
}

/** A portrait gesture replaces the idle body and aim blends, never the
 * player's damage threads or the mounted images' independent animations. */
export function createProfileGestureAnimations({
  actions,
  mixer,
  armAction,
}: ProfileGestureAnimationsOptions): {
  playRandom(): void;
  /** Call immediately after the player's mixer.update(delta). */
  update(): void;
  dispose(): void;
} {
  const gestures = [
    ...new Set(
      PROFILE_GESTURE_ACTIONS.map((name) => actions.get(name)).filter(
        (action): action is AnimationAction => action !== undefined,
      ),
    ),
  ];
  const idle = actions.get("root");
  // Representative armor/weapon choices can come from different demos:
  // a heavy model has no sniper look thread, so retain the ordinary arm pose.
  const arm = actions.get(armAction.toLowerCase()) ?? actions.get("look");
  const neutral = new Set(
    [arm, actions.get("head"), actions.get("headside")].filter(
      (action): action is AnimationAction => action !== undefined,
    ),
  );
  const owned = new Set(
    [idle, ...neutral, ...gestures].filter(
      (action): action is AnimationAction => action !== undefined,
    ),
  );
  const snapshot = createAnimationPoseSnapshot(mixer, owned);
  let active: AnimationAction | undefined;
  let finished = false;
  let disposed = false;
  let transitionEnd: number | undefined;

  function restoreIdle(blend = false) {
    if (idle) {
      idle.reset().setEffectiveWeight(1).setEffectiveTimeScale(1);
      idle.setLoop(LoopRepeat, Infinity);
      idle.clampWhenFinished = false;
      idle.play();
      if (blend) idle.fadeIn(ANIM_TRANSITION_TIME);
    }
    for (const action of neutral) {
      action.reset().setEffectiveWeight(1);
      holdDtsAction(action, 0.5);
      if (blend) action.fadeIn(ANIM_TRANSITION_TIME);
    }
  }

  function transition(start: () => void) {
    // A frozen copy of the displayed pose also handles restarting the same
    // clip and clicking again midway through an unfinished transition.
    const pose = snapshot.capture();
    for (const action of owned) action.stop();
    start();
    pose.fadeOut(ANIM_TRANSITION_TIME);
    transitionEnd = mixer.time + ANIM_TRANSITION_TIME;
    mixer.update(0);
  }

  function onFinished(event: { action: AnimationAction }) {
    if (event.action === active) finished = true;
  }
  mixer.addEventListener("finished", onFinished);
  restoreIdle();

  return {
    playRandom() {
      if (disposed || !idle || !gestures.length) return;
      finished = false;
      transition(() => {
        active = gestures[Math.floor(Math.random() * gestures.length)];
        active.reset().setEffectiveWeight(1).setEffectiveTimeScale(1);
        active.setLoop(LoopOnce, 1);
        active.clampWhenFinished = true;
        active.play().fadeIn(ANIM_TRANSITION_TIME);
      });
    },
    update() {
      if (disposed) return;
      if (transitionEnd !== undefined && mixer.time >= transitionEnd) {
        snapshot.stop();
        transitionEnd = undefined;
        mixer.update(0);
      }
      if (!finished) return;
      active = undefined;
      finished = false;
      transition(() => restoreIdle(true));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mixer.removeEventListener("finished", onFinished);
      for (const action of owned) action.stop();
      snapshot.dispose();
      active = undefined;
      finished = false;
    },
  };
}
