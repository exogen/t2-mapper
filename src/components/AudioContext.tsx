import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { useThree } from "@react-three/fiber";
import { AudioListener, AudioLoader } from "three";
import { engineStore } from "../state/engineStore";
import { useDataSource } from "../state/gameEntityStore";
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

    // Resume the AudioContext on user interaction to satisfy browser autoplay
    // policy. Without this, sounds won't play until the user clicks/taps.
    const resumeOnGesture = () => {
      const ctx = listener.context;
      if (!ctx || ctx.state !== "suspended") return;
      ctx.resume().finally(() => {
        document.removeEventListener("click", resumeOnGesture);
        document.removeEventListener("keydown", resumeOnGesture);
        document.removeEventListener("touchend", resumeOnGesture);
      });
    };
    document.addEventListener("click", resumeOnGesture);
    document.addEventListener("keydown", resumeOnGesture);
    document.addEventListener("touchend", resumeOnGesture);

    // Suspend/resume the Web AudioContext when demo playback pauses/resumes.
    // This freezes all playing sounds at their current position rather than
    // stopping them, so they resume seamlessly.
    const unsubscribe = engineStore.subscribe(
      (state) => state.playback.status,
      (status) => {
        const ctx = listener.context;
        if (!ctx) return;
        if (status === "paused") {
          ctx.suspend();
        } else if (ctx.state === "suspended") {
          ctx.resume();
        }
      },
    );

    return () => {
      document.removeEventListener("click", resumeOnGesture);
      document.removeEventListener("keydown", resumeOnGesture);
      document.removeEventListener("touchend", resumeOnGesture);
      unsubscribe();
      if (listener) camera.remove(listener);
    };
  }, [camera]);

  // A dead live session keeps rendering its last frame, but looping
  // entity sounds shouldn't keep playing after the disconnect.
  const dataSource = useDataSource();
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
