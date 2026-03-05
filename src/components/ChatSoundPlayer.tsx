import { useEffect, useRef } from "react";
import { Audio } from "three";
import { audioToUrl } from "../loaders";
import { useAudio } from "./AudioContext";
import { getCachedAudioBuffer, trackDemoSound, untrackDemoSound } from "./AudioEmitter";
import { useSettings } from "./SettingsProvider";
import { engineStore, useEngineSelector } from "../state";
import type { DemoChatMessage } from "../demo/types";

/**
 * Plays non-positional sound effects for chat messages with ~w sound tags.
 * Must be rendered inside the Canvas tree (within AudioProvider).
 */
export function ChatSoundPlayer() {
  const { audioLoader, audioListener } = useAudio();
  const settings = useSettings();
  const audioEnabled = settings?.audioEnabled ?? false;
  const messages = useEngineSelector(
    (state) => state.playback.streamSnapshot?.chatMessages,
  );
  const timeSec = useEngineSelector(
    (state) => state.playback.streamSnapshot?.timeSec,
  );
  const playedSetRef = useRef(new WeakSet<DemoChatMessage>());
  // Track active voice chat sound per sender so a new voice bind from the
  // same player stops their previous one (matching Tribes 2 behavior).
  const activeBySenderRef = useRef(
    new Map<string, Audio<GainNode>>(),
  );

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
        const rate = engineStore.getState().playback.rate;
        const sender = msg.sender;
        getCachedAudioBuffer(url, audioLoader, (buffer) => {
          // Stop the sender's previous voice chat sound.
          if (sender) {
            const prev = activeBySender.get(sender);
            if (prev) {
              try { prev.stop(); } catch {}
              untrackDemoSound(prev);
              prev.disconnect();
              activeBySender.delete(sender);
            }
          }
          const sound = new Audio(audioListener);
          sound.setBuffer(buffer);
          sound.setPlaybackRate(pitch * rate);
          trackDemoSound(sound, pitch);
          if (sender) {
            activeBySender.set(sender, sound);
          }
          sound.play();
          // Clean up the source node once playback finishes.
          sound.source!.onended = () => {
            untrackDemoSound(sound);
            sound.disconnect();
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
