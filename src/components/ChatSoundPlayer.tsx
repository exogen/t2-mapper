import { useEffect, useRef } from "react";
import { Audio } from "three";
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
import { commentaryPlayback } from "../state/streamPlaybackStore";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
import { useRecording } from "./usePlayback";

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
  // Every sound still in flight, sender or not. Turning audio off unmounts
  // this component, and a half-finished announcer line has to stop with
  // it — nothing else owns these (they aren't parented to an entity, and
  // stopAllTrackedSounds only runs on recording changes and seeks).
  const liveSoundsRef = useRef(new Set<Audio<GainNode>>());

  useEffect(() => {
    const live = liveSoundsRef.current;
    const activeBySender = activeBySenderRef.current;
    return () => {
      for (const sound of live) stopAndDetachSound(sound);
      live.clear();
      activeBySender.clear();
    };
  }, []);

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
      if (onAir && isAnnouncerSound(msg.soundPath)) continue;
      try {
        const url = audioToUrl(msg.soundPath);
        const pitch = msg.soundPitch ?? 1;
        const sender = msg.sender;
        const gen = getSoundGeneration();
        getCachedAudioBuffer(url, audioLoader, (buffer) => {
          if (gen !== getSoundGeneration()) return;
          // A suspended context queues the beep instead of playing it —
          // it would join the pile-up on the first user gesture. Skip.
          if (!audioContextRunning(audioListener)) return;
          // Stop the sender's previous voice chat sound.
          if (sender) {
            const prev = activeBySender.get(sender);
            if (prev) {
              stopAndDetachSound(prev);
              liveSoundsRef.current.delete(prev);
              activeBySender.delete(sender);
            }
          }
          // A global stop (seek, recording change) nulls three's onended,
          // so those sounds never announce themselves as finished — sweep
          // them here rather than holding dead nodes for the session.
          for (const done of liveSoundsRef.current) {
            if (!done.isPlaying) liveSoundsRef.current.delete(done);
          }
          const sound = new Audio(audioListener);
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
            stopAndDetachSound(sound);
            liveSoundsRef.current.delete(sound);
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
