import type { EmitterInstance } from "./ParticleSystem";

// A seek may jump hours into a recording. Rebuild at most 128 simulation
// steps; this covers WOE's longest (4 second) particle lifetime completely.
const STEP_MS = 32;
const MAX_WARMUP_MS = STEP_MS * 128;

/**
 * Fill a newly created ambient emitter at a recorded age, including while the
 * destination is paused. This is bounded cosmetic reconstruction at its
 * current transform: historical movement, random cadence, and particles
 * older than the warmup budget are not replayed. Finite emitter lifetimes
 * still advance through omitted history, so expired effects stay expired.
 * The caller supplies world gravity on the emitter before warming it.
 */
export function warmAmbientEmitter(
  emitter: EmitterInstance,
  ageMS: number,
  origin: [number, number, number],
  axis: [number, number, number],
  velocity: [number, number, number],
  timeMultiple: number,
): void {
  if (!Number.isFinite(ageMS) || ageMS <= 0) return;
  const age = Math.round(ageMS);
  const particles = emitter.data.particles;
  const window = Math.min(
    age,
    Math.max(0, particles.lifetimeMS + particles.lifetimeVarianceMS),
    MAX_WARMUP_MS,
  );
  const omitted = age - window;
  if (omitted > 0) emitter.advanceEmpty(omitted, omitted * timeMultiple);
  for (let remaining = window; remaining > 0;) {
    const step = Math.min(STEP_MS, remaining);
    emitter.emitPeriodic(origin, origin, step * timeMultiple, axis, velocity);
    // Native timeMultiple increases births without speeding up physics.
    emitter.update(step);
    remaining -= step;
  }
}
