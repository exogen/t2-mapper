import { useEffect, useRef } from "react";
import type { Audio } from "three";
import { audioToUrl } from "../loaders";
import { useAudio } from "./AudioContext";
import {
  audioContextRunning,
  getCachedAudioBuffer,
  getEffectiveSoundRate,
  getSoundGeneration,
  trackSound,
  stopAndDetachSound,
} from "./AudioEmitter";
import { useSettings } from "./SettingsProvider";
import { commentaryPlayback, streamClock } from "../state/streamPlaybackStore";
import { engineStore, useEngineSelector } from "../state/engineStore";
import {
  streamSnapshotStore,
  useStreamSnapshot,
} from "../state/streamSnapshotStore";
import { useRecording } from "./usePlayback";
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
 * Must be rendered inside the Canvas tree (within AudioProvider).
 *
 * While the CastGenius commentary track is on air, the in-game
 * announcer is suppressed entirely (the booth makes those calls);
 * everything else rides the global master-volume duck.
 */
export function ChatSoundPlayer() {
  const { audioLoader, audioListener } = useAudio();
  const { audioEnabled } = useSettings();
  const messages = useStreamSnapshot((snap) => snap?.chatMessages);
  const ending = useEngineSelector(
    (state) => state.playback.status === "ending",
  );
  // IDs are deterministic across reconstruction; dedupe within each traversal
  // so rewinding allows the same voice bind to play when reached again.
  const playedIdsRef = useRef(new Set<number>());
  const recording = useRecording();
  const traversalRef = useRef({
    recording,
    seekNonce: engineStore.getState().playback.seekNonce,
  });
  // Track active voice chat sound per sender so a new voice bind from the
  // same player stops their previous one (matching Tribes 2 behavior).
  const activeBySenderRef = useRef(new Map<string, Audio<GainNode>>());
  // Own chat sounds and pending loads through natural EOF. Manual transport
  // changes still silence them via the shared audio device.
  const liveSoundsRef = useRef(new Set<Audio<GainNode>>());
  const pendingLoadsRef = useRef(new Map<symbol, PendingChatSound>());
  const processedMessagesRef = useRef<StreamSnapshot["chatMessages"] | null>(
    null,
  );

  useEffect(() => {
    const live = liveSoundsRef.current;
    const activeBySender = activeBySenderRef.current;
    const pending = pendingLoadsRef.current;
    const played = playedIdsRef.current;
    return () => {
      for (const load of pending.values()) load.cancel();
      played.clear();
      for (const sound of live) stopAndDetachSound(sound);
      live.clear();
      activeBySender.clear();
    };
  }, [audioEnabled, audioListener, recording]);

  useEffect(() => {
    // Clock subscriptions issue urgent updates in the scene's React root,
    // interrupting Suspense retries. Only messages and EOF need React work.
    const playback = engineStore.getState().playback;
    if (playback.recording !== recording) return;
    const played = playedIdsRef.current;
    const activeBySender = activeBySenderRef.current;
    const pendingLoads = pendingLoadsRef.current;
    const stopSound = (sound: Audio<GainNode>, sender: string) => {
      stopAndDetachSound(sound);
      liveSoundsRef.current.delete(sound);
      if (sender && activeBySender.get(sender) === sound) {
        activeBySender.delete(sender);
      }
    };
    if (
      traversalRef.current.recording !== recording ||
      traversalRef.current.seekNonce !== playback.seekNonce
    ) {
      for (const sound of liveSoundsRef.current) stopAndDetachSound(sound);
      liveSoundsRef.current.clear();
      activeBySender.clear();
      for (const load of pendingLoads.values()) load.cancel();
      played.clear();
      traversalRef.current = { recording, seekNonce: playback.seekNonce };
    }
    const snapshot = streamSnapshotStore.getState().snapshot;
    const currentMessages = snapshot?.chatMessages ?? null;
    const finish = () => {
      const current = engineStore.getState().playback;
      if (
        current.recording === recording &&
        current.seekNonce === playback.seekNonce &&
        current.status === "ending" &&
        processedMessagesRef.current ===
          (streamSnapshotStore.getState().snapshot?.chatMessages ?? null) &&
        pendingLoads.size === 0 &&
        !Array.from(liveSoundsRef.current).some((sound) => sound.isPlaying)
      ) {
        engineStore.getState().setPlaybackStatus("paused");
      }
    };
    // A final buffer may finish before React processes the final snapshot.
    // Don't close the audio tail until that entire batch has been handled.
    processedMessagesRef.current = null;
    if (!audioEnabled || !currentMessages?.length || !snapshot) {
      processedMessagesRef.current = currentMessages;
      finish();
      return;
    }
    if (!audioLoader || !audioListener) return;
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
              for (const done of liveSoundsRef.current) {
                if (!done.isPlaying) liveSoundsRef.current.delete(done);
              }
              const sound = audioListener.createChatSound();
              sound.setBuffer(buffer);
              // On-air ducking is global now (AudioContext's master duck):
              // chat routes through the listener, so a per-sound duck here
              // would stack to a double discount.
              sound.setPlaybackRate(getEffectiveSoundRate(pitch));
              trackSound(sound, pitch);
              liveSoundsRef.current.add(sound);
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
    processedMessagesRef.current = currentMessages;
    finish();
  }, [audioEnabled, audioLoader, audioListener, messages, recording, ending]);

  return null;
}
