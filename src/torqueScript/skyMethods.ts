import type { SkyGhostData } from "t2-demo-parser";
import { skyFromMis } from "../scene/misToScene";
import { updateSkyRenderWind, updateSkyWeather } from "../scene/skyWeather";
import type { TorqueObject, TorqueRuntime } from "./types";

function torqueBool(value: unknown): boolean {
  return String(value).toLowerCase() === "true" || !!Number(value);
}

/** Retail Sky console methods registered at 0x5ab1c0. */
export function registerSkyMethods(runtime: TorqueRuntime): void {
  const reg = runtime.$.registerMethod.bind(runtime.$);
  const update = (object: TorqueObject, fields: SkyGhostData) => {
    const now = (Date.now() - runtime.state.startTime) / 1000;
    const sky = skyFromMis(object);
    runtime.$.setProp(
      object,
      "_skyweather",
      updateSkyWeather(sky.weather, fields, now, sky.fogVolumes.length),
    );
  };

  reg("Sky", "stormCloudsShow", (object, show) =>
    update(object, { stormCloudsOn: torqueBool(show) }),
  );
  reg("Sky", "stormFogShow", (object, show) =>
    update(object, { stormFogOn: torqueBool(show) }),
  );
  reg("Sky", "stormClouds", (object, comingIn, seconds) => {
    const duration = Number(seconds);
    if (Number.isFinite(duration) && duration > 0) {
      update(object, {
        stormType: torqueBool(comingIn) ? 1 : 2,
        stormMagnitude: duration,
      });
    }
  });
  reg("Sky", "stormFog", (object, percentage, seconds) => {
    const target = Number(percentage);
    const duration = Number(seconds);
    if (Number.isFinite(target) && Number.isFinite(duration) && duration > 0) {
      update(object, {
        stormTimeline: { startPct: target, duration, indexOrMode: -1 },
      });
    }
  });
  reg("Sky", "realFog", (object, enabled, max, min, speed) => {
    const value0 = Number(max);
    const value1 = Number(min);
    const value2 = Number(speed);
    if ([value0, value1, value2].every(Number.isFinite)) {
      update(object, {
        stormCloudProfile: {
          enabled: Number(torqueBool(enabled)),
          value0,
          value1,
          value2,
        },
      });
    }
  });
  reg("Sky", "setWindVelocity", (object, x, y, z) => {
    const windVelocity = { x: Number(x), y: Number(y), z: Number(z) };
    if (Object.values(windVelocity).every(Number.isFinite)) {
      const sky = skyFromMis(object);
      const weather = updateSkyRenderWind(
        sky.weather,
        sky.windVelocity,
        windVelocity,
        false,
      );
      if (weather !== sky.weather)
        runtime.$.setProp(object, "_skyweather", weather);
      runtime.$.setProp(
        object,
        "windvelocity",
        Object.values(windVelocity).join(" "),
      );
    }
  });
  reg("Sky", "getWindVelocity", (object) => object.windvelocity ?? "1 0 0");
}
