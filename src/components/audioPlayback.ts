import { engineStore } from "../state/engineStore";
import { gameEntityStore, isStreamingSource } from "../state/gameEntityStore";
import type { createAudioPlaybackFade } from "./audioPlaybackFade";

const noop = () => {};

/** Bind the audio device to every transport transition, including short seeks. */
export function connectAudioPlayback(
  context: AudioContext,
  fade: Pick<ReturnType<typeof createAudioPlaybackFade>, "setPlaying">,
) {
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
    // Request the latest intent even if ctx.state looks correct: the
    // opposite operation may still be in flight. Do not serialize behind
    // resume(), which can remain pending until a browser gesture unlock.
    const settled = shouldPlay() ? context.resume() : context.suspend();
    // A statechange event need not expose every intermediate state. Read
    // fresh transport state when a request settles, never its old intent.
    settled.then(updateFade, noop);
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
  context.addEventListener("statechange", reconcile);
  reconcile();

  return {
    reconcile,
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribePlayback();
      unsubscribeSource();
      context.removeEventListener("statechange", reconcile);
      // The listener/graph outlive React. Silence them on teardown, and
      // prevent old promise completions from touching a later mount's fade.
      fade.setPlaying(false);
      context.suspend().catch(noop);
    },
  };
}
