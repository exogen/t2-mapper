/**
 * ShapeBase sound slots as PositionalAudio objects, matching Tribes 2's
 * architecture where sounds are OpenAL sources tracked internally by
 * ShapeBase, not separate entities.
 */

import type { Object3D, PositionalAudio } from "three";
import { getAudioGraph } from "./audioGraph";
import {
  audioContextRunning,
  resolveAudioProfile,
  getCachedAudioBuffer,
  createPositionalAudio,
  getSoundGeneration,
  stopAndDetachSound,
  trackSound,
  type ResolvedAudioProfile,
} from "./soundEffects";
import { getEffectiveSoundRate } from "./audioPlaybackRate";
import { audioToUrl } from "../loaders";
import { engineStore } from "../state/engineStore";
import { settingsStore } from "../state/settingsStore";
import { streamClock } from "../state/streamPlaybackStore";
import type { SoundSlot, StreamEntity } from "../stream/types";
import { streamTimeToTick } from "../stream/streamHelpers";
import { reaction } from "./storeReaction";

const MAX_SOUND_SLOTS = 4;
const MAX_ONE_SHOT_AGE_SEC = 2;

/** Per-frame scratch for slot lookup, shared across all entities. */
const _slotByIndexScratch: Array<SoundSlot | undefined> = new Array(
  MAX_SOUND_SLOTS,
).fill(undefined);

interface PendingSlotLoad {
  unsubscribe?: () => void;
}

interface SlotState {
  sound: PositionalAudio | null;
  pending?: PendingSlotLoad;
  profileId: number;
  revision: number;
  /** Remember consumption separately from the lifetime of the audio node. */
  handled: boolean;
  isLooping?: boolean;
  gen: number;
}

interface SlotProfile {
  profile: ResolvedAudioProfile;
  url: string;
}

function stopSlot(slot: SlotState | null): void {
  if (!slot) return;
  slot.pending?.unsubscribe?.();
  slot.pending = undefined;
  const sound = slot.sound;
  if (sound) {
    slot.sound = null;
    stopAndDetachSound(sound);
    sound.gain.disconnect();
  }
}

/**
 * Manage up to 4 sound slots for a ShapeBase entity, reading its live
 * `soundSlots` every frame. Sounds attach to `parentObject`.
 */
export function createEntitySoundSlots(
  read: () => Pick<StreamEntity, "soundSlots"> | null | undefined,
  parentObject: Object3D,
): { update(): void; dispose(): void } {
  const { audioLoader, audioListener } = getAudioGraph();
  const slots: (SlotState | null)[] = Array.from(
    { length: MAX_SOUND_SLOTS },
    () => null,
  );
  // Cache only datablock metadata per model. Idle slots do not own PCM.
  const profiles = new Map<number, SlotProfile | null>();
  let stream = engineStore.getState().playback.recording?.streamingPlayback;
  let streamRevision = stream?.playbackRevision;
  let disposed = false;

  // Turning audio off must silence loops that are already playing — the
  // frame callbacks may not run while the canvas is inactive.
  const stopAudioReaction = reaction(
    settingsStore,
    (state) => state.audioEnabled,
    (audioEnabled) => {
      if (audioEnabled) return;
      for (const slot of slots) {
        stopSlot(slot);
        if (slot) slot.handled = true;
      }
    },
  );

  type Transport = ReturnType<typeof engineStore.getState>["playback"];
  const suppressOneShot = (activation: SoundSlot, transport: Transport) =>
    !audioContextRunning(audioListener) ||
    streamClock.time - activation.changedAtSec > MAX_ONE_SHOT_AGE_SEC ||
    // A seek destination may contain latched state, even on a new model.
    (transport.recording?.source === "demo" &&
      transport.seekTime > 0 &&
      streamTimeToTick(activation.changedAtSec) <=
        streamTimeToTick(transport.seekTime));

  function startSlot(
    slot: SlotState,
    profile: ResolvedAudioProfile,
    buffer: AudioBuffer,
  ) {
    const sound = createPositionalAudio(audioListener, profile);
    sound.setBuffer(buffer);
    sound.setLoop(profile.isLooping);
    sound.setPlaybackRate(getEffectiveSoundRate());
    const baseOnEnded = sound.onEnded.bind(sound);
    sound.onEnded = () => {
      baseOnEnded();
      if (slot.sound === sound) stopSlot(slot);
    };
    parentObject.add(sound);
    slot.sound = sound;
    slot.handled = true;
    try {
      sound.play();
      trackSound(sound);
    } catch {
      stopSlot(slot);
    }
  }

  function loadSlot(
    index: number,
    slot: SlotState,
    { profile, url }: SlotProfile,
    transport: Transport,
  ): void {
    const { recording, seekNonce } = transport;
    const ownerStream = stream;
    const revision = streamRevision;
    const worldGeneration = ownerStream?.worldGeneration;
    const generation = slot.gen;
    const pending: PendingSlotLoad = {};
    slot.pending = pending;
    const settle = () => {
      if (slot.pending !== pending) return false;
      slot.pending = undefined;
      return true;
    };
    const onError = () => {
      if (settle() && !profile.isLooping) slot.handled = true;
    };
    try {
      const unsubscribe = getCachedAudioBuffer(
        url,
        audioLoader,
        (buffer) => {
          if (!settle() || disposed) return;
          const latest = engineStore.getState().playback;
          if (
            latest.recording !== recording ||
            latest.recording?.streamingPlayback !== ownerStream ||
            ownerStream?.playbackRevision !== revision ||
            ownerStream?.worldGeneration !== worldGeneration ||
            latest.seekNonce !== seekNonce ||
            latest.status !== "playing" ||
            getSoundGeneration() !== generation ||
            !settingsStore.getState().audioEnabled
          )
            return;
          const activation = read()?.soundSlots?.find((s) => s.index === index);
          if (
            !activation?.playing ||
            activation.profileId !== slot.profileId ||
            activation.revision !== slot.revision
          )
            return;
          if (!profile.isLooping && suppressOneShot(activation, latest)) {
            slot.handled = true;
            return;
          }
          startSlot(slot, profile, buffer);
        },
        onError,
      );
      if (slot.pending === pending) pending.unsubscribe = unsubscribe;
      else unsubscribe?.();
    } catch {
      onError();
    }
  }

  function update(): void {
    if (disposed) return;
    const soundSlots = read()?.soundSlots;
    const audioEnabled = settingsStore.getState().audioEnabled;
    const playback = engineStore.getState().playback;
    const nextStream = playback.recording?.streamingPlayback;
    const isPlaying = playback.status === "playing";
    const gen = getSoundGeneration();
    if (
      nextStream !== stream ||
      nextStream?.playbackRevision !== streamRevision
    ) {
      for (const slot of slots) stopSlot(slot);
      slots.fill(null);
      profiles.clear();
      stream = nextStream;
      streamRevision = stream?.playbackRevision;
    }

    // Reconstruction isn't a sequence of audible gameplay events.
    if (playback.status === "seeking") {
      for (const slot of slots) {
        stopSlot(slot);
        if (slot) slot.handled = true;
      }
      return;
    }

    // Module-scope scratch, cleared each use — this runs per entity per
    // frame, so a fresh array here would be constant GC churn.
    const slotByIndex = _slotByIndexScratch;
    slotByIndex.fill(undefined);
    if (soundSlots) {
      for (const s of soundSlots) slotByIndex[s.index] = s;
    }

    for (let i = 0; i < MAX_SOUND_SLOTS; i++) {
      const slotData = slotByIndex[i];
      const profileId = slotData?.profileId;
      let current = slots[i];
      if (!slotData?.playing || profileId == null) {
        stopSlot(current);
        slots[i] = null;
        continue;
      }
      if (
        !current ||
        current.revision !== slotData.revision ||
        current.profileId !== profileId
      ) {
        stopSlot(current);
        current = slots[i] = {
          sound: null,
          profileId,
          revision: slotData.revision,
          handled: false,
          gen,
        };
      }
      if (current.gen !== gen || !audioEnabled || !isPlaying) {
        stopSlot(current);
        current.handled = true;
        current.gen = gen;
      }
      if (!audioEnabled || !isPlaying) continue;
      if (current.sound || current.pending) continue;
      if (current.handled && current.isLooping === false) continue;

      let cached = profiles.get(profileId);
      if (cached === undefined) {
        if (!stream) continue;
        const profile = resolveAudioProfile(
          profileId,
          stream.getDataBlockData.bind(stream),
        );
        if (!profile) continue;
        try {
          cached = { profile, url: audioToUrl(profile.filename) };
        } catch {
          // File not in manifest — don't retry it every frame.
          cached = null;
        }
        profiles.set(profileId, cached);
      }
      if (!cached) continue;
      const { profile } = cached;
      current.isLooping = profile.isLooping;
      if (!profile.isLooping) {
        if (suppressOneShot(slotData, playback)) current.handled = true;
        if (current.handled) continue;
      }
      loadSlot(i, current, cached, playback);
    }
  }

  return {
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      stopAudioReaction();
      // A model or listener replacement also retires its audio nodes.
      for (const slot of slots) stopSlot(slot);
      slots.fill(null);
      profiles.clear();
    },
  };
}
