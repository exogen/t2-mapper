import { streamSnapshotStore } from "../state/streamSnapshotStore";

/**
 * Central IFF/team color theme.
 *
 * Two coloring regimes exist:
 * - **Teamed viewer**: the engine's viewer-relative `iffColor` only
 *   CLASSIFIES the side (friend vs foe); the rendered color always comes
 *   from the IFF_* constants below, so palette edits apply everywhere.
 * - **Observer viewer** (sensor group 0): there is no friend/foe side, so
 *   entities are colored by TEAM using a user-selected scheme.
 *
 * All indicator surfaces (3D IFF triangles, health fills, flag markers,
 * command circuit dots/cones and flag callouts) resolve their colors here
 * so palettes can be swapped in one place.
 */

export interface IffRgb {
  r: number;
  g: number;
  b: number;
}

/**
 * One displayable affiliation color. `color` is the HUD shade; `mapColor`
 * is used by Command Circuit and timeline markers. Both use the same
 * bright green/red. `strokeOpacity` controls outline-style indicators
 * (the CC flag callout's circle/leader).
 */
export interface IffDisplayColor {
  color: IffRgb;
  mapColor: IffRgb;
  strokeOpacity: number;
}

/** All team tints, in sRGB (0–255). Blue keeps a brighter map variant;
 * classic Match HUD team names have their own intentional text colors. */
export const IFF_PALETTE = {
  green: { r: 0, g: 212, b: 71 },
  red: { r: 255, g: 60, b: 10 },
  blue: { r: 40, g: 152, b: 255 },
  blueMap: { r: 45, g: 162, b: 255 },
  orange: { r: 255, g: 100, b: 15 },
  neutral: { r: 200, g: 200, b: 200 },
  classicFriendlyName: { r: 45, g: 228, b: 106 },
  classicTeamName: { r: 121, g: 203, b: 212 },
} satisfies Record<string, IffRgb>;

export const IFF_FRIENDLY: IffDisplayColor = {
  color: IFF_PALETTE.green,
  mapColor: IFF_PALETTE.green,
  strokeOpacity: 0.6,
};

export const IFF_ENEMY: IffDisplayColor = {
  color: IFF_PALETTE.red,
  mapColor: IFF_PALETTE.red,
  strokeOpacity: 0.65,
};

/** Matches the app's other neutral icon tints. */
export const IFF_NEUTRAL: IffDisplayColor = {
  color: IFF_PALETTE.neutral,
  mapColor: IFF_PALETTE.neutral,
  strokeOpacity: 0.5,
};

const BLUE: IffDisplayColor = {
  color: IFF_PALETTE.blue,
  mapColor: IFF_PALETTE.blueMap,
  strokeOpacity: 0.75,
};

const ORANGE: IffDisplayColor = {
  color: IFF_PALETTE.orange,
  mapColor: IFF_PALETTE.orange,
  strokeOpacity: 0.6,
};

/**
 * Team color schemes for observer mode. Team 1 (Storm) first, team 2
 * (Inferno) second; teams beyond 2 fall back to neutral.
 */
export type TeamColorScheme = "blueOrange" | "greenRed" | "redGreen";

export const TEAM_COLOR_SCHEMES: Record<
  TeamColorScheme,
  { label: string; teams: [IffDisplayColor, IffDisplayColor] }
> = {
  blueOrange: { label: "Blue / Orange", teams: [BLUE, ORANGE] },
  greenRed: { label: "Green / Red", teams: [IFF_FRIENDLY, IFF_ENEMY] },
  redGreen: { label: "Red / Green", teams: [IFF_ENEMY, IFF_FRIENDLY] },
};

export const DEFAULT_TEAM_COLOR_SCHEME: TeamColorScheme = "blueOrange";

/**
 * Whether the stream is viewed from the observer "team" (sensor group 0 —
 * no inherent friend/foe side). False outside streaming.
 */
export function isObserverView(): boolean {
  const snapshot = streamSnapshotStore.getState().snapshot;
  return snapshot != null && snapshot.playerSensorGroup === 0;
}

/**
 * Resolve the display color for an entity's affiliation.
 *
 * Observer view: color by team via the selected scheme. Teamed view:
 * classify the engine's viewer-relative iffColor (red channel dominant =
 * enemy — the same test PlayerNameplate has always used to pick its
 * triangle texture); entities without one read as friendly, matching the
 * historical fallback.
 */
export function resolveIffDisplay(
  entity: { iffColor?: IffRgb; teamId?: number },
  observerView: boolean,
  scheme: TeamColorScheme,
): IffDisplayColor {
  if (observerView) {
    const teams = TEAM_COLOR_SCHEMES[scheme].teams;
    if (entity.teamId === 1) return teams[0];
    if (entity.teamId === 2) return teams[1];
    return IFF_NEUTRAL;
  }
  const iff = entity.iffColor;
  return iff && iff.r > iff.g ? IFF_ENEMY : IFF_FRIENDLY;
}

// Cached by object identity: theme colors are module constants, and
// several overlay painters stringify them every frame.
const _rgbStrings = new WeakMap<IffRgb, string>();

export function rgbString(color: IffRgb): string {
  let str = _rgbStrings.get(color);
  if (!str) {
    str = `rgb(${color.r}, ${color.g}, ${color.b})`;
    _rgbStrings.set(color, str);
  }
  return str;
}

export function rgbaString({ r, g, b }: IffRgb, alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
