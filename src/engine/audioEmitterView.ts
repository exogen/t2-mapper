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
import { createPositionalAudio, stopAndDetachSound } from "./soundEffects";
import { createDebugMarker, showWhileDebugTourTarget } from "./debugVisuals";
import { createPositionedRoot, type EntityView } from "./entityViews";
import { FramePriority } from "./framePriority";
import { combineCleanups, reaction } from "./storeReaction";
import { WorldLabel } from "./worldLabel";
import type { GameEngine } from "./gameEngine";

const EMITTER_RETRY_MS = 1000;

interface PendingEmitterLoad {
  unsubscribe?: () => void;
}

/**
 * An AudioEmitter's sound, while audio is enabled. 3D emitters play only
 * while the camera is within their max distance (and stop outside it);
 * 2D emitters play from the start. Looping emitters with a loop gap wait
 * a (per-emitter random) gap between plays.
 */
function startEmitterSound(
  entity: AudioEmitterEntity,
  engine: GameEngine,
): (() => void) | undefined {
  if (!entity.audioFileName) return;
  let audioUrl: string;
  try {
    audioUrl = audioToUrl(entity.audioFileName);
  } catch {
    return;
  }
  const volume = entity.audioVolume ?? 1;
  const minDistance = entity.audioMinDistance ?? 1;
  const maxDistance = entity.audioMaxDistance ?? 1;
  const is3D = entity.audioIs3D ?? true;
  const isLooping = entity.audioIsLooping ?? true;
  const minGap = Math.max(0, entity.audioMinLoopGap ?? 0);
  const maxGap = Math.max(minGap, entity.audioMaxLoopGap ?? 0);
  const hasLoopGap = isLooping && maxGap > 0;
  const loopDelay = hasLoopGap
    ? (minGap + Math.random() * (maxGap - minGap)) / 1000
    : 0;
  const emitterPos = new Vector3(...(entity.position ?? [0, 0, 0]));
  const { audioLoader, audioListener } = getAudioGraph();

  let pendingLoad: PendingEmitterLoad | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let inRange = !is3D;
  let disposed = false;

  const cancelRetry = () => {
    clearTimeout(retryTimer);
    retryTimer = undefined;
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
  sound.setLoop(isLooping && !hasLoopGap);

  const play = (delay = 0) => {
    if (disposed || !inRange || !sound.buffer || sound.isPlaying) return;
    try {
      sound.play(delay);
    } catch {
      // The audio device may have gone away.
    }
  };

  const onEnded = sound.onEnded.bind(sound);
  sound.onEnded = () => {
    onEnded();
    sound.disconnect();
    // The shared context pauses the gap together with the rest of the mix.
    if (hasLoopGap) play(loopDelay);
  };

  const loadAndPlay = () => {
    if (disposed || !inRange || retryTimer !== undefined) return;
    if (sound.buffer) {
      play();
      return;
    }
    if (pendingLoad) return;
    const request: PendingEmitterLoad = {};
    pendingLoad = request;
    const settle = () => {
      if (pendingLoad !== request) return false;
      pendingLoad = undefined;
      return true;
    };
    const onError = () => {
      if (!settle() || !inRange) return;
      // The cache owns retry backoff for the URL. This wakes the emitter even
      // when the canvas is rendering on demand.
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        loadAndPlay();
      }, EMITTER_RETRY_MS);
    };
    try {
      request.unsubscribe = getCachedAudioBuffer(
        audioUrl,
        audioLoader,
        (buffer) => {
          if (!settle()) return;
          sound.setBuffer(buffer);
          play();
        },
        onError,
      );
      if (disposed) request.unsubscribe();
    } catch {
      onError();
    }
  };

  if (!is3D) loadAndPlay();

  return combineCleanups(
    () => {
      disposed = true;
      cancelRetry();
      pendingLoad?.unsubscribe?.();
      pendingLoad = undefined;
      stopAndDetachSound(sound);
      sound.gain.disconnect();
    },
    is3D
      ? engine.withHost(({ scene }) => {
          scene.add(sound);
          return () => scene.remove(sound);
        })
      : undefined,
    // 3D emitters: load/play when the camera comes in range, stop when it
    // leaves.
    is3D
      ? engine.scheduler.add(FramePriority.PostCamera, ({ camera }) => {
          const nowInRange =
            camera.position.distanceTo(emitterPos) <= maxDistance;
          if (nowInRange === inRange) return;
          inRange = nowInRange;
          if (inRange) {
            loadAndPlay();
          } else {
            cancelRetry();
            if (sound.isPlaying) {
              sound.stop();
              sound.disconnect();
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
