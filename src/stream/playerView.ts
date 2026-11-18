import { Quaternion } from "three";
import type { DemoPlayerAim, PlayerTickView, StreamEntity } from "./types";
import { MAX_PITCH, threeForwardHeading } from "./streamHelpers";
import { clamp } from "../mathUtils";
import {
  MAX_LOOK_ANGLE,
  PACKED_BODY_YAW_STEP,
  PACKED_HEAD_STEP,
} from "./quantizedPlayerAim";

export interface PlayerViewAngles {
  yaw: number;
  pitch: number;
}

/** Total view yaw, plus the head turn needed to recover the body's yaw. */
export interface PlayerRenderAim extends PlayerViewAngles {
  headYaw: number;
}

/**
 * Head pitch and yaw as fractions of maxLookAngle, in [-1, 1].
 */
export interface PlayerHeadAngles {
  pitch: number;
  yaw: number;
}

type PlayerView = PlayerTickView & Pick<StreamEntity, "playerDelta">;

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
const HALF_YAW_STEP = PACKED_BODY_YAW_STEP / 2;
const HALF_HEAD_STEP = PACKED_HEAD_STEP / 2;
const LOOK_THREAD_LIMIT = (80 * Math.PI) / 180;

const _head: PlayerHeadAngles = { pitch: 0, yaw: 0 };
const _tickRotation = new Quaternion();
const _renderAim: PlayerRenderAim = { yaw: 0, pitch: 0, headYaw: 0 };

function interpolateYaw(from: number, to: number, t: number): number {
  const delta = to - from;
  return from + Math.atan2(Math.sin(delta), Math.cos(delta)) * t;
}

/** Fade from the normal world pose into reconstructed first-person aim. */
export function blendPlayerRenderAim(
  from: PlayerRenderAim,
  to: PlayerRenderAim,
  weight: number,
): void {
  to.yaw = interpolateYaw(from.yaw, to.yaw, weight);
  to.pitch = from.pitch + (to.pitch - from.pitch) * weight;
  to.headYaw = from.headYaw + (to.headYaw - from.headYaw) * weight;
}

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

/** Player::updateLookAnimation (0x5d4cf0) samples the arm and vertical
 * head threads over ±80°, independently of PlayerData::maxLookAngle. */
export function playerLookPitchPosition(pitchRadians: number): number {
  return clamp(
    (pitchRadians + LOOK_THREAD_LIMIT) / (2 * LOOK_THREAD_LIMIT),
    0,
    1,
  );
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

export function getPlayerViewAngles(
  bodyRotation: Quaternion,
  player: PlayerView | undefined,
  interpT: number,
  out: PlayerViewAngles,
  aimCorrection = false,
  previousTickView?: PlayerTickView,
  fittedAim?: DemoPlayerAim,
): PlayerViewAngles {
  const aim = getPlayerRenderAim(
    bodyRotation,
    player,
    interpT,
    _renderAim,
    aimCorrection,
    previousTickView,
    fittedAim,
  );
  out.yaw = aim.yaw;
  out.pitch = aim.pitch;
  return out;
}

/**
 * Player::getRenderEyeTransform angles, shared by the eye and mounted weapon.
 * The rendered body's heading already includes playerBodyYawCorrection.
 * A previous completed tick lets replay interpolate packet corrections.
 */
export function getPlayerRenderAim(
  bodyRotation: Quaternion,
  player: PlayerView | undefined,
  interpT: number,
  out: PlayerRenderAim,
  aimCorrection = false,
  previousTickView?: PlayerTickView,
  fittedAim?: DemoPlayerAim,
): PlayerRenderAim {
  const lifeChanged =
    player &&
    previousTickView &&
    !!player.damageState !== !!previousTickView.damageState;
  const aimCut = previousTickView?.aimCut;
  if (
    aimCut &&
    player?.viewQuantized &&
    !player.mountObjectId &&
    !player.damageState
  ) {
    const currentAim = fittedAim?.current ?? player.reconstructedAim;
    if (currentAim) {
      out.yaw = currentAim.bodyYaw + currentAim.headYaw;
      out.pitch = clamp(currentAim.pitch, -MAX_PITCH, MAX_PITCH);
      out.headYaw = currentAim.headYaw;
      return out;
    }
  }
  if (
    !aimCut &&
    player?.viewQuantized &&
    previousTickView?.viewQuantized &&
    !player.damageState &&
    !previousTickView.damageState &&
    player.mountObjectId === previousTickView.mountObjectId &&
    player.mountNode === previousTickView.mountNode &&
    (player.mountObjectId || (player.rotation && previousTickView.rotation))
  ) {
    const currentAim = fittedAim?.current ?? player.reconstructedAim;
    const previousAim =
      fittedAim?.previous ?? previousTickView.reconstructedAim;
    if (!player.mountObjectId && currentAim && previousAim) {
      out.yaw = interpolateYaw(
        previousAim.bodyYaw + previousAim.headYaw,
        currentAim.bodyYaw + currentAim.headYaw,
        interpT,
      );
      out.pitch = clamp(
        previousAim.pitch + (currentAim.pitch - previousAim.pitch) * interpT,
        -MAX_PITCH,
        MAX_PITCH,
      );
      out.headYaw =
        previousAim.headYaw +
        (currentAim.headYaw - previousAim.headYaw) * interpT;
      return out;
    }
    const { pitch: currentPitch, yaw: currentHeadYaw } = getPlayerHeadAngles(
      player,
      1,
      _head,
      aimCorrection,
    );
    const previous = getPlayerHeadAngles(
      previousTickView,
      1,
      _head,
      aimCorrection,
    );
    const headPitch =
      previous.pitch + (currentPitch - previous.pitch) * interpT;
    let previousYaw = previous.yaw * MAX_LOOK_ANGLE;
    let currentYaw = currentHeadYaw * MAX_LOOK_ANGLE;
    out.headYaw = previousYaw + (currentYaw - previousYaw) * interpT;
    const baseYaw = player.mountObjectId
      ? threeForwardHeading(bodyRotation)
      : playerBodyYawCorrection(player, aimCorrection);
    if (!player.mountObjectId) {
      previousYaw += threeForwardHeading(
        _tickRotation.fromArray(previousTickView.rotation!),
      );
      currentYaw += threeForwardHeading(
        _tickRotation.fromArray(player.rotation!),
      );
    }
    out.yaw = baseYaw + interpolateYaw(previousYaw, currentYaw, interpT);
    out.pitch = clamp(headPitch * MAX_LOOK_ANGLE, -MAX_PITCH, MAX_PITCH);
    return out;
  }
  // The rendered body can still interpolate through an aim discontinuity.
  const snap = lifeChanged || aimCut;
  const bodyYaw =
    snap && player?.rotation && !player.mountObjectId
      ? threeForwardHeading(_tickRotation.fromArray(player.rotation)) +
        playerBodyYawCorrection(player, aimCorrection)
      : threeForwardHeading(bodyRotation);
  const head = getPlayerHeadAngles(
    player,
    snap ? 1 : interpT,
    _head,
    aimCorrection,
  );
  const lookScale = player?.playerDelta?.maxLookAngle ?? MAX_LOOK_ANGLE;
  out.headYaw = head.yaw * lookScale;
  out.yaw = bodyYaw + out.headYaw;
  out.pitch = clamp(head.pitch * lookScale, -MAX_PITCH, MAX_PITCH);
  return out;
}
