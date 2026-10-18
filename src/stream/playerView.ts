import type { Quaternion } from "three";
import type { StreamEntity } from "./types";
import { clamp, MAX_PITCH, threeForwardHeading } from "./streamHelpers";

export interface PlayerViewAngles {
  yaw: number;
  pitch: number;
}

/**
 * Head pitch and yaw as fractions of maxLookAngle, in [-1, 1].
 */
export interface PlayerHeadAngles {
  pitch: number;
  yaw: number;
}

type PlayerView = Pick<
  StreamEntity,
  "playerDelta" | "headPitch" | "headYaw" | "viewQuantized"
>;

/** All Tribes 2 armor datablocks use a maxLookAngle of 1.5 radians. */
const MAX_LOOK_ANGLE = 1.5;

/**
 * Half a packed step of a ghost's view. Player::packUpdate (FUN_005dae80)
 * sends the body yaw as writeFloat(7) of a turn and the head pitch and yaw
 * as writeSignedFloat(6) of maxLookAngle, and both writers chop toward
 * zero (FUN_0043bf80, FUN_0043c000), so a decoded angle sits at the bottom
 * of its step and a level head yaw reads as -1.4°. The middle of the step
 * is the unbiased estimate: exact angles in players' own recordings sit a
 * median 0.50 (head pitch) and 0.49 (body yaw) of the way through their
 * step, and on a demo's 345 laser rifle shots it moved the view from 2.7°
 * left of and 1.3° above the shots to within 0.1°.
 */
const HALF_YAW_STEP = Math.PI / 127;
const HALF_HEAD_STEP = 1 / 63;

const _head: PlayerHeadAngles = { pitch: 0, yaw: 0 };

/**
 * A player's head angles at `interpT`. With `aimCorrection`, a view a ghost
 * update packed (viewQuantized) is read at the middle of its step, except a
 * pitch on either limit: updateMove (FUN_005d2d60) clamps the head to
 * min/maxLookAngle and players pin against it. Of 36,419 exact samples from
 * players' own recordings, the 6 in the bottom step all sat on the limit,
 * and the top step can hold nothing else. The recording client's own
 * full-precision view is left as it is.
 */
export function getPlayerHeadAngles(
  player: PlayerView | undefined,
  interpT: number,
  out: PlayerHeadAngles,
  aimCorrection = false,
): PlayerHeadAngles {
  const look = player?.playerDelta;
  const backstep = 1 - interpT;
  const lookScale = look?.maxLookAngle || 1;
  let pitch = look
    ? (look.head[0] + look.headVec[0] * backstep) / lookScale
    : (player?.headPitch ?? 0);
  let yaw = look
    ? (look.head[1] + look.headVec[1] * backstep) / lookScale
    : (player?.headYaw ?? 0);
  if (aimCorrection && player?.viewQuantized) {
    if (Math.abs(pitch) < 1) pitch = Math.min(1, pitch + HALF_HEAD_STEP);
    // The packed range ends at maxLookAngle.
    yaw = Math.min(1, yaw + HALF_HEAD_STEP);
  }
  out.pitch = pitch;
  out.yaw = yaw;
  return out;
}

/**
 * The yaw `aimCorrection` adds to a player's rendered body: half a packed
 * step, when a ghost update packed its rotation.
 */
export function playerBodyYawCorrection(
  player: Pick<StreamEntity, "viewQuantized"> | undefined,
  aimCorrection: boolean,
): number {
  return aimCorrection && player?.viewQuantized ? HALF_YAW_STEP : 0;
}

/**
 * Player::getEyeTransform view angles, without the eye bone's animation.
 * `bodyRotation` is the body as rendered, which already carries
 * playerBodyYawCorrection, or the vehicle a mounted player rides.
 */
export function getPlayerViewAngles(
  bodyRotation: Quaternion,
  player: PlayerView | undefined,
  interpT: number,
  out: PlayerViewAngles,
  aimCorrection = false,
): PlayerViewAngles {
  const head = getPlayerHeadAngles(player, interpT, _head, aimCorrection);
  out.yaw = threeForwardHeading(bodyRotation) + head.yaw * MAX_LOOK_ANGLE;
  out.pitch = clamp(head.pitch * MAX_LOOK_ANGLE, -MAX_PITCH, MAX_PITCH);
  return out;
}
