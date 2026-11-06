import type { SkyGhostData } from "t2-demo-parser";
import type { Vec3 } from "./types";

interface FogFade {
  from: number;
  to: number;
  startTime: number;
  duration: number;
}

interface RealFog {
  startTime: number;
  min: number;
  max: number;
  speed: number;
}

export interface SkyCloudStorm {
  state: 1 | 2;
  startTime: number;
  duration: number;
}

/** Client weather state in source seconds, preserved by stream checkpoints. */
export interface SkyWeather {
  /** Cached horizontal render wind, when it differs from Sky.windVelocity. */
  renderWind?: Vec3;
  cloudsOn?: boolean;
  cloudStorm?: SkyCloudStorm;
  fog?: FogFade[];
  fogOn?: boolean;
  realFog?: RealFog;
}

const STORM_TIME_SCALE = 1.024;

/**
 * initSkyData refreshes the cloud and precipitation direction on a
 * DistanceMask. WindMask runs later and writes only the raw velocity.
 */
export function updateSkyRenderWind(
  weather: SkyWeather | undefined,
  previousWind: Vec3,
  nextWind: Vec3,
  refresh: boolean,
): SkyWeather | undefined {
  const cached = refresh ? previousWind : (weather?.renderWind ?? previousWind);
  const renderWind =
    cached.x === nextWind.x && cached.y === nextWind.y ? undefined : cached;
  return renderWind === weather?.renderWind
    ? weather
    : { ...weather, renderWind };
}

function stationaryFog(value: number, startTime: number): FogFade {
  return { from: value, to: value, startTime, duration: 0 };
}

function fogEnd(fog: FogFade): number {
  return fog.startTime + fog.duration;
}

function fadeValue(fog: FogFade, time: number): number {
  if (fog.duration === 0) return fog.to;
  const t = Math.max(0, Math.min(1, (time - fog.startTime) / fog.duration));
  return fog.from + (fog.to - fog.from) * t;
}

/** The lower fog bands enter first and the upper bands leave first. */
function stormFog(
  fog: FogFade[],
  startTime: number,
  duration: number,
  target: number,
  volume: number,
  comingIn: boolean,
): FogFade[] {
  const perVolume = (duration * STORM_TIME_SCALE) / fog.length;
  return fog.map((band, i) => {
    if (volume >= 0 && i !== volume) return band;
    const order = volume >= 0 ? 0 : comingIn ? i : fog.length - i - 1;
    return {
      from: band.to,
      to: target,
      startTime: startTime + order * perVolume,
      duration: perVolume,
    };
  });
}

/**
 * Retail Sky::unpackUpdate (0x5ab580) applies these masks in order.
 * TorqueScript's server methods feed the same state transitions in explore.
 */
export function updateSkyWeather(
  previous: SkyWeather | undefined,
  data: SkyGhostData,
  now: number,
  fogCount: number,
): SkyWeather | undefined {
  if (
    !data.stormInit &&
    data.stormCloudsOn == null &&
    data.stormFogOn == null &&
    data.stormType == null &&
    !data.stormTimeline &&
    !data.stormCloudProfile
  ) {
    return previous;
  }

  const weather = { ...previous };
  const baseFog = (value: number) =>
    Array.from({ length: fogCount }, () => stationaryFog(value, now));
  const init = data.stormInit;
  if (init && init.duration > 0) {
    weather.fogOn = true;
    weather.fog = stormFog(
      baseFog(init.startPct),
      now - init.startTime / 1000,
      init.duration,
      init.targetPct,
      -1,
      init.indexOrMode === 1,
    );
  }
  if (data.stormCloudsOn != null) weather.cloudsOn = data.stormCloudsOn;
  if (data.stormFogOn != null) {
    weather.fogOn = data.stormFogOn;
    if (!data.stormFogOn) weather.fog = baseFog(0);
    if (weather.realFog)
      weather.realFog = { ...weather.realFog, startTime: now };
  }

  const cloudDuration = data.stormMagnitude ?? 0;
  if (cloudDuration > 0 && (data.stormType === 1 || data.stormType === 2)) {
    weather.cloudsOn = true;
    weather.cloudStorm = {
      state: data.stormType,
      startTime: now,
      duration: cloudDuration * STORM_TIME_SCALE,
    };
  }

  const timeline = data.stormTimeline;
  if (
    timeline &&
    timeline.duration > 0 &&
    Number.isInteger(timeline.indexOrMode) &&
    timeline.indexOrMode < fogCount
  ) {
    weather.fogOn = true;
    const previousFog = weather.fog ?? baseFog(1);
    // Starting a new storm finishes the preceding storm's fade.
    const settled = previousFog.map((band) => stationaryFog(band.to, now));
    const volume = timeline.indexOrMode;
    const from = settled[volume >= 0 ? volume : 0]?.to ?? 1;
    weather.fog = stormFog(
      settled,
      now,
      timeline.duration,
      timeline.startPct,
      volume,
      from <= timeline.startPct,
    );
  }

  const profile = data.stormCloudProfile;
  if (profile) {
    if (
      profile.enabled &&
      profile.value0 >= profile.value1 &&
      profile.value2 > 0
    ) {
      if (weather.realFog) {
        weather.fog = baseFog(1).map((_, i) =>
          stationaryFog(skyFogPercentage(weather, i, fogCount, now), now),
        );
      }
      weather.realFog = {
        startTime: now,
        max: profile.value0,
        min: profile.value1,
        speed: profile.value2,
      };
    } else if (weather.realFog) {
      weather.fog = baseFog(1).map((_, i) =>
        stationaryFog(skyFogPercentage(weather, i, fogCount, now), now),
      );
      delete weather.realFog;
    }
  }
  return weather;
}

export function skyFogPercentage(
  weather: SkyWeather | undefined,
  index: number,
  count: number,
  time: number,
): number {
  const band = weather?.fog?.[index];
  const percentage = band ? fadeValue(band, time) : 1;
  const realFog = weather?.realFog;
  if (!realFog || !weather.fogOn) return percentage;

  // Real fog oscillates by a per-render step in retail (0x5ae210). Sample at the
  // engine's 32 ms reference step so playback and seeks share one clock.
  const stormEnd =
    weather.fog?.reduce(
      (end, fade) => Math.max(end, fogEnd(fade)),
      realFog.startTime,
    ) ?? realFog.startTime;
  if (time < stormEnd) return percentage;

  const speedIndex = index < 2 ? 1 - index : index;
  const speed = (count - speedIndex) ** 2 * realFog.speed;
  const steps = Math.floor((time - stormEnd) * (1000 / 32));
  if (steps <= 0 || speed === 0) return percentage;
  const { min, max } = realFog;
  const first = Math.max(1, Math.ceil((percentage - min) / speed));
  if (steps < first) return percentage - speed * steps;

  const leg = Math.max(1, Math.ceil((max - min) / speed));
  const phase = (steps - first) % (2 * leg);
  return phase <= leg
    ? Math.min(max, min + phase * speed)
    : Math.max(min, max - (phase - leg) * speed);
}

/** Translate source-clock weather when saving or hydrating a catch-up. */
export function shiftSkyWeather(
  weather: SkyWeather,
  offset: number,
): SkyWeather {
  const shift = <T extends { startTime: number }>(state: T): T => ({
    ...state,
    startTime: state.startTime + offset,
  });
  return {
    ...weather,
    cloudStorm: weather.cloudStorm && shift(weather.cloudStorm),
    fog: weather.fog?.map(shift),
    realFog: weather.realFog && shift(weather.realFog),
  };
}

const hiddenCloudFrame = { visible: false, center: 0, fade: 0 };

/** The active cloud layer sweeps in windward and fades before the next layer. */
export function skyCloudStormFrame(
  storm: SkyCloudStorm,
  layer: number,
  count: number,
  time: number,
): { visible: boolean; center: number; fade: number } | undefined {
  const incoming = storm.state === 1;
  const order = incoming ? layer : count - layer - 1;
  const sweepTime = storm.duration / (count + 1);
  const fadeTime = sweepTime / count;
  const elapsed = time - storm.startTime - order * (sweepTime + fadeTime);
  if (elapsed < 0) return incoming ? hiddenCloudFrame : undefined;
  if (elapsed >= sweepTime + fadeTime) {
    return incoming ? undefined : hiddenCloudFrame;
  }
  if (incoming) {
    return {
      visible: true,
      center: 2 * Math.max(0, 1 - elapsed / sweepTime),
      fade: Math.max(0, (elapsed - sweepTime) / fadeTime),
    };
  }
  return {
    visible: true,
    center: 2 * Math.max(0, (elapsed - fadeTime) / sweepTime),
    // A departing layer fades from full opacity down to the radial mask.
    fade: Math.min(0, elapsed / fadeTime - 1),
  };
}
