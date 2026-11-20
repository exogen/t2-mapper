import { clamp } from "../mathUtils";
import type { StreamCamera } from "./types";

/** GameConnection::getControlCameraTransform moves mCameraPos at 10/s. */
export const PLAYER_CAMERA_SPEED = 10;

export function recordedCameraBlend(
  camera: StreamCamera,
  interpT: number,
): number {
  const end =
    camera.controlCameraBlend ?? (camera.mode === "first-person" ? 0 : 1);
  const start = camera.previousControlCameraBlend ?? end;
  return start + (end - start) * interpT;
}

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
