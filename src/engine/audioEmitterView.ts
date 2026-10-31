import {
  Audio,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
  type Object3D,
} from "three";
import { audioToUrl } from "../loaders";
import type { AudioEmitterEntity } from "../state/gameEntityTypes";
import { selectDebugMode, settingsStore } from "../state/settingsStore";
import { getAudioGraph } from "./audioGraph";
import { getCachedAudioBuffer } from "./audioBuffers";
import { createPositionalAudio } from "./soundEffects";
import { createDebugMarker, showWhileDebugTourTarget } from "./debugVisuals";
import { createPositionedRoot, type EntityView } from "./entityViews";
import { FramePriority } from "./framePriority";
import { combineCleanups, reaction } from "./storeReaction";
import { WorldLabel } from "./worldLabel";
import type { GameEngine } from "./gameEngine";

/**
 * An AudioEmitter's sound, while audio is enabled. 3D emitters play only
 * while the camera is within their max distance (and stop outside it);
 * 2D emitters play from the start. Looping emitters with a loop gap wait
 * a (per-emitter random) gap between plays.
 */
function startEmitterSound(
  entity: AudioEmitterEntity,
  engine: GameEngine,
): () => void {
  const fileName = entity.audioFileName ?? "";
  const volume = entity.audioVolume ?? 1;
  const minDistance = entity.audioMinDistance ?? 1;
  const maxDistance = entity.audioMaxDistance ?? 1;
  const minLoopGap = entity.audioMinLoopGap ?? 0;
  const maxLoopGap = entity.audioMaxLoopGap ?? 0;
  const is3D = entity.audioIs3D ?? true;
  const isLooping = entity.audioIsLooping ?? true;
  const emitterPos = new Vector3(...(entity.position ?? [0, 0, 0]));
  const randomValue = Math.random();
  const { audioLoader, audioListener } = getAudioGraph();

  let loopTimer: ReturnType<typeof setTimeout> | null = null;
  let loopGapTimer: ReturnType<typeof setTimeout> | null = null;
  let loaded = false;
  let inRange = false;
  let stopped = false;

  const clearTimers = () => {
    if (loopTimer != null) clearTimeout(loopTimer);
    if (loopGapTimer != null) clearTimeout(loopGapTimer);
    loopTimer = loopGapTimer = null;
  };

  let sound: Audio<GainNode | PannerNode>;
  if (is3D) {
    const positional = createPositionalAudio(audioListener, {
      refDist: minDistance,
      maxDist: maxDistance,
      volume,
    });
    positional.position.copy(emitterPos);
    sound = positional;
  } else {
    sound = new Audio(audioListener);
    sound.setVolume(volume);
  }

  const setupLooping = () => {
    if (!isLooping) return;
    if (minLoopGap > 0 || maxLoopGap > 0) {
      const gapMin = Math.max(0, minLoopGap);
      const gapMax = Math.max(gapMin, maxLoopGap);
      const gap =
        gapMin === gapMax ? gapMin : randomValue * (gapMax - gapMin) + gapMin;
      sound.setLoop(false);
      const checkLoop = () => {
        if (stopped) return;
        if (sound.isPlaying === false) {
          loopTimer = setTimeout(() => {
            if (stopped) return;
            try {
              sound.play();
              setupLooping();
            } catch {
              /* expected */
            }
          }, gap);
        } else {
          loopGapTimer = setTimeout(checkLoop, 100);
        }
      };
      loopGapTimer = setTimeout(checkLoop, 100);
    } else {
      sound.setLoop(true);
    }
  };

  // Load once, then play (and restart after a stop).
  const loadAndPlay = () => {
    if (!loaded) {
      let audioUrl: string;
      try {
        audioUrl = audioToUrl(fileName);
      } catch {
        return;
      }
      getCachedAudioBuffer(audioUrl, audioLoader, (audioBuffer) => {
        if (stopped || sound.buffer) return;
        sound.setBuffer(audioBuffer);
        loaded = true;
        try {
          sound.play();
          setupLooping();
        } catch {
          /* expected */
        }
      });
    } else if (!sound.isPlaying) {
      try {
        sound.play();
        setupLooping();
      } catch {
        /* expected */
      }
    }
  };

  if (!is3D && fileName) loadAndPlay();

  return combineCleanups(
    () => {
      stopped = true;
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
    },
    is3D
      ? engine.withHost(({ scene }) => {
          scene.add(sound);
          return () => scene.remove(sound);
        })
      : undefined,
    // 3D emitters: load/play when the camera comes in range, stop when it
    // leaves.
    is3D && fileName
      ? engine.scheduler.add(FramePriority.PostCamera, ({ camera }) => {
          const nowInRange =
            camera.position.distanceTo(emitterPos) <= maxDistance;
          if (nowInRange && !inRange) {
            inRange = true;
            loadAndPlay();
          } else if (!nowInRange && inRange) {
            inRange = false;
            clearTimers();
            try {
              sound.stop();
            } catch {
              /* expected */
            }
          }
        })
      : undefined,
  );
}

/** Debug mode: the emitter's min-distance sphere and its file name. */
function showEmitterRange(
  parent: Object3D,
  entity: AudioEmitterEntity,
): () => void {
  const minDistance = entity.audioMinDistance ?? 1;
  const geometry = new SphereGeometry(minDistance, 12, 12);
  const material = new MeshBasicMaterial({
    color: "#00ff00",
    wireframe: true,
    opacity: 0.05,
    transparent: true,
    toneMapped: false,
  });
  const sphere = new Mesh(geometry, material);
  parent.add(sphere);
  const label = new WorldLabel(sphere, entity.audioFileName ?? "", {
    color: "#00ff00",
    position: [0, minDistance + 1, 0],
  });
  return () => {
    label.dispose();
    parent.remove(sphere);
    geometry.dispose();
    material.dispose();
  };
}

/** A mission AudioEmitter: its ambient sound, and debug visuals. */
export function createAudioEmitterView(
  entity: AudioEmitterEntity,
  engine: GameEngine,
): EntityView {
  const { root, model } = createPositionedRoot(entity);
  return {
    root,
    dispose: combineCleanups(
      reaction(
        settingsStore,
        (state) => state.audioEnabled,
        (enabled) => (enabled ? startEmitterSound(entity, engine) : undefined),
      ),
      reaction(
        settingsStore,
        (state) => state.audioEnabled && selectDebugMode(state),
        (show) => (show ? showEmitterRange(model, entity) : undefined),
      ),
      showWhileDebugTourTarget(model, entity.id, () => createDebugMarker(1.5)),
    ),
  };
}
