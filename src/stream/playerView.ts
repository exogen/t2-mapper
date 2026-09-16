import type { Quaternion } from "three";
import type { StreamEntity } from "./types";
import { clamp, MAX_PITCH, threeForwardHeading } from "./streamHelpers";

export interface PlayerViewAngles {
  yaw: number;
  pitch: number;
}

/** All Tribes 2 armor datablocks use a maxLookAngle of 1.5 radians. */
const MAX_LOOK_ANGLE = 1.5;

/** Player::getEyeTransform view angles, without the eye bone's animation. */
export function getPlayerViewAngles(
  bodyRotation: Quaternion,
  player:
    Pick<StreamEntity, "playerDelta" | "headPitch" | "headYaw"> | undefined,
  interpT: number,
  out: PlayerViewAngles,
): PlayerViewAngles {
  const look = player?.playerDelta;
  const backstep = 1 - interpT;
  const lookScale = look?.maxLookAngle || 1;
  const headPitch = look
    ? (look.head[0] + look.headVec[0] * backstep) / lookScale
    : (player?.headPitch ?? 0);
  const headYaw = look
    ? (look.head[1] + look.headVec[1] * backstep) / lookScale
    : (player?.headYaw ?? 0);
  out.yaw = threeForwardHeading(bodyRotation) + headYaw * MAX_LOOK_ANGLE;
  out.pitch = clamp(headPitch * MAX_LOOK_ANGLE, -MAX_PITCH, MAX_PITCH);
  return out;
}
