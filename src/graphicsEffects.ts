const threeLutUrl = (file: string) =>
  `https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/luts/${encodeURIComponent(file)}`;

export const COLOR_GRADE_PATHS = {
  "Bourbon 64": threeLutUrl("Bourbon 64.CUBE"),
  "Chemical 168": threeLutUrl("Chemical 168.CUBE"),
  "Clayton 33": threeLutUrl("Clayton 33.CUBE"),
  "Cubicle 99": threeLutUrl("Cubicle 99.CUBE"),
  "Remy 24": threeLutUrl("Remy 24.CUBE"),
  "Presetpro-Cinematic": threeLutUrl("Presetpro-Cinematic.3dl"),
  NeutralLUT: threeLutUrl("NeutralLUT.png"),
  "B&WLUT": threeLutUrl("B&WLUT.png"),
  NightLUT: threeLutUrl("NightLUT.png"),
  "Fuji Velvia 50": "luts/film/fuji-velvia-50.png",
  "Kodak Portra 160 NC": "luts/film/kodak-portra-160-nc.png",
  "Ilford HP5 Plus 400": "luts/film/ilford-hp5-plus-400.png",
} as const;

export const GRAPHICS_EFFECTS = {
  bloom: "Bloom",
  tiltShift: "Tilt-shift",
  vignette: "Vignette",
  grain: "Film grain",
  scanlines: "Scanlines",
  chromaticAberration: "Chromatic aberration",
  crtPhosphorMask: "CRT phosphor mask",
} as const;

export type GraphicsEffect = keyof typeof GRAPHICS_EFFECTS;
export type ColorGradePreset = keyof typeof COLOR_GRADE_PATHS;
export type ColorGrade = "off" | ColorGradePreset;

export const GRAPHICS_EFFECT_KEYS = Object.keys(
  GRAPHICS_EFFECTS,
) as GraphicsEffect[];

export interface ClipGraphicsEffects {
  readonly intensity: Readonly<Partial<Record<GraphicsEffect, number>>>;
  readonly grade?: Readonly<{ name: ColorGradePreset; intensity: number }>;
}
