import { memo, useEffect, useEffectEvent, useRef, useState } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import {
  Audio,
  AudioListener,
  AudioLoader,
  Object3D,
  PositionalAudio,
  Vector3,
} from "three";
import { createLogger } from "../logger";
import { audioToUrl } from "../loaders";
import { useAudio } from "./AudioContext";
import { useDebug, useSettings } from "./SettingsProvider";
import { FloatingLabel } from "./FloatingLabel";
import { engineStore } from "../state/engineStore";
import { AudioEmitterEntity } from "../state/gameEntityTypes";

const log = createLogger("AudioEmitter");

// Global audio buffer cache shared across all audio components.
export const audioBufferCache = new Map<string, AudioBuffer>();

// Track active sounds so their playbackRate can be updated when the playback
// rate changes (e.g. slow-motion or fast-forward). Maps each sound to its
// intrinsic pitch (1.0 for normal, or the voice pitch multiplier for chat).
const _activeSounds = new Map<Audio<GainNode | PannerNode>, number>();

/** Register a sound for automatic playback rate tracking during streaming. */
export function trackSound(
  sound: Audio<GainNode | PannerNode>,
  basePitch = 1,
): void {
  _activeSounds.set(sound, basePitch);
}

/** Unregister a tracked sound. */
export function untrackSound(sound: Audio<GainNode | PannerNode>): void {
  _activeSounds.delete(sound);
}

/**
 * Generation counter incremented on each stopAllTrackedSounds() call.
 * Async sound callbacks check this to avoid playing after teardown.
 */
let _soundGeneration = 0;

/** Current sound generation — capture before async work, check on completion. */
export function getSoundGeneration(): number {
  return _soundGeneration;
}

/** Stop and unregister all tracked sounds. Called on recording change. */
export function stopAllTrackedSounds(): void {
  _soundGeneration++;
  for (const [sound] of _activeSounds) {
    try {
      sound.stop();
    } catch {
      /* already stopped */
    }
    try {
      sound.disconnect();
    } catch {
      /* already disconnected */
    }
  }
  _activeSounds.clear();
}

engineStore.subscribe(
  (state) => state.playback.rate,
  (rate) => {
    for (const [sound, basePitch] of _activeSounds) {
      try {
        sound.setPlaybackRate(basePitch * rate);
      } catch {
        // Sound may have been disposed.
      }
    }
  },
);

export interface ResolvedAudioProfile {
  filename: string;
  is3D: boolean;
  isLooping: boolean;
  refDist: number;
  maxDist: number;
  volume: number;
}

/**
 * Resolve an AudioProfile datablock ID to its playback parameters by following
 * the AudioProfile → AudioDescription chain.
 */
export function resolveAudioProfile(
  audioProfileId: number,
  getDb: (id: number) => Record<string, unknown> | undefined,
): ResolvedAudioProfile | null {
  const profileBlock = getDb(audioProfileId);
  const rawFilename = profileBlock?.filename as string | undefined;
  if (!rawFilename) return null;

  const filename = rawFilename.endsWith(".wav")
    ? rawFilename
    : `${rawFilename}.wav`;

  const descId = profileBlock.description as number | null;
  const descBlock = descId != null ? getDb(descId) : undefined;
  const is3D = (descBlock?.is3D as boolean) ?? true;
  const isLooping = (descBlock?.isLooping as boolean) ?? false;
  const refDist = (descBlock?.referenceDistance as number) ?? 20;
  const maxDist = (descBlock?.maxDistance as number) ?? 100;
  const volume = (descBlock?.volume as number) ?? 1;

  return { filename, is3D, isLooping, refDist, maxDist, volume };
}

/**
 * Play a one-shot sound effect. For 3D sounds, creates a PositionalAudio
 * attached to `parent` (at `position` if given, otherwise at the parent's
 * origin); for 2D, creates a non-positional Audio. Self-cleans on end.
 */
export function playOneShotSound(
  resolved: ResolvedAudioProfile,
  audioListener: AudioListener,
  audioLoader: AudioLoader,
  position?: Vector3,
  parent?: Object3D,
): void {
  let url: string;
  try {
    url = audioToUrl(resolved.filename);
  } catch {
    // File not in manifest — skip silently.
    return;
  }
  const rate = engineStore.getState().playback.rate;
  const gen = _soundGeneration;
  getCachedAudioBuffer(url, audioLoader, (buffer) => {
    if (gen !== _soundGeneration) return;
    try {
      if (resolved.is3D && parent) {
        const sound = new PositionalAudio(audioListener);
        sound.setBuffer(buffer);
        // Torque uses inverse distance: gain = refDist / distance,
        // hard cutoff at maxDistance. Web Audio's "inverse" model matches.
        sound.setDistanceModel("inverse");
        sound.setRefDistance(resolved.refDist);
        sound.setMaxDistance(resolved.maxDist);
        sound.setRolloffFactor(1);
        sound.setVolume(resolved.volume);
        sound.setPlaybackRate(rate);
        if (position) {
          sound.position.copy(position);
        }
        parent.add(sound);
        _activeSounds.set(sound, 1);
        sound.play();
        sound.source!.onended = () => {
          _activeSounds.delete(sound);
          try {
            sound.disconnect();
          } catch {
            /* already disconnected */
          }
          parent.remove(sound);
        };
      } else {
        const sound = new Audio(audioListener);
        sound.setBuffer(buffer);
        sound.setVolume(resolved.volume);
        sound.setPlaybackRate(rate);
        _activeSounds.set(sound, 1);
        sound.play();
        sound.source!.onended = () => {
          _activeSounds.delete(sound);
          try {
            sound.disconnect();
          } catch {
            /* already disconnected */
          }
        };
      }
    } catch {
      // Playback failure (e.g. suspended AudioContext) — skip silently.
    }
  });
}

export function getCachedAudioBuffer(
  audioUrl: string,
  audioLoader: AudioLoader,
  onLoad: (buffer: AudioBuffer) => void,
) {
  if (audioBufferCache.has(audioUrl)) {
    onLoad(audioBufferCache.get(audioUrl)!);
  } else {
    audioLoader.load(
      audioUrl,
      (buffer: AudioBuffer) => {
        audioBufferCache.set(audioUrl, buffer);
        onLoad(buffer);
      },
      undefined,
      (err: any) => {
        log.error("Audio load error %s: %o", audioUrl, err);
      },
    );
  }
}

export const AudioEmitter = memo(function AudioEmitter({
  entity,
}: {
  entity: AudioEmitterEntity;
}) {
  const { debugMode } = useDebug();
  const fileName = entity.audioFileName ?? "";
  const volume = entity.audioVolume ?? 1;
  const minDistance = entity.audioMinDistance ?? 1;
  const maxDistance = entity.audioMaxDistance ?? 1;
  const minLoopGap = entity.audioMinLoopGap ?? 0;
  const maxLoopGap = entity.audioMaxLoopGap ?? 0;
  const is3D = (entity.audioIs3D ?? true) ? 1 : 0;
  const isLooping = entity.audioIsLooping ?? true;

  const [x, y, z] = entity.position ?? [0, 0, 0];
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const { audioLoader, audioListener } = useAudio();
  const { audioEnabled } = useSettings();

  const soundRef = useRef<Audio<GainNode | PannerNode> | null>(null);
  const loopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loopGapIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoadedRef = useRef(false);
  const isInRangeRef = useRef(false);
  const emitterPosRef = useRef(new Vector3(x, y, z));
  // Generation counter: incremented when the sound object is recreated so
  // that stale setTimeout callbacks from a previous sound are discarded.
  const generationRef = useRef(0);

  const clearTimers = () => {
    if (loopTimerRef.current != null) {
      clearTimeout(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    if (loopGapIntervalRef.current != null) {
      clearTimeout(loopGapIntervalRef.current);
      loopGapIntervalRef.current = null;
    }
  };

  const [randomValue] = useState(() => Math.random());

  // Create sound object on mount.
  useEffect(() => {
    if (!audioLoader || !audioListener) return;

    generationRef.current++;

    let sound: Audio<GainNode | PannerNode>;
    if (is3D) {
      const positional = new PositionalAudio(audioListener);
      positional.position.copy(emitterPosRef.current);
      positional.setDistanceModel("inverse");
      positional.setRefDistance(minDistance);
      positional.setMaxDistance(maxDistance);
      positional.setRolloffFactor(1);
      positional.setVolume(volume);
      sound = positional;
      scene.add(sound);
    } else {
      sound = new Audio(audioListener);
      sound.setVolume(volume);
    }

    soundRef.current = sound;

    return () => {
      clearTimers();
      try {
        sound.stop();
      } catch {
        /* already stopped */
      }
      try {
        sound.disconnect();
      } catch {
        /* already disconnected */
      }
      if (is3D) scene.remove(sound);
      soundRef.current = null;
      isLoadedRef.current = false;
      isInRangeRef.current = false;
    };
  }, [
    audioLoader,
    audioListener,
    is3D,
    minDistance,
    maxDistance,
    volume,
    scene,
  ]);

  // Setup looping logic (only called from effects/timers, never during render).
  const setupLooping = (sound: Audio<GainNode | PannerNode>, gen: number) => {
    if (!isLooping) return;

    if (minLoopGap > 0 || maxLoopGap > 0) {
      const gapMin = Math.max(0, minLoopGap);
      const gapMax = Math.max(gapMin, maxLoopGap);
      const gap =
        gapMin === gapMax ? gapMin : randomValue * (gapMax - gapMin) + gapMin;

      sound.loop = false;

      const checkLoop = () => {
        // Discard callbacks from a previous sound generation.
        if (gen !== generationRef.current) return;
        if (sound.isPlaying === false) {
          loopTimerRef.current = setTimeout(() => {
            if (gen !== generationRef.current) return;
            try {
              sound.play();
              setupLooping(sound, gen);
            } catch {
              /* expected */
            }
          }, gap);
        } else {
          loopGapIntervalRef.current = setTimeout(checkLoop, 100);
        }
      };
      loopGapIntervalRef.current = setTimeout(checkLoop, 100);
    } else {
      sound.setLoop(true);
    }
  };

  // Load and play audio. For 3D, gated by proximity; for 2D, plays immediately.
  const loadAndPlay = useEffectEvent((sound: Audio<GainNode | PannerNode>) => {
    if (!audioLoader) return;
    const gen = generationRef.current;
    if (!isLoadedRef.current) {
      let audioUrl: string;
      try {
        audioUrl = audioToUrl(fileName);
      } catch {
        return;
      }
      getCachedAudioBuffer(audioUrl, audioLoader, (audioBuffer) => {
        if (gen !== generationRef.current) return;
        if (!sound.buffer) {
          sound.setBuffer(audioBuffer);
          isLoadedRef.current = true;
          try {
            sound.play();
            setupLooping(sound, gen);
          } catch {
            /* expected */
          }
        }
      });
    } else {
      try {
        if (!sound.isPlaying) {
          sound.play();
          setupLooping(sound, gen);
        }
      } catch {
        /* expected */
      }
    }
  });

  // 2D emitters: load and play on mount (no proximity gating).
  useEffect(() => {
    const sound = soundRef.current;
    if (!sound || is3D || !audioEnabled || !fileName) return;
    loadAndPlay(sound);
  }, [audioEnabled, is3D, fileName, audioLoader, audioListener]);

  // 3D emitters: check proximity and load/unload audio per frame.
  useFrame(() => {
    const sound = soundRef.current;
    if (!sound || !is3D || !audioEnabled || !fileName) return;

    const distance = camera.position.distanceTo(emitterPosRef.current);

    const wasInRange = isInRangeRef.current;
    const isNowInRange = distance <= maxDistance;

    if (isNowInRange && !wasInRange) {
      isInRangeRef.current = true;
      loadAndPlay(sound);
    } else if (!isNowInRange && wasInRange) {
      isInRangeRef.current = false;
      clearTimers();
      try {
        sound.stop();
      } catch {
        /* expected */
      }
    }
  });

  // Stop audio if disabled; reset range state so re-enabling triggers playback.
  useEffect(() => {
    const sound = soundRef.current;
    if (!sound) return;

    if (!audioEnabled) {
      clearTimers();
      try {
        sound.stop();
      } catch {
        /* expected */
      }
      isInRangeRef.current = false;
    }
  }, [audioEnabled]);

  return debugMode ? (
    <mesh position={emitterPosRef.current}>
      <sphereGeometry args={[minDistance, 12, 12]} />
      <meshBasicMaterial
        color="#00ff00"
        wireframe
        opacity={0.05}
        transparent
        toneMapped={false}
      />
      <FloatingLabel color="#00ff00" position={[0, minDistance + 1, 0]}>
        {fileName}
      </FloatingLabel>
    </mesh>
  ) : null;
});
