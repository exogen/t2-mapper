import { createStore } from "zustand/vanilla";
import { subscribeWithSelector } from "zustand/middleware";
import { classifyDevice, readDeviceSignals } from "../deviceConstraints";
import {
  DEFAULT_TEAM_COLOR_SCHEME,
  TEAM_COLOR_SCHEMES,
  type TeamColorScheme,
} from "../iffTheme";
import {
  DEFAULT_PLAYER_INTERPOLATION,
  RETAIL_PLAYER_INTERPOLATION,
  normalizePlayerInterpolation,
  samePlayerInterpolation,
  type PlayerInterpolationSettings,
} from "../stream/playerInterpolation";

export const DEFAULT_RESOURCE_LOOKAHEAD_MS = 8_000;
export const MAX_RESOURCE_LOOKAHEAD_MS = 30_000;

export function isResourceLookaheadMs(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_RESOURCE_LOOKAHEAD_MS
  );
}

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

export const MIN_IFF_DISTANCE = 50;
export const MAX_IFF_DISTANCE = 1000;
export const IFF_DISTANCE_STEP = 50;

export type FlagColorMode = "matchTeam" | "possession";
const FLAG_COLOR_MODES: readonly FlagColorMode[] = ["matchTeam", "possession"];

export type FlagReturnCamera = "followHome" | "holdPosition" | "delay";
const FLAG_RETURN_CAMERAS: readonly FlagReturnCamera[] = [
  "followHome",
  "holdPosition",
  "delay",
];

/** Server browser layout: the classic table or preview tiles. */
export type ServerBrowserView = "list" | "tiles";
const SERVER_BROWSER_VIEW_VALUES: readonly ServerBrowserView[] = [
  "list",
  "tiles",
];

export type TouchMode = "dualStick" | "moveLookStick";

export const MAX_PREFERRED_FOV = 150;
export const MAX_ZOOM_SPEED_MS = 500;

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
  invertLookY: boolean;
  clickToCycle: boolean;
  fov: number;
  /** Milliseconds to sweep through 90° of zoom. Zero makes it instant. */
  zoomSpeedMs: number;
  audioEnabled: boolean;
  audioVolume: number;
  /** Play the CastGenius commentary track when a demo has one. Off =
   *  the camera cast still runs, but the audio is never downloaded. */
  commentaryEnabled: boolean;
  /** Show the commentary's lines as subtitles, scheduled from the cue
   *  file — works with or without the audio track. */
  commentarySubtitles: boolean;
  timelineNoSpoilers: boolean;
  /** Browser-generated CastGenius lookahead. Null uses the configured default. */
  localCastLookaheadMs: number | null;
  /** How far ahead of recorded playback to warm assets. Zero disables it. */
  resourceLookaheadMs: number;
  /** Adjust sound pitch to match playback speed. */
  adjustAudioSpeed: boolean;
  animationEnabled: boolean;
  /** Engine-style projected shadows under players and vehicles. */
  shadowsEnabled: boolean;
  hdTexturesEnabled: boolean;
  debugMode: boolean;
  touchMode: TouchMode;
  joystickOpacity: number;
  warriorName: string;
  invertScroll: boolean;
  invertDrag: boolean;
  invertJoystick: boolean;
  sidebarOpen: boolean;
  hasSeenClipRecordingHelp: boolean;
  pauseClipRecordingWhenDemoPaused: boolean;
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
  quickCamDetachOnRecall: boolean;
  scoreHudStyle: HudStyle;
  showReticle: boolean;
  showCompass: boolean;
  serverBrowserView: ServerBrowserView;
  showIffs: IffVisibility;
  iffMaxDistance: number;
  /** Team color scheme used when spectating from the observer "team". */
  observerTeamColors: TeamColorScheme;
  flagColorMode: FlagColorMode;
  followTeamIff: boolean;
  firstPersonTeamIff: boolean;
  /** Player names under command circuit dot markers. */
  ccPlayerNames: CcPlayerNames;
  followBehindPlayer: boolean;
  flagReturnCamera: FlagReturnCamera;
  renderOnDemand: boolean;
  lodEnabled: boolean;
  showFpsMeter: boolean;
  /** Estimate other players' aim from their packed angles and available moves. */
  aimCorrection: boolean;
  playerInterpolation: Readonly<PlayerInterpolationSettings>;
}

/** What the current app mode allows (see modeFeatureAccess). */
export interface FeatureAccess {
  canDisableFog: boolean;
  canShowDebugVisuals: boolean;
  canShowEntityList: boolean;
}

export interface SettingsState extends Preferences {
  readonly hdTexturesDefaultEnabled: boolean;
  access: FeatureAccess;
  /** The `?fog=` URL override, mirrored here by SettingsProvider. */
  fogEnabledOverride: boolean | null;
}

/** Defaults written by the old full-snapshot format. Keep this baseline stable. */
const LEGACY_DEFAULT_PREFERENCES = {
  fogEnabled: true,
  highQualityFog: false,
  speedMultiplier: 0.15,
  mouseSensitivity: 0.002,
  invertLookY: false,
  clickToCycle: true,
  fov: 90,
  audioEnabled: true,
  audioVolume: 0.5,
  commentaryEnabled: true,
  commentarySubtitles: false,
  localCastLookaheadMs: null,
  resourceLookaheadMs: 5_000,
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
  hasSeenClipRecordingHelp: false,
  pauseClipRecordingWhenDemoPaused: true,
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
  quickCamDetachOnRecall: false,
  scoreHudStyle: "solid",
  showReticle: true,
  showCompass: true,
  serverBrowserView: "list",
  showIffs: "always",
  iffMaxDistance: 150,
  observerTeamColors: "blueOrange",
  flagColorMode: "matchTeam",
  followTeamIff: false,
  firstPersonTeamIff: false,
  ccPlayerNames: "always",
  followBehindPlayer: false,
  flagReturnCamera: "followHome",
  showFpsMeter: false,
  aimCorrection: true,
} as const satisfies Partial<Preferences>;

export const DEFAULT_PREFERENCES: Preferences = {
  ...LEGACY_DEFAULT_PREFERENCES,
  mouseSensitivity: DEFAULT_MOUSE_SENSITIVITY,
  zoomSpeedMs: 0,
  timelineNoSpoilers: false,
  resourceLookaheadMs: DEFAULT_RESOURCE_LOOKAHEAD_MS,
  hdTexturesEnabled: true,
  observerTeamColors: DEFAULT_TEAM_COLOR_SCHEME,
  renderOnDemand: false,
  lodEnabled: true,
  playerInterpolation: DEFAULT_PLAYER_INTERPOLATION,
};

type ScalarPreferences = Omit<
  Preferences,
  "hudPreferences" | "playerInterpolation"
>;

/** Sparse choices, with HUD and interpolation fields saved independently. */
type PreferenceOverrides = Partial<
  Omit<ScalarPreferences, "renderOnDemand" | "lodEnabled">
> & {
  showScoreHud?: boolean;
  scoreHudPosition?: HudPosition;
  showQuickCamHud?: boolean;
  quickCamHudPosition?: HudPosition;
  playerInterpolationOverride?: Partial<PlayerInterpolationSettings>;
};

type PersistedSettings = PreferenceOverrides & {
  preferencesVersion?: number;
  useHdTexturePack?: boolean;
  resourceLookaheadOverrideMs?: number;
  playerInterpolation?: Partial<PlayerInterpolationSettings>;
};

const PREFERENCES_VERSION = 2;
const STORAGE_KEY = "settings";
const SAVE_DEBOUNCE_MS = 500;

const LEGACY_STORED_DEFAULTS: PreferenceOverrides = {
  ...LEGACY_DEFAULT_PREFERENCES,
  showScoreHud: LEGACY_DEFAULT_PREFERENCES.hudPreferences.score.enabled,
  scoreHudPosition: LEGACY_DEFAULT_PREFERENCES.hudPreferences.score.position,
  showQuickCamHud: LEGACY_DEFAULT_PREFERENCES.hudPreferences.quickCam.enabled,
  quickCamHudPosition:
    LEGACY_DEFAULT_PREFERENCES.hudPreferences.quickCam.position,
};

export function readPersistedSettings(): PreferenceOverrides {
  try {
    return restorePreferenceOverrides(
      JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") || {},
    );
  } catch {
    return {};
  }
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/** Old snapshots included defaults. Keep choices we can distinguish. */
function restorePreferenceOverrides(
  saved: PersistedSettings,
): PreferenceOverrides {
  const restored: PreferenceOverrides = {};
  const legacy = saved.preferencesVersion !== PREFERENCES_VERSION;
  const read = <K extends keyof PreferenceOverrides>(key: K) => {
    const value = saved[key];
    // HD textures were already saved only when explicitly set.
    if (
      legacy &&
      key !== "hdTexturesEnabled" &&
      Object.is(value, LEGACY_STORED_DEFAULTS[key])
    )
      return undefined;
    return value;
  };
  const copy = <K extends keyof PreferenceOverrides>(
    key: K,
    valid: (value: NonNullable<PreferenceOverrides[K]>) => boolean = () => true,
  ) => {
    const value = read(key);
    if (value != null && valid(value))
      (restored as Record<string, unknown>)[key] = value;
  };
  const isBoolean = (value: unknown) => typeof value === "boolean";
  copy("debugMode");
  copy("showFpsMeter");
  copy("aimCorrection", isBoolean);
  // Older saves included the retail defaults even when only another preference changed.
  const legacyOverride =
    saved.playerInterpolation &&
    !samePlayerInterpolation(
      normalizePlayerInterpolation(saved.playerInterpolation),
      RETAIL_PLAYER_INTERPOLATION,
    )
      ? saved.playerInterpolation
      : undefined;
  const interpolation = saved.playerInterpolationOverride ?? legacyOverride;
  if (interpolation && typeof interpolation === "object") {
    const normalized = normalizePlayerInterpolation(interpolation);
    const overrides: Partial<PlayerInterpolationSettings> = {};
    for (const key of Object.keys(
      normalized,
    ) as (keyof PlayerInterpolationSettings)[]) {
      if (Number.isFinite(interpolation[key])) overrides[key] = normalized[key];
    }
    if (Object.keys(overrides).length)
      restored.playerInterpolationOverride = overrides;
  }
  copy("audioEnabled");
  copy("animationEnabled");
  copy("shadowsEnabled");
  copy("hdTexturesEnabled", isBoolean);
  if (
    restored.hdTexturesEnabled === undefined &&
    isBoolean(saved.useHdTexturePack)
  )
    restored.hdTexturesEnabled = saved.useHdTexturePack;
  copy("fogEnabled");
  copy("highQualityFog");
  const speedMultiplier = read("speedMultiplier");
  if (typeof speedMultiplier === "number" && Number.isFinite(speedMultiplier))
    restored.speedMultiplier = clamp(
      // Keep saved speeds on the same whole-percentage grid as the controls.
      Math.round(speedMultiplier * 100) / 100,
      MIN_SPEED_MULTIPLIER,
      MAX_SPEED_MULTIPLIER,
    );
  const mouseSensitivity = read("mouseSensitivity");
  if (typeof mouseSensitivity === "number" && Number.isFinite(mouseSensitivity))
    restored.mouseSensitivity = clamp(
      mouseSensitivity,
      MIN_MOUSE_SENSITIVITY,
      MAX_MOUSE_SENSITIVITY,
    );
  const fov = read("fov");
  if (typeof fov === "number" && Number.isFinite(fov) && fov > 0)
    restored.fov = Math.min(fov, MAX_PREFERRED_FOV);
  copy(
    "zoomSpeedMs",
    (value) =>
      Number.isInteger(value) && value >= 0 && value <= MAX_ZOOM_SPEED_MS,
  );
  copy("invertLookY", isBoolean);
  copy("clickToCycle", isBoolean);
  copy("touchMode");
  const joystickOpacity = read("joystickOpacity");
  if (typeof joystickOpacity === "number" && Number.isFinite(joystickOpacity))
    restored.joystickOpacity = clamp(
      // Keep saved opacity on the same 5% grid as the slider.
      Math.round(joystickOpacity * 20) / 20,
      MIN_JOYSTICK_OPACITY,
      MAX_JOYSTICK_OPACITY,
    );
  copy("warriorName");
  copy("audioVolume");
  copy("commentaryEnabled");
  copy("commentarySubtitles");
  copy("timelineNoSpoilers", isBoolean);
  const localCastLookaheadMs = read("localCastLookaheadMs");
  if (
    localCastLookaheadMs === null ||
    (typeof localCastLookaheadMs === "number" &&
      Number.isFinite(localCastLookaheadMs) &&
      localCastLookaheadMs >= 0)
  )
    restored.localCastLookaheadMs = localCastLookaheadMs;
  if (isResourceLookaheadMs(saved.resourceLookaheadOverrideMs))
    restored.resourceLookaheadMs = saved.resourceLookaheadOverrideMs;
  else copy("resourceLookaheadMs", isResourceLookaheadMs);
  copy("adjustAudioSpeed");
  copy("invertScroll");
  copy("invertDrag");
  copy("invertJoystick");
  copy("sidebarOpen", isBoolean);
  copy("hasSeenClipRecordingHelp", isBoolean);
  copy("pauseClipRecordingWhenDemoPaused", isBoolean);
  const fpsLimit = read("fpsLimit");
  if (fpsLimit === null || Number.isInteger(fpsLimit))
    restored.fpsLimit = fpsLimit;
  copy("renderScale", (value) => RENDER_SCALE_OPTIONS.includes(value));
  copy("showInputOverlay");
  copy("showChat");
  copy("chatHudStyle", (value) => HUD_STYLE_VALUES.includes(value));
  copy("scoreHudStyle", (value) => HUD_STYLE_VALUES.includes(value));
  copy("showMatchHud");
  copy("matchHudStyle", (value) => MATCH_HUD_STYLE_VALUES.includes(value));
  copy("scoreStyle", (value) => SCORE_STYLE_VALUES.includes(value));
  const isHudPosition = (value: string) =>
    value === "left" || value === "right";
  copy("showScoreHud", isBoolean);
  copy("scoreHudPosition", isHudPosition);
  copy("showQuickCamHud", isBoolean);
  copy("quickCamHudPosition", isHudPosition);
  copy("quickCamHideUnassignedSlots", isBoolean);
  copy("quickCamDetachOnRecall", isBoolean);
  copy("showReticle");
  copy("showCompass");
  copy("showIffs", (value) => IFF_VISIBILITY_VALUES.includes(value));
  const iffMaxDistance = read("iffMaxDistance");
  if (typeof iffMaxDistance === "number" && Number.isFinite(iffMaxDistance))
    restored.iffMaxDistance = clamp(
      Math.round(iffMaxDistance / IFF_DISTANCE_STEP) * IFF_DISTANCE_STEP,
      MIN_IFF_DISTANCE,
      MAX_IFF_DISTANCE,
    );
  copy(
    "observerTeamColors",
    (value) =>
      typeof value === "string" && Object.hasOwn(TEAM_COLOR_SCHEMES, value),
  );
  copy("flagColorMode", (value) => FLAG_COLOR_MODES.includes(value));
  copy("followTeamIff", isBoolean);
  copy("firstPersonTeamIff", isBoolean);
  copy("ccPlayerNames", (value) => CC_PLAYER_NAMES_VALUES.includes(value));
  copy("followBehindPlayer", isBoolean);
  copy("flagReturnCamera", (value) => FLAG_RETURN_CAMERAS.includes(value));
  copy("serverBrowserView", (value) =>
    SERVER_BROWSER_VIEW_VALUES.includes(value),
  );
  return restored;
}

function mergeOverrides(
  previous: PreferenceOverrides,
  changes: PreferenceOverrides,
): PreferenceOverrides {
  return {
    ...previous,
    ...changes,
    ...(changes.playerInterpolationOverride && {
      playerInterpolationOverride: {
        ...previous.playerInterpolationOverride,
        ...changes.playerInterpolationOverride,
      },
    }),
  };
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
 * The settings store: restored from localStorage on creation. Most writes
 * are debounced. React reads it through
 * SettingsProvider's hooks; everything else uses `getState`/`subscribe`.
 */
export function createSettingsStore() {
  const hdTexturesDefaultEnabled =
    !classifyDevice(readDeviceSignals()).constrained;
  const {
    // The provider restores this on non-touch devices once input is known.
    sidebarOpen: _sidebarOpen,
    showScoreHud,
    scoreHudPosition,
    showQuickCamHud,
    quickCamHudPosition,
    playerInterpolationOverride,
    ...restored
  } = readPersistedSettings();
  const { score, quickCam } = DEFAULT_PREFERENCES.hudPreferences;
  const store = createStore<SettingsState>()(
    subscribeWithSelector((): SettingsState => ({
      ...DEFAULT_PREFERENCES,
      hdTexturesEnabled: hdTexturesDefaultEnabled,
      ...restored,
      hudPreferences: {
        score: {
          enabled: showScoreHud ?? score.enabled,
          position: scoreHudPosition ?? score.position,
        },
        quickCam: {
          enabled: showQuickCamHud ?? quickCam.enabled,
          position: quickCamHudPosition ?? quickCam.position,
        },
      },
      playerInterpolation: normalizePlayerInterpolation(
        playerInterpolationOverride,
      ),
      hdTexturesDefaultEnabled,
      access: {
        canDisableFog: true,
        canShowDebugVisuals: true,
        canShowEntityList: true,
      },
      fogEnabledOverride: null,
    })),
  );

  let pending: PreferenceOverrides = {};
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const flushChoices = () => {
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = null;
    if (!Object.keys(pending).length) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          preferencesVersion: PREFERENCES_VERSION,
          ...mergeOverrides(readPersistedSettings(), pending),
        }),
      );
      pending = {};
    } catch {
      // Probably forbidden by browser settings.
    }
  };
  const saveChoices = (changes: PreferenceOverrides) => {
    if (!Object.keys(changes).length) return;
    pending = mergeOverrides(pending, changes);
    // Save the choice before the renderer starts replacing textures.
    if (changes.hdTexturesEnabled !== undefined) flushChoices();
    else {
      if (saveTimer !== null) clearTimeout(saveTimer);
      saveTimer = setTimeout(flushChoices, SAVE_DEBOUNCE_MS);
    }
  };

  return { ...store, saveChoices, flushChoices };
}

export const settingsStore = createSettingsStore();

if (typeof window !== "undefined")
  window.addEventListener("pagehide", settingsStore.flushChoices);

type SetStateAction<T> = T | ((previous: T) => T);

/** Commit only the preferences supplied by the user's action. */
export function setPreferences(
  changes: Partial<ScalarPreferences>,
  store: SettingsStore = settingsStore,
): void {
  const {
    renderOnDemand: _renderOnDemand,
    lodEnabled: _lodEnabled,
    ...choices
  } = changes;
  store.saveChoices(choices);
  store.setState(changes);
}

/** A `useState`-style setter for one preference. */
export function setPreference<
  K extends Exclude<keyof Preferences, "hudPreferences">,
>(
  key: K,
  action: SetStateAction<Preferences[K]>,
  store: SettingsStore = settingsStore,
): void {
  const value =
    typeof action === "function"
      ? (action as (previous: Preferences[K]) => Preferences[K])(
          store.getState()[key],
        )
      : action;
  if (key === "playerInterpolation")
    updatePlayerInterpolationPreference(
      value as PlayerInterpolationSettings,
      store,
    );
  else setPreferences({ [key]: value }, store);
}

export function updatePlayerInterpolationPreference(
  changes: Partial<PlayerInterpolationSettings>,
  store: SettingsStore = settingsStore,
): void {
  const current = store.getState().playerInterpolation;
  const next = normalizePlayerInterpolation({ ...current, ...changes });
  const overrides: Partial<PlayerInterpolationSettings> = {};
  for (const key of Object.keys(
    changes,
  ) as (keyof PlayerInterpolationSettings)[])
    overrides[key] = next[key];
  if (Object.keys(overrides).length)
    store.saveChoices({ playerInterpolationOverride: overrides });
  if (!samePlayerInterpolation(current, next))
    store.setState({ playerInterpolation: next });
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
  const keys = {
    score: { enabled: "showScoreHud", position: "scoreHudPosition" },
    quickCam: { enabled: "showQuickCamHud", position: "quickCamHudPosition" },
  } as const;
  const other = hud === "score" ? "quickCam" : "score";
  const previous = store.getState().hudPreferences;
  const next = { ...previous[hud], ...changes };
  const hideOther =
    next.enabled &&
    previous[other].enabled &&
    previous[other].position === next.position;
  store.saveChoices({
    ...(changes.enabled !== undefined && {
      [keys[hud].enabled]: changes.enabled,
    }),
    ...(changes.position !== undefined && {
      [keys[hud].position]: changes.position,
    }),
    ...(hideOther && { [keys[other].enabled]: false }),
  });
  store.setState({
    hudPreferences: {
      ...previous,
      [hud]: next,
      ...(hideOther && { [other]: { ...previous[other], enabled: false } }),
    },
  });
}
