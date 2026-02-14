import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type StateSetter<T> = ReturnType<typeof useState<T>>[1];

export type TouchMode = "dualStick" | "moveLookStick";

type SettingsContext = {
  fogEnabled: boolean;
  setFogEnabled: StateSetter<boolean>;
  highQualityFog: boolean;
  setHighQualityFog: StateSetter<boolean>;
  fov: number;
  setFov: StateSetter<number>;
  audioEnabled: boolean;
  setAudioEnabled: StateSetter<boolean>;
  animationEnabled: boolean;
  setAnimationEnabled: StateSetter<boolean>;
};

type DebugContext = {
  debugMode: boolean;
  setDebugMode: StateSetter<boolean>;
};

type ControlsContext = {
  speedMultiplier: number;
  setSpeedMultiplier: StateSetter<number>;
  touchMode: TouchMode;
  setTouchMode: StateSetter<TouchMode>;
};

const SettingsContext = createContext<SettingsContext | null>(null);
const DebugContext = createContext<DebugContext | null>(null);
const ControlsContext = createContext<ControlsContext | null>(null);

type PersistedSettings = {
  fogEnabled?: boolean;
  highQualityFog?: boolean;
  speedMultiplier?: number;
  fov?: number;
  audioEnabled?: boolean;
  animationEnabled?: boolean;
  debugMode?: boolean;
  touchMode?: TouchMode;
};

export function useSettings() {
  return useContext(SettingsContext);
}

export function useDebug() {
  return useContext(DebugContext);
}

export function useControls() {
  return useContext(ControlsContext);
}

export function SettingsProvider({
  children,
  fogEnabledOverride,
  onClearFogEnabledOverride,
}: {
  children: ReactNode;
  fogEnabledOverride?: boolean | null;
  onClearFogEnabledOverride: () => void;
}) {
  const [fogEnabled, setFogEnabled] = useState(true);
  const [highQualityFog, setHighQualityFog] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [fov, setFov] = useState(90);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [animationEnabled, setAnimationEnabled] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [touchMode, setTouchMode] = useState<TouchMode>("moveLookStick");

  const setFogEnabledWithoutOverride: StateSetter<boolean> = useCallback(
    (value) => {
      setFogEnabled(value);
      onClearFogEnabledOverride();
    },
    [onClearFogEnabledOverride],
  );

  const settingsContext: SettingsContext = useMemo(
    () => ({
      fogEnabled: fogEnabledOverride ?? fogEnabled,
      setFogEnabled: setFogEnabledWithoutOverride,
      highQualityFog,
      setHighQualityFog,
      fov,
      setFov,
      audioEnabled,
      setAudioEnabled,
      animationEnabled,
      setAnimationEnabled,
    }),
    [
      fogEnabled,
      fogEnabledOverride,
      setFogEnabledWithoutOverride,
      highQualityFog,
      fov,
      audioEnabled,
      animationEnabled,
    ],
  );

  const debugContext: DebugContext = useMemo(
    () => ({ debugMode, setDebugMode }),
    [debugMode, setDebugMode],
  );

  const controlsContext: ControlsContext = useMemo(
    () => ({ speedMultiplier, setSpeedMultiplier, touchMode, setTouchMode }),
    [speedMultiplier, setSpeedMultiplier, touchMode, setTouchMode],
  );

  // Read persisted settings from localStorage.
  useLayoutEffect(() => {
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
    if (savedSettings.animationEnabled != null) {
      setAnimationEnabled(savedSettings.animationEnabled);
    }
    if (savedSettings.fogEnabled != null) {
      setFogEnabled(savedSettings.fogEnabled);
    }
    if (savedSettings.highQualityFog != null) {
      setHighQualityFog(savedSettings.highQualityFog);
    }
    if (savedSettings.speedMultiplier != null) {
      setSpeedMultiplier(savedSettings.speedMultiplier);
    }
    if (savedSettings.fov != null) {
      setFov(savedSettings.fov);
    }
    if (savedSettings.touchMode != null) {
      setTouchMode(savedSettings.touchMode);
    }
  }, []);

  // Persist settings to localStorage with debouncing to avoid excessive writes
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clear any pending save
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    // Debounce localStorage writes
    saveTimerRef.current = setTimeout(() => {
      const settingsToSave: PersistedSettings = {
        fogEnabled,
        highQualityFog,
        speedMultiplier,
        fov,
        audioEnabled,
        animationEnabled,
        debugMode,
        touchMode,
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
  }, [
    fogEnabled,
    highQualityFog,
    speedMultiplier,
    fov,
    audioEnabled,
    animationEnabled,
    debugMode,
    touchMode,
  ]);

  return (
    <SettingsContext.Provider value={settingsContext}>
      <DebugContext.Provider value={debugContext}>
        <ControlsContext.Provider value={controlsContext}>
          {children}
        </ControlsContext.Provider>
      </DebugContext.Provider>
    </SettingsContext.Provider>
  );
}
