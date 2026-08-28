import { useEffect, useRef } from "react";
import { Audio } from "three";
import { audioToUrl } from "../loaders";
import { useAudio } from "./AudioContext";
import {
  getCachedAudioBuffer,
  getEffectiveSoundRate,
  getSoundGeneration,
  trackSound,
  stopAndDetachSound,
} from "./AudioEmitter";
import { useSettings } from "./SettingsProvider";
import { commentaryPlayback } from "../state/streamPlaybackStore";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
import { useRecording } from "./usePlayback";

/** The in-game announcer's sounds ("30 seconds", "Storm scores"...). */
const ANNOUNCER_PREFIX = "voice/announcer/";
/** Voice binds play at half volume under the commentary track. */
const COMMENTARY_DUCK_VOLUME = 0.5;

/**
 * Plays non-positional sound effects for chat messages with ~w sound tags.
 * Must be rendered inside the Canvas tree (within AudioProvider).
 *
 * While the CastGenius commentary track is on air, the in-game
 * announcer is suppressed entirely (the booth makes those calls) and
 * player voice binds duck to half volume under the commentary.
 */
export function ChatSoundPlayer() {
  const { audioLoader, audioListener } = useAudio();
  const { audioEnabled } = useSettings();
  const messages = useStreamSnapshot((snap) => snap?.chatMessages);
  const timeSec = useStreamSnapshot((snap) => snap?.timeSec);
  // Dedupe by message id, which is deterministic across seeks (a backward
  // seek replays the demo from the start with the counter reset, assigning
  // the same ids to the same messages) — object identity is NOT: the replay
  // rebuilds message objects, so a WeakSet would re-fire every voice bind
  // near the seek target. Ids restart per recording, so reset on change.
  const playedIdsRef = useRef(new Set<number>());
  const recording = useRecording();
  useEffect(() => {
    playedIdsRef.current.clear();
  }, [recording]);
  // Track active voice chat sound per sender so a new voice bind from the
  // same player stops their previous one (matching Tribes 2 behavior).
  const activeBySenderRef = useRef(new Map<string, Audio<GainNode>>());

  useEffect(() => {
    if (
      !audioEnabled ||
      !audioLoader ||
      !audioListener ||
      !messages?.length ||
      timeSec == null
    ) {
      return;
    }
    const played = playedIdsRef.current;
    const activeBySender = activeBySenderRef.current;
    for (const msg of messages) {
      if (played.has(msg.id)) continue;
      played.add(msg.id);
      if (!msg.soundPath) continue;
      // Skip sounds that are too old (e.g. after seeking).
      if (Math.abs(timeSec - msg.timeSec) > 2) continue;
      const onAir = commentaryPlayback.active;
      if (onAir && msg.soundPath.startsWith(ANNOUNCER_PREFIX)) continue;
      try {
        const url = audioToUrl(msg.soundPath);
        const pitch = msg.soundPitch ?? 1;
        const sender = msg.sender;
        const gen = getSoundGeneration();
        getCachedAudioBuffer(url, audioLoader, (buffer) => {
          if (gen !== getSoundGeneration()) return;
          // Stop the sender's previous voice chat sound.
          if (sender) {
            const prev = activeBySender.get(sender);
            if (prev) {
              stopAndDetachSound(prev);
              activeBySender.delete(sender);
            }
          }
          const sound = new Audio(audioListener);
          sound.setBuffer(buffer);
          if (onAir) sound.setVolume(COMMENTARY_DUCK_VOLUME);
          sound.setPlaybackRate(getEffectiveSoundRate(pitch));
          trackSound(sound, pitch);
          if (sender) {
            activeBySender.set(sender, sound);
          }
          // Chain (not replace) three's onEnded so isPlaying bookkeeping
          // stays correct.
          const baseOnEnded = sound.onEnded.bind(sound);
          sound.onEnded = () => {
            baseOnEnded();
            stopAndDetachSound(sound);
            if (sender && activeBySender.get(sender) === sound) {
              activeBySender.delete(sender);
            }
          };
          sound.play();
        });
      } catch {
        // File not in manifest — skip silently.
      }
    }
  }, [audioEnabled, audioLoader, audioListener, messages, timeSec]);

  return null;
}
