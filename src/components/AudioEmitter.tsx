import { memo, useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import {
  Audio,
  AudioListener,
  AudioLoader,
  Object3D,
  PositionalAudio,
  Vector3,
} from "three";
import type { TorqueObject } from "../torqueScript";
import { getFloat, getInt, getPosition, getProperty } from "../mission";
import { audioToUrl } from "../loaders";
import { useAudio } from "./AudioContext";
import { useDebug, useSettings } from "./SettingsProvider";
import { FloatingLabel } from "./FloatingLabel";
import { engineStore } from "../state";

// Global audio buffer cache shared across all audio components.
export const audioBufferCache = new Map<string, AudioBuffer>();

// ── Demo sound rate tracking ──
// Track active demo sounds so their playbackRate can be updated when the
// playback rate changes (e.g. slow-motion or fast-forward).
// Maps each sound to its intrinsic pitch (1.0 for normal sounds, or the
// voice pitch multiplier for chat sounds).
const _activeDemoSounds = new Map<Audio<GainNode | PannerNode>, number>();

/** Register a sound for automatic playback rate tracking. */
export function trackDemoSound(
  sound: Audio<GainNode | PannerNode>,
  basePitch = 1,
): void {
  _activeDemoSounds.set(sound, basePitch);
}

/** Unregister a tracked demo sound. */
export function untrackDemoSound(sound: Audio<GainNode | PannerNode>): void {
  _activeDemoSounds.delete(sound);
}

engineStore.subscribe(
  (state) => state.playback.rate,
  (rate) => {
    for (const [sound, basePitch] of _activeDemoSounds) {
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
  getCachedAudioBuffer(url, audioLoader, (buffer) => {
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
        _activeDemoSounds.set(sound, 1);
        sound.play();
        sound.source!.onended = () => {
          _activeDemoSounds.delete(sound);
          sound.disconnect();
          parent.remove(sound);
        };
      } else {
        const sound = new Audio(audioListener);
        sound.setBuffer(buffer);
        sound.setVolume(resolved.volume);
        sound.setPlaybackRate(rate);
        _activeDemoSounds.set(sound, 1);
        sound.play();
        sound.source!.onended = () => {
          _activeDemoSounds.delete(sound);
          sound.disconnect();
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
        console.error("Audio load error", audioUrl, err);
      },
    );
  }
}

export const AudioEmitter = memo(function AudioEmitter({
  object,
}: {
  object: TorqueObject;
}) {
  const { debugMode } = useDebug();
  const fileName = getProperty(object, "fileName") ?? "";
  const volume = getFloat(object, "volume") ?? 1;
  const minDistance = getFloat(object, "minDistance") ?? 1;
  const maxDistance = getFloat(object, "maxDistance") ?? 1;
  const minLoopGap = getFloat(object, "minLoopGap") ?? 0;
  const maxLoopGap = getFloat(object, "maxLoopGap") ?? 0;
  const is3D = getInt(object, "is3D") ?? 0;

  const [x, y, z] = getPosition(object);
  const { scene, camera } = useThree();
  const { audioLoader, audioListener } = useAudio();
  const { audioEnabled } = useSettings();

  const soundRef = useRef<Audio<GainNode | PannerNode> | null>(null);
  const loopTimerRef = useRef<NodeJS.Timeout | null>(null);
  const loopGapIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isLoadedRef = useRef(false);
  const isInRangeRef = useRef(false);
  const emitterPosRef = useRef(new Vector3(x, y, z));

  const clearTimers = () => {
    if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
    if (loopGapIntervalRef.current) clearTimeout(loopGapIntervalRef.current);
  };

  // Create sound object on mount.
  useEffect(() => {
    if (!audioLoader || !audioListener) return;

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
      try { sound.stop(); } catch {}
      sound.disconnect();
      if (is3D) scene.remove(sound);
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

  // Setup looping logic (only called when audio loads).
  const setupLooping = (sound: Audio<GainNode | PannerNode>) => {
    if (minLoopGap > 0 || maxLoopGap > 0) {
      const gapMin = Math.max(0, minLoopGap);
      const gapMax = Math.max(gapMin, maxLoopGap);
      const gap =
        gapMin === gapMax ? gapMin : Math.random() * (gapMax - gapMin) + gapMin;

      sound.loop = false;

      const checkLoop = () => {
        if (sound.isPlaying === false) {
          loopTimerRef.current = setTimeout(() => {
            try {
              sound.play();
              setupLooping(sound);
            } catch {}
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
  const loadAndPlay = (sound: Audio<GainNode | PannerNode>) => {
    if (!isLoadedRef.current) {
      const audioUrl = audioToUrl(fileName);
      getCachedAudioBuffer(audioUrl, audioLoader, (audioBuffer) => {
        if (!sound.buffer) {
          sound.setBuffer(audioBuffer);
          isLoadedRef.current = true;
          try {
            sound.play();
            setupLooping(sound);
          } catch {}
        }
      });
    } else {
      try {
        if (!sound.isPlaying) {
          sound.play();
          setupLooping(sound);
        }
      } catch {}
    }
  };

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
      try { sound.stop(); } catch {}
    }
  });

  // Stop audio if disabled.
  useEffect(() => {
    const sound = soundRef.current;
    if (!sound) return;

    if (!audioEnabled) {
      clearTimers();
      try { sound.stop(); } catch {}
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
