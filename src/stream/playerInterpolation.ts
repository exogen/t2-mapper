export interface PlayerInterpolationSettings {
  maxLatencyTicks: number;
  maxPredictionTicks: number;
  maxWarpTicks: number;
  minWarpTicks: number;
}

export const RETAIL_PLAYER_INTERPOLATION: Readonly<PlayerInterpolationSettings> =
  Object.freeze({
    maxLatencyTicks: 0,
    maxPredictionTicks: 30,
    maxWarpTicks: 3,
    minWarpTicks: 0.5,
  });

export const DEFAULT_PLAYER_INTERPOLATION: Readonly<PlayerInterpolationSettings> =
  Object.freeze({
    ...RETAIL_PLAYER_INTERPOLATION,
    maxWarpTicks: 2,
    minWarpTicks: 0,
  });

export const PLAYER_INTERPOLATION_RANGES = {
  maxLatencyTicks: { min: 0, max: 16, step: "any" },
  maxPredictionTicks: { min: 0, max: 120, step: 1 },
  maxWarpTicks: { min: 1, max: 30, step: 1 },
  minWarpTicks: { min: 0, max: 30, step: "any" },
} as const;

export function samePlayerInterpolation(
  a: Readonly<PlayerInterpolationSettings>,
  b: Readonly<PlayerInterpolationSettings>,
): boolean {
  return (
    a.maxLatencyTicks === b.maxLatencyTicks &&
    a.maxPredictionTicks === b.maxPredictionTicks &&
    a.maxWarpTicks === b.maxWarpTicks &&
    a.minWarpTicks === b.minWarpTicks
  );
}

export function normalizePlayerInterpolation(
  input: unknown,
): Readonly<PlayerInterpolationSettings> {
  if (input === null || typeof input !== "object")
    return DEFAULT_PLAYER_INTERPOLATION;
  const settings = { ...DEFAULT_PLAYER_INTERPOLATION };
  const values = input as Partial<
    Record<keyof PlayerInterpolationSettings, unknown>
  >;
  for (const key of Object.keys(
    settings,
  ) as (keyof PlayerInterpolationSettings)[]) {
    const value = values[key];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const { min, max, step } = PLAYER_INTERPOLATION_RANGES[key];
    settings[key] = Math.max(
      min,
      Math.min(max, step === "any" ? value : Math.round(value)),
    );
  }
  return samePlayerInterpolation(settings, DEFAULT_PLAYER_INTERPOLATION)
    ? DEFAULT_PLAYER_INTERPOLATION
    : settings;
}
