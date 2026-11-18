import { clamp } from "../mathUtils";
import {
  MAX_LOOK_ANGLE,
  PACKED_BODY_YAW_STEP,
  PACKED_HEAD_STEP,
  reconstructQuantizedAim,
  type QuantizedAimEstimate,
  type QuantizedAimSample,
} from "./quantizedPlayerAim";

export const DEMO_AIM_LOOKAHEAD_TICKS = 2;

/** One compatible player's pose observations in packet order. */
export interface DemoAimTick {
  tick: number;
  observations: readonly QuantizedAimSample[];
  estimate?: QuantizedAimEstimate;
  /** Discontinuity immediately before this tick. */
  cut?: boolean;
}

const TURN = 2 * Math.PI;
const DEG = Math.PI / 180;
const MIN_TURN_RATE = 0.1 * DEG;
const MAX_TURN_RATE = 6 * DEG;
const MIN_INPUT_DISAGREEMENT = 0.4 * DEG;
const MAX_POSE_DISCONTINUITY = 30 * DEG;
const MAX_OBSERVATION_SEPARATION = DEMO_AIM_LOOKAHEAD_TICKS + 1;
const ANCHOR_WEIGHT = 0.18;
const UNCERTAIN_MOVE_WEIGHT = 0.35;
const ACCELERATION_WEIGHT = 0.12;

type Axis = "bodyYaw" | "pitch";
type EstimatedTick = DemoAimTick & { estimate: QuantizedAimEstimate };

interface AimPoint {
  tick: number;
  angle: number;
  low: number;
  high: number;
  move: number;
  burst: boolean;
}

function unwrap(angle: number, reference: number): number {
  return angle + TURN * Math.round((reference - angle) / TURN);
}

function hasMotion(move: number): boolean {
  const speed = Math.abs(move);
  return speed >= MIN_TURN_RATE && speed <= MAX_TURN_RATE;
}

function consistentMotion(a: number, b: number): boolean {
  return (
    a * b > 0 &&
    hasMotion(a) &&
    hasMotion(b) &&
    Math.min(Math.abs(a), Math.abs(b)) >=
      0.65 * Math.max(Math.abs(a), Math.abs(b))
  );
}

function makePoint(
  frame: EstimatedTick,
  axis: Axis,
  reference: number,
): AimPoint | undefined {
  const newest = frame.observations.at(-1);
  if (!newest) return;
  const yaw = axis === "bodyYaw";
  const step = yaw ? PACKED_BODY_YAW_STEP : PACKED_HEAD_STEP * MAX_LOOK_ANGLE;
  const angle = yaw
    ? unwrap(frame.estimate.bodyYaw, reference)
    : frame.estimate.pitch;
  const read = (sample: QuantizedAimSample) => {
    const packed = yaw ? sample.rotationZ : sample.headX * MAX_LOOK_ANGLE;
    const low = yaw ? unwrap(packed, angle) : packed;
    const limit = yaw ? TURN : MAX_LOOK_ANGLE;
    return {
      low,
      high: low + Math.min(step, limit - packed),
      move: (yaw ? sample.move?.yaw : sample.move?.pitch) ?? 0,
    };
  };
  const latest = read(newest);
  let low = latest.low;
  let high = latest.high;
  const burst = frame.observations.length > 1;
  if (burst) {
    // Arrival order is known, but the demo tick can fall within the burst.
    // Adjacent bins with coherent movement can bracket that tick. Repeated
    // copies of the latest Move hint do not become additional input.
    let previous = read(frame.observations[0]);
    let coherent = true;
    for (let i = 1; i < frame.observations.length; i++) {
      const packet = read(frame.observations[i]);
      const change = packet.low - previous.low;
      if (
        !consistentMotion(previous.move, packet.move) ||
        change * packet.move < -1e-9 ||
        Math.abs(change) > step + 1e-9
      ) {
        coherent = false;
        break;
      }
      previous = packet;
    }
    const prior = read(frame.observations[frame.observations.length - 2]);
    if (coherent) {
      low = Math.min(low, prior.low);
      high = Math.max(high, prior.high);
    }
  }
  // Keep stationary and sharp-turn samples at their causal estimates. The
  // packed bottom pitch bin can also represent an exact pinned look angle.
  if (
    latest.move === 0 ||
    Math.abs(latest.move) > MAX_TURN_RATE ||
    (!yaw && Math.abs(angle) === MAX_LOOK_ANGLE)
  ) {
    low = high = angle;
  }
  return { tick: frame.tick, angle, low, high, move: latest.move, burst };
}

function canFitInterval(a: AimPoint, b: AimPoint): boolean {
  const ticks = b.tick - a.tick;
  return (
    ticks <= MAX_OBSERVATION_SEPARATION &&
    Math.abs(b.angle - a.angle) <= MAX_POSE_DISCONTINUITY &&
    (ticks === 1 || consistentMotion(a.move, b.move))
  );
}

/** Fit nearby endpoint angles within the observed bins, using the Move hints
 * for displacement and preferring a steady velocity during a coherent turn. */
function solve(points: readonly AimPoint[]): number[] {
  const angles = points.map((point) => point.angle);
  const moves = points.map((point, i) => {
    if (i === 0) return 0;
    const prev = points[i - 1];
    return (
      point.move + ((prev.move + point.move) * (point.tick - prev.tick - 1)) / 2
    );
  });
  if (
    !points.some(
      (point, i) =>
        i > 0 &&
        Math.abs(point.angle - points[i - 1].angle - moves[i]) >
          MIN_INPUT_DISAGREEMENT,
    )
  )
    return angles;

  const moveWeights = points.map((point, i) =>
    i === 0 || point.burst || point.tick - points[i - 1].tick > 1
      ? UNCERTAIN_MOVE_WEIGHT
      : 1,
  );
  const accelWeights = points.map((point, i) => {
    // An acceleration term is only meaningful across equally spaced ticks.
    if (
      i < 2 ||
      point.burst ||
      points[i - 1].burst ||
      point.tick - points[i - 2].tick !== 2 ||
      !consistentMotion(point.move, points[i - 1].move)
    )
      return 0;
    return ACCELERATION_WEIGHT;
  });

  // Coordinate descent on a tiny box-constrained least-squares problem.
  for (let pass = 0; pass < 12; pass++) {
    for (let position = 0; position < points.length; position++) {
      const i = pass % 2 ? points.length - 1 - position : position;
      const { angle, low, high } = points[i];
      if (low === high) continue;
      let gradient = ANCHOR_WEIGHT * (angles[i] - angle);
      let weight = ANCHOR_WEIGHT;
      if (i > 0) {
        gradient += moveWeights[i] * (angles[i] - angles[i - 1] - moves[i]);
        weight += moveWeights[i];
      }
      if (i + 1 < points.length) {
        gradient -=
          moveWeights[i + 1] * (angles[i + 1] - angles[i] - moves[i + 1]);
        weight += moveWeights[i + 1];
      }
      for (
        let end = Math.max(2, i);
        end < Math.min(points.length, i + 3);
        end++
      ) {
        const accelWeight = accelWeights[end];
        if (!accelWeight) continue;
        const coefficient = end === i + 1 ? -2 : 1;
        const error = angles[end] - 2 * angles[end - 1] + angles[end - 2];
        gradient += accelWeight * coefficient * error;
        weight += accelWeight * coefficient * coefficient;
      }
      angles[i] = clamp(angles[i] - gradient / weight, low, high);
    }
  }
  return angles;
}

function fitAxis(
  frames: readonly EstimatedTick[],
  target: EstimatedTick,
  axis: Axis,
) {
  const points: AimPoint[] = [];
  for (const frame of frames) {
    const point = makePoint(
      frame,
      axis,
      points.at(-1)?.angle ?? target.estimate[axis],
    );
    if (point) points.push(point);
  }
  const next = points.findIndex((point) => point.tick >= target.tick);
  if (next <= 0) return target.estimate[axis];
  const current = points[next];
  const previous = points[next - 1];
  const exact = current.tick === target.tick;
  if (!canFitInterval(previous, current)) return target.estimate[axis];

  const motionBefore = consistentMotion(previous.move, current.move);
  if (!exact && !motionBefore) return target.estimate[axis];
  // Preserve the first observed Move of a reversal when its speed is already
  // explained. Later samples in the new direction can start a new fit.
  if (
    !motionBefore &&
    previous.move * current.move < 0 &&
    Math.min(Math.abs(previous.move), Math.abs(current.move)) > DEG &&
    Math.abs(current.angle - previous.angle - current.move) <=
      MIN_INPUT_DISAGREEMENT
  )
    return target.estimate[axis];

  let first = next - 1;
  let end = next + 1;
  while (first > 0 && canFitInterval(points[first - 1], points[first])) first--;
  while (end < points.length && canFitInterval(points[end - 1], points[end]))
    end++;
  if (end - first < 3 && exact) return target.estimate[axis];
  if (exact && end === next + 1 && !current.burst) return target.estimate[axis];
  const fitted = solve(points.slice(first, end));
  const angle = fitted[next - first];
  if (exact) return angle;
  const prior = fitted[next - first - 1];
  const fraction =
    (target.tick - previous.tick) / (current.tick - previous.tick);
  return prior + (angle - prior) * fraction;
}

function blocked(frame: DemoAimTick): boolean {
  return (
    frame.observations.some(
      (sample) => !sample.move || sample.move.freeLook === true,
    ) || frame.estimate?.freeLook === true
  );
}

/** Estimate render-only angles from the pose packets on either side of the
 * requested tick. The window contains at most two future ticks. */
export function fitDemoAim(
  ticks: readonly DemoAimTick[],
  targetTick: number,
): QuantizedAimEstimate | undefined {
  const index = ticks.findIndex((frame) => frame.tick === targetTick);
  if (index < 0) return undefined;
  const target = ticks[index];
  if (blocked(target)) return target.estimate;
  let first = index;
  let end = index + 1;
  while (
    first > 0 &&
    !ticks[first].cut &&
    !blocked(ticks[first - 1]) &&
    targetTick - ticks[first - 1].tick <= DEMO_AIM_LOOKAHEAD_TICKS
  )
    first--;
  while (
    end < ticks.length &&
    !ticks[end].cut &&
    !blocked(ticks[end]) &&
    ticks[end].tick - targetTick <= DEMO_AIM_LOOKAHEAD_TICKS
  )
    end++;

  const frames: EstimatedTick[] = [];
  let estimate: QuantizedAimEstimate | undefined;
  let lastObservedTick = ticks[first].tick - 1;
  for (let i = first; i < end; i++) {
    const frame = ticks[i];
    const newest = frame.observations.at(-1);
    if (newest) {
      estimate =
        frame.estimate ??
        reconstructQuantizedAim(
          estimate,
          newest,
          frame.tick - lastObservedTick,
        );
      lastObservedTick = frame.tick;
    } else {
      estimate = frame.estimate ?? estimate;
    }
    if (estimate) frames.push({ ...frame, estimate });
  }
  const estimatedTarget = frames.find((frame) => frame.tick === targetTick);
  if (!estimatedTarget) return undefined;
  const baseline = estimatedTarget.estimate;
  const fittedYaw = fitAxis(frames, estimatedTarget, "bodyYaw");
  const pitch = fitAxis(frames, estimatedTarget, "pitch");
  if (fittedYaw === baseline.bodyYaw && pitch === baseline.pitch)
    return baseline;
  const wrappedYaw = fittedYaw % TURN;
  const bodyYaw = wrappedYaw < 0 ? wrappedYaw + TURN : wrappedYaw;
  return { ...baseline, bodyYaw, pitch };
}
