import { THRUST_DOWN, THRUST_FORWARD } from "../stream/types";

/**
 * Jet flare thread logic shared by players and vehicles (Tribes2.exe
 * Player::processTick FUN_005d2d60 / FlyingVehicle::updateJet FUN_00610e20
 * / HoverVehicle FUN_00619090). The flare sequences are non-cyclic, so a
 * thread run at time scale +1 while the jets are on and −1 while they are
 * off fades the flare meshes in and back out, clamped to [0, 1].
 */

/** Advance a ±1 time-scale thread by `dtSec` and clamp it to [0, 1]. */
export function stepFlareThread(
  position: number,
  active: boolean,
  dtSec: number,
  durationSec: number,
): number {
  if (!(durationSec > 0)) return active ? 1 : 0;
  const next = position + (active ? dtSec : -dtSec) / durationSec;
  return Math.min(1, Math.max(0, next));
}

/**
 * One vehicle jet direction's activate/maintain pair. `activatePosition`
 * is the Activate thread's normalized position; while `maintaining` the
 * Activate thread is parked at 0 and the cyclic Maintain sequence runs
 * instead, from `maintainStartSec` (stream seconds).
 */
export interface JetDirectionState {
  activatePosition: number;
  maintaining: boolean;
  maintainStartSec: number;
}

export function createJetDirectionState(): JetDirectionState {
  return { activatePosition: 0, maintaining: false, maintainStartSec: 0 };
}

/**
 * One frame of FlyingVehicle::updateJet for a direction. When the
 * direction is active the Activate thread plays forward; once it reaches
 * its end (and the shape has a Maintain sequence) it is parked at 0 and
 * Maintain starts. When the direction goes inactive mid-Maintain, Maintain
 * stops and Activate is set to its end so it can play back out.
 */
export function stepJetDirection(
  state: JetDirectionState,
  active: boolean,
  dtSec: number,
  activateDurationSec: number,
  hasMaintain: boolean,
  nowSec: number,
): void {
  if (!state.maintaining || !active) {
    if (state.maintaining) {
      state.activatePosition = 1;
      state.maintaining = false;
    }
    state.activatePosition = stepFlareThread(
      state.activatePosition,
      active,
      dtSec,
      activateDurationSec,
    );
  }
  if (state.activatePosition >= 1 && hasMaintain && !state.maintaining) {
    state.activatePosition = 0;
    state.maintaining = true;
    state.maintainStartSec = nowSec;
  }
}

/**
 * Whether a vehicle's back jets are lit: they burn whenever the thrust
 * direction is forward, even with the jets off (the parked shrike's blue
 * burners), while the bottom jets need the jets on and thrust down.
 */
export function backJetsActive(thrustDirection: number): boolean {
  return thrustDirection === THRUST_FORWARD;
}

export function bottomJetsActive(
  thrustDirection: number,
  jetting: boolean,
): boolean {
  return jetting && thrustDirection === THRUST_DOWN;
}

/**
 * Fraction of the frame delta the contrail emitter receives: nothing at or
 * below minTrailSpeed, ramping to the full delta once the vehicle is
 * maneuveringForce/mass above it (FlyingVehicle::updateJet contrail block).
 */
export function contrailDeltaScale(
  forwardSpeed: number,
  minTrailSpeed: number,
  accel: number,
): number {
  if (!(forwardSpeed > minTrailSpeed)) return 0;
  if (!(accel > 0)) return 1;
  return Math.min(1, (forwardSpeed - minTrailSpeed) / accel);
}

/**
 * Speed along the vehicle's forward axis, from its Torque-space velocity
 * and the Three.js quaternion the stream gives its group (Three x is
 * Torque forward y; Three (x, y, z) reads back as Torque (y, z, x)).
 */
export function vehicleForwardSpeed(
  velocity: readonly [number, number, number],
  quaternion: readonly [number, number, number, number],
): number {
  const [x, y, z, w] = quaternion;
  // Three-space forward = q × (1, 0, 0).
  const fx = 1 - 2 * (y * y + z * z);
  const fy = 2 * (x * y + w * z);
  const fz = 2 * (x * z - w * y);
  // Back to Torque: (fz, fx, fy).
  return Math.abs(velocity[0] * fz + velocity[1] * fx + velocity[2] * fy);
}
