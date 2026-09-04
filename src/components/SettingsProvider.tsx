import {
  createContext,
  type Dispatch,
  ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFogQueryState } from "./useQueryParams";
import { useTouchDevice } from "./useTouchDevice";
import {
  DEFAULT_TEAM_COLOR_SCHEME,
  TEAM_COLOR_SCHEMES,
  type TeamColorScheme,
} from "./iffTheme";

/** When to show player names under command circuit dot markers. */
export type CcPlayerNames = "always" | "hover" | "never";
const CC_PLAYER_NAMES_VALUES: readonly CcPlayerNames[] = [
  "always",
  "hover",
  "never",
];

/** Server browser layout: the classic table or preview tiles. */
export type ServerBrowserView = "list" | "tiles";
const SERVER_BROWSER_VIEW_VALUES: readonly ServerBrowserView[] = [
  "list",
  "tiles",
];
import { setAdjustAudioSpeedFlag } from "./audioPlaybackRate";

export const MIN_SPEED_MULTIPLIER = 0.01;
export const MAX_SPEED_MULTIPLIER = 1;

/** Render-scale fractions offered in the Graphics panel (of the standard
 *  render resolution: devicePixelRatio clamped to [1, 2]). */
export const RENDER_SCALE_OPTIONS: readonly number[] = [0.25, 0.5, 0.75, 1];

export const DEFAULT_MOUSE_SENSITIVITY = 32 / 16000; // 0.002
export const MIN_MOUSE_SENSITIVITY = 1 / 16000;
export const MAX_MOUSE_SENSITIVITY = 256 / 16000;

type StateSetter<T> = Dispatch<SetStateAction<T>>;

export type TouchMode = "dualStick" | "moveLookStick";

type SettingsContextType = {
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
  /** Play the CastGenius commentary track when a demo has one. Off =
   *  the camera cast still runs, but the mp3 is never downloaded. */
  commentaryEnabled: boolean;
  setCommentaryEnabled: StateSetter<boolean>;
  /** Show the commentary's lines as subtitles, scheduled from the cue
   *  file — works with or without the audio track. */
  commentarySubtitles: boolean;
  setCommentarySubtitles: StateSetter<boolean>;
  adjustAudioSpeed: boolean;
  setAdjustAudioSpeed: StateSetter<boolean>;
  sidebarOpen: boolean;
  setSidebarOpen: StateSetter<boolean>;
  fpsLimit: number | null;
  setFpsLimit: StateSetter<number | null>;
  /** 3D view resolution as a fraction of the standard render resolution
   *  (devicePixelRatio clamped to [1, 2] — the r3f default). 1 = 100%. */
  renderScale: number;
  setRenderScale: StateSetter<number>;
  showInputOverlay: boolean;
  setShowInputOverlay: StateSetter<boolean>;
  showChat: boolean;
  setShowChat: StateSetter<boolean>;
  showReticle: boolean;
  setShowReticle: StateSetter<boolean>;
  showCompass: boolean;
  setShowCompass: StateSetter<boolean>;
  serverBrowserView: ServerBrowserView;
  setServerBrowserView: StateSetter<ServerBrowserView>;
  /** Team color scheme used when spectating from the observer "team". */
  observerTeamColors: TeamColorScheme;
  setObserverTeamColors: StateSetter<TeamColorScheme>;
  /** Player names under command circuit dot markers. */
  ccPlayerNames: CcPlayerNames;
  setCcPlayerNames: StateSetter<CcPlayerNames>;
};

type DebugContextType = {
  debugMode: boolean;
  setDebugMode: StateSetter<boolean>;
  renderOnDemand: boolean;
  setRenderOnDemand: StateSetter<boolean>;
  showFpsMeter: boolean;
  setShowFpsMeter: StateSetter<boolean>;
};

type ControlsContextType = {
  speedMultiplier: number;
  setSpeedMultiplier: StateSetter<number>;
  mouseSensitivity: number;
  setMouseSensitivity: StateSetter<number>;
  touchMode: TouchMode;
  setTouchMode: StateSetter<TouchMode>;
  invertScroll: boolean;
  setInvertScroll: StateSetter<boolean>;
  invertDrag: boolean;
  setInvertDrag: StateSetter<boolean>;
  invertJoystick: boolean;
  setInvertJoystick: StateSetter<boolean>;
};

const SettingsContext = createContext<SettingsContextType | null>(null);
const DebugContext = createContext<DebugContextType | null>(null);
const ControlsContext = createContext<ControlsContextType | null>(null);

type PersistedSettings = {
  fogEnabled?: boolean;
  highQualityFog?: boolean;
  speedMultiplier?: number;
  mouseSensitivity?: number;
  fov?: number;
  audioEnabled?: boolean;
  adjustAudioSpeed?: boolean;
  animationEnabled?: boolean;
  debugMode?: boolean;
  touchMode?: TouchMode;
  warriorName?: string;
  audioVolume?: number;
  commentaryEnabled?: boolean;
  commentarySubtitles?: boolean;
  invertScroll?: boolean;
  invertDrag?: boolean;
  invertJoystick?: boolean;
  sidebarOpen?: boolean;
  fpsLimit?: number | null;
  renderScale?: number;
  showInputOverlay?: boolean;
  showChat?: boolean;
  showReticle?: boolean;
  showCompass?: boolean;
  showFpsMeter?: boolean;
  serverBrowserView?: ServerBrowserView;
  observerTeamColors?: TeamColorScheme;
  ccPlayerNames?: CcPlayerNames;
};

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error(
      "No SettingsContext found. Did you remember to add a <SettingsProvider>?",
    );
  }
  return context;
}

export function useDebug() {
  const context = useContext(DebugContext);
  if (!context) {
    throw new Error(
      "No DebugContext found. Did you remember to add a <SettingsProvider>?",
    );
  }
  return context;
}

export function useControls() {
  const context = useContext(ControlsContext);
  if (!context) {
    throw new Error(
      "No ControlsContext found. Did you remember to add a <SettingsProvider>?",
    );
  }
  return context;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [fogEnabled, setFogEnabled] = useState(true);
  const [highQualityFog, setHighQualityFog] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(0.15);
  const [mouseSensitivity, setMouseSensitivity] = useState(
    DEFAULT_MOUSE_SENSITIVITY,
  );
  const [fov, setFov] = useState(90);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [audioVolume, setAudioVolume] = useState(0.75);
  const [commentaryEnabled, setCommentaryEnabled] = useState(true);
  const [commentarySubtitles, setCommentarySubtitles] = useState(false);
  const [adjustAudioSpeed, setAdjustAudioSpeed] = useState(true);
  const [animationEnabled, setAnimationEnabled] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [touchMode, setTouchMode] = useState<TouchMode>("moveLookStick");
  const [warriorName, setWarriorName] = useState("MapGenius");
  const [invertScroll, setInvertScroll] = useState(false);
  const [invertDrag, setInvertDrag] = useState(false);
  const [invertJoystick, setInvertJoystick] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [fpsLimit, setFpsLimit] = useState<number | null>(null);
  const [renderScale, setRenderScale] = useState(1);
  const [showInputOverlay, setShowInputOverlay] = useState(true);
  const [showChat, setShowChat] = useState(true);
  const [showReticle, setShowReticle] = useState(true);
  const [showCompass, setShowCompass] = useState(true);
  const [serverBrowserView, setServerBrowserView] =
    useState<ServerBrowserView>("list");
  const [observerTeamColors, setObserverTeamColors] = useState<TeamColorScheme>(
    DEFAULT_TEAM_COLOR_SCHEME,
  );
  const [ccPlayerNames, setCcPlayerNames] = useState<CcPlayerNames>("always");
  const [renderOnDemand, setRenderOnDemand] = useState(false);
  const [showFpsMeter, setShowFpsMeter] = useState(false);

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

  const settingsContext: SettingsContextType = useMemo(
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
      commentaryEnabled,
      setCommentaryEnabled,
      commentarySubtitles,
      setCommentarySubtitles,
      adjustAudioSpeed,
      setAdjustAudioSpeed,
      sidebarOpen,
      setSidebarOpen,
      fpsLimit,
      setFpsLimit,
      renderScale,
      setRenderScale,
      showInputOverlay,
      setShowInputOverlay,
      showChat,
      setShowChat,
      showReticle,
      setShowReticle,
      showCompass,
      setShowCompass,
      serverBrowserView,
      setServerBrowserView,
      observerTeamColors,
      setObserverTeamColors,
      ccPlayerNames,
      setCcPlayerNames,
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
      commentaryEnabled,
      commentarySubtitles,
      adjustAudioSpeed,
      sidebarOpen,
      fpsLimit,
      renderScale,
      showInputOverlay,
      showChat,
      showReticle,
      showCompass,
      serverBrowserView,
      observerTeamColors,
      ccPlayerNames,
    ],
  );

  const debugContext: DebugContextType = useMemo(
    () => ({
      debugMode,
      setDebugMode,
      renderOnDemand,
      setRenderOnDemand,
      showFpsMeter,
      setShowFpsMeter,
    }),
    [debugMode, setDebugMode, renderOnDemand, showFpsMeter],
  );

  const controlsContext: ControlsContextType = useMemo(
    () => ({
      speedMultiplier,
      setSpeedMultiplier,
      mouseSensitivity,
      setMouseSensitivity,
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
      mouseSensitivity,
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
      savedSettings =
        JSON.parse(localStorage.getItem("settings") ?? "{}") || {};
    } catch (err) {
      // Ignore.
    }
    if (savedSettings.debugMode != null) {
      setDebugMode(savedSettings.debugMode);
    }
    if (savedSettings.showFpsMeter != null) {
      setShowFpsMeter(savedSettings.showFpsMeter);
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
    if (savedSettings.mouseSensitivity != null) {
      setMouseSensitivity(
        Math.max(
          MIN_MOUSE_SENSITIVITY,
          Math.min(MAX_MOUSE_SENSITIVITY, savedSettings.mouseSensitivity),
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
    if (savedSettings.commentaryEnabled != null) {
      setCommentaryEnabled(savedSettings.commentaryEnabled);
    }
    if (savedSettings.commentarySubtitles != null) {
      setCommentarySubtitles(savedSettings.commentarySubtitles);
    }
    if (savedSettings.adjustAudioSpeed != null) {
      setAdjustAudioSpeed(savedSettings.adjustAudioSpeed);
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
    if (
      savedSettings.fpsLimit === null ||
      Number.isInteger(savedSettings.fpsLimit)
    ) {
      setFpsLimit(savedSettings.fpsLimit!);
    }
    if (
      savedSettings.renderScale != null &&
      RENDER_SCALE_OPTIONS.includes(savedSettings.renderScale)
    ) {
      setRenderScale(savedSettings.renderScale);
    }
    if (savedSettings.showInputOverlay != null) {
      setShowInputOverlay(savedSettings.showInputOverlay);
    }
    if (savedSettings.showChat != null) {
      setShowChat(savedSettings.showChat);
    }
    if (savedSettings.showReticle != null) {
      setShowReticle(savedSettings.showReticle);
    }
    if (savedSettings.showCompass != null) {
      setShowCompass(savedSettings.showCompass);
    }
    if (
      savedSettings.observerTeamColors != null &&
      savedSettings.observerTeamColors in TEAM_COLOR_SCHEMES
    ) {
      setObserverTeamColors(savedSettings.observerTeamColors);
    }
    if (
      savedSettings.ccPlayerNames != null &&
      CC_PLAYER_NAMES_VALUES.includes(savedSettings.ccPlayerNames)
    ) {
      setCcPlayerNames(savedSettings.ccPlayerNames);
    }
    if (
      savedSettings.serverBrowserView != null &&
      SERVER_BROWSER_VIEW_VALUES.includes(savedSettings.serverBrowserView)
    ) {
      setServerBrowserView(savedSettings.serverBrowserView);
    }
    if (savedSettings.sidebarOpen != null) {
      // Don't restore on touch devices!
      if (!isTouch) {
        setSidebarOpen(savedSettings.sidebarOpen);
      }
    }
  }, [isTouch]);

  // Sync adjustAudioSpeed to the AudioEmitter module-level flag.
  useEffect(() => {
    setAdjustAudioSpeedFlag(adjustAudioSpeed);
  }, [adjustAudioSpeed]);

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
        mouseSensitivity,
        fov,
        audioEnabled,
        animationEnabled,
        debugMode,
        touchMode,
        warriorName,
        audioVolume,
        commentaryEnabled,
        commentarySubtitles,
        adjustAudioSpeed,
        invertScroll,
        invertDrag,
        invertJoystick,
        sidebarOpen,
        fpsLimit,
        renderScale,
        showInputOverlay,
        showChat,
        showReticle,
        showCompass,
        showFpsMeter,
        serverBrowserView,
        observerTeamColors,
        ccPlayerNames,
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
    mouseSensitivity,
    fov,
    audioEnabled,
    animationEnabled,
    debugMode,
    touchMode,
    warriorName,
    audioVolume,
    commentaryEnabled,
    commentarySubtitles,
    adjustAudioSpeed,
    invertScroll,
    invertDrag,
    invertJoystick,
    sidebarOpen,
    fpsLimit,
    renderScale,
    showInputOverlay,
    showChat,
    showReticle,
    showCompass,
    showFpsMeter,
    serverBrowserView,
    observerTeamColors,
    ccPlayerNames,
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
