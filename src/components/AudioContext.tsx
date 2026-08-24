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

// Page-lifetime singletons. The listener owns the Web Audio graph: its gain
// node is wired to the speakers in its constructor, and every sound ever
// created keeps routing through the listener it was built with. Recreating
// the listener (as this once did on every default-camera switch — observer ↔
// command circuit) orphaned all in-flight sounds on a still-connected graph:
// they kept playing forever, immune to the volume slider and mute. One
// listener, moved between cameras, means volume/suspend always reach every
// sound.
let _audioListener: AudioListener | null = null;
let _audioLoader: AudioLoader | null = null;

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
    _audioLoader ??= new AudioLoader();
    if (!_audioListener) {
      _audioListener = new AudioListener();
      // Safety limiter between the master gain and the speakers. Dozens of
      // simultaneous effects sum well past full scale and hard-clip at the
      // destination — harsh distortion that reads as crackle. A compressor
      // with a high ratio and fast attack transparently catches the peaks
      // instead. (setFilter wires gain → limiter → destination.)
      const ctx = _audioListener.context;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      _audioListener.setFilter(limiter);
    }
    const audioLoader = _audioLoader;
    const listener = _audioListener;
    camera.add(listener);

    // Referentially stable across camera switches so useAudio() consumers
    // (every shape/player/emitter) don't re-render when the command circuit
    // opens or closes.
    setAudioContext((prev) =>
      prev.audioListener === listener && prev.audioLoader === audioLoader
        ? prev
        : { audioLoader, audioListener: listener },
    );

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
      camera.remove(listener);
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
