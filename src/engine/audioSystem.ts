import { gameEntityStore } from "../state/gameEntityStore";
import { liveConnectionStore } from "../state/liveConnectionStore";
import { settingsStore } from "../state/settingsStore";
import { registerMetricSource } from "../diagnostics/resourceMetricRegistry";
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
const SOUND_PROMPT_DELAY_MS = 300;

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
    updateSoundRecovery();
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
  const unlockAudio = (retryStalledClock: boolean) => {
    if (
      settingsStore.getState().audioEnabled &&
      navigator.userActivation?.isActive !== false
    )
      playback.unlock(retryStalledClock);
  };
  const onGesture = () => unlockAudio(false);
  const retrySound = () => unlockAudio(true);

  const recovery = engine.audioRecovery;
  let soundPromptTimer: ReturnType<typeof setTimeout> | undefined;
  function needsSoundRecovery() {
    const { audioEnabled, audioVolume } = settingsStore.getState();
    return (
      audioEnabled &&
      audioVolume > 0 &&
      !document.hidden &&
      !liveSessionDead() &&
      playback.needsAttention()
    );
  }
  function updateSoundRecovery() {
    const { enableSound } = recovery.getState();
    if (!needsSoundRecovery()) {
      clearTimeout(soundPromptTimer);
      soundPromptTimer = undefined;
      if (enableSound) recovery.setState({ enableSound: null });
    } else if (!enableSound && soundPromptTimer === undefined) {
      // Give normal startup and foreground recovery time to finish.
      soundPromptTimer = setTimeout(() => {
        soundPromptTimer = undefined;
        if (needsSoundRecovery())
          recovery.setState({ enableSound: retrySound });
      }, SOUND_PROMPT_DELAY_MS);
    }
  }
  const unsubscribeRecovery = playback.subscribe(updateSoundRecovery);

  // Reconcile interruptions and verify the audio clock on foregrounding.
  const onVisibility = () => {
    playback.reconcile();
    updateSoundRecovery();
  };
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) onVisibility();
  };
  const gestures = ["pointerdown", "click", "keydown"] as const;
  for (const type of gestures) document.addEventListener(type, onGesture);
  // A touch activates playback on release, even when canvas input suppresses
  // the follow-up click or stops the event from bubbling.
  document.addEventListener("touchend", onGesture, {
    capture: true,
    passive: true,
  });
  document.addEventListener("visibilitychange", onVisibility);
  const view = document.defaultView;
  view?.addEventListener("pageshow", onPageShow);

  return combineCleanups(
    () => {
      for (const type of gestures)
        document.removeEventListener(type, onGesture);
      document.removeEventListener("touchend", onGesture, true);
      document.removeEventListener("visibilitychange", onVisibility);
      view?.removeEventListener("pageshow", onPageShow);
      unsubscribeRecovery();
      clearTimeout(soundPromptTimer);
      recovery.setState({ enableSound: null });
      playback.dispose();
      audioListener.removeFromParent();
    },
    registerMetricSource("audioDevice", () => ({
      clockSec: audioListener.context.currentTime,
      running: Number(audioListener.context.state === "running"),
      interrupted: Number(audioListener.context.state === "interrupted"),
      needsAttention: Number(playback.needsAttention()),
      soundPromptAvailable: Number(recovery.getState().enableSound !== null),
    })),
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
