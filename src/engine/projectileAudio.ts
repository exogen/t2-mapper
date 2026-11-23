import { Vector3, type Object3D, type PositionalAudio } from "three";
import { audioToUrl } from "../loaders";
import { torqueVecToThree } from "../scene/coordinates";
import { engineStore, type PlaybackSliceState } from "../state/engineStore";
import { settingsStore } from "../state/settingsStore";
import { streamClock } from "../state/streamPlaybackStore";
import type {
  StreamEntity,
  StreamSnapshot,
  StreamingPlayback,
} from "../stream/types";
import type { AudioSources } from "./audioGraph";
import { getEffectiveSoundRate } from "./audioPlaybackRate";
import type { ParticleSnapshotIndex } from "./particleSnapshot";
import {
  createPositionalAudio,
  getCachedAudioBuffer,
  getSoundGeneration,
  resolveAudioProfile,
  stopAndDetachSound,
  trackSound,
} from "./soundEffects";
import { reaction } from "./storeReaction";

const MAX_PROJECTILE_SOUNDS = 20;

type FlyingProjectile = StreamEntity & {
  dataBlockId: number;
  position: [number, number, number];
};

function flyingProjectile(
  entity: StreamEntity | undefined,
): entity is FlyingProjectile {
  return (
    entity?.type === "Projectile" &&
    entity.dataBlockId != null &&
    entity.hasExploded !== true &&
    entity.position != null
  );
}

interface ProjectileLoop {
  sound: PositionalAudio;
  dataBlockId: number;
  volume: number;
  maxDist: number;
  muted: boolean;
}

interface PendingLoop {
  dataBlockId: number;
  unsubscribe?: () => void;
}

function disposeLoop(sound: PositionalAudio): void {
  stopAndDetachSound(sound);
  sound.gain.disconnect();
}

export function createProjectileAudio(
  group: Object3D,
  playback: StreamingPlayback,
  snapshotRef: { readonly current: StreamSnapshot | null },
  { audioListener, audioLoader }: AudioSources,
) {
  const active = new Map<string, ProjectileLoop>();
  const pending = new Map<string, PendingLoop>();
  const soundUrls = new Map<string, string | null>();
  const getDataBlock = playback.getDataBlockData.bind(playback);
  const listenerPosition = new Vector3();
  const soundPosition = new Vector3();
  let scope = readScope(engineStore.getState().playback.seekNonce);

  function reset() {
    for (const request of pending.values()) request.unsubscribe?.();
    pending.clear();
    for (const { sound } of active.values()) disposeLoop(sound);
    active.clear();
  }

  const stopMuteReaction = reaction(
    settingsStore,
    (state) => state.audioEnabled,
    (enabled) => {
      if (!enabled) reset();
    },
  );

  function readScope(seekNonce: number) {
    return {
      seekNonce,
      soundGeneration: getSoundGeneration(),
      playbackRevision: playback.playbackRevision,
      worldGeneration: playback.worldGeneration,
    };
  }

  function scopeChanged(seekNonce: number) {
    return (
      scope.seekNonce !== seekNonce ||
      scope.soundGeneration !== getSoundGeneration() ||
      scope.playbackRevision !== playback.playbackRevision ||
      scope.worldGeneration !== playback.worldGeneration
    );
  }

  function resolveUrl(filename: string): string | null {
    let url = soundUrls.get(filename);
    if (url === undefined) {
      try {
        url = audioToUrl(filename);
      } catch {
        url = null;
      }
      soundUrls.set(filename, url);
    }
    return url;
  }

  function audibleSnapshot(transport: PlaybackSliceState) {
    const snapshot = snapshotRef.current;
    if (
      !snapshot ||
      snapshot.playbackRevision !== playback.playbackRevision ||
      transport.recording?.streamingPlayback !== playback ||
      streamClock.worldPaused ||
      !settingsStore.getState().audioEnabled
    )
      return null;
    return snapshot;
  }

  function requestLoop(
    { id, dataBlockId, position }: FlyingProjectile,
    index: ParticleSnapshotIndex,
  ) {
    const soundId = getDataBlock(dataBlockId)?.sound;
    if (typeof soundId !== "number") return;
    const profile = resolveAudioProfile(soundId, getDataBlock);
    if (!profile?.isLooping || !profile.is3D) return;
    torqueVecToThree(position, soundPosition);
    if (soundPosition.distanceTo(listenerPosition) > profile.maxDist) return;
    const url = resolveUrl(profile.filename);
    if (!url) return;

    const request: PendingLoop = { dataBlockId };
    pending.set(id, request);
    const settle = () => pending.get(id) === request && pending.delete(id);
    try {
      request.unsubscribe = getCachedAudioBuffer(
        url,
        audioLoader,
        (buffer) => {
          if (!settle()) return;
          const transport = engineStore.getState().playback;
          if (
            scopeChanged(transport.seekNonce) ||
            transport.status !== "playing" ||
            active.size >= MAX_PROJECTILE_SOUNDS
          )
            return;

          // A projectile can move, explode or leave the snapshot during decode.
          const snapshot = audibleSnapshot(transport);
          const current = snapshot ? index.getEntity(snapshot, id) : undefined;
          if (!flyingProjectile(current) || current.dataBlockId !== dataBlockId)
            return;
          torqueVecToThree(current.position, soundPosition);
          audioListener.getWorldPosition(listenerPosition);
          if (soundPosition.distanceTo(listenerPosition) > profile.maxDist)
            return;

          const sound = createPositionalAudio(audioListener, profile);
          sound.setBuffer(buffer);
          sound.setPlaybackRate(getEffectiveSoundRate());
          sound.setLoop(true);
          sound.position.copy(soundPosition);
          group.add(sound);
          try {
            sound.play();
          } catch {
            disposeLoop(sound);
            return;
          }
          trackSound(sound);
          active.set(id, {
            sound,
            dataBlockId,
            volume: profile.volume,
            maxDist: profile.maxDist,
            muted: false,
          });
        },
        settle,
      );
    } catch {
      settle();
    }
  }

  return {
    update(index: ParticleSnapshotIndex) {
      const { projectiles, entities } = index;
      const transport = engineStore.getState().playback;
      if (scopeChanged(transport.seekNonce)) {
        reset();
        scope = readScope(transport.seekNonce);
      }
      // Debrief freezes projectiles while voice and other one-shots continue.
      if (!audibleSnapshot(transport)) {
        reset();
        return;
      }
      if (transport.status !== "playing") return;

      for (const [id, request] of pending) {
        const entity = entities.get(id);
        if (
          !flyingProjectile(entity) ||
          entity.dataBlockId !== request.dataBlockId
        ) {
          pending.delete(id);
          request.unsubscribe?.();
        }
      }
      audioListener.getWorldPosition(listenerPosition);
      for (const [id, entry] of active) {
        const entity = entities.get(id);
        if (
          !entry.sound.isPlaying ||
          !flyingProjectile(entity) ||
          entity.dataBlockId !== entry.dataBlockId
        ) {
          active.delete(id);
          disposeLoop(entry.sound);
          continue;
        }
        const position = torqueVecToThree(
          entity.position,
          entry.sound.position,
        );
        // The inverse distance model alone never reaches zero gain.
        const muted = position.distanceTo(listenerPosition) > entry.maxDist;
        if (muted === entry.muted) continue;
        entry.muted = muted;
        entry.sound.setVolume(muted ? 0 : entry.volume);
      }
      for (const entity of projectiles) {
        if (active.size >= MAX_PROJECTILE_SOUNDS) break;
        if (
          flyingProjectile(entity) &&
          !active.has(entity.id) &&
          !pending.has(entity.id)
        )
          requestLoop(entity, index);
      }
    },
    reset,
    dispose() {
      stopMuteReaction();
      reset();
    },
  };
}
