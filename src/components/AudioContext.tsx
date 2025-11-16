import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { useThree } from "@react-three/fiber";
import { AudioListener, AudioLoader } from "three";

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
      (child) => child instanceof AudioListener
    ) as AudioListener | undefined;

    if (!listener) {
      listener = new AudioListener();
      camera.add(listener);
    }

    setAudioContext({
      audioLoader,
      audioListener: listener,
    });
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
