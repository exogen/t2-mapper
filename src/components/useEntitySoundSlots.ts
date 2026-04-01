/**
 * Hook that manages ShapeBase sound slots as PositionalAudio objects,
 * matching Tribes 2's architecture where sounds are OpenAL sources
 * tracked internally by ShapeBase, not separate entities.
 */

import { useEffect, useRef } from "react";
import { PositionalAudio } from "three";
import type { Object3D } from "three";
import { useFrame } from "@react-three/fiber";
import { useAudio } from "./AudioContext";
import {
  resolveAudioProfile,
  getCachedAudioBuffer,
  trackSound,
  untrackSound,
  type ResolvedAudioProfile,
} from "./AudioEmitter";
import { getEffectiveSoundRate } from "./audioPlaybackRate";
import { audioToUrl } from "../loaders";
import { engineStore } from "../state/engineStore";
import { useSettings } from "./SettingsProvider";

const MAX_SOUND_SLOTS = 4;

interface SlotState {
  profileId: number;
  sound: PositionalAudio;
  profile: ResolvedAudioProfile;
}

/**
 * Manage up to 4 sound slots for a ShapeBase entity.
 * Reads soundSlots from the stream entity ref imperatively in useFrame.
 */
export function useEntitySoundSlots(
  streamEntityRef: React.RefObject<
    | {
        soundSlots?: Array<{
          index: number;
          playing: boolean;
          profileId?: number;
        }>;
      }
    | null
    | undefined
  >,
  parentObject: Object3D | null,
): void {
  const { audioLoader, audioListener } = useAudio();
  const { audioEnabled } = useSettings();
  const slotsRef = useRef<(SlotState | null)[]>(
    Array.from({ length: MAX_SOUND_SLOTS }, () => null),
  );
  // Cache resolved profiles + buffers by profileId.
  const profileCacheRef = useRef(
    new Map<number, { profile: ResolvedAudioProfile; buffer: AudioBuffer }>(),
  );

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      for (const slot of slotsRef.current) {
        if (!slot) continue;
        untrackSound(slot.sound);
        try {
          slot.sound.stop();
        } catch {
          /* already stopped */
        }
        try {
          slot.sound.disconnect();
        } catch {
          /* already disconnected */
        }
        slot.sound.parent?.remove(slot.sound);
      }
      slotsRef.current = Array.from({ length: MAX_SOUND_SLOTS }, () => null);
    };
  }, []);

  useFrame(() => {
    if (!audioEnabled || !audioListener || !audioLoader || !parentObject)
      return;

    const entity = streamEntityRef.current;
    const soundSlots = entity?.soundSlots;
    const slots = slotsRef.current;
    const playback = engineStore.getState().playback;
    const isPlaying = playback.status === "playing";

    for (let i = 0; i < MAX_SOUND_SLOTS; i++) {
      // Find this slot's data from the ghost update.
      const slotData = soundSlots?.find((s) => s.index === i);
      const shouldPlay = !!slotData?.playing && slotData.profileId != null;
      const profileId = slotData?.profileId ?? -1;
      const current = slots[i];

      if (shouldPlay && isPlaying) {
        // Check if we need to start or change the sound.
        if (
          current &&
          current.profileId === profileId &&
          current.sound.isPlaying
        ) {
          // Already playing the right sound — nothing to do.
          continue;
        }

        // Stop old sound if profile changed.
        if (current && current.profileId !== profileId) {
          untrackSound(current.sound);
          try {
            current.sound.stop();
          } catch {
            /* already stopped */
          }
          current.sound.parent?.remove(current.sound);
          slots[i] = null;
        }

        // Resolve profile and buffer (may be cached).
        const cached = profileCacheRef.current.get(profileId);
        if (cached) {
          // Have profile + buffer — start playing.
          if (!slots[i]) {
            const sound = new PositionalAudio(audioListener);
            sound.setDistanceModel("inverse");
            sound.setRefDistance(cached.profile.refDist);
            sound.setMaxDistance(cached.profile.maxDist);
            sound.setRolloffFactor(1);
            sound.setVolume(cached.profile.volume);
            sound.setBuffer(cached.buffer);
            sound.setLoop(cached.profile.isLooping);
            sound.setPlaybackRate(getEffectiveSoundRate());
            parentObject.add(sound);
            try {
              sound.play();
              trackSound(sound, 1);
            } catch {
              /* AudioContext suspended */
            }
            slots[i] = { profileId, sound, profile: cached.profile };
          }
        } else {
          // Need to resolve — do it once, then it'll be picked up next frame.
          const sp = engineStore.getState().playback;
          const stream = sp.recording?.streamingPlayback;
          if (!stream) continue;
          const getDb = stream.getDataBlockData.bind(stream);
          const resolved = resolveAudioProfile(profileId, getDb);
          if (!resolved) continue;
          try {
            const url = audioToUrl(resolved.filename);
            getCachedAudioBuffer(url, audioLoader, (buffer) => {
              profileCacheRef.current.set(profileId, {
                profile: resolved,
                buffer,
              });
            });
          } catch {
            // File not in manifest.
          }
        }
      } else {
        // Should not be playing — stop if active.
        if (current) {
          untrackSound(current.sound);
          try {
            current.sound.stop();
          } catch {
            /* already stopped */
          }
          current.sound.parent?.remove(current.sound);
          slots[i] = null;
        }
      }
    }
  });
}
