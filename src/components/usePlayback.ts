import { useCallback } from "react";
import type { StreamRecording } from "../stream/types";
import {
  engineStore,
  isCurrentPlayback,
  useEngineSelector,
} from "../state/engineStore";
import { useStreamSnapshot } from "../state/streamSnapshotStore";

export const SPEED_OPTIONS = [0.25, 0.5, 1, 1.5, 2, 3, 4, 8];

export function useRecording(): StreamRecording | null {
  return useEngineSelector((state) => state.playback.recording);
}

export function useIsPlaying(): boolean {
  return useEngineSelector((state) => state.playback.status === "playing");
}

export function useIsSeeking(): boolean {
  return useEngineSelector((state) => state.playback.status === "seeking");
}

/** Whole seconds during playback; retain the exact requested time while seeking. */
export function useCurrentTime(): number {
  const snapshotSec = useStreamSnapshot((snap) =>
    snap ? Math.floor(snap.timeSec) : null,
  );
  const seekSec = useEngineSelector((state) =>
    Math.floor(state.playback.seekTime),
  );
  const requestedTime = useEngineSelector((state) =>
    state.playback.status === "seeking" ? state.playback.seekTime : null,
  );
  return requestedTime ?? snapshotSec ?? seekSec;
}

export function useDuration(): number {
  return useEngineSelector((state) => state.playback.durationMs / 1000);
}

export function useSpeed(): number {
  return useEngineSelector((state) => state.playback.rate);
}

export function usePlaybackActions() {
  const recording = useRecording();
  const setRecording = useEngineSelector((state) => state.setRecording);
  const seekPlayback = useEngineSelector((state) => state.seekPlayback);
  const setPlaybackRate = useEngineSelector((state) => state.setPlaybackRate);

  const seek = useCallback(
    (timeSec: number) => {
      if (!recording || !isCurrentPlayback(recording)) return;
      seekPlayback(timeSec);
    },
    [recording, seekPlayback],
  );

  const setSpeed = useCallback(
    (speed: number) => {
      if (!recording || !isCurrentPlayback(recording)) return;
      setPlaybackRate(speed);
    },
    [recording, setPlaybackRate],
  );

  const toggle = useCallback(() => {
    if (recording) engineStore.getState().togglePlayback(recording);
  }, [recording]);

  return {
    setRecording,
    toggle,
    seek,
    setSpeed,
  };
}
