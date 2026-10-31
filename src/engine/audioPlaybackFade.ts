/** Short enough to preserve the attack of the scene, but avoid a hard start. */
const FADE_IN_SEC = 0.05;

/**
 * A separate output envelope so master-volume changes and commentary ducking
 * cannot overwrite the fade. Schedule on the audio clock: a blocked resume
 * must not consume the fade while the context is still suspended.
 */
export function createAudioPlaybackFade(context: BaseAudioContext) {
  const node = context.createGain();
  node.gain.value = 0;
  let audible = false;

  return {
    node,
    setPlaying(playing: boolean) {
      const nextAudible = playing && context.state === "running";
      if (nextAudible === audible) return;
      audible = nextAudible;

      const now = context.currentTime;
      node.gain.cancelScheduledValues(now);
      node.gain.setValueAtTime(0, now);
      if (audible) {
        node.gain.linearRampToValueAtTime(1, now + FADE_IN_SEC);
      }
    },
  };
}
