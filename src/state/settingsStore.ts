import { createStore } from "zustand/vanilla";
import { subscribeWithSelector } from "zustand/middleware";
import {
  DEFAULT_TEAM_COLOR_SCHEME,
  TEAM_COLOR_SCHEMES,
  type TeamColorScheme,
} from "../iffTheme";

/** When to show player names under command circuit dot markers. */
export type CcPlayerNames = "always" | "hover" | "never";
const CC_PLAYER_NAMES_VALUES: readonly CcPlayerNames[] = [
  "always",
  "hover",
  "never",
];

export type HudStyle = "solid" | "transparent";
const HUD_STYLE_VALUES: readonly HudStyle[] = ["solid", "transparent"];

export type MatchHudStyle = "classic" | "broadcast";
const MATCH_HUD_STYLE_VALUES: readonly MatchHudStyle[] = [
  "classic",
  "broadcast",
];

export type ScoreStyle = "classic" | "competition";
const SCORE_STYLE_VALUES: readonly ScoreStyle[] = ["classic", "competition"];

export type HudPosition = "left" | "right";
export type HudPreference = { enabled: boolean; position: HudPosition };

/** Visibility of the player's world-space IFF triangle and nameplate. */
export type IffVisibility = "always" | "followed" | "exceptFollowed" | "never";
const IFF_VISIBILITY_VALUES: readonly IffVisibility[] = [
  "always",
  "followed",
  "exceptFollowed",
  "never",
];

/** Server browser layout: the classic table or preview tiles. */
export type ServerBrowserView = "list" | "tiles";
const SERVER_BROWSER_VIEW_VALUES: readonly ServerBrowserView[] = [
  "list",
  "tiles",
];

export type TouchMode = "dualStick" | "moveLookStick";

export const MIN_JOYSTICK_OPACITY = 0.1;
export const MAX_JOYSTICK_OPACITY = 1;

export const MIN_SPEED_MULTIPLIER = 0.01;
export const MAX_SPEED_MULTIPLIER = 1;

/** Render-scale fractions offered in the Graphics panel (of the standard
 *  render resolution: devicePixelRatio clamped to [1, 2]). */
export const RENDER_SCALE_OPTIONS: readonly number[] = [0.25, 0.5, 0.75, 1];

export const DEFAULT_MOUSE_SENSITIVITY = 32 / 16000; // 0.002
export const MIN_MOUSE_SENSITIVITY = 1 / 16000;
export const MAX_MOUSE_SENSITIVITY = 256 / 16000;

/** The viewer's own choices, as stored. Read the effective fog and debug
 *  state through `selectFogEnabled` and `selectDebugMode`, which apply the
 *  mode's restrictions and the URL's fog override. */
export interface Preferences {
  fogEnabled: boolean;
  highQualityFog: boolean;
  speedMultiplier: number;
  mouseSensitivity: number;
  clickToCycle: boolean;
  fov: number;
  audioEnabled: boolean;
  audioVolume: number;
  /** Play the CastGenius commentary track when a demo has one. Off =
   *  the camera cast still runs, but the audio is never downloaded. */
  commentaryEnabled: boolean;
  /** Show the commentary's lines as subtitles, scheduled from the cue
   *  file — works with or without the audio track. */
  commentarySubtitles: boolean;
  /** Adjust sound pitch to match playback speed. */
  adjustAudioSpeed: boolean;
  animationEnabled: boolean;
  /** Engine-style projected shadows under players and vehicles. */
  shadowsEnabled: boolean;
  debugMode: boolean;
  touchMode: TouchMode;
  joystickOpacity: number;
  warriorName: string;
  invertScroll: boolean;
  invertDrag: boolean;
  invertJoystick: boolean;
  sidebarOpen: boolean;
  fpsLimit: number | null;
  /** 3D view resolution as a fraction of the standard render resolution
   *  (devicePixelRatio clamped to [1, 2]). 1 = 100%. */
  renderScale: number;
  showInputOverlay: boolean;
  showChat: boolean;
  chatHudStyle: HudStyle;
  showMatchHud: boolean;
  matchHudStyle: MatchHudStyle;
  scoreStyle: ScoreStyle;
  /** The mini score and quick cam HUDs share the screen edges: enabling
   *  one at the other's position turns the other off. */
  hudPreferences: { score: HudPreference; quickCam: HudPreference };
  quickCamHideUnassignedSlots: boolean;
  scoreHudStyle: HudStyle;
  showReticle: boolean;
  showCompass: boolean;
  serverBrowserView: ServerBrowserView;
  showIffs: IffVisibility;
  /** Team color scheme used when spectating from the observer "team". */
  observerTeamColors: TeamColorScheme;
  /** Player names under command circuit dot markers. */
  ccPlayerNames: CcPlayerNames;
  followBehindPlayer: boolean;
  renderOnDemand: boolean;
  lodEnabled: boolean;
  showFpsMeter: boolean;
  /**
   * Read other players' packed view angles at the middle of their step
   * wherever they're drawn: models, beams and follow cameras (playerView.ts).
   */
  aimCorrection: boolean;
}

/** What the current app mode allows (see modeFeatureAccess). */
export interface FeatureAccess {
  canDisableFog: boolean;
  canShowDebugVisuals: boolean;
  canShowEntityList: boolean;
}

export interface SettingsState extends Preferences {
  access: FeatureAccess;
  /** The `?fog=` URL override, mirrored here by SettingsProvider. */
  fogEnabledOverride: boolean | null;
}

export const DEFAULT_PREFERENCES: Preferences = {
  fogEnabled: true,
  highQualityFog: false,
  speedMultiplier: 0.15,
  mouseSensitivity: DEFAULT_MOUSE_SENSITIVITY,
  clickToCycle: true,
  fov: 90,
  audioEnabled: true,
  audioVolume: 0.75,
  commentaryEnabled: true,
  commentarySubtitles: false,
  adjustAudioSpeed: true,
  animationEnabled: true,
  shadowsEnabled: true,
  debugMode: false,
  touchMode: "moveLookStick",
  joystickOpacity: 0.9,
  warriorName: "MapGenius",
  invertScroll: false,
  invertDrag: false,
  invertJoystick: false,
  sidebarOpen: false,
  fpsLimit: null,
  renderScale: 1,
  showInputOverlay: true,
  showChat: true,
  chatHudStyle: "solid",
  showMatchHud: true,
  matchHudStyle: "classic",
  scoreStyle: "classic",
  hudPreferences: {
    score: { enabled: false, position: "left" },
    quickCam: { enabled: false, position: "left" },
  },
  quickCamHideUnassignedSlots: false,
  scoreHudStyle: "solid",
  showReticle: true,
  showCompass: true,
  serverBrowserView: "list",
  showIffs: "always",
  observerTeamColors: DEFAULT_TEAM_COLOR_SCHEME,
  ccPlayerNames: "always",
  followBehindPlayer: false,
  renderOnDemand: false,
  lodEnabled: true,
  showFpsMeter: false,
  aimCorrection: true,
};

/** The localStorage shape (flat HUD preferences, no session-only keys). */
type PersistedSettings = Partial<
  Omit<Preferences, "hudPreferences" | "renderOnDemand" | "lodEnabled">
> & {
  showScoreHud?: boolean;
  scoreHudPosition?: HudPosition;
  showQuickCamHud?: boolean;
  quickCamHudPosition?: HudPosition;
};

const STORAGE_KEY = "settings";
const SAVE_DEBOUNCE_MS = 500;

export function readPersistedSettings(): PersistedSettings {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") || {};
  } catch {
    return {};
  }
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/**
 * Validated preferences from what was saved. `sidebarOpen` is left out:
 * it's only restored on non-touch devices, once that's known.
 */
export function restorePreferences(
  saved: PersistedSettings,
): Partial<Preferences> {
  const restored: Partial<Preferences> = {};
  const copy = <K extends keyof PersistedSettings & keyof Preferences>(
    key: K,
    valid: (value: NonNullable<PersistedSettings[K]>) => boolean = () => true,
  ) => {
    const value = saved[key];
    if (value != null && valid(value))
      (restored as Record<string, unknown>)[key] = value;
  };
  const isBoolean = (value: unknown) => typeof value === "boolean";
  copy("debugMode");
  copy("showFpsMeter");
  copy("aimCorrection", isBoolean);
  copy("audioEnabled");
  copy("animationEnabled");
  copy("shadowsEnabled");
  copy("fogEnabled");
  copy("highQualityFog");
  if (saved.speedMultiplier != null)
    restored.speedMultiplier = clamp(
      // Keep saved speeds on the same whole-percentage grid as the controls.
      Math.round(saved.speedMultiplier * 100) / 100,
      MIN_SPEED_MULTIPLIER,
      MAX_SPEED_MULTIPLIER,
    );
  if (saved.mouseSensitivity != null)
    restored.mouseSensitivity = clamp(
      saved.mouseSensitivity,
      MIN_MOUSE_SENSITIVITY,
      MAX_MOUSE_SENSITIVITY,
    );
  copy("fov");
  copy("clickToCycle", isBoolean);
  copy("touchMode");
  if (
    typeof saved.joystickOpacity === "number" &&
    Number.isFinite(saved.joystickOpacity)
  )
    restored.joystickOpacity = clamp(
      // Keep saved opacity on the same 5% grid as the slider.
      Math.round(saved.joystickOpacity * 20) / 20,
      MIN_JOYSTICK_OPACITY,
      MAX_JOYSTICK_OPACITY,
    );
  copy("warriorName");
  copy("audioVolume");
  copy("commentaryEnabled");
  copy("commentarySubtitles");
  copy("adjustAudioSpeed");
  copy("invertScroll");
  copy("invertDrag");
  copy("invertJoystick");
  if (saved.fpsLimit === null || Number.isInteger(saved.fpsLimit))
    restored.fpsLimit = saved.fpsLimit;
  copy("renderScale", (value) => RENDER_SCALE_OPTIONS.includes(value));
  copy("showInputOverlay");
  copy("showChat");
  copy("chatHudStyle", (value) => HUD_STYLE_VALUES.includes(value));
  copy("scoreHudStyle", (value) => HUD_STYLE_VALUES.includes(value));
  copy("showMatchHud");
  copy("matchHudStyle", (value) => MATCH_HUD_STYLE_VALUES.includes(value));
  copy("scoreStyle", (value) => SCORE_STYLE_VALUES.includes(value));
  restored.hudPreferences = {
    score: {
      position: saved.scoreHudPosition === "right" ? "right" : "left",
      enabled: saved.showScoreHud ?? false,
    },
    quickCam: {
      position: saved.quickCamHudPosition === "right" ? "right" : "left",
      enabled: saved.showQuickCamHud ?? false,
    },
  };
  copy("quickCamHideUnassignedSlots", isBoolean);
  copy("showReticle");
  copy("showCompass");
  copy("showIffs", (value) => IFF_VISIBILITY_VALUES.includes(value));
  copy("observerTeamColors", (value) => value in TEAM_COLOR_SCHEMES);
  copy("ccPlayerNames", (value) => CC_PLAYER_NAMES_VALUES.includes(value));
  copy("followBehindPlayer", isBoolean);
  copy("serverBrowserView", (value) =>
    SERVER_BROWSER_VIEW_VALUES.includes(value),
  );
  return restored;
}

function toPersisted(state: Preferences): PersistedSettings {
  const {
    hudPreferences,
    renderOnDemand: _renderOnDemand,
    lodEnabled: _lodEnabled,
    ...rest
  } = state;
  return {
    ...rest,
    showScoreHud: hudPreferences.score.enabled,
    scoreHudPosition: hudPreferences.score.position,
    showQuickCamHud: hudPreferences.quickCam.enabled,
    quickCamHudPosition: hudPreferences.quickCam.position,
  };
}

function pickPreferences(state: SettingsState): Preferences {
  const preferences = {} as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_PREFERENCES))
    preferences[key] = state[key as keyof Preferences];
  return preferences as unknown as Preferences;
}

/** Effective fog: forced on where the mode can't disable it, otherwise the
 *  URL override wins over the preference. */
export function selectFogEnabled(state: SettingsState): boolean {
  return (
    !state.access.canDisableFog ||
    (state.fogEnabledOverride ?? state.fogEnabled)
  );
}

/** Effective debug mode, gated by what the mode allows. */
export function selectDebugMode(state: SettingsState): boolean {
  return state.access.canShowDebugVisuals && state.debugMode;
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;

/**
 * The settings store: restored from localStorage on creation, saved back
 * (debounced) whenever a preference changes. React reads it through
 * SettingsProvider's hooks; everything else uses `getState`/`subscribe`.
 */
export function createSettingsStore() {
  const store = createStore<SettingsState>()(
    subscribeWithSelector((): SettingsState => ({
      ...DEFAULT_PREFERENCES,
      ...restorePreferences(readPersistedSettings()),
      access: {
        canDisableFog: true,
        canShowDebugVisuals: true,
        canShowEntityList: true,
      },
      fogEnabledOverride: null,
    })),
  );

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  store.subscribe(
    pickPreferences,
    (preferences) => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        try {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(toPersisted(preferences)),
          );
        } catch {
          // Probably forbidden by browser settings.
        }
      }, SAVE_DEBOUNCE_MS);
    },
    { equalityFn: shallowEqual },
  );

  return store;
}

function shallowEqual(a: object, b: object): boolean {
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  for (const key of Object.keys(aRecord))
    if (!Object.is(aRecord[key], bRecord[key])) return false;
  return true;
}

export const settingsStore = createSettingsStore();

type SetStateAction<T> = T | ((previous: T) => T);

/** A `useState`-style setter for one preference. */
export function setPreference<K extends keyof Preferences>(
  key: K,
  action: SetStateAction<Preferences[K]>,
  store: SettingsStore = settingsStore,
): void {
  store.setState((state) => ({
    [key]:
      typeof action === "function"
        ? (action as (previous: Preferences[K]) => Preferences[K])(state[key])
        : action,
  }));
}

/** Drop the `?fog=` override so the preference applies again. */
export function clearFogEnabledOverride(
  store: SettingsStore = settingsStore,
): void {
  store.setState({ fogEnabledOverride: null });
}

/** Enabling the score or quick cam HUD at the other's position hides the
 *  other, so the most recent choice wins the edge. */
export function updateHudPreference(
  hud: "score" | "quickCam",
  changes: Partial<HudPreference>,
  store: SettingsStore = settingsStore,
): void {
  const other = hud === "score" ? "quickCam" : "score";
  store.setState(({ hudPreferences: previous }) => {
    const next = { ...previous[hud], ...changes };
    return {
      hudPreferences: {
        ...previous,
        [hud]: next,
        [other]:
          next.enabled &&
          previous[other].enabled &&
          previous[other].position === next.position
            ? { ...previous[other], enabled: false }
            : previous[other],
      } as Preferences["hudPreferences"],
    };
  });
}
