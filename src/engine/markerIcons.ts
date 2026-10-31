/**
 * SVG markup of the icons the overlay labels draw (via getSvgIconLabel),
 * as react-icons renders them: Font Awesome's skull-and-crossbones and
 * hand, IcoMoon's home and down-right arrow.
 */
import { IFF_NEUTRAL, rgbString } from "../iffTheme";
import { LABEL_TEXT_FILL } from "./canvasLabel";

const skull = (color: string) =>
  `<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" color="${color}" style="color:${color}" height="12" width="12" xmlns="http://www.w3.org/2000/svg"><path d="M439.15 453.06L297.17 384l141.99-69.06c7.9-3.95 11.11-13.56 7.15-21.46L432 264.85c-3.95-7.9-13.56-11.11-21.47-7.16L224 348.41 37.47 257.69c-7.9-3.95-17.51-.75-21.47 7.16L1.69 293.48c-3.95 7.9-.75 17.51 7.15 21.46L150.83 384 8.85 453.06c-7.9 3.95-11.11 13.56-7.15 21.47l14.31 28.63c3.95 7.9 13.56 11.11 21.47 7.15L224 419.59l186.53 90.72c7.9 3.95 17.51.75 21.47-7.15l14.31-28.63c3.95-7.91.74-17.52-7.16-21.47zM150 237.28l-5.48 25.87c-2.67 12.62 5.42 24.85 16.45 24.85h126.08c11.03 0 19.12-12.23 16.45-24.85l-5.5-25.87c41.78-22.41 70-62.75 70-109.28C368 57.31 303.53 0 224 0S80 57.31 80 128c0 46.53 28.22 86.87 70 109.28zM280 112c17.65 0 32 14.35 32 32s-14.35 32-32 32-32-14.35-32-32 14.35-32 32-32zm-112 0c17.65 0 32 14.35 32 32s-14.35 32-32 32-32-14.35-32-32 14.35-32 32-32z"></path></svg>`;
const home = (color: string) =>
  `<svg stroke="currentColor" fill="currentColor" stroke-width="0" version="1.1" viewBox="0 0 16 16" color="${color}" style="color:${color}" height="9" width="9" xmlns="http://www.w3.org/2000/svg"><path d="M16 9.226l-8-6.21-8 6.21v-2.532l8-6.21 8 6.21zM14 9v6h-4v-4h-4v4h-4v-6l6-4.5z"></path></svg>`;
const hand = (color: string) =>
  `<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" color="${color}" style="color:${color}" height="9" width="9" xmlns="http://www.w3.org/2000/svg"><path d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 208c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-176c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 272c0 1.5 0 3.1 .1 4.6L67.6 283c-16-15.2-41.3-14.6-56.6 1.4s-14.6 41.3 1.4 56.6L124.8 448c43.1 41.1 100.4 64 160 64l19.2 0c97.2 0 176-78.8 176-176l0-208c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 112c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-176c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 176c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-208z"></path></svg>`;
const arrowDownRight = (color: string) =>
  `<svg stroke="currentColor" fill="currentColor" stroke-width="0" version="1.1" viewBox="0 0 16 16" color="${color}" style="color:${color}" height="8" width="8" xmlns="http://www.w3.org/2000/svg"><path d="M16 4.5l-4 4-8.5-8.5-3.5 3.5 8.5 8.5-4 4h11.5v-11.5z"></path></svg>`;

/** Death icon size on the command circuit map. */
export const SKULL_SIZE = 12;

/** Neutral gray, matching the app's other neutral icon tints (e.g. the
 *  untinted flag marker). */
export const SKULL_MARKUP = skull(rgbString(IFF_NEUTRAL.mapColor));

/** Flag status icons for the command circuit's flag callouts. */
export const FLAG_STATUS_ICONS = {
  home: { markup: home(LABEL_TEXT_FILL), size: 9 },
  held: { markup: hand(LABEL_TEXT_FILL), size: 9 },
  field: { markup: arrowDownRight(LABEL_TEXT_FILL), size: 8 },
} as const;
