import { gameEntityStore } from "../state/gameEntityStore";
import { liveConnectionStore } from "../state/liveConnectionStore";
import { settingsStore } from "../state/settingsStore";
import {
  commentaryPlayback,
  streamPlaybackStore,
} from "../state/streamPlaybackStore";
import { connectAudioPlayback } from "./audioPlayback";
import { getAudioGraph } from "./audioGraph";
import { installMissileLockAudio } from "./missileLockAudio";
import { preloadMatchSounds } from "./preloadMatchSounds";
import { FramePriority } from "./framePriority";
import { combineCleanups, reaction } from "./storeReaction";
import type { GameEngine } from "./gameEngine";

/**
 * While the commentary track plays, game sounds sit at this fraction of the
 * master volume so the callers read over the action.
 **/
const COMMENTARY_DUCK = 0.5;

/** A dead live session keeps rendering its last frame, but looping entity
 *  sounds shouldn't keep playing after the disconnect. */
function liveSessionDead(): boolean {
  if (gameEntityStore.getState().dataSource !== "live") return false;
  if (streamPlaybackStore.getState().playback?.localSpectator) return false;
  const live = liveConnectionStore.getState();
  return (
    live.gameStatus !== "connected" &&
    !(
      live.role === "watcher" &&
      live.watchStatus !== null &&
      live.watchStatus !== "ended"
    )
  );
}

/**
 * Spatial audio for the canvas: the listener rides the camera being
 * rendered, sounds are suspended in place while a stream is stopped,
 * paused or seeking, and the master volume follows the settings (ducked
 * under commentary, silent once a live session dies).
 */
export function installAudio(engine: GameEngine): () => void {
  const audio = getAudioGraph();
  const { audioLoader, audioListener, outputFade } = audio;
  let masterTarget: number | undefined;
  const updateMasterVolume = () => {
    const { audioEnabled, audioVolume } = settingsStore.getState();
    const target =
      (audioEnabled && !liveSessionDead() ? audioVolume : 0) *
      (commentaryPlayback.active ? COMMENTARY_DUCK : 1);
    if (target === masterTarget) return;
    masterTarget = target;
    audioListener.setMasterVolume(target);
  };

  // Suspend all sounds at their current positions while a stream is
  // stopped, paused or seeking. At natural EOF only chat stays audible
  // until the final sounds finish.
  const playback = connectAudioPlayback(audioListener.context, {
    output: outputFade,
    world: audioListener.world,
    chat: audioListener.chat,
  });

  // Unlock even when playback is stopped; the device controller waits for
  // resume to finish before suspending again. Overlapping opposite requests
  // can leave Chrome reporting "running" with a frozen audio clock.
  const onGesture = () => playback.unlock();
  // Reconcile interruptions and verify the audio clock on foregrounding.
  const onVisibility = () => playback.reconcile();
  const gestures = ["pointerdown", "click", "keydown", "touchend"] as const;
  for (const type of gestures) document.addEventListener(type, onGesture);
  document.addEventListener("visibilitychange", onVisibility);

  return combineCleanups(
    () => {
      for (const type of gestures)
        document.removeEventListener(type, onGesture);
      document.removeEventListener("visibilitychange", onVisibility);
      playback.dispose();
      audioListener.removeFromParent();
    },
    reaction(
      settingsStore,
      (state) => (state.audioEnabled ? state.audioVolume : 0),
      updateMasterVolume,
    ),
    reaction(
      settingsStore,
      (state) => state.audioEnabled,
      (enabled) => (enabled ? preloadMatchSounds(audioLoader) : undefined),
    ),
    installMissileLockAudio(engine, audio),
    // The listener follows whichever camera this frame renders through
    // (the command circuit's rig while it's open).
    engine.scheduler.add(FramePriority.ShadowAtlas, ({ camera }) => {
      if (audioListener.parent !== camera) camera.add(audioListener);
    }),
    // Reconcile ducking and live-session state even when preferences haven't changed.
    engine.scheduler.add(FramePriority.PostCamera, updateMasterVolume),
  );
}
