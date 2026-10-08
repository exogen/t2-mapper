import type { CSSProperties } from "react";

/** Broadcast HUD tuning. All dimensions are CSS pixels at desktop size. */
export const matchHudLayout = {
  topMargin: 8,
  bottomMargin: 0,
  sideMargin: 16,
  maxWidth: 1560,
  singleTeamMaxWidth: 900,
  rowGap: 8,

  panelHeight: 72,
  // Horizontal movement per vertical pixel: 0 is vertical, 1 is 45 degrees.
  slant: 0.35,
  bottomCornerHeight: 11.25,
  accentWidth: 20,
  accentGap: 8,
  panelClockGap: 16,
  panelBorderWidth: 2,
  railWidth: 4,

  clockWidth: 160,
  clockHeight: 48,
  clockTopOffset: 12,
  clockTextPadding: 20,
  clockBorderWidth: 2,

  // Horizontal padding is measured from the angled edges at panel mid-height.
  outerTextPadding: 16,
  scoreInnerPadding: 28,
  contentTopPadding: 10,
  contentBottomPadding: 8,
  nameScoreGap: 20,
  nameDetailsGap: 3,
  detailsGap: 16,
  carrierMinWidthEm: 12,
  playerIconGap: 5,
  flagIconGap: 6,

  nameFontSize: 24,
  // Interpolate Tektur's width axis between these name lengths, then clamp.
  nameWidthStartLength: 20,
  nameWidthEndLength: 40,
  nameWidthStart: 100,
  nameWidthEnd: 75,
  scoreFontSize: 48,
  largeScoreFontSize: 56,
  detailsFontSize: 13,
  clockFontSize: 32,
} as const;

// Feed the same layout values to CSS; SVG geometry reads the object directly.
export const matchHudStyle = {
  "--hud-top-margin": `${matchHudLayout.topMargin}px`,
  "--hud-bottom-margin": `${matchHudLayout.bottomMargin}px`,
  "--hud-side-margin": `${matchHudLayout.sideMargin}px`,
  "--hud-row-gap": `${matchHudLayout.rowGap}px`,
  "--hud-panel-border-width": matchHudLayout.panelBorderWidth,
  "--hud-rail-width": matchHudLayout.railWidth,
  "--hud-clock-border-width": matchHudLayout.clockBorderWidth,
  "--hud-name-score-gap": `${matchHudLayout.nameScoreGap}px`,
  "--hud-name-details-gap": `${matchHudLayout.nameDetailsGap}px`,
  "--hud-details-gap": `${matchHudLayout.detailsGap}px`,
  "--hud-player-icon-gap": `${matchHudLayout.playerIconGap}px`,
  "--hud-flag-icon-gap": `${matchHudLayout.flagIconGap}px`,
  "--hud-name-font-size": `${matchHudLayout.nameFontSize}px`,
  "--hud-score-font-size": `${matchHudLayout.scoreFontSize}px`,
  "--hud-large-score-font-size": `${matchHudLayout.largeScoreFontSize}px`,
  "--hud-details-font-size": `${matchHudLayout.detailsFontSize}px`,
  "--hud-clock-font-size": `${matchHudLayout.clockFontSize}px`,
} as CSSProperties;
