import type { SceneInteriorInstance } from "./types";

export function interiorAlarmTime(
  scene: Pick<
    SceneInteriorInstance,
    "alarmState" | "alarmTimeSec" | "alarmChangedAtSec"
  >,
  timeSec: number,
): number {
  return (
    (scene.alarmTimeSec ?? 0) +
    (scene.alarmState
      ? Math.max(0, timeSec - (scene.alarmChangedAtSec ?? 0))
      : 0)
  );
}

/** Time spent in the currently selected lighting mode. Native setAlarmMode
 * ignores requests for resources without an alarm state (FUN_00524c60). */
export function interiorLightingTime(
  scene: SceneInteriorInstance | undefined,
  timeSec: number,
  hasAlarmState: boolean,
): number {
  const elapsed = Math.max(0, timeSec - (scene?.lightingStartTimeSec ?? 0));
  const alarmTime =
    scene && hasAlarmState ? interiorAlarmTime(scene, timeSec) : 0;
  return scene?.alarmState && hasAlarmState
    ? alarmTime
    : Math.max(0, elapsed - alarmTime);
}

/** Scene data is shared with seek checkpoints: never mutate it in place. */
export function updateInteriorAlarm(
  scene: SceneInteriorInstance,
  alarmState: boolean,
  timeSec: number,
): SceneInteriorInstance {
  if (scene.alarmState === alarmState) return scene;
  return {
    ...scene,
    alarmState,
    alarmTimeSec: interiorAlarmTime(scene, timeSec),
    alarmChangedAtSec: timeSec,
  };
}
