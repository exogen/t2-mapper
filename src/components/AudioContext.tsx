import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { useThree } from "@react-three/fiber";
import { AudioListener, AudioLoader } from "three";
import { engineStore } from "../state";

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
  const { camera } = useThree();
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

    // Suspend/resume the Web AudioContext when demo playback pauses/resumes.
    // This freezes all playing sounds at their current position rather than
    // stopping them, so they resume seamlessly.
    const unsubscribe = engineStore.subscribe(
      (state) => state.playback.status,
      (status) => {
        const ctx = listener?.context;
        if (!ctx) return;
        if (status === "paused") {
          ctx.suspend();
        } else if (status === "playing" && ctx.state === "suspended") {
          ctx.resume();
        }
      },
    );

    return () => {
      unsubscribe();
    };
  }, [camera]);

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
