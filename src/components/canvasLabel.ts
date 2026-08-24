/**
 * Canvas-drawn label bitmaps for the 2D label overlay (see LabelOverlay).
 *
 * Labels draw at labelDpr() resolution and report their CSS-pixel size; the
 * overlay canvas runs at the same resolution and draws them 1:1, so text
 * stays crisp at native display resolution regardless of the 3D render
 * scale — the reason labels are overlay bitmaps rather than in-scene
 * sprites (which live in the render-scaled framebuffer and blur with it,
 * and cost a draw call each).
 */

/** Matches the app's `html` font stack (main.css). */
export const LABEL_FONT_FAMILY =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export function labelDpr(): number {
  return typeof window !== "undefined"
    ? Math.min(window.devicePixelRatio || 1, 2)
    : 1;
}

export interface CanvasLabel {
  canvas: HTMLCanvasElement;
  /** Drawn size in CSS pixels (canvas is dpr× larger). */
  width: number;
  height: number;
}

/**
 * Create a label canvas of the given CSS-pixel size. Use labelContext()
 * to draw on it in CSS-pixel coordinates.
 */
export function createCanvasLabel(width: number, height: number): CanvasLabel {
  const dpr = labelDpr();
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * dpr));
  canvas.height = Math.max(1, Math.ceil(height * dpr));
  return { canvas, width, height };
}

/** Cleared 2D context scaled so drawing coordinates are CSS pixels. */
export function labelContext(label: CanvasLabel): CanvasRenderingContext2D {
  const ctx = label.canvas.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, label.canvas.width, label.canvas.height);
  const dpr = label.canvas.width / Math.max(1, Math.ceil(label.width));
  ctx.scale(dpr, dpr);
  return ctx;
}

// ── Unified label style: THE place to tweak label colors and alphas ──
// Every label draws text (and icons) the same way: a dark outline under a
// light fill (the CC player-name look). Canvas strokes text natively
// (strokeText); the stroke is painted first so it sits behind the fill,
// and rasterized icons get a matching silhouette outline.

/** Default label foreground. */
export const LABEL_TEXT_FILL = "rgba(255, 255, 255, 0.92)";
/** Text outline color (rgb) and opacity. */
export const LABEL_TEXT_STROKE_RGB = "0, 0, 0";
export const LABEL_TEXT_STROKE_ALPHA = 0.7;
export const LABEL_TEXT_STROKE = `rgba(${LABEL_TEXT_STROKE_RGB}, ${LABEL_TEXT_STROKE_ALPHA})`;
export const LABEL_TEXT_STROKE_WIDTH = 2;
/** Icon silhouette outline (IFF arrows, flag/status icons, skull),
 *  separate from the text stroke. */
export const LABEL_ICON_STROKE_RGB = "0, 0, 0";
export const LABEL_ICON_STROKE_ALPHA = 0.3;
/** Letter-spacing as a fraction of font size (negative = tighter). Labels
 *  with very small text can opt out via letterSpacingEm (CC player names). */
export const LABEL_LETTER_SPACING_EM = -0.05;
/** Dark chip behind FloatingLabel text, and its padding around the text. */
export const LABEL_CHIP_BACKGROUND = "rgba(0, 0, 0, 0.2)";
export const LABEL_CHIP_PAD_X = 2;
export const LABEL_CHIP_PAD_Y = 0;

/** letterSpacing value for a CSS font string ("11px …" → "-1.1px"). */
function labelLetterSpacing(font: string, em: number): string {
  return `${parseFloat(font) * em}px`;
}

/**
 * Draw text in the app's unified label style. `fill` may override the
 * foreground (colored debug labels); the stroke never varies.
 */
export function drawLabelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  opts: {
    fill?: string;
    align?: CanvasTextAlign;
    letterSpacingEm?: number;
  } = {},
): void {
  ctx.font = font;
  ctx.letterSpacing = labelLetterSpacing(
    font,
    opts.letterSpacingEm ?? LABEL_LETTER_SPACING_EM,
  );
  ctx.textAlign = opts.align ?? "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = LABEL_TEXT_STROKE;
  ctx.lineWidth = LABEL_TEXT_STROKE_WIDTH;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = opts.fill ?? LABEL_TEXT_FILL;
  ctx.fillText(text, x, y);
}

const _measureCtx: { ctx: CanvasRenderingContext2D | null } = { ctx: null };

/** Measure text width in CSS pixels for the given CSS font string, at the
 *  unified letter-spacing (pass the same letterSpacingEm as the draw). */
export function measureLabelText(
  text: string,
  font: string,
  letterSpacingEm: number = LABEL_LETTER_SPACING_EM,
): number {
  if (!_measureCtx.ctx) {
    _measureCtx.ctx = document.createElement("canvas").getContext("2d")!;
  }
  _measureCtx.ctx.font = font;
  _measureCtx.ctx.letterSpacing = labelLetterSpacing(font, letterSpacingEm);
  return _measureCtx.ctx.measureText(text).width;
}

/** Default chip font size (FloatingLabel; callouts pass their own). */
const TEXT_FONT_SIZE = 11;

/** Gap between chip text and its trailing icon. */
export const LABEL_CHIP_ICON_GAP = 3;

export interface ChipIcon {
  bitmap: CanvasLabel;
  /** The icon's logical size (the bitmap carries an outline margin). */
  size: number;
}

/** Chip box size for the given text/options (shared with drawLabelChip). */
export function chipSize(
  text: string,
  fontSize: number,
  icon?: ChipIcon | null,
): [width: number, height: number] {
  const font = `${fontSize}px ${LABEL_FONT_FAMILY}`;
  const contentWidth =
    measureLabelText(text, font) + (icon ? LABEL_CHIP_ICON_GAP + icon.size : 0);
  return [
    Math.ceil(contentWidth) + LABEL_CHIP_PAD_X * 2,
    fontSize + 2 + LABEL_CHIP_PAD_Y * 2,
  ];
}

/**
 * Draw a label chip — the shared pill every chip-style label uses:
 * LABEL_CHIP_BACKGROUND backdrop, LABEL_CHIP_PAD_X/Y padding, stroked
 * text, optional trailing icon. Anchored at (x, y): "center" centers the
 * chip there; "left" puts the chip's left edge there, vertically centered.
 */
export function drawLabelChip(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: {
    fontSize?: number;
    fill?: string;
    icon?: ChipIcon | null;
    anchor?: "center" | "left";
  } = {},
): void {
  const fontSize = opts.fontSize ?? TEXT_FONT_SIZE;
  const font = `${fontSize}px ${LABEL_FONT_FAMILY}`;
  const icon = opts.icon ?? null;
  const textWidth = Math.ceil(measureLabelText(text, font));
  const width =
    textWidth +
    (icon ? LABEL_CHIP_ICON_GAP + icon.size : 0) +
    LABEL_CHIP_PAD_X * 2;
  const height = fontSize + 2 + LABEL_CHIP_PAD_Y * 2;
  const boxX = opts.anchor === "left" ? x : x - width / 2;
  const boxY = y - height / 2;
  ctx.fillStyle = LABEL_CHIP_BACKGROUND;
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, width, height, 1);
  ctx.fill();
  drawLabelText(
    ctx,
    text,
    boxX + LABEL_CHIP_PAD_X,
    boxY + height / 2 + 0.5,
    font,
    {
      fill: opts.fill,
      align: "left",
    },
  );
  if (icon) {
    const pad = (icon.bitmap.width - icon.size) / 2;
    ctx.drawImage(
      icon.bitmap.canvas,
      boxX + LABEL_CHIP_PAD_X + textWidth + LABEL_CHIP_ICON_GAP - pad,
      boxY + (height - icon.size) / 2 - pad,
      icon.bitmap.width,
      icon.bitmap.height,
    );
  }
}

/** A FloatingLabel-style text chip: dark pill background, stroked text. */
export function makeTextLabel(text: string, color?: string): CanvasLabel {
  const [width, height] = chipSize(text, TEXT_FONT_SIZE);
  const label = createCanvasLabel(width, height);
  const ctx = labelContext(label);
  drawLabelChip(ctx, text, width / 2, height / 2, { fill: color });
  return label;
}

// ── Callout lines (tour + flag callouts) ──

export const CALLOUT_STROKE_WIDTH = 1.2;
const CALLOUT_LEADER_DIAGONAL = 16;
const CALLOUT_LEADER_RUN = 22;

/**
 * Draw a callout's circle and 45° down-right leader line; returns the
 * label anchor at the end of the horizontal run (for drawLabelChip with
 * anchor "left").
 */
export function drawCalloutLines(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  stroke: string,
): { x: number; y: number } {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = CALLOUT_STROKE_WIDTH;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  const startX = cx + radius * Math.SQRT1_2;
  const startY = cy + radius * Math.SQRT1_2;
  const elbowX = startX + CALLOUT_LEADER_DIAGONAL;
  const elbowY = startY + CALLOUT_LEADER_DIAGONAL;
  const endX = elbowX + CALLOUT_LEADER_RUN;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(elbowX, elbowY);
  ctx.lineTo(endX, elbowY);
  ctx.stroke();
  return { x: endX, y: elbowY };
}

// ── Tinted icons ──
// The canvas equivalent of the old CSS mask-image + background-color
// pattern (IFF arrows, flag icons): the icon image is an alpha mask,
// filled with a theme color and drawn with the unified silhouette
// outline. Cached by (url, color, size) — a handful of team colors per
// session.

// ── Rasterized SVG icons ──
// For react-icons in overlay labels: callers render the icon element to a
// static markup string once (renderToStaticMarkup) and this rasterizes it
// to a bitmap via an SVG data URL, cached by markup + size. Icons get the
// same dark silhouette outline as label text (drawn as a stroke-tinted
// copy at one-pixel offsets under the icon — viewBox-agnostic, unlike an
// SVG stroke-width).

/** Outline margin around the icon; the bitmap is this much larger on
 *  every side than the requested icon size. */
export const SVG_ICON_OUTLINE_PAD = 2;

const _outlineOffsets: ReadonlyArray<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2],
  [-Math.SQRT1_2, -Math.SQRT1_2],
];

/**
 * Draw an icon at (x, y, w, h) in CSS pixels with the unified silhouette
 * outline behind it: a stroke-tinted copy stamped at one-pixel offsets
 * (accumulated opaque, then composited once at the stroke alpha so
 * overlapping stamps don't stack darker than text strokes). The outline
 * extends 1px beyond the icon box on every side.
 */
function drawOutlinedIcon(
  ctx: CanvasRenderingContext2D,
  icon: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const dpr = labelDpr();
  const silhouette = document.createElement("canvas");
  silhouette.width = Math.max(1, Math.ceil(w * dpr));
  silhouette.height = Math.max(1, Math.ceil(h * dpr));
  const sctx = silhouette.getContext("2d")!;
  sctx.drawImage(icon, 0, 0, silhouette.width, silhouette.height);
  sctx.globalCompositeOperation = "source-in";
  sctx.fillStyle = `rgb(${LABEL_ICON_STROKE_RGB})`;
  sctx.fillRect(0, 0, silhouette.width, silhouette.height);

  const outline = document.createElement("canvas");
  outline.width = Math.max(1, Math.ceil((w + 2) * dpr));
  outline.height = Math.max(1, Math.ceil((h + 2) * dpr));
  const octx = outline.getContext("2d")!;
  octx.scale(dpr, dpr);
  for (const [dx, dy] of _outlineOffsets) {
    octx.drawImage(silhouette, 1 + dx, 1 + dy, w, h);
  }

  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * LABEL_ICON_STROKE_ALPHA;
  ctx.drawImage(outline, x - 1, y - 1, w + 2, h + 2);
  ctx.globalAlpha = prevAlpha;
  ctx.drawImage(icon, x, y, w, h);
}

const _svgIconImages = new Map<string, HTMLImageElement | null>();
const _svgIconLabels = new Map<string, CanvasLabel>();

/**
 * Returns the icon bitmap (icon size plus the outline margin), or null
 * while the SVG is still rasterizing.
 */
export function getSvgIconLabel(
  markup: string,
  width: number,
  height: number,
): CanvasLabel | null {
  const key = `${width}x${height}|${markup}`;
  const cached = _svgIconLabels.get(key);
  if (cached) return cached;

  const image = _svgIconImages.get(key);
  if (image === undefined) {
    const el = new Image();
    _svgIconImages.set(key, null);
    el.onload = () => {
      _svgIconImages.set(key, el);
    };
    el.src = `data:image/svg+xml,${encodeURIComponent(markup)}`;
    return null;
  }
  if (image === null) return null; // still rasterizing

  const pad = SVG_ICON_OUTLINE_PAD;
  const label = createCanvasLabel(width + pad * 2, height + pad * 2);
  const ctx = labelContext(label);
  drawOutlinedIcon(ctx, image, pad, pad, width, height);
  _svgIconLabels.set(key, label);
  return label;
}

export interface TintedIconOptions {
  /** Icon size in CSS pixels (drawn contain-fit, centered). */
  size: number;
  /** Canvas margin around the icon (room for the silhouette outline). */
  margin: number;
}

const _iconImages = new Map<string, HTMLImageElement | null>();
const _iconLabels = new Map<string, CanvasLabel>();

/**
 * Returns the tinted icon bitmap, or null while the image is still
 * loading. The bitmap is (size + 2·margin) square.
 */
export function getTintedIconLabel(
  url: string,
  colorStr: string,
  opts: TintedIconOptions,
): CanvasLabel | null {
  const key = `${url}|${colorStr}|${opts.size}`;
  const cached = _iconLabels.get(key);
  if (cached) return cached;

  const image = _iconImages.get(url);
  if (image === undefined) {
    const el = new Image();
    _iconImages.set(url, null);
    el.onload = () => {
      _iconImages.set(url, el);
    };
    el.src = url;
    return null;
  }
  if (image === null) return null; // still loading

  const dpr = labelDpr();
  // Contain-fit the image within the icon box.
  const aspect = image.width / Math.max(1, image.height);
  const iconW = aspect >= 1 ? opts.size : opts.size * aspect;
  const iconH = aspect >= 1 ? opts.size / aspect : opts.size;

  // Tint on a temp canvas: draw the mask, then fill with the color
  // through its alpha (source-in).
  const temp = document.createElement("canvas");
  temp.width = Math.max(1, Math.ceil(iconW * dpr));
  temp.height = Math.max(1, Math.ceil(iconH * dpr));
  const tctx = temp.getContext("2d")!;
  tctx.imageSmoothingEnabled = false;
  tctx.drawImage(image, 0, 0, temp.width, temp.height);
  tctx.globalCompositeOperation = "source-in";
  tctx.fillStyle = colorStr;
  tctx.fillRect(0, 0, temp.width, temp.height);

  const labelSize = opts.size + opts.margin * 2;
  const label = createCanvasLabel(labelSize, labelSize);
  const ctx = labelContext(label);
  ctx.imageSmoothingEnabled = false;
  drawOutlinedIcon(
    ctx,
    temp,
    (labelSize - iconW) / 2,
    (labelSize - iconH) / 2,
    iconW,
    iconH,
  );
  _iconLabels.set(key, label);
  return label;
}
