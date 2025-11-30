import { memo, useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { PositionalAudio, Vector3 } from "three";
import type { TorqueObject } from "../torqueScript";
import { getPosition, getProperty } from "../mission";
import { audioToUrl } from "../loaders";
import { useAudio } from "./AudioContext";
import { useDebug, useSettings } from "./SettingsProvider";
import { FloatingLabel } from "./FloatingLabel";

// Global audio buffer cache
const audioBufferCache = new Map<string, AudioBuffer>();

function getCachedAudioBuffer(
  audioUrl: string,
  audioLoader: any,
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
        console.error("AudioEmitter: Audio load error", audioUrl, err);
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
  const volume = getProperty(object, "volume") ?? 1;
  const minDistance = getProperty(object, "minDistance") ?? 1;
  const maxDistance = getProperty(object, "maxDistance") ?? 1;
  const minLoopGap = getProperty(object, "minLoopGap") ?? 0;
  const maxLoopGap = getProperty(object, "maxLoopGap") ?? 0;
  const is3D = getProperty(object, "is3D") ?? 0;

  const [x, y, z] = getPosition(object);
  const { scene, camera } = useThree();
  const { audioLoader, audioListener } = useAudio();
  const { audioEnabled } = useSettings();

  const soundRef = useRef<PositionalAudio | null>(null);
  const loopTimerRef = useRef<NodeJS.Timeout | null>(null);
  const loopGapIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isLoadedRef = useRef(false);
  const isInRangeRef = useRef(false);
  const emitterPosRef = useRef(new Vector3(x, y, z));

  // Create sound object on mount
  useEffect(() => {
    if (!audioLoader || !audioListener) return;

    // Always use PositionalAudio for consistent interface
    const sound = new PositionalAudio(audioListener);
    sound.position.copy(emitterPosRef.current);

    // Configure distance properties
    if (is3D) {
      sound.setDistanceModel("exponential");
      sound.setRefDistance(minDistance / 20);
      sound.setMaxDistance(maxDistance / 25);
      sound.setVolume(volume);
    } else {
      // No attenuation: very large max distance
      sound.setDistanceModel("linear");
      sound.setRefDistance(1);
      sound.setMaxDistance(2000000);
      sound.setVolume(volume / 15);
    }

    soundRef.current = sound;
    scene.add(sound);

    return () => {
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
      if (loopGapIntervalRef.current) clearTimeout(loopGapIntervalRef.current);
      try {
        sound.stop();
      } catch (e) {}
      sound.disconnect();
      scene.remove(sound);
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

  // Setup looping logic (only called when audio loads)
  const setupLooping = (sound: PositionalAudio) => {
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
            } catch (err) {}
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

  // Check proximity and load/unload audio
  useFrame(() => {
    const sound = soundRef.current;
    if (!sound || !audioEnabled || !fileName) return;

    const cameraPos = camera.position;
    const emitterPos = emitterPosRef.current;
    const distance = cameraPos.distanceTo(emitterPos);
    const loadRadius = maxDistance; // Scale down by 10 like visualization

    const wasInRange = isInRangeRef.current;
    const isNowInRange = distance <= loadRadius;

    // Entering range: load and play
    if (isNowInRange && !wasInRange) {
      isInRangeRef.current = true;

      if (!isLoadedRef.current) {
        const audioUrl = audioToUrl(fileName);
        getCachedAudioBuffer(audioUrl, audioLoader, (audioBuffer) => {
          if (!sound.buffer) {
            sound.setBuffer(audioBuffer);
            isLoadedRef.current = true;
            try {
              sound.play();
              setupLooping(sound);
            } catch (err) {}
          }
        });
      } else {
        // Already loaded, just play
        try {
          if (!sound.isPlaying) {
            sound.play();
            setupLooping(sound);
          }
        } catch (err) {}
      }
    }
    // Leaving range: stop and clean up
    else if (!isNowInRange && wasInRange) {
      isInRangeRef.current = false;

      if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
      if (loopGapIntervalRef.current) clearTimeout(loopGapIntervalRef.current);

      try {
        sound.stop();
      } catch (err) {}
    }
  });

  // Stop audio if disabled
  useEffect(() => {
    const sound = soundRef.current;
    if (!sound) return;

    if (!audioEnabled) {
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
      if (loopGapIntervalRef.current) clearTimeout(loopGapIntervalRef.current);
      try {
        sound.stop();
      } catch (err) {}
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
