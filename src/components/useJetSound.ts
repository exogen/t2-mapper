import { useCallback, useEffect, useRef } from "react";
import type { Object3D, PositionalAudio } from "three";
import { useAudio } from "./AudioContext";
import { useSettings } from "./SettingsProvider";
import {
  createPositionalAudio,
  getCachedAudioBuffer,
  getEffectiveSoundRate,
  resolveAudioProfile,
  stopAndDetachSound,
  trackSound,
  untrackSound,
  type ResolvedAudioProfile,
} from "./AudioEmitter";
import { audioToUrl } from "../loaders";
import { engineStore } from "../state/engineStore";

/**
 * A looping jet sound the client plays itself rather than through the
 * networked sound slots (Player::updateJet and FlyingVehicle::updateJet
 * call alxPlay3d directly while jetting). The returned function is called
 * every frame with whether the jets are on; the profile is resolved once
 * from `profileId` and the sound attached to `parent`.
 */
export function useJetSound(
  parent: Object3D,
  profileId: number | null | undefined,
): (jetting: boolean) => void {
  const { audioLoader, audioListener } = useAudio();
  const { audioEnabled } = useSettings();
  const soundRef = useRef<PositionalAudio | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const profileRef = useRef<ResolvedAudioProfile | null>(null);

  useEffect(() => {
    bufferRef.current = null;
    profileRef.current = null;
    if (!audioLoader || profileId == null) return;
    const sp = engineStore.getState().playback.recording?.streamingPlayback;
    if (!sp) return;
    const resolved = resolveAudioProfile(
      profileId,
      sp.getDataBlockData.bind(sp),
    );
    if (!resolved) return;
    profileRef.current = resolved;
    try {
      getCachedAudioBuffer(
        audioToUrl(resolved.filename),
        audioLoader,
        (buffer) => {
          bufferRef.current = buffer;
        },
      );
    } catch {
      // File not in manifest.
    }
  }, [audioLoader, profileId]);

  useEffect(() => {
    return () => {
      const sound = soundRef.current;
      if (sound) {
        stopAndDetachSound(sound);
        soundRef.current = null;
      }
    };
  }, [parent]);

  return useCallback(
    (jetting: boolean) => {
      const sound = soundRef.current;
      const playing = sound?.isPlaying ?? false;
      if (jetting && !playing) {
        const profile = profileRef.current;
        const buffer = bufferRef.current;
        if (!audioEnabled || !audioListener || !buffer || !profile) return;
        let next = sound;
        if (!next) {
          next = createPositionalAudio(audioListener, profile);
          parent.add(next);
          soundRef.current = next;
        }
        try {
          next.setBuffer(buffer);
          next.setLoop(true);
          next.setPlaybackRate(getEffectiveSoundRate());
          next.play();
          trackSound(next, 1);
        } catch {
          /* AudioContext suspended */
        }
      } else if (playing && sound && (!jetting || !audioEnabled)) {
        // Also stop when audio is turned off mid-thrust — the start branch
        // is gated on audioEnabled, but an already-running loop isn't.
        untrackSound(sound);
        try {
          sound.stop();
        } catch {
          /* already stopped */
        }
      }
    },
    [audioEnabled, audioListener, parent],
  );
}
