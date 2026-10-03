import { engineStore } from "../state/engineStore";
import { gameEntityStore, isStreamingSource } from "../state/gameEntityStore";
import type { createAudioPlaybackFade } from "./audioPlaybackFade";
import { getAudioDevice } from "./audioDevice";

const connections = new WeakMap<AudioContext, () => void>();

/** Bind the audio device to every transport transition, including short seeks. */
export function connectAudioPlayback(
  context: AudioContext,
  fade: Pick<ReturnType<typeof createAudioPlaybackFade>, "setPlaying">,
) {
  // A new view can mount before the old view's passive cleanup runs.
  connections.get(context)?.();
  const device = getAudioDevice(context);
  let disposed = false;
  const shouldPlay = () => {
    const { recording, status } = engineStore.getState().playback;
    // A new recording can arrive before StreamingController changes the
    // scene's data source. Its stopped/seeking state already owns audio.
    const source = recording?.source ?? gameEntityStore.getState().dataSource;
    return (
      !isStreamingSource(source) || (recording != null && status === "playing")
    );
  };
  const updateFade = () => {
    if (!disposed) fade.setPlaying(shouldPlay());
  };
  const reconcile = () => {
    if (disposed) return;
    updateFade();
    device.setRunning(shouldPlay());
  };

  const unsubscribePlayback = engineStore.subscribe((state, previous) => {
    if (
      state.playback.status !== previous.playback.status ||
      state.playback.recording !== previous.playback.recording
    ) {
      reconcile();
    }
  });
  const unsubscribeSource = gameEntityStore.subscribe((state, previous) => {
    if (state.dataSource !== previous.dataSource) reconcile();
  });
  // Promise completion matters too: not every intermediate device state
  // necessarily produces a separate statechange event.
  const unsubscribeDevice = device.subscribe(updateFade);
  reconcile();

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    connections.delete(context);
    unsubscribePlayback();
    unsubscribeSource();
    unsubscribeDevice();
    fade.setPlaying(false);
    device.setRunning(false);
  };
  connections.set(context, dispose);

  return {
    reconcile,
    unlock() {
      if (disposed) return;
      reconcile();
      device.unlock();
    },
    dispose,
  };
}
