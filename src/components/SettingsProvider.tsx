import {
  type Dispatch,
  ReactNode,
  type SetStateAction,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/shallow";
import { useFogQueryState, useModeQueryState } from "./useQueryParams";
import { useTouchDevice } from "./useTouchDevice";
import { useDataSource } from "../state/gameEntityStore";
import { applyModeFeatureAccess } from "./modeFeatureAccess";
import {
  clearFogEnabledOverride,
  readPersistedSettings,
  selectDebugMode,
  selectFogEnabled,
  setPreference,
  settingsStore,
  updateHudPreference,
  type CcPlayerNames,
  type HudPosition,
  type HudStyle,
  type IffVisibility,
  type MatchHudStyle,
  type Preferences,
  type ScoreStyle,
  type ServerBrowserView,
  type SettingsState,
  type TouchMode,
} from "../state/settingsStore";
import type { TeamColorScheme } from "../iffTheme";

export type {
  CcPlayerNames,
  HudPosition,
  HudStyle,
  IffVisibility,
  MatchHudStyle,
  ScoreStyle,
  ServerBrowserView,
  TouchMode,
} from "../state/settingsStore";
export {
  DEFAULT_MOUSE_SENSITIVITY,
  MAX_MOUSE_SENSITIVITY,
  MAX_SPEED_MULTIPLIER,
  MIN_MOUSE_SENSITIVITY,
  MIN_SPEED_MULTIPLIER,
  RENDER_SCALE_OPTIONS,
} from "../state/settingsStore";

type StateSetter<T> = Dispatch<SetStateAction<T>>;

type SettingsContextType = {
  canDisableFog: boolean;
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
  shadowsEnabled: boolean;
  setShadowsEnabled: StateSetter<boolean>;
  warriorName: string;
  setWarriorName: StateSetter<string>;
  audioVolume: number;
  setAudioVolume: StateSetter<number>;
  commentaryEnabled: boolean;
  setCommentaryEnabled: StateSetter<boolean>;
  commentarySubtitles: boolean;
  setCommentarySubtitles: StateSetter<boolean>;
  adjustAudioSpeed: boolean;
  setAdjustAudioSpeed: StateSetter<boolean>;
  sidebarOpen: boolean;
  setSidebarOpen: StateSetter<boolean>;
  fpsLimit: number | null;
  setFpsLimit: StateSetter<number | null>;
  renderScale: number;
  setRenderScale: StateSetter<number>;
  showInputOverlay: boolean;
  setShowInputOverlay: StateSetter<boolean>;
  showChat: boolean;
  setShowChat: StateSetter<boolean>;
  chatHudStyle: HudStyle;
  setChatHudStyle: StateSetter<HudStyle>;
  showMatchHud: boolean;
  setShowMatchHud: StateSetter<boolean>;
  matchHudStyle: MatchHudStyle;
  setMatchHudStyle: StateSetter<MatchHudStyle>;
  scoreStyle: ScoreStyle;
  setScoreStyle: StateSetter<ScoreStyle>;
  showScoreHud: boolean;
  setShowScoreHud: (enabled: boolean) => void;
  scoreHudPosition: HudPosition;
  setScoreHudPosition: (position: HudPosition) => void;
  showQuickCamHud: boolean;
  setShowQuickCamHud: (enabled: boolean) => void;
  quickCamHudPosition: HudPosition;
  setQuickCamHudPosition: (position: HudPosition) => void;
  quickCamHideUnassignedSlots: boolean;
  setQuickCamHideUnassignedSlots: StateSetter<boolean>;
  scoreHudStyle: HudStyle;
  setScoreHudStyle: StateSetter<HudStyle>;
  showReticle: boolean;
  setShowReticle: StateSetter<boolean>;
  showCompass: boolean;
  setShowCompass: StateSetter<boolean>;
  serverBrowserView: ServerBrowserView;
  setServerBrowserView: StateSetter<ServerBrowserView>;
  showIffs: IffVisibility;
  setShowIffs: StateSetter<IffVisibility>;
  observerTeamColors: TeamColorScheme;
  setObserverTeamColors: StateSetter<TeamColorScheme>;
  ccPlayerNames: CcPlayerNames;
  setCcPlayerNames: StateSetter<CcPlayerNames>;
  followBehindPlayer: boolean;
  setFollowBehindPlayer: StateSetter<boolean>;
};

type DebugContextType = {
  canShowDebugVisuals: boolean;
  canShowEntityList: boolean;
  debugMode: boolean;
  setDebugMode: StateSetter<boolean>;
  renderOnDemand: boolean;
  setRenderOnDemand: StateSetter<boolean>;
  lodEnabled: boolean;
  setLodEnabled: StateSetter<boolean>;
  showFpsMeter: boolean;
  setShowFpsMeter: StateSetter<boolean>;
  aimCorrection: boolean;
  setAimCorrection: StateSetter<boolean>;
};

type ControlsContextType = {
  speedMultiplier: number;
  setSpeedMultiplier: StateSetter<number>;
  mouseSensitivity: number;
  setMouseSensitivity: StateSetter<number>;
  clickToCycle: boolean;
  setClickToCycle: StateSetter<boolean>;
  touchMode: TouchMode;
  setTouchMode: StateSetter<TouchMode>;
  invertScroll: boolean;
  setInvertScroll: StateSetter<boolean>;
  invertDrag: boolean;
  setInvertDrag: StateSetter<boolean>;
  invertJoystick: boolean;
  setInvertJoystick: StateSetter<boolean>;
};

function setter<K extends keyof Preferences>(
  key: K,
): StateSetter<Preferences[K]> {
  return (action) => setPreference(key, action);
}

const settingsActions = {
  setFogEnabled: ((action) => {
    setPreference("fogEnabled", action);
    clearFogEnabledOverride();
  }) as StateSetter<boolean>,
  clearFogEnabledOverride: () => clearFogEnabledOverride(),
  setHighQualityFog: setter("highQualityFog"),
  setFov: setter("fov"),
  setAudioEnabled: setter("audioEnabled"),
  setAnimationEnabled: setter("animationEnabled"),
  setShadowsEnabled: setter("shadowsEnabled"),
  setWarriorName: setter("warriorName"),
  setAudioVolume: setter("audioVolume"),
  setCommentaryEnabled: setter("commentaryEnabled"),
  setCommentarySubtitles: setter("commentarySubtitles"),
  setAdjustAudioSpeed: setter("adjustAudioSpeed"),
  setSidebarOpen: setter("sidebarOpen"),
  setFpsLimit: setter("fpsLimit"),
  setRenderScale: setter("renderScale"),
  setShowInputOverlay: setter("showInputOverlay"),
  setShowChat: setter("showChat"),
  setChatHudStyle: setter("chatHudStyle"),
  setShowMatchHud: setter("showMatchHud"),
  setMatchHudStyle: setter("matchHudStyle"),
  setScoreStyle: setter("scoreStyle"),
  setShowScoreHud: (enabled: boolean) =>
    updateHudPreference("score", { enabled }),
  setScoreHudPosition: (position: HudPosition) =>
    updateHudPreference("score", { position }),
  setShowQuickCamHud: (enabled: boolean) =>
    updateHudPreference("quickCam", { enabled }),
  setQuickCamHudPosition: (position: HudPosition) =>
    updateHudPreference("quickCam", { position }),
  setQuickCamHideUnassignedSlots: setter("quickCamHideUnassignedSlots"),
  setScoreHudStyle: setter("scoreHudStyle"),
  setShowReticle: setter("showReticle"),
  setShowCompass: setter("showCompass"),
  setServerBrowserView: setter("serverBrowserView"),
  setShowIffs: setter("showIffs"),
  setObserverTeamColors: setter("observerTeamColors"),
  setCcPlayerNames: setter("ccPlayerNames"),
  setFollowBehindPlayer: setter("followBehindPlayer"),
};

function selectSettings(state: SettingsState): SettingsContextType {
  return {
    ...settingsActions,
    canDisableFog: state.access.canDisableFog,
    fogEnabled: selectFogEnabled(state),
    highQualityFog: state.highQualityFog,
    fov: state.fov,
    audioEnabled: state.audioEnabled,
    animationEnabled: state.animationEnabled,
    shadowsEnabled: state.shadowsEnabled,
    warriorName: state.warriorName,
    audioVolume: state.audioVolume,
    commentaryEnabled: state.commentaryEnabled,
    commentarySubtitles: state.commentarySubtitles,
    adjustAudioSpeed: state.adjustAudioSpeed,
    sidebarOpen: state.sidebarOpen,
    fpsLimit: state.fpsLimit,
    renderScale: state.renderScale,
    showInputOverlay: state.showInputOverlay,
    showChat: state.showChat,
    chatHudStyle: state.chatHudStyle,
    showMatchHud: state.showMatchHud,
    matchHudStyle: state.matchHudStyle,
    scoreStyle: state.scoreStyle,
    showScoreHud: state.hudPreferences.score.enabled,
    scoreHudPosition: state.hudPreferences.score.position,
    showQuickCamHud: state.hudPreferences.quickCam.enabled,
    quickCamHudPosition: state.hudPreferences.quickCam.position,
    quickCamHideUnassignedSlots: state.quickCamHideUnassignedSlots,
    scoreHudStyle: state.scoreHudStyle,
    showReticle: state.showReticle,
    showCompass: state.showCompass,
    serverBrowserView: state.serverBrowserView,
    showIffs: state.showIffs,
    observerTeamColors: state.observerTeamColors,
    ccPlayerNames: state.ccPlayerNames,
    followBehindPlayer: state.followBehindPlayer,
  };
}

const debugActions = {
  setDebugMode: setter("debugMode"),
  setRenderOnDemand: setter("renderOnDemand"),
  setLodEnabled: setter("lodEnabled"),
  setShowFpsMeter: setter("showFpsMeter"),
  setAimCorrection: setter("aimCorrection"),
};

function selectDebug(state: SettingsState): DebugContextType {
  return {
    ...debugActions,
    canShowDebugVisuals: state.access.canShowDebugVisuals,
    canShowEntityList: state.access.canShowEntityList,
    debugMode: selectDebugMode(state),
    renderOnDemand: state.renderOnDemand,
    lodEnabled: state.lodEnabled,
    showFpsMeter: state.showFpsMeter,
    aimCorrection: state.aimCorrection,
  };
}

const controlsActions = {
  setSpeedMultiplier: setter("speedMultiplier"),
  setMouseSensitivity: setter("mouseSensitivity"),
  setClickToCycle: setter("clickToCycle"),
  setTouchMode: setter("touchMode"),
  setInvertScroll: setter("invertScroll"),
  setInvertDrag: setter("invertDrag"),
  setInvertJoystick: setter("invertJoystick"),
};

function selectControls(state: SettingsState): ControlsContextType {
  return {
    ...controlsActions,
    speedMultiplier: state.speedMultiplier,
    mouseSensitivity: state.mouseSensitivity,
    clickToCycle: state.clickToCycle,
    touchMode: state.touchMode,
    invertScroll: state.invertScroll,
    invertDrag: state.invertDrag,
    invertJoystick: state.invertJoystick,
  };
}

/** Viewer preferences. Re-renders only when one of these fields changes. */
export function useSettings(): SettingsContextType {
  return useStoreWithEqualityFn(settingsStore, selectSettings, shallow);
}

export function useDebug(): DebugContextType {
  return useStoreWithEqualityFn(settingsStore, selectDebug, shallow);
}

export function useControls(): ControlsContextType {
  return useStoreWithEqualityFn(settingsStore, selectControls, shallow);
}

/**
 * Feeds the settings store what it can't know on its own: the app mode's
 * restrictions, the `?fog=` URL override, and whether this is a touch
 * device (the sidebar preference is only restored on non-touch devices).
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [mode] = useModeQueryState();
  const dataSource = useDataSource();
  const [fogEnabledOverride, setFogEnabledOverride] = useFogQueryState();
  const urlOverrideRef = useRef(fogEnabledOverride);

  useLayoutEffect(() => {
    urlOverrideRef.current = fogEnabledOverride;
    applyModeFeatureAccess(mode, dataSource, fogEnabledOverride);
  }, [mode, dataSource, fogEnabledOverride]);

  // Choosing a fog setting clears the override, which also drops it from
  // the URL.
  useEffect(
    () =>
      settingsStore.subscribe(
        (state) => state.fogEnabledOverride,
        (override) => {
          if (override === null && urlOverrideRef.current !== null)
            setFogEnabledOverride(null);
        },
      ),
    [setFogEnabledOverride],
  );

  const isTouch = useTouchDevice();
  useEffect(() => {
    if (isTouch !== false) return;
    const { sidebarOpen } = readPersistedSettings();
    if (sidebarOpen != null) setPreference("sidebarOpen", sidebarOpen);
  }, [isTouch]);

  return children;
}
