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
  createPositionalAudio,
  getSoundGeneration,
  stopAndDetachSound,
  trackSound,
  type ResolvedAudioProfile,
} from "./AudioEmitter";
import { getEffectiveSoundRate } from "./audioPlaybackRate";
import { audioToUrl } from "../loaders";
import { engineStore } from "../state/engineStore";
import { useSettings } from "./SettingsProvider";

const MAX_SOUND_SLOTS = 4;

/** Per-frame scratch for slot lookup, shared across all entities. */
const _slotByIndexScratch: Array<
  { index: number; playing: boolean; profileId?: number } | undefined
> = new Array(MAX_SOUND_SLOTS).fill(undefined);

interface SlotState {
  profileId: number;
  sound: PositionalAudio;
  profile: ResolvedAudioProfile;
  /** Sound generation at play time. A bumped global generation means the
   *  sound was stopped externally (seek / recording change), as opposed to
   *  a non-looping profile simply finishing. */
  gen: number;
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
        if (slot) stopAndDetachSound(slot.sound);
      }
      slotsRef.current = Array.from({ length: MAX_SOUND_SLOTS }, () => null);
    };
  }, []);

  // Turning audio off must silence loops that are already playing — the
  // per-frame loop below early-returns while disabled, so it can't.
  useEffect(() => {
    if (audioEnabled) return;
    const slots = slotsRef.current;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot) {
        stopAndDetachSound(slot.sound);
        slots[i] = null;
      }
    }
  }, [audioEnabled]);

  useFrame(() => {
    if (!audioEnabled || !audioListener || !audioLoader || !parentObject)
      return;

    const entity = streamEntityRef.current;
    const soundSlots = entity?.soundSlots;
    const slots = slotsRef.current;
    const playback = engineStore.getState().playback;
    const isPlaying = playback.status === "playing";

    // Build index for O(1) slot lookup (avoids find() per slot per frame).
    // Module-scope scratch, cleared each use — this hook runs per entity
    // per frame, so a fresh array here would be constant GC churn.
    const slotByIndex = _slotByIndexScratch;
    slotByIndex.fill(undefined);
    if (soundSlots) {
      for (const s of soundSlots) slotByIndex[s.index] = s;
    }

    for (let i = 0; i < MAX_SOUND_SLOTS; i++) {
      const slotData = slotByIndex[i];
      const shouldPlay = !!slotData?.playing && slotData.profileId != null;
      const profileId = slotData?.profileId ?? -1;
      const current = slots[i];

      if (shouldPlay && isPlaying) {
        if (current && current.profileId === profileId) {
          // Already playing the right sound — nothing to do.
          if (current.sound.isPlaying) continue;
          if (current.gen === getSoundGeneration()) {
            // Non-looping profile finished naturally. The ghost latches
            // `playing` until the server clears it, so don't restart —
            // that would loop a one-shot.
            continue;
          }
          // Stopped externally (seek / recording change) — clear the slot
          // so the still-latched ghost state can restart the sound.
          stopAndDetachSound(current.sound);
          slots[i] = null;
        }

        // Stop old sound if profile changed.
        if (current && current.profileId !== profileId) {
          stopAndDetachSound(current.sound);
          slots[i] = null;
        }

        // Resolve profile and buffer (may be cached).
        const cached = profileCacheRef.current.get(profileId);
        if (cached) {
          // Have profile + buffer — start playing.
          if (!slots[i]) {
            const sound = createPositionalAudio(audioListener, cached.profile);
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
            slots[i] = {
              profileId,
              sound,
              profile: cached.profile,
              gen: getSoundGeneration(),
            };
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
          stopAndDetachSound(current.sound);
          slots[i] = null;
        }
      }
    }
  });
}
