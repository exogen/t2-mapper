import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { DemoRecording } from "../demo/types";

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
  /** Ref used by the scene component to sync playback time back to context. */
  playbackRef: React.RefObject<PlaybackState>;
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  speed: number;
  /** Set by the provider when seeking; cleared by the scene component. */
  pendingSeek: number | null;
  /** Set by the provider when play/pause changes; cleared by the scene. */
  pendingPlayState: boolean | null;
}

const DemoContext = createContext<DemoContextValue | null>(null);

export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) {
    throw new Error("useDemo must be used within DemoProvider");
  }
  return context;
}

export function useDemoOptional() {
  return useContext(DemoContext);
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [recording, setRecording] = useState<DemoRecording | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1);

  const playbackRef = useRef<PlaybackState>({
    isPlaying: false,
    currentTime: 0,
    speed: 1,
    pendingSeek: null,
    pendingPlayState: null,
  });

  const duration = recording?.duration ?? 0;

  const play = useCallback(() => {
    setIsPlaying(true);
    playbackRef.current.pendingPlayState = true;
  }, []);

  const pause = useCallback(() => {
    setIsPlaying(false);
    playbackRef.current.pendingPlayState = false;
  }, []);

  const seek = useCallback((time: number) => {
    setCurrentTime(time);
    playbackRef.current.pendingSeek = time;
  }, []);

  const handleSetSpeed = useCallback((newSpeed: number) => {
    setSpeed(newSpeed);
    playbackRef.current.speed = newSpeed;
  }, []);

  const handleSetRecording = useCallback((rec: DemoRecording | null) => {
    setRecording(rec);
    setIsPlaying(false);
    setCurrentTime(0);
    setSpeed(1);
    playbackRef.current.isPlaying = false;
    playbackRef.current.currentTime = 0;
    playbackRef.current.speed = 1;
    playbackRef.current.pendingSeek = null;
    playbackRef.current.pendingPlayState = null;
  }, []);

  /**
   * Called by DemoPlayback on each frame to sync the current time back
   * to React state (throttled by the scene component).
   */
  const updateCurrentTime = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  // Attach the updater to the ref so the scene component can call it
  // without needing it as a dependency.
  (playbackRef.current as any).updateCurrentTime = updateCurrentTime;

  const context: DemoContextValue = useMemo(
    () => ({
      recording,
      setRecording: handleSetRecording,
      isPlaying,
      currentTime,
      duration,
      speed,
      play,
      pause,
      seek,
      setSpeed: handleSetSpeed,
      playbackRef,
    }),
    [
      recording,
      handleSetRecording,
      isPlaying,
      currentTime,
      duration,
      speed,
      play,
      pause,
      seek,
      handleSetSpeed,
    ],
  );

  return (
    <DemoContext.Provider value={context}>{children}</DemoContext.Provider>
  );
}
