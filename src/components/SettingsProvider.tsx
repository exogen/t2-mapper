import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFogQueryState } from "./useQueryParams";
import { useTouchDevice } from "./useTouchDevice";

type StateSetter<T> = ReturnType<typeof useState<T>>[1];

export type TouchMode = "dualStick" | "moveLookStick";

type SettingsContext = {
  fogEnabled: boolean;
  setFogEnabled: StateSetter<boolean>;
  clearFogEnabledOverride: () => void;
  highQualityFog: boolean;
  setHighQualityFog: StateSetter<boolean>;
  fov: number;
  setFov: StateSetter<number>;
  audioEnabled: boolean;
  setAudioEnabled: StateSetter<boolean>;
  animationEnabled: boolean;
  setAnimationEnabled: StateSetter<boolean>;
  warriorName: string;
  setWarriorName: StateSetter<string>;
  audioVolume: number;
  setAudioVolume: StateSetter<number>;
  sidebarOpen: boolean;
  setSidebarOpen: StateSetter<boolean>;
};

type DebugContext = {
  debugMode: boolean;
  setDebugMode: StateSetter<boolean>;
  renderOnDemand: boolean;
  setRenderOnDemand: StateSetter<boolean>;
};

type ControlsContext = {
  speedMultiplier: number;
  setSpeedMultiplier: StateSetter<number>;
  touchMode: TouchMode;
  setTouchMode: StateSetter<TouchMode>;
  invertScroll: boolean;
  setInvertScroll: StateSetter<boolean>;
  invertDrag: boolean;
  setInvertDrag: StateSetter<boolean>;
  invertJoystick: boolean;
  setInvertJoystick: StateSetter<boolean>;
};

export const MIN_SPEED_MULTIPLIER = 0.01;
export const MAX_SPEED_MULTIPLIER = 1;

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
  warriorName?: string;
  audioVolume?: number;
  invertScroll?: boolean;
  invertDrag?: boolean;
  invertJoystick?: boolean;
  sidebarOpen?: boolean;
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

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [fogEnabled, setFogEnabled] = useState(true);
  const [highQualityFog, setHighQualityFog] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(0.15);
  const [fov, setFov] = useState(90);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0.75);
  const [animationEnabled, setAnimationEnabled] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [touchMode, setTouchMode] = useState<TouchMode>("moveLookStick");
  const [warriorName, setWarriorName] = useState("MapGenius");
  const [invertScroll, setInvertScroll] = useState(false);
  const [invertDrag, setInvertDrag] = useState(false);
  const [invertJoystick, setInvertJoystick] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [renderOnDemand, setRenderOnDemand] = useState(false);

  const [fogEnabledOverride, setFogEnabledOverride] = useFogQueryState();
  const clearFogEnabledOverride = useCallback(() => {
    setFogEnabledOverride(null);
  }, [setFogEnabledOverride]);

  const setFogEnabledWithoutOverride: StateSetter<boolean> = useCallback(
    (value) => {
      setFogEnabled(value);
      clearFogEnabledOverride();
    },
    [clearFogEnabledOverride],
  );

  const settingsContext: SettingsContext = useMemo(
    () => ({
      fogEnabled: fogEnabledOverride ?? fogEnabled,
      setFogEnabled: setFogEnabledWithoutOverride,
      clearFogEnabledOverride,
      highQualityFog,
      setHighQualityFog,
      fov,
      setFov,
      audioEnabled,
      setAudioEnabled,
      animationEnabled,
      setAnimationEnabled,
      warriorName,
      setWarriorName,
      audioVolume,
      setAudioVolume,
      sidebarOpen,
      setSidebarOpen,
    }),
    [
      fogEnabled,
      fogEnabledOverride,
      setFogEnabledWithoutOverride,
      clearFogEnabledOverride,
      highQualityFog,
      fov,
      audioEnabled,
      animationEnabled,
      warriorName,
      audioVolume,
      sidebarOpen,
    ],
  );

  const debugContext: DebugContext = useMemo(
    () => ({
      debugMode,
      setDebugMode,
      renderOnDemand,
      setRenderOnDemand,
    }),
    [debugMode, setDebugMode, renderOnDemand],
  );

  const controlsContext: ControlsContext = useMemo(
    () => ({
      speedMultiplier,
      setSpeedMultiplier,
      touchMode,
      setTouchMode,
      invertScroll,
      setInvertScroll,
      invertDrag,
      setInvertDrag,
      invertJoystick,
      setInvertJoystick,
    }),
    [
      speedMultiplier,
      setSpeedMultiplier,
      touchMode,
      setTouchMode,
      invertScroll,
      invertDrag,
      invertJoystick,
    ],
  );

  const isTouch = useTouchDevice();

  // Read persisted settings from localStorage.
  useEffect(() => {
    // Defer until we know whether or not we're on a touch device...
    if (isTouch == null) return;

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
      setSpeedMultiplier(
        Math.max(
          MIN_SPEED_MULTIPLIER,
          Math.min(MAX_SPEED_MULTIPLIER, savedSettings.speedMultiplier),
        ),
      );
    }
    if (savedSettings.fov != null) {
      setFov(savedSettings.fov);
    }
    if (savedSettings.touchMode != null) {
      setTouchMode(savedSettings.touchMode);
    }
    if (savedSettings.warriorName != null) {
      setWarriorName(savedSettings.warriorName);
    }
    if (savedSettings.audioVolume != null) {
      setAudioVolume(savedSettings.audioVolume);
    }
    if (savedSettings.invertScroll != null) {
      setInvertScroll(savedSettings.invertScroll);
    }
    if (savedSettings.invertDrag != null) {
      setInvertDrag(savedSettings.invertDrag);
    }
    if (savedSettings.invertJoystick != null) {
      setInvertJoystick(savedSettings.invertJoystick);
    }
    if (savedSettings.sidebarOpen != null) {
      // Don't restore on touch devices!
      if (!isTouch) {
        setSidebarOpen(savedSettings.sidebarOpen);
      }
    }
  }, [isTouch]);

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
        warriorName,
        audioVolume,
        invertScroll,
        invertDrag,
        invertJoystick,
        sidebarOpen,
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
    warriorName,
    audioVolume,
    invertScroll,
    invertDrag,
    invertJoystick,
    sidebarOpen,
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
