import type { PrecipitationGhostData } from "t2-demo-parser";
import type { TorqueObject, TorqueRuntime } from "../torqueScript/types";
import { resolveDatablock } from "../torqueScript/datablocks";
import type {
  LightningConfig,
  PrecipitationConfig,
  PrecipitationState,
  PrecipitationStorm,
  WeatherColor,
  WeatherPoint,
  WeatherSound,
} from "./types";

type Data = Record<string, unknown>;
type GetData = (id: number) => Data | undefined;
const STORM_SECOND = 1.024;

function num(value: unknown, fallback: number): number {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  if (value == null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "false") return false;
    if (value.toLowerCase() === "true") return true;
  }
  return num(value, fallback ? 1 : 0) !== 0;
}

function point(value: unknown, fallback: WeatherPoint): WeatherPoint {
  if (Array.isArray(value))
    return [0, 1, 2].map((i) => num(value[i], fallback[i])) as WeatherPoint;
  if (typeof value === "string")
    return point(value.trim().split(/\s+/), fallback);
  if (value && typeof value === "object") {
    const v = value as Data;
    return [
      num(v.x, fallback[0]),
      num(v.y, fallback[1]),
      num(v.z, fallback[2]),
    ];
  }
  return [...fallback];
}

function color(value: unknown, fallback: WeatherColor): WeatherColor {
  if (typeof value === "string") value = value.trim().split(/\s+/);
  if (Array.isArray(value))
    return [0, 1, 2, 3].map((i) => num(value[i], fallback[i])) as WeatherColor;
  if (value && typeof value === "object") {
    const v = value as Data;
    return [
      num(v.r, fallback[0]),
      num(v.g, fallback[1]),
      num(v.b, fallback[2]),
      num(v.a, fallback[3]),
    ];
  }
  return [...fallback];
}

function sound(
  profile: Data | undefined,
  description: Data | undefined,
  native: boolean,
): WeatherSound | undefined {
  if (typeof profile?.filename !== "string" || !profile.filename)
    return undefined;
  const get = (key: string) => description?.[native ? key.toLowerCase() : key];
  return {
    filename: profile.filename,
    is3D: bool(get("is3D"), true),
    isLooping: bool(get("isLooping"), false),
    refDist: num(get(native ? "minDistance" : "referenceDistance"), 20),
    maxDist: num(get("maxDistance"), 100),
    volume: num(get("volume"), 1),
  };
}

function wireSound(reference: unknown, get: GetData): WeatherSound | undefined {
  const profile = typeof reference === "number" ? get(reference) : undefined;
  const description =
    typeof profile?.description === "number"
      ? get(profile.description)
      : undefined;
  return sound(profile, description, false);
}

function missionSound(
  reference: unknown,
  runtime: TorqueRuntime,
): WeatherSound | undefined {
  const profile = resolveDatablock(reference, runtime);
  return sound(profile, resolveDatablock(profile?.description, runtime), true);
}

/** Retail FUN_006833b0: 32 ticks per authored second, 32 ms per tick. */
export function precipitationPercentage(
  config: Pick<PrecipitationConfig, "percentage" | "storm">,
  now: number,
): number {
  const storm = config.storm;
  if (!storm) return config.percentage;
  if (storm.duration <= 0) return storm.endPercentage;
  const fraction = Math.min(
    1,
    Math.max(0, (now - storm.startTime) / storm.duration),
  );
  return (
    storm.startPercentage +
    (storm.endPercentage - storm.startPercentage) * fraction
  );
}

function rebaseStorm(
  config: PrecipitationState,
  current: number,
  now: number,
  target?: number,
): void {
  const previous = config.storm;
  if (previous && previous.duration > 0) {
    const speed =
      (previous.endPercentage - previous.startPercentage) / previous.duration;
    const endPercentage = target ?? previous.endPercentage;
    config.storm = {
      startTime: now,
      startPercentage: current,
      endPercentage,
      duration: speed ? Math.max(0, (endPercentage - current) / speed) : 0,
    };
  }
  config.percentage = current;
}

function beginPrecipitationStorm(
  state: PrecipitationState,
  {
    endPercentage,
    durationSeconds,
  }: NonNullable<PrecipitationGhostData["stormUpdate"]>,
  now: number,
  elapsedTicks = 0,
): void {
  const duration = durationSeconds * STORM_SECOND;
  if (!(duration > 0) || !Number.isFinite(duration)) return;
  const target = num(endPercentage, state.percentage);
  const speed = (target - state.percentage) / duration;
  // The initial mask advances a fading-out storm with the opposite sign.
  const current = state.percentage + Math.abs(speed) * elapsedTicks * 0.032;
  state.percentage = current;
  state.storm = {
    startTime: now,
    duration: speed ? Math.max(0, (target - current) / speed) : 0,
    startPercentage: current,
    endPercentage: target,
  };
  state.enabled = true;
}

function precipitationMaxDrops(value: unknown, fallback: number): number {
  const count = Math.trunc(num(value, fallback));
  return count < 0 || count > 2000 ? 2000 : count;
}

function initialPrecipitationPercentage(value: number): number {
  return value >= 0 && value <= 1 ? value : 1;
}

/** Apply masks in retail order, then initialize the counters on ghost add. */
export function resolvePrecipitationState(
  fields: PrecipitationGhostData,
  now: number,
  previous?: PrecipitationState,
): PrecipitationState {
  // A hidden storm skips the retail render update, so incoming masks use
  // its stored percentage even if the visible fade would have ended.
  const current = previous?.enabled
    ? precipitationPercentage(previous, now)
    : (previous?.percentage ?? 1);
  const maxDrops = precipitationMaxDrops(
    fields.maxDrops,
    previous?.maxDrops ?? 2000,
  );
  const state: PrecipitationState = {
    percentage: num(fields.percentage, current),
    enabled: previous?.enabled ?? true,
    maxDrops,
    drawCount: previous?.drawCount,
    spawnCount:
      previous?.storm && previous.enabled
        ? Math.trunc(previous.maxDrops * current)
        : previous?.spawnCount,
    storm:
      previous?.storm &&
      (!previous.enabled ||
        now < previous.storm.startTime + previous.storm.duration)
        ? previous.storm
        : undefined,
  };
  if (fields.stormInitial) {
    beginPrecipitationStorm(
      state,
      fields.stormInitial,
      now,
      Math.max(0, num(fields.stormInitial.elapsedTicks, 0)),
    );
  }
  if (typeof fields.stormPrecipitationOn === "boolean") {
    state.enabled = fields.stormPrecipitationOn;
    if (!state.enabled) rebaseStorm(state, 0, now);
  }
  if (fields.stormUpdate) {
    if (fields.stormUpdate.durationSeconds === 0) {
      // Retail stores the new endpoint but skips recalculating the slope.
      const target = num(fields.stormUpdate.endPercentage, state.percentage);
      rebaseStorm(state, state.percentage, now, target);
    } else {
      beginPrecipitationStorm(state, fields.stormUpdate, now);
    }
  }
  if (fields.percentageUpdate != null) {
    const percentage = num(fields.percentageUpdate, state.percentage);
    rebaseStorm(state, percentage, now);
    state.drawCount = Math.trunc(maxDrops * percentage);
  }
  if (!previous) {
    const percentage = initialPrecipitationPercentage(state.percentage);
    if (percentage !== state.percentage) rebaseStorm(state, percentage, now);
    state.drawCount = state.spawnCount = Math.trunc(maxDrops * percentage);
  }
  return state;
}

function precipitationBase(
  raw: Data,
  native: boolean,
  audio: WeatherSound | undefined,
): PrecipitationConfig {
  const field = (name: string) => raw[native ? name.toLowerCase() : name];
  // The parser's legacy `numDrops` label is the retail type field (0x4c),
  // not a count: FUN_006801c0 / 006805d0 / 00680e50.
  const rawType = num(native ? field("type") : (raw.type ?? raw.numDrops), 0);
  const type = rawType === 1 ? 1 : rawType === 2 ? 2 : 0;
  const minVelocity = type === 0 ? 1.25 : 0.25;
  const maxVelocity = type === 0 ? 4 : type === 1 ? 1.5 : 1;
  const size = (name: string) => {
    const value = num(field(name), 1);
    return value > 0 && value <= 20 ? value : 1;
  };
  return {
    type,
    materialList: String(field("materialList") ?? ""),
    sound: audio,
    maxSize: num(field("maxSize"), 1),
    sizeX: size("sizeX"),
    sizeY: size("sizeY"),
    movingBoxPer: num(field("movingBoxPer"), 0.35),
    divHeightVal: num(field("divHeightVal"), 1.5),
    sizeBigBox: num(field("sizeBigBox"), 1),
    topBoxSpeed: num(field("topBoxSpeed"), 20),
    frontBoxSpeed: num(field("frontBoxSpeed"), 30),
    topBoxDrawPer: num(field("topBoxDrawPer"), 0.5),
    bottomDrawHeight: num(field("bottomDrawHeight"), 40),
    skipIfPer: num(field("skipIfPer"), -0.3),
    bottomSpeedPer: num(field("bottomSpeedPer"), 1),
    frontSpeedPer: num(field("frontSpeedPer"), 1.5),
    frontRadiusPer: num(field("frontRadiusPer"), 0.5),
    percentage: 1,
    enabled: true,
    colors: [
      type === 0
        ? [0.6, 0.6, 0.6, 1]
        : type === 1
          ? [1, 1, 1, 1]
          : [0.9, 0.8, 0.5, 1],
    ],
    offsetSpeed: 0.25,
    minVelocity,
    maxVelocity,
    averageSpeed: ((minVelocity + maxVelocity) / 2) * 0.65,
    maxDrops: 2000,
    maxRadius: type === 1 ? 125 : 80,
  };
}

function instancePrecipitation(
  base: PrecipitationConfig,
  fields: Data,
  native: boolean,
): PrecipitationConfig {
  const field = (name: string) => fields[native ? name.toLowerCase() : name];
  const result = { ...base };
  for (const name of [
    "offsetSpeed",
    "minVelocity",
    "maxVelocity",
    "maxRadius",
  ] as const) {
    if (field(name) != null) {
      const value = num(field(name), result[name]);
      if (value !== -1) result[name] = value;
    }
  }
  const rawColors = native
    ? [fields.color1, fields.color2, fields.color3]
    : Array.isArray(fields.colors)
      ? fields.colors
      : undefined;
  if (rawColors) {
    const colors: WeatherColor[] = [];
    for (const entry of rawColors) {
      const resolved = color(entry, [-1, 0, 0, 1]);
      if (resolved[0] < 0) break;
      colors.push(resolved);
    }
    if (colors.length) result.colors = colors;
  }
  return result;
}

/** Apply sparse retail masks without losing an in-progress storm. */
export function resolveStreamPrecipitation(
  raw: Data,
  fields: PrecipitationGhostData,
  get: GetData,
  now: number,
  previous?: PrecipitationConfig,
): PrecipitationConfig {
  const base = precipitationBase(raw, false, wireSound(raw.soundProfile, get));
  const instance = previous
    ? {
        colors: previous.colors,
        offsetSpeed: previous.offsetSpeed,
        minVelocity: previous.minVelocity,
        maxVelocity: previous.maxVelocity,
        averageSpeed: previous.averageSpeed ?? base.averageSpeed,
        maxRadius: previous.maxRadius,
      }
    : {};
  return {
    ...instancePrecipitation({ ...base, ...instance }, fields, false),
    ...resolvePrecipitationState(fields, now, previous),
  };
}

export function resolveMissionPrecipitation(
  object: TorqueObject,
  runtime: TorqueRuntime,
  now = 0,
): PrecipitationConfig | undefined {
  const raw = resolveDatablock(object.datablock, runtime);
  if (!raw) return undefined;
  const result = instancePrecipitation(
    precipitationBase(raw, true, missionSound(raw.soundprofile, runtime)),
    object,
    true,
  );
  result.maxDrops = precipitationMaxDrops(object.maxnumdrops, result.maxDrops);
  result.percentage = initialPrecipitationPercentage(num(object.percentage, 1));
  // Authored instance fields exist before native onNewDataBlock. Unlike
  // a ghost InitMask, they therefore participate in the cached average.
  result.averageSpeed = ((result.minVelocity + result.maxVelocity) / 2) * 0.65;
  result.drawCount = num(
    object._weatherdrawcount,
    Math.trunc(result.maxDrops * result.percentage),
  );
  result.spawnCount = num(object._weatherspawncount, result.drawCount);
  result.enabled = bool(object._weatherenabled, true);
  if (object._weatherstorm && typeof object._weatherstorm === "object")
    result.storm = { ...(object._weatherstorm as PrecipitationStorm) };
  if (result.enabled) result.percentage = precipitationPercentage(result, now);
  return result;
}

function lightningBase(
  raw: Data,
  fields: Data,
  native: boolean,
  strikeSound: WeatherSound | undefined,
  thunderSounds: WeatherSound[],
): LightningConfig {
  const field = (name: string) => fields[native ? name.toLowerCase() : name];
  const textures = native
    ? Array.from({ length: 8 }, (_, i) => raw[`striketextures${i}`])
    : raw.strikeTextures;
  return {
    position: point(field("position"), [0, 0, 0]),
    scale: point(field("scale"), [512, 512, 300]),
    strikeWidth: num(field("strikeWidth"), 2.5),
    chanceToHitTarget: num(field("chanceToHitTarget"), 0.5),
    strikeRadius: num(field("strikeRadius"), 20),
    boltStartRadius: num(field("boltStartRadius"), 20),
    color: color(field("color"), [1, 1, 1, 1]),
    fadeColor: color(field("fadeColor"), [0.1, 0.1, 1, 1]),
    useFog: bool(field("useFog"), true),
    strikesPerMinute: Math.trunc(num(field("strikesPerMinute"), 12)),
    // Retail render0x00627900 uses slot zero; never promote a later texture
    // into an intentionally empty first slot.
    strikeTextures: Array.isArray(textures)
      ? textures.map((t) => (typeof t === "string" ? t : ""))
      : [],
    strikeSound,
    thunderSounds,
  };
}

export function resolveStreamLightning(
  raw: Data,
  fields: Data,
  get: GetData,
  previous?: LightningConfig,
): LightningConfig {
  // Retail FUN_00627150 registers thunderSounds[8] at 0x44 and strikeSound
  // at 0x64. Decoder names are reversed; normalize their semantics here.
  const thunderSounds = (
    Array.isArray(raw.strikeSounds) ? raw.strikeSounds : []
  )
    .map((id) => wireSound(id, get))
    .filter((s): s is WeatherSound => !!s);
  const combined = { ...previous, ...fields };
  return lightningBase(
    raw,
    combined,
    false,
    wireSound(raw.thunderSound, get),
    thunderSounds,
  );
}

export function resolveMissionLightning(
  object: TorqueObject,
  runtime: TorqueRuntime,
): LightningConfig | undefined {
  const raw = resolveDatablock(object.datablock, runtime);
  if (!raw) return undefined;
  const thunderSounds = Array.from({ length: 8 }, (_, i) =>
    missionSound(raw[`thundersounds${i}`], runtime),
  ).filter((s): s is WeatherSound => !!s);
  return lightningBase(
    raw,
    object,
    true,
    missionSound(raw.strikesound, runtime),
    thunderSounds,
  );
}
