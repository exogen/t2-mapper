import {
  AnimationClip,
  PropertyBinding,
  type AnimationAction,
  type AnimationMixer,
  type KeyframeTrack,
} from "three";

// Three's runtime binding exposes getValue, but its declarations omit it.
interface ReadableBinding {
  getValue(values: Float32Array, offset: number): void;
  unbind(): void;
}

/** A reusable frozen pose for transitions that can be interrupted or restart
 * the same action. Pass pose actions belonging to this mixer's root. */
export function createAnimationPoseSnapshot(
  mixer: AnimationMixer,
  actions: Iterable<AnimationAction>,
): {
  capture(): AnimationAction;
  stop(): void;
  dispose(): void;
} {
  const tracks = new Map<string, KeyframeTrack>();
  for (const action of actions) {
    for (const source of action.getClip().tracks) {
      if (tracks.has(source.name)) continue;
      const track = source.clone();
      track.times = new Float32Array([0]);
      track.values = source.values.slice(0, source.getValueSize());
      tracks.set(source.name, track);
    }
  }
  const samples = [...tracks.values()].map((track) => ({
    track,
    binding: PropertyBinding.create(
      mixer.getRoot(),
      track.name,
    ) as unknown as ReadableBinding,
  }));
  const clip = new AnimationClip("pose snapshot", 1, [...tracks.values()]);
  const action = mixer.clipAction(clip);
  return {
    capture() {
      // Read everything while the interrupted blend still owns the pose.
      for (const { track, binding } of samples)
        binding.getValue(track.values, 0);
      action.reset().setEffectiveWeight(1).play();
      action.paused = true;
      return action;
    },
    stop() {
      action.stop();
    },
    dispose() {
      action.stop();
      mixer.uncacheAction(clip);
      for (const { binding } of samples) binding.unbind();
    },
  };
}
