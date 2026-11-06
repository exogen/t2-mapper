import type { PrecipitationGhostData } from "t2-demo-parser";
import {
  resolveMissionPrecipitation,
  resolvePrecipitationState,
} from "../weather/data";
import type { LightningRequest } from "../weather/types";
import type { TorqueObject, TorqueRuntime } from "./types";

/**
 * Native weather commands, not additional mission scripts. Explore feeds the
 * same client-state transitions as a networked Precipitation's update masks.
 * Retail commands: 00680ba0/00680bd0/00680c10; masks: 00681260.
 */
export function registerWeatherMethods(runtime: TorqueRuntime): void {
  const reg = runtime.$.registerMethod.bind(runtime.$);
  const now = () => (Date.now() - runtime.state.startTime) / 1000;

  const update = (object: TorqueObject, fields: PrecipitationGhostData) => {
    const time = now();
    const previous = resolveMissionPrecipitation(object, runtime, time);
    if (!previous) return;
    const next = resolvePrecipitationState(fields, time, previous);
    runtime.$.setProp(object, "percentage", next.percentage);
    runtime.$.setProp(object, "_weatherenabled", next.enabled);
    runtime.$.setProp(object, "_weatherstorm", next.storm ?? null);
    runtime.$.setProp(object, "_weatherdrawcount", next.drawCount);
    runtime.$.setProp(object, "_weatherspawncount", next.spawnCount);
  };

  reg("Precipitation", "setPercentage", (object, value) => {
    const percentage = Number(value);
    if (Number.isFinite(percentage) && percentage >= 0 && percentage <= 1)
      update(object, { percentageUpdate: percentage });
  });
  reg("Precipitation", "stormShow", (object, value) => {
    const text = String(value).toLowerCase();
    const enabled = text === "true" || (text !== "false" && !!Number(value));
    update(object, { stormPrecipitationOn: enabled });
  });
  reg("Precipitation", "stormPrecipitation", (object, value, seconds) => {
    const target = Number(value),
      duration = Number(seconds);
    if (!Number.isFinite(target) || !Number.isFinite(duration) || duration < 0)
      return;
    update(object, {
      stormUpdate: { endPercentage: target, durationSeconds: duration },
    });
  });

  reg("Lightning", "strikeRandomPoint", (object) => {
    const time = now();
    const requests =
      (object._weatherstrikes as LightningRequest[] | undefined) ?? [];
    const sequence = Number(object._weatherstrikesequence ?? 0) + 1;
    object._weatherstrikesequence = sequence;
    runtime.$.setProp(object, "_weatherstrikes", [
      ...requests.filter((request) => time - request.time <= 30),
      { sequence, time },
    ]);
  });
  // Retail strikeObject's implementation (00628e00) is empty. WarningFlash
  // events (00628510) have no defined coordinates or distinct client effect;
  // do not invent target bolts or a screen flash for these unfinished APIs.
  reg("Lightning", "strikeObject", () => {});
  reg("Lightning", "warningFlashes", () => {});
}
