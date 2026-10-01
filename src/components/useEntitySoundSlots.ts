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
  audioContextRunning,
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
import { streamClock } from "../state/streamPlaybackStore";
import type { SoundSlot, StreamEntity } from "../stream/types";
import { streamTimeToTick } from "../stream/streamHelpers";

const MAX_SOUND_SLOTS = 4;
const MAX_ONE_SHOT_AGE_SEC = 2;

/** Per-frame scratch for slot lookup, shared across all entities. */
const _slotByIndexScratch: Array<SoundSlot | undefined> = new Array(
  MAX_SOUND_SLOTS,
).fill(undefined);

interface SlotState {
  sound: PositionalAudio | null;
  profileId: number;
  revision: number;
  /** Remember consumption separately from the lifetime of the audio node. */
  handled: boolean;
  isLooping?: boolean;
  gen: number;
}

interface ProfileBuffer {
  profile: ResolvedAudioProfile;
  buffer: AudioBuffer | null;
  loading: boolean;
}

function stopSlotSound(slot: SlotState | null): void {
  if (!slot?.sound) return;
  stopAndDetachSound(slot.sound);
  slot.sound = null;
}

/**
 * Manage up to 4 sound slots for a ShapeBase entity.
 * Reads soundSlots from the stream entity ref imperatively in useFrame.
 */
export function useEntitySoundSlots(
  streamEntityRef: React.RefObject<
    Pick<StreamEntity, "soundSlots"> | null | undefined
  >,
  parentObject: Object3D | null,
): void {
  const { audioLoader, audioListener } = useAudio();
  const { audioEnabled } = useSettings();
  const slotsRef = useRef<(SlotState | null)[]>(
    Array.from({ length: MAX_SOUND_SLOTS }, () => null),
  );
  const profileCacheRef = useRef(new Map<number, ProfileBuffer>());
  const streamRef = useRef(
    engineStore.getState().playback.recording?.streamingPlayback,
  );

  // A model or listener replacement also retires its audio nodes.
  useEffect(() => {
    return () => {
      for (const slot of slotsRef.current) stopSlotSound(slot);
    };
  }, [parentObject, audioListener]);

  // Turning audio off must silence loops that are already playing — the
  // frame callbacks may not run while the canvas is inactive.
  useEffect(() => {
    if (audioEnabled) return;
    for (const slot of slotsRef.current) {
      stopSlotSound(slot);
      if (slot) slot.handled = true;
    }
  }, [audioEnabled]);

  useFrame(() => {
    const entity = streamEntityRef.current;
    const soundSlots = entity?.soundSlots;
    const slots = slotsRef.current;
    const playback = engineStore.getState().playback;
    const stream = playback.recording?.streamingPlayback;
    const isPlaying = playback.status === "playing";
    const gen = getSoundGeneration();
    if (stream !== streamRef.current) {
      for (const slot of slots) stopSlotSound(slot);
      slots.fill(null);
      profileCacheRef.current = new Map();
      streamRef.current = stream;
    }

    // Reconstruction isn't a sequence of audible gameplay events.
    if (playback.status === "seeking") {
      for (const slot of slots) {
        stopSlotSound(slot);
        if (slot) slot.handled = true;
      }
      return;
    }

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
      let current = slots[i];
      if (!shouldPlay) {
        stopSlotSound(current);
        slots[i] = null;
        continue;
      }
      if (
        !current ||
        current.revision !== slotData!.revision ||
        current.profileId !== profileId
      ) {
        stopSlotSound(current);
        current = slots[i] = {
          sound: null,
          profileId,
          revision: slotData!.revision,
          handled: false,
          gen,
        };
      }
      if (current.gen !== gen || !audioEnabled || !isPlaying) {
        stopSlotSound(current);
        current.handled = true;
        current.gen = gen;
      }
      if (
        !audioEnabled ||
        !isPlaying ||
        !audioListener ||
        !audioLoader ||
        !parentObject
      )
        continue;
      if (current.sound) continue;
      if (current.handled && current.isLooping === false) continue;

      const cache = profileCacheRef.current;
      let cached = cache.get(profileId);
      if (!cached) {
        if (!stream) continue;
        const profile = resolveAudioProfile(
          profileId,
          stream.getDataBlockData.bind(stream),
        );
        if (!profile) continue;
        cached = { profile, buffer: null, loading: false };
        cache.set(profileId, cached);
      }
      const { profile } = cached;
      current.isLooping = profile.isLooping;
      if (!profile.isLooping) {
        // Latched state at a seek target (including a newly mounted model)
        // restores loops, but isn't another one-shot trigger.
        if (
          !audioContextRunning(audioListener) ||
          streamClock.time - slotData!.changedAtSec > MAX_ONE_SHOT_AGE_SEC ||
          (playback.recording?.source === "demo" &&
            playback.seekTime > 0 &&
            streamTimeToTick(slotData!.changedAtSec) <=
              streamTimeToTick(playback.seekTime))
        )
          current.handled = true;
        if (current.handled) continue;
      }
      if (!cached.buffer) {
        if (cached.loading) continue;
        cached.loading = true;
        const entry = cached;
        try {
          getCachedAudioBuffer(
            audioToUrl(profile.filename),
            audioLoader,
            (buffer) => {
              entry.buffer = buffer;
              entry.loading = false;
            },
            () => {
              cache.delete(profileId);
              if (!profile.isLooping) current.handled = true;
            },
          );
        } catch {
          // File not in manifest — don't retry it every frame.
        }
        continue;
      }

      const sound = createPositionalAudio(audioListener, profile);
      sound.setBuffer(cached.buffer);
      sound.setLoop(profile.isLooping);
      sound.setPlaybackRate(getEffectiveSoundRate());
      const baseOnEnded = sound.onEnded.bind(sound);
      sound.onEnded = () => {
        baseOnEnded();
        stopAndDetachSound(sound);
        if (current.sound === sound) current.sound = null;
      };
      parentObject.add(sound);
      current.sound = sound;
      current.handled = true;
      try {
        sound.play();
        trackSound(sound, 1);
      } catch {
        stopSlotSound(current);
      }
    }
  });
}
