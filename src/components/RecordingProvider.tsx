import { useCallback, type ReactNode } from "react";
import type { StreamRecording } from "../stream/types";
import { useEngineSelector } from "../state";

export function RecordingProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useRecording(): StreamRecording | null {
  return useEngineSelector((state) => state.playback.recording);
}

export function useIsPlaying(): boolean {
  return useEngineSelector((state) => state.playback.status === "playing");
}

export function useCurrentTime(): number {
  return useEngineSelector((state) => state.playback.timeMs / 1000);
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
  const setPlaybackTime = useEngineSelector((state) => state.setPlaybackTime);
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
    (time: number) => {
      setPlaybackTime(time * 1000);
    },
    [setPlaybackTime],
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
