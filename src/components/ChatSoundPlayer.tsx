import { useEffect, useRef } from "react";
import { Audio } from "three";
import { audioToUrl } from "../loaders";
import { useAudio } from "./AudioContext";
import { getCachedAudioBuffer } from "./AudioEmitter";
import { useSettings } from "./SettingsProvider";
import { useEngineSelector } from "../state";
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
  const playedCountRef = useRef(0);

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
    const startIdx = playedCountRef.current;
    for (let i = startIdx; i < messages.length; i++) {
      const msg: DemoChatMessage = messages[i];
      if (!msg.soundPath) continue;
      // Skip sounds that are too old (e.g. after seeking).
      if (Math.abs(timeSec - msg.timeSec) > 2) continue;
      try {
        const url = audioToUrl(msg.soundPath);
        const pitch = msg.soundPitch ?? 1;
        getCachedAudioBuffer(url, audioLoader, (buffer) => {
          const sound = new Audio(audioListener);
          sound.setBuffer(buffer);
          if (pitch !== 1) {
            sound.setPlaybackRate(pitch);
          }
          sound.play();
          // Clean up the source node once playback finishes.
          sound.source!.onended = () => {
            sound.disconnect();
          };
        });
      } catch {
        // File not in manifest — skip silently.
      }
    }
    playedCountRef.current = messages.length;
  }, [audioEnabled, audioLoader, audioListener, messages, timeSec]);

  return null;
}
