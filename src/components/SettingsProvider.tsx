import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const SettingsContext = createContext(null);

type PersistedSettings = {
  fogEnabled?: boolean;
  speedMultiplier?: number;
  fov?: number;
  audioEnabled?: boolean;
  debugMode?: boolean;
};

export function useSettings() {
  return useContext(SettingsContext);
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [fogEnabled, setFogEnabled] = useState(true);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [fov, setFov] = useState(90);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [debugMode, setDebugMode] = useState(false);

  const value = useMemo(
    () => ({
      fogEnabled,
      setFogEnabled,
      speedMultiplier,
      setSpeedMultiplier,
      fov,
      setFov,
      audioEnabled,
      setAudioEnabled,
      debugMode,
      setDebugMode,
    }),
    [fogEnabled, speedMultiplier, fov, audioEnabled, debugMode, setDebugMode]
  );

  // Read persisted settings from localStoarge.
  useEffect(() => {
    let savedSettings: PersistedSettings = {};
    try {
      savedSettings = JSON.parse(localStorage.getItem("settings")) || {};
    } catch (err) {
      // Ignore.
    }
    if (savedSettings.debugMode != null) {
      setDebugMode(savedSettings.debugMode);
    }
    if (savedSettings.audioEnabled != null) {
      setAudioEnabled(savedSettings.audioEnabled);
    }
    if (savedSettings.fogEnabled != null) {
      setFogEnabled(savedSettings.fogEnabled);
    }
    if (savedSettings.speedMultiplier != null) {
      setSpeedMultiplier(savedSettings.speedMultiplier);
    }
    if (savedSettings.fov != null) {
      setFov(savedSettings.fov);
    }
  }, []);

  // Persist settings to localStorage with debouncing to avoid excessive writes
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clear any pending save
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    // Debounce localStorage writes (wait 300ms after last change)
    saveTimerRef.current = setTimeout(() => {
      const settingsToSave: PersistedSettings = {
        fogEnabled,
        speedMultiplier,
        fov,
        audioEnabled,
        debugMode,
      };
      try {
        localStorage.setItem("settings", JSON.stringify(settingsToSave));
      } catch (err) {
        // Probably forbidden by browser settings.
      }
    }, 500);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [fogEnabled, speedMultiplier, fov, audioEnabled, debugMode]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}
