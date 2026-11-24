import { engineStore } from "../state/engineStore";
import { gameEntityStore, isStreamingSource } from "../state/gameEntityStore";
import type { createAudioPlaybackFade } from "./audioPlaybackFade";
import { getAudioDevice } from "./audioDevice";

const connections = new WeakMap<AudioContext, () => void>();
type PlaybackFade = Pick<
  ReturnType<typeof createAudioPlaybackFade>,
  "setPlaying"
>;

/** Bind the audio device to every transport transition, including short seeks. */
export function connectAudioPlayback(
  context: AudioContext,
  fades: { output: PlaybackFade; world: PlaybackFade; chat: PlaybackFade },
) {
  // A new view can mount before the old view's passive cleanup runs.
  connections.get(context)?.();
  const device = getAudioDevice(context);
  let disposed = false;

  function applyFades(world: boolean, chat: boolean) {
    fades.world.setPlaying(world);
    fades.chat.setPlaying(chat);
    fades.output.setPlaying(world || chat);
  }

  function updateFades() {
    const { recording, status } = engineStore.getState().playback;
    // A new recording can arrive before StreamPlaybackSession changes the
    // scene's data source. Its stopped/seeking state already owns audio.
    const source = recording?.source ?? gameEntityStore.getState().dataSource;
    const world =
      !isStreamingSource(source) || (recording != null && status === "playing");
    const ending = recording?.source === "demo" && status === "ending";
    const audible = world || ending;
    applyFades(world, audible);
    return audible;
  }

  const syncPlayback = () => {
    if (disposed) return;
    device.setRunning(updateFades());
  };

  const unsubscribePlayback = engineStore.subscribe((state, previous) => {
    if (
      state.playback.status !== previous.playback.status ||
      state.playback.recording !== previous.playback.recording
    ) {
      syncPlayback();
    }
  });
  const unsubscribeSource = gameEntityStore.subscribe((state, previous) => {
    if (state.dataSource !== previous.dataSource) syncPlayback();
  });
  // Promise completion matters too: not every intermediate device state
  // necessarily produces a separate statechange event.
  const unsubscribeDevice = device.subscribe(updateFades);
  syncPlayback();

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    connections.delete(context);
    unsubscribePlayback();
    unsubscribeSource();
    unsubscribeDevice();
    applyFades(false, false);
    device.setRunning(false);
  };
  connections.set(context, dispose);

  return {
    needsAttention: () => !disposed && device.needsAttention(),
    subscribe: device.subscribe,
    reconcile() {
      if (disposed) return;
      syncPlayback();
      device.verifyClock();
    },
    unlock(retryStalledClock = false) {
      if (disposed) return;
      updateFades();
      device.unlock(retryStalledClock);
    },
    dispose,
  };
}
