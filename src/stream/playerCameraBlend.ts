import { clamp } from "../mathUtils";

/** GameConnection::getControlCameraTransform moves mCameraPos at 10/s. */
export const PLAYER_CAMERA_SPEED = 10;

export function advancePlayerCameraBlend(
  blend: number,
  firstPerson: boolean,
  deltaSec: number,
  speed = PLAYER_CAMERA_SPEED,
): number {
  return clamp(
    blend + (firstPerson ? -1 : 1) * speed * Math.max(0, deltaSec),
    0,
    1,
  );
}
