import { useCallback } from "react";
import type { StreamRecording } from "../stream/types";
import { useEngineSelector } from "../state/engineStore";
import { useStreamSnapshot } from "../state/streamSnapshotStore";

export const SPEED_OPTIONS = [0.25, 0.5, 1, 1.5, 2, 3, 4, 8];

export function useRecording(): StreamRecording | null {
  return useEngineSelector((state) => state.playback.recording);
}

export function useIsPlaying(): boolean {
  return useEngineSelector((state) => state.playback.status === "playing");
}

/** Playback time for UI display, floored to whole seconds. The selectors
 *  evaluate on every store mutation but only trigger a re-render when
 *  the displayed second changes (~1/s). */
export function useCurrentTime(): number {
  const snapshotSec = useStreamSnapshot((snap) =>
    snap ? Math.floor(snap.timeSec) : null,
  );
  const seekSec = useEngineSelector((state) =>
    Math.floor(state.playback.seekTime),
  );
  return snapshotSec ?? seekSec;
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
  const setPlaybackStatus = useEngineSelector(
    (state) => state.setPlaybackStatus,
  );
  const seekPlayback = useEngineSelector((state) => state.seekPlayback);
  const setPlaybackRate = useEngineSelector((state) => state.setPlaybackRate);

  const setRec = useCallback(
    (recording: StreamRecording | null) => {
      setRecording(recording);
    },
    [setRecording],
  );

  const play = useCallback(() => {
    if (!recording) return;
    setPlaybackStatus("playing");
  }, [recording, setPlaybackStatus]);

  const pause = useCallback(() => {
    setPlaybackStatus("paused");
  }, [setPlaybackStatus]);

  const seek = useCallback(
    (timeSec: number) => {
      seekPlayback(timeSec);
    },
    [seekPlayback],
  );

  const setSpeed = useCallback(
    (speed: number) => {
      setPlaybackRate(speed);
    },
    [setPlaybackRate],
  );

  return {
    setRecording: setRec,
    play,
    pause,
    seek,
    setSpeed,
  };
}
