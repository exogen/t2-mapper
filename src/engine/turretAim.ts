import type { AnimationAction } from "three";
import type { TurretAim } from "../stream/types";

/**
 * Positions of a turret's activate, elevate and turn threads for an aim,
 * as the client sets them every tick (Tribes2.exe Turret::processTick
 * FUN_006553c0 and setAim FUN_006560b0). `null` means the thread does not
 * exist: elevate and turn only live while the turret is fully activated,
 * activate only while activation is non-zero. The turn clip spans a full
 * turn (phi/360) and the elevate clip 0..180 degrees (theta/180) whatever
 * the datablock's theta limits.
 */
export interface TurretThreadPositions {
  activate: number | null;
  elevate: number | null;
  turn: number | null;
}

export function turretThreadPositions(aim: TurretAim): TurretThreadPositions {
  const active = aim.activation === 1;
  let phi = aim.phi % 360;
  if (phi < 0) phi += 360;
  return {
    activate: aim.activation !== 0 ? aim.activation : null,
    elevate: active ? aim.theta / 180 : null,
    turn: active ? phi / 360 : null,
  };
}

/**
 * The paused, position-driven actions standing in for the three threads.
 * A deployable's "activate" sequence is empty (one keyframe, no nodes), so
 * the GLB carries no clip for it; the thread then animates nothing.
 */
export interface TurretAnimActions {
  activate?: AnimationAction;
  elevate: AnimationAction;
  turn: AnimationAction;
}

/**
 * Scrub a paused action to a thread position, creating (playing) it on
 * first use and stopping it while the thread is absent.
 */
export function setThreadPosition(
  action: AnimationAction,
  position: number | null,
): void {
  if (position == null) {
    if (action.isScheduled()) action.stop();
    return;
  }
  if (!action.isScheduled()) {
    action.reset();
    action.paused = true;
    action.play();
  }
  action.time = Math.max(0, Math.min(1, position)) * action.getClip().duration;
}

export function driveTurretAim(
  actions: TurretAnimActions,
  aim: TurretAim | undefined,
): void {
  const pos = aim
    ? turretThreadPositions(aim)
    : { activate: null, elevate: null, turn: null };
  if (actions.activate) setThreadPosition(actions.activate, pos.activate);
  setThreadPosition(actions.elevate, pos.elevate);
  setThreadPosition(actions.turn, pos.turn);
}
