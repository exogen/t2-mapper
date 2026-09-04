import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { AudioListener, AudioLoader } from "three";
import { useEngineSelector } from "../state/engineStore";
import { isStreamingSource, useDataSource } from "../state/gameEntityStore";
import { useLiveSelector } from "../state/liveConnectionStore";
import { commentaryPlayback } from "../state/streamPlaybackStore";
import { useSettings } from "./SettingsProvider";

/**
 * While the commentary track plays, game sounds sit at this fraction of the
 * master volume so the callers read over the action.
 **/
const COMMENTARY_DUCK = 0.5;

/** A blocked resume() never settles; a rejected one is nothing to act on. */
const noop = () => {};

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
  // Whether a user gesture has started this page's AudioContext at least
  // once (see the unlock below).
  const unlockedRef = useRef(false);

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

    // Autoplay policy: a suspended AudioContext only starts from inside a
    // user gesture, and that permission is granted ONCE — after a
    // gesture-driven start, later resumes are allowed on their own.
    //
    // So the first gesture has to spend that permission even when nothing
    // wants to be audible yet. Reconciling alone doesn't: the clicks a
    // viewer actually makes (pick a demo, press play) land while playback
    // is still "stopped", so reconcile suspends instead of resuming, and
    // the one resume that matters comes later — when the auto-director or
    // the play button starts the stream, outside any gesture — where the
    // browser refuses it. The refusal is invisible (a blocked resume()
    // never rejects, it just never settles), and nothing retries, so every
    // sound stays dead until the viewer happens to click again. That is
    // the "audio is enabled but silent until I toggle it off and on" bug:
    // the toggle isn't fixing anything, its clicks are.
    //
    // Resuming here and immediately handing back to reconcile leaves the
    // context in whatever state the transport wants, unlocked either way.
    const onGesture = () => {
      const ctx = listener.context;
      if (!unlockedRef.current && ctx.state === "suspended") {
        // Only a resume that actually lands counts as the unlock, so a
        // gesture the browser didn't credit leaves the next one to try.
        ctx.resume().then(() => {
          unlockedRef.current = true;
        }, noop);
      }
      reconcileRef.current();
    };
    // Also re-assert on visibility changes: a context created while the
    // tab is in the background can come up suspended with no gesture in
    // sight, and coming back to the tab is not itself a gesture.
    const onVisibility = () => reconcileRef.current();
    document.addEventListener("pointerdown", onGesture);
    document.addEventListener("click", onGesture);
    document.addEventListener("keydown", onGesture);
    document.addEventListener("touchend", onGesture);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("pointerdown", onGesture);
      document.removeEventListener("click", onGesture);
      document.removeEventListener("keydown", onGesture);
      document.removeEventListener("touchend", onGesture);
      document.removeEventListener("visibilitychange", onVisibility);
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
    const ctx = listener?.context;
    // Ask for the state we want rather than testing ctx.state first: a
    // transition already in flight leaves that reading stale (the state
    // flips a quantum or two after suspend()/resume() is called), and a
    // guard reading it would skip the call that corrects it. Both calls
    // are no-ops when the context is already where we want it.
    const reconcile = () => {
      if (!ctx) return;
      const shouldPlay = !streaming || status === "playing";
      const settle = shouldPlay ? ctx.resume() : ctx.suspend();
      settle.catch(noop);
    };
    reconcileRef.current = reconcile;
    reconcile();
    if (!ctx) return;
    // The context can also change state on its own — a browser that
    // auto-resumes a blocked context on the first interaction, or an OS
    // interruption — so re-assert whenever it does.
    ctx.addEventListener("statechange", reconcile);
    return () => ctx.removeEventListener("statechange", reconcile);
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

  // Applied per frame (not in an effect) because the commentary flag is
  // mutable per-frame state, not React state. The commentary element
  // itself bypasses the listener, so ducking here leaves speech at full
  // master volume.
  useFrame(() => {
    const target =
      (muted ? 0 : audioVolume) *
      (commentaryPlayback.active ? COMMENTARY_DUCK : 1);
    const listener = audioContext.audioListener;
    if (listener && listener.getMasterVolume() !== target) {
      listener.setMasterVolume(target);
    }
  });

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
