import { useCallback, type ReactNode } from "react";
import type { DemoRecording } from "../demo/types";
import { useEngineSelector } from "../state";

interface DemoContextValue {
  recording: DemoRecording | null;
  setRecording: (recording: DemoRecording | null) => void;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  speed: number;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setSpeed: (speed: number) => void;
}

export function DemoProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useDemoRecording(): DemoRecording | null {
  return useEngineSelector((state) => state.playback.recording);
}

export function useDemoIsPlaying(): boolean {
  return useEngineSelector((state) => state.playback.status === "playing");
}

export function useDemoCurrentTime(): number {
  return useEngineSelector((state) => state.playback.timeMs / 1000);
}

export function useDemoDuration(): number {
  return useEngineSelector((state) => state.playback.durationMs / 1000);
}

export function useDemoSpeed(): number {
  return useEngineSelector((state) => state.playback.rate);
}

export function useDemoActions() {
  const recording = useDemoRecording();
  const setDemoRecording = useEngineSelector((state) => state.setDemoRecording);
  const setPlaybackStatus = useEngineSelector(
    (state) => state.setPlaybackStatus,
  );
  const setPlaybackTime = useEngineSelector((state) => state.setPlaybackTime);
  const setPlaybackRate = useEngineSelector((state) => state.setPlaybackRate);

  const setRecording = useCallback(
    (recording: DemoRecording | null) => {
      setDemoRecording(recording);
    },
    [setDemoRecording],
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
    setRecording,
    play,
    pause,
    seek,
    setSpeed,
  };
}

export function useDemo(): DemoContextValue {
  const recording = useDemoRecording();
  const isPlaying = useDemoIsPlaying();
  const currentTime = useDemoCurrentTime();
  const duration = useDemoDuration();
  const speed = useDemoSpeed();
  const actions = useDemoActions();

  return {
    recording,
    isPlaying,
    currentTime,
    duration,
    speed,
    setRecording: actions.setRecording,
    play: actions.play,
    pause: actions.pause,
    seek: actions.seek,
    setSpeed: actions.setSpeed,
  };
}

export function useDemoOptional(): DemoContextValue {
  return useDemo();
}
