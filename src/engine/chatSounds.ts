import type { Audio } from "three";
import { audioToUrl } from "../loaders";
import { getAudioGraph } from "./audioGraph";
import {
  audioContextRunning,
  getCachedAudioBuffer,
  getEffectiveSoundRate,
  getSoundGeneration,
  trackSound,
  stopAndDetachSound,
} from "./soundEffects";
import { combineCleanups, reaction } from "./storeReaction";
import { settingsStore } from "../state/settingsStore";
import { commentaryPlayback, streamClock } from "../state/streamPlaybackStore";
import { engineStore } from "../state/engineStore";
import { streamSnapshotStore } from "../state/streamSnapshotStore";
import { streamTimeToTick } from "../stream/streamHelpers";
import type { StreamSnapshot } from "../stream/types";

const MAX_CHAT_SOUND_AGE_SEC = 5;

interface PendingChatSound {
  sender: string;
  cancel(): void;
}

/**
 * The in-game announcer's spoken lines, skipped while the commentary
 * track is on air (the casters call these moments themselves). Two
 * homes: `voice/announcer/ann.*` (scores, flag events, game over) and —
 * despite the fx path — `fx/misc/hunters_*`, which is the announcer
 * VOICE counting down ("Thirty seconds!"): stock defaultGame.cs wires
 * `hunters_%1.wav` for both the match-start and match-end counts.
 * Torque paths are case-insensitive, so compare lowercased.
 */
function isAnnouncerSound(soundPath: string): boolean {
  const path = soundPath.toLowerCase();
  return (
    path.startsWith("voice/announcer/") || path.startsWith("fx/misc/hunters_")
  );
}

/**
 * Plays non-positional sound effects for chat messages with ~w sound tags.
 * `processMessages` plays whatever the current snapshot holds that hasn't
 * played yet; `reset` stops and forgets everything.
 *
 * While the CastGenius commentary track is on air, the in-game
 * announcer is suppressed entirely (the booth makes those calls);
 * everything else rides the global master-volume duck.
 */
export function createChatSoundPlayer() {
  const { audioLoader, audioListener } = getAudioGraph();
  // IDs are deterministic across reconstruction; dedupe within each traversal
  // so rewinding allows the same voice bind to play when reached again.
  const played = new Set<number>();
  let traversal = {
    recording: engineStore.getState().playback.recording,
    seekNonce: engineStore.getState().playback.seekNonce,
  };
  // Track active voice chat sound per sender so a new voice bind from the
  // same player stops their previous one (matching Tribes 2 behavior).
  const activeBySender = new Map<string, Audio<GainNode>>();
  // Own chat sounds and pending loads through natural EOF. Manual transport
  // changes still silence them via the shared audio device.
  const liveSounds = new Set<Audio<GainNode>>();
  const pendingLoads = new Map<symbol, PendingChatSound>();
  let processedMessages: StreamSnapshot["chatMessages"] | null = null;

  const reset = () => {
    for (const load of pendingLoads.values()) load.cancel();
    played.clear();
    for (const sound of liveSounds) stopAndDetachSound(sound);
    liveSounds.clear();
    activeBySender.clear();
  };

  const processMessages = () => {
    const playback = engineStore.getState().playback;
    const { recording } = playback;
    const { audioEnabled } = settingsStore.getState();
    const stopSound = (sound: Audio<GainNode>, sender: string) => {
      stopAndDetachSound(sound);
      liveSounds.delete(sound);
      if (sender && activeBySender.get(sender) === sound) {
        activeBySender.delete(sender);
      }
    };
    if (
      traversal.recording !== recording ||
      traversal.seekNonce !== playback.seekNonce
    ) {
      for (const sound of liveSounds) stopAndDetachSound(sound);
      liveSounds.clear();
      activeBySender.clear();
      for (const load of pendingLoads.values()) load.cancel();
      played.clear();
      traversal = { recording, seekNonce: playback.seekNonce };
    }
    const snapshot = streamSnapshotStore.getState().snapshot;
    const currentMessages = snapshot?.chatMessages ?? null;
    const finish = () => {
      const current = engineStore.getState().playback;
      if (
        current.recording === recording &&
        current.seekNonce === playback.seekNonce &&
        current.status === "ending" &&
        processedMessages ===
          (streamSnapshotStore.getState().snapshot?.chatMessages ?? null) &&
        pendingLoads.size === 0 &&
        !Array.from(liveSounds).some((sound) => sound.isPlaying)
      ) {
        engineStore.getState().setPlaybackStatus("paused");
      }
    };
    // A final buffer may finish before the final snapshot is processed.
    // Don't close the audio tail until that entire batch has been handled.
    processedMessages = null;
    if (!audioEnabled || !currentMessages?.length || !snapshot) {
      processedMessages = currentMessages;
      finish();
      return;
    }
    const { timeSec } = snapshot;
    for (const msg of currentMessages) {
      if (played.has(msg.id)) continue;
      played.add(msg.id);
      if (!msg.soundPath) continue;
      if (playback.status !== "playing" && playback.status !== "ending")
        continue;
      // A seek restores chat history without replaying nearby old lines.
      if (
        recording?.source === "demo" &&
        playback.seekTime > 0 &&
        streamTimeToTick(msg.timeSec) <= streamTimeToTick(playback.seekTime)
      )
        continue;
      const ageSec = Math.abs(timeSec - msg.timeSec);
      if (ageSec > MAX_CHAT_SOUND_AGE_SEC) continue;
      const onAir = commentaryPlayback.active;
      if (onAir && isAnnouncerSound(msg.soundPath)) continue;
      const request = Symbol();
      let loadTimeout: ReturnType<typeof setTimeout> | undefined;
      let loadDeadlineMs: number | undefined;
      const cancel = () => {
        clearTimeout(loadTimeout);
        pendingLoads.delete(request);
      };
      const settle = () => {
        cancel();
        finish();
      };
      try {
        const url = audioToUrl(msg.soundPath);
        const pitch = msg.soundPitch ?? 1;
        const sender = msg.sender;
        const gen = getSoundGeneration();
        const seekNonce = playback.seekNonce;
        // A slow older voice bind must not interrupt this player's newer one.
        if (sender) {
          for (const load of pendingLoads.values()) {
            if (load.sender === sender) load.cancel();
          }
        }
        pendingLoads.set(request, { sender, cancel });
        getCachedAudioBuffer(
          url,
          audioLoader,
          (buffer) => {
            if (!pendingLoads.has(request)) return;
            try {
              const currentPlayback = engineStore.getState().playback;
              if (
                gen !== getSoundGeneration() ||
                currentPlayback.recording !== recording ||
                currentPlayback.seekNonce !== seekNonce ||
                (currentPlayback.status !== "playing" &&
                  currentPlayback.status !== "ending") ||
                (loadDeadlineMs != null &&
                  performance.now() > loadDeadlineMs) ||
                Math.abs(streamClock.time - msg.timeSec) >
                  MAX_CHAT_SOUND_AGE_SEC
              )
                return;
              // A suspended context queues the beep instead of playing it —
              // it would join the pile-up on the first user gesture. Skip.
              if (!audioContextRunning(audioListener)) return;
              // Stop the sender's previous voice chat sound.
              if (sender) {
                const prev = activeBySender.get(sender);
                if (prev) stopSound(prev, sender);
              }
              // A global stop (seek, recording change) nulls three's onended,
              // so those sounds never announce themselves as finished — sweep
              // them here rather than holding dead nodes for the session.
              for (const done of liveSounds) {
                if (!done.isPlaying) liveSounds.delete(done);
              }
              const sound = audioListener.createChatSound();
              sound.setBuffer(buffer);
              // On-air ducking is global now (AudioContext's master duck):
              // chat routes through the listener, so a per-sound duck here
              // would stack to a double discount.
              sound.setPlaybackRate(getEffectiveSoundRate(pitch));
              trackSound(sound, pitch);
              liveSounds.add(sound);
              if (sender) {
                activeBySender.set(sender, sound);
              }
              // Chain (not replace) three's onEnded so isPlaying bookkeeping
              // stays correct.
              const baseOnEnded = sound.onEnded.bind(sound);
              sound.onEnded = () => {
                baseOnEnded();
                stopSound(sound, sender);
                finish();
              };
              try {
                sound.play();
              } catch (error) {
                stopSound(sound, sender);
                throw error;
              }
            } finally {
              settle();
            }
          },
          settle,
        );
        // The demo clock stops at EOF. Bound uncached loads in real time too,
        // without cutting off sounds that have already started playing.
        if (pendingLoads.has(request)) {
          const waitMs = (MAX_CHAT_SOUND_AGE_SEC - ageSec) * 1000;
          loadDeadlineMs = performance.now() + waitMs;
          loadTimeout = setTimeout(settle, waitMs);
        }
      } catch {
        settle();
        // File not in manifest — skip silently.
      }
    }
    processedMessages = currentMessages;
    finish();
  };

  return { processMessages, reset };
}

/** Chat sounds as each snapshot publishes its messages. */
export function installChatSounds(): () => void {
  const { processMessages, reset } = createChatSoundPlayer();
  return combineCleanups(
    // A new recording or an audio toggle starts over.
    reaction(
      engineStore,
      (state) => state.playback.recording,
      () => {
        processMessages();
        return reset;
      },
    ),
    reaction(
      settingsStore,
      (state) => state.audioEnabled,
      () => {
        processMessages();
        return reset;
      },
    ),
    reaction(
      streamSnapshotStore,
      (state) => state.snapshot?.chatMessages,
      processMessages,
    ),
    // At natural EOF, playback pauses once the last chat sounds finish.
    reaction(
      engineStore,
      (state) => state.playback.status === "ending",
      processMessages,
    ),
  );
}
