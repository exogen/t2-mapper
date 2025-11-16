import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { PositionalAudio, Audio } from "three";
import { ConsoleObject, getPosition, getProperty } from "../mission";
import { audioToUrl } from "../loaders";
import { useAudio } from "./AudioContext";
import { useSettings } from "./SettingsProvider";

export function AudioEmitter({ object }: { object: ConsoleObject }) {
  const fileName = getProperty(object, "fileName")?.value ?? "";
  const volume = parseFloat(getProperty(object, "volume")?.value ?? "1");
  const minDistance = parseFloat(
    getProperty(object, "minDistance")?.value ?? "1"
  );
  const maxDistance = parseFloat(
    getProperty(object, "maxDistance")?.value ?? "1"
  );
  const minLoopGap = parseFloat(
    getProperty(object, "minLoopGap")?.value ?? "0"
  );
  const maxLoopGap = parseFloat(
    getProperty(object, "maxLoopGap")?.value ?? "0"
  );
  const is3D = parseInt(getProperty(object, "is3D")?.value ?? "0");

  const [z, y, x] = getPosition(object);
  const { scene } = useThree();
  const { audioLoader, audioListener } = useAudio();
  const { audioEnabled } = useSettings();
  const soundRef = useRef<PositionalAudio | null>(null);
  const loopTimerRef = useRef<NodeJS.Timeout | null>(null);
  const loopGapIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!fileName || !audioLoader || !audioListener || !audioEnabled) {
      if (!fileName) {
        console.warn("AudioEmitter: No fileName provided");
      }
      if (!audioLoader) {
        console.warn("AudioEmitter: No audio loader available");
      }
      if (!audioListener) {
        console.warn("AudioEmitter: No audio listener available");
      }
      return;
    }

    const audioUrl = audioToUrl(fileName);

    let sound;

    // Configure distance properties
    if (is3D) {
      sound = new PositionalAudio(audioListener);
      sound.position.set(x - 1024, y, z - 1024);
      sound.setDistanceModel("exponential");
      sound.setRefDistance(minDistance / 25);
      sound.setMaxDistance(maxDistance / 50);
      sound.setVolume(volume);
    } else {
      sound = new Audio(audioListener);
      sound.setVolume(Math.min(volume, 0.25));
    }

    soundRef.current = sound;

    // Setup looping with gap
    const setupLooping = () => {
      if (minLoopGap > 0 || maxLoopGap > 0) {
        const gapMin = Math.max(0, minLoopGap);
        const gapMax = Math.max(gapMin, maxLoopGap);
        const gap =
          gapMin === gapMax
            ? gapMin
            : Math.random() * (gapMax - gapMin) + gapMin;

        sound.loop = false;

        // Check periodically when audio ends. onEnded wasn't working
        const checkLoop = () => {
          if (sound.isPlaying === false) {
            loopTimerRef.current = setTimeout(() => {
              try {
                sound.play();
                setupLooping();
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

    // Load and play audio
    audioLoader.load(
      audioUrl,
      (audioBuffer: any) => {
        sound.setBuffer(audioBuffer);

        try {
          sound.play();
          setupLooping();
        } catch (err) {}
      },
      undefined,
      (err: any) => {}
    );

    // Add to scene
    scene.add(sound);

    return () => {
      if (loopTimerRef.current) {
        clearTimeout(loopTimerRef.current);
      }
      if (loopGapIntervalRef.current) {
        clearTimeout(loopGapIntervalRef.current);
      }
      try {
        sound.stop();
      } catch (e) {
        // May fail if already stopped
      }
      sound.disconnect();
      scene.remove(sound);
    };
  }, [
    fileName,
    volume,
    minLoopGap,
    maxLoopGap,
    is3D,
    minDistance,
    maxDistance,
    audioLoader,
    audioListener,
    audioEnabled,
    scene,
  ]);

  // Render debug visualization and invisible marker
  return null;
}
