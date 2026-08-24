import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { useThree } from "@react-three/fiber";
import { AudioListener, AudioLoader } from "three";
import { useEngineSelector } from "../state/engineStore";
import { isStreamingSource, useDataSource } from "../state/gameEntityStore";
import { useLiveSelector } from "../state/liveConnectionStore";
import { useSettings } from "./SettingsProvider";

interface AudioContextType {
  audioLoader: AudioLoader | null;
  audioListener: AudioListener | null;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

/**
 * AudioProvider initializes the AudioLoader and AudioListener for spatial audio.
 * Must be rendered inside the Canvas component.
 */
export function AudioProvider({ children }: { children: ReactNode }) {
  const camera = useThree((state) => state.camera);
  const { audioVolume } = useSettings();
  const [audioContext, setAudioContext] = useState<AudioContextType>({
    audioLoader: null,
    audioListener: null,
  });

  // Latest reconcile of AudioContext state ↔ playback, kept in a ref so the
  // gesture listeners (registered once) always call the current one.
  const reconcileRef = useRef<() => void>(() => {});

  useEffect(() => {
    // Create audio loader
    const audioLoader = new AudioLoader();

    // Create listener if not already present
    let listener = camera.children.find(
      (child) => child instanceof AudioListener,
    ) as AudioListener | undefined;

    if (!listener) {
      listener = new AudioListener();
      camera.add(listener);
    }

    setAudioContext({
      audioLoader,
      audioListener: listener,
    });

    // A user gesture is required before the browser lets the AudioContext
    // resume (autoplay policy). Reconcile on any gesture: a stream that
    // should be running gets sound, while a paused/stopped one stays silent
    // even after the gesture (see the reconcile effect below).
    const onGesture = () => reconcileRef.current();
    document.addEventListener("click", onGesture);
    document.addEventListener("keydown", onGesture);
    document.addEventListener("touchend", onGesture);

    return () => {
      document.removeEventListener("click", onGesture);
      document.removeEventListener("keydown", onGesture);
      document.removeEventListener("touchend", onGesture);
      if (listener) camera.remove(listener);
    };
  }, [camera]);

  // Keep the Web AudioContext running only while a demo/live stream is
  // actually playing. Suspending (rather than muting) freezes every routed
  // sound at its current position so it resumes seamlessly — and, crucially,
  // covers the ambient emitters / chat / jet loops that rely on suspension
  // instead of checking `isPlaying` themselves. A demo loads at "stopped"
  // (never "paused"), so silence must cover any non-playing stream state,
  // not just "paused". Map mode isn't a stream, so its ambient audio keeps
  // running. Applied on every relevant change and immediately on mount,
  // since the initial "stopped" fires no later transition to react to.
  const status = useEngineSelector((state) => state.playback.status);
  const dataSource = useDataSource();
  const streaming = isStreamingSource(dataSource);
  const listener = audioContext.audioListener;
  useEffect(() => {
    const reconcile = () => {
      const ctx = listener?.context;
      if (!ctx) return;
      const shouldPlay = !streaming || status === "playing";
      if (shouldPlay) {
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
      } else if (ctx.state === "running") {
        ctx.suspend().catch(() => {});
      }
    };
    reconcileRef.current = reconcile;
    reconcile();
  }, [status, streaming, listener]);

  // A dead live session keeps rendering its last frame, but looping
  // entity sounds shouldn't keep playing after the disconnect.
  const liveSessionDead = useLiveSelector(
    (s) =>
      s.gameStatus !== "connected" &&
      !(
        s.role === "watcher" &&
        s.watchStatus !== null &&
        s.watchStatus !== "ended"
      ),
  );
  const muted = dataSource === "live" && liveSessionDead;

  useEffect(() => {
    audioContext.audioListener?.setMasterVolume(muted ? 0 : audioVolume);
  }, [audioVolume, muted, audioContext.audioListener]);

  return (
    <AudioContext.Provider value={audioContext}>
      {children}
    </AudioContext.Provider>
  );
}

/**
 * Hook to access audio resources (AudioLoader and AudioListener).
 * Must be used within an AudioProvider.
 */
export function useAudio(): AudioContextType {
  const context = useContext(AudioContext);
  if (context === undefined) {
    throw new Error("useAudio must be used within AudioProvider");
  }
  return context;
}
