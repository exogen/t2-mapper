import { clamp } from "../mathUtils";
import type { PlayerMove } from "./playerPrediction";

/** All Tribes 2 armor datablocks use a maxLookAngle of 1.5 radians. */
export const MAX_LOOK_ANGLE = 1.5;
export const PACKED_BODY_YAW_STEP = (2 * Math.PI) / 127;
export const PACKED_HEAD_STEP = 2 / 63;

const TURN = 2 * Math.PI;
const MAX_OBSERVATION_GAP_TICKS = 4;
const SPARSE_PREDICTION_WEIGHT = 0.75;

/** Estimated body and head angles, in Torque radians. */
export interface QuantizedAimEstimate {
  readonly bodyYaw: number;
  readonly pitch: number;
  readonly headYaw: number;
  readonly yawInput?: number;
  readonly pitchInput?: number;
  readonly freeLook?: boolean;
}

export interface QuantizedAimSample {
  rotationZ: number;
  headX: number;
  headZ: number;
  move?: Pick<PlayerMove, "yaw" | "pitch" | "freeLook">;
}

function fitBin(
  prediction: number | undefined,
  lower: number,
  upper: number,
  correctionLimit: number,
  missingTicks: number,
  hasMotion: boolean,
): number {
  const center = (lower + upper) / 2;
  // A large discrepancy means the sampled input did not explain the turn.
  if (
    prediction === undefined ||
    prediction < lower - correctionLimit ||
    prediction > upper + correctionLimit
  )
    return center;
  const fitted = clamp(prediction, lower, upper);
  if (missingTicks > 0 && (hasMotion || fitted !== prediction))
    return center + (fitted - center) * SPARSE_PREDICTION_WEIGHT;
  return fitted;
}

function fitHead(
  prediction: number | undefined,
  packed: number,
  correctionLimit: number,
  missingTicks: number,
  hasMotion: boolean,
): number {
  return fitBin(
    prediction,
    packed * MAX_LOOK_ANGLE,
    Math.min(1, packed + PACKED_HEAD_STEP) * MAX_LOOK_ANGLE,
    correctionLimit,
    missingTicks,
    hasMotion,
  );
}

function estimateInput(
  previous: number | undefined,
  input: number | undefined,
  missingTicks: number,
): number {
  if (input === undefined) return 0;
  return previous === undefined || missingTicks === 0
    ? input
    : input + ((previous + input) * missingTicks) / 2;
}

/**
 * Carry the latest turn input forward within the ranges implied by the
 * truncated absolute angles. For a short gap, use the average of the two
 * observed move rates to estimate the missing inputs.
 */
export function reconstructQuantizedAim(
  previous: QuantizedAimEstimate | undefined,
  sample: QuantizedAimSample,
  elapsedTicks = 1,
): QuantizedAimEstimate {
  const longGap = elapsedTicks > MAX_OBSERVATION_GAP_TICKS;
  const { rotationZ, headX, headZ } = sample;
  const move = sample.move;
  const yawInput = move ? (move.yaw ?? 0) : undefined;
  const pitchInput = move ? (move.pitch ?? 0) : undefined;
  const freeLook = move ? (move.freeLook ?? false) : undefined;
  const missingTicks = longGap ? 0 : Math.max(0, elapsedTicks - 1);
  let bodyPrediction: number | undefined;
  let pitchPrediction: number | undefined;
  let headYawPrediction: number | undefined;
  let yawDelta = 0;
  let pitchDelta = 0;

  if (previous && !longGap) {
    const sameLookMode = previous.freeLook === freeLook;
    if (move && elapsedTicks > 0) {
      yawDelta = estimateInput(
        sameLookMode ? previous.yawInput : undefined,
        yawInput,
        missingTicks,
      );
      pitchDelta = estimateInput(previous.pitchInput, pitchInput, missingTicks);
    }
    bodyPrediction = previous.bodyYaw + (freeLook ? 0 : yawDelta);
    pitchPrediction = previous.pitch + pitchDelta;
    headYawPrediction = previous.headYaw;
    if (move && elapsedTicks > 0)
      headYawPrediction = freeLook
        ? headYawPrediction + yawDelta
        : headYawPrediction * 0.5 ** (sameLookMode ? elapsedTicks : 1);
  } else if (previous && previous.freeLook === freeLook) {
    // Across a long gap only retain a stationary estimate that still fits.
    if (yawInput === 0 && previous.yawInput === 0) {
      bodyPrediction = previous.bodyYaw;
      headYawPrediction = previous.headYaw;
    }
    if (pitchInput === 0 && previous.pitchInput === 0)
      pitchPrediction = previous.pitch;
  }

  if (bodyPrediction !== undefined) {
    // Compare in the same revolution as the packet's yaw bin.
    let offset = bodyPrediction - rotationZ;
    if (offset < -Math.PI || offset > Math.PI) {
      offset %= TURN;
      if (offset < -Math.PI) offset += TURN;
      else if (offset > Math.PI) offset -= TURN;
      bodyPrediction = rotationZ + offset;
    }
  }

  const headCorrectionLimit = longGap ? 0 : PACKED_HEAD_STEP * MAX_LOOK_ANGLE;
  const bodyYaw = fitBin(
    bodyPrediction,
    rotationZ,
    Math.min(TURN, rotationZ + PACKED_BODY_YAW_STEP),
    longGap ? 0 : PACKED_BODY_YAW_STEP,
    missingTicks,
    !freeLook && yawDelta !== 0,
  );
  return {
    bodyYaw: bodyYaw === TURN ? 0 : bodyYaw,
    // The bottom pitch bin is usually a player pinned at the aim limit.
    pitch:
      headX === -1 &&
      ((pitchPrediction === undefined && (pitchInput ?? 0) <= 0) ||
        (pitchPrediction !== undefined && pitchPrediction <= -MAX_LOOK_ANGLE))
        ? -MAX_LOOK_ANGLE
        : fitHead(
            pitchPrediction,
            headX,
            headCorrectionLimit,
            missingTicks,
            pitchDelta !== 0,
          ),
    headYaw: fitHead(
      headYawPrediction,
      headZ,
      headCorrectionLimit,
      missingTicks,
      headYawPrediction !== previous?.headYaw,
    ),
    yawInput,
    pitchInput,
    freeLook,
  };
}
