/** WheeledVehicle's angular velocity and accumulated animation position. */
export interface WheelState {
  /** Network avel, in radians per second. */
  speed: number;
  lateralSlip: number;
  longitudinalSlip: number;
  /** Normalized turns at timeSec, rebased on speed or frozen-state changes. */
  rotation: number;
  timeSec: number;
}

/** VehicleData constructor default; each vehicle normally supplies its own. */
export const DEFAULT_MAX_STEERING_ANGLE = 0.785;

/** Vehicle::unpackUpdate (Tribes2.exe 0x0060dc30): unsigned wire value to radians. */
export function decodeVehicleSteering(
  packedYaw: number,
  maxSteeringAngle = DEFAULT_MAX_STEERING_ANGLE,
): number {
  return 2 * packedYaw * maxSteeringAngle - maxSteeringAngle;
}

/** WheeledVehicle::updateWheelThreads (0x006154f0), preserving the turn's sign. */
export function wheelSteeringPosition(
  steeringYaw: number,
  maxSteeringAngle = DEFAULT_MAX_STEERING_ANGLE,
): number {
  if (maxSteeringAngle <= 0) return 0.5;
  const t = (steeringYaw * Math.abs(steeringYaw)) / maxSteeringAngle;
  return Math.max(0, Math.min(1, 0.5 - t * 0.5));
}

/** Sample using stream time, which already accounts for playback timeScale. */
export function wheelRotationAt(
  wheel: WheelState,
  timeSec: number,
  frozen = false,
): number {
  // WheeledVehicle::advanceTime (Tribes2.exe 0x00613300): avel * dt / 2π.
  // Its multiplier at 0x007a6a08 is the double 0.15915494309189535.
  if (frozen) return wheel.rotation;
  const rotation =
    wheel.rotation +
    (wheel.speed * Math.max(0, timeSec - wheel.timeSec)) / (2 * Math.PI);
  return rotation - Math.floor(rotation);
}
