import { useEffect, useRef } from "react";
import { Audio } from "three";
import { audioToUrl } from "../loaders";
import { useAudio } from "./AudioContext";
import {
  getCachedAudioBuffer,
  getEffectiveSoundRate,
  getSoundGeneration,
  trackSound,
  untrackSound,
} from "./AudioEmitter";
import { useSettings } from "./SettingsProvider";
import { useEngineSelector } from "../state/engineStore";
import type { ChatMessage } from "../stream/types";

/**
 * Plays non-positional sound effects for chat messages with ~w sound tags.
 * Must be rendered inside the Canvas tree (within AudioProvider).
 */
export function ChatSoundPlayer() {
  const { audioLoader, audioListener } = useAudio();
  const { audioEnabled } = useSettings();
  const messages = useEngineSelector(
    (state) => state.playback.streamSnapshot?.chatMessages,
  );
  const timeSec = useEngineSelector(
    (state) => state.playback.streamSnapshot?.timeSec,
  );
  const playedSetRef = useRef(new WeakSet<ChatMessage>());
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
    const played = playedSetRef.current;
    const activeBySender = activeBySenderRef.current;
    for (const msg of messages) {
      if (played.has(msg)) continue;
      played.add(msg);
      if (!msg.soundPath) continue;
      // Skip sounds that are too old (e.g. after seeking).
      if (Math.abs(timeSec - msg.timeSec) > 2) continue;
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
              try {
                prev.stop();
              } catch {
                /* already stopped */
              }
              untrackSound(prev);
              try {
                prev.disconnect();
              } catch {
                /* already disconnected */
              }
              activeBySender.delete(sender);
            }
          }
          const sound = new Audio(audioListener);
          sound.setBuffer(buffer);
          sound.setPlaybackRate(getEffectiveSoundRate(pitch));
          trackSound(sound, pitch);
          if (sender) {
            activeBySender.set(sender, sound);
          }
          sound.play();
          // Clean up the source node once playback finishes.
          (sound.source as AudioBufferSourceNode).onended = () => {
            untrackSound(sound);
            try {
              sound.disconnect();
            } catch {
              /* already disconnected */
            }
            if (sender && activeBySender.get(sender) === sound) {
              activeBySender.delete(sender);
            }
          };
        });
      } catch {
        // File not in manifest — skip silently.
      }
    }
  }, [audioEnabled, audioLoader, audioListener, messages, timeSec]);

  return null;
}
