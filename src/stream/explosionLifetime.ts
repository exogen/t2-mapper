/**
 * Explosion lifetime as Tribes2.exe computes it (binary-verified):
 *
 * - Explosion::onAdd: mDelayMS = delayMS ± randInt(delayVariance) and
 *   mEndingMS = lifetimeMS ± randInt(lifetimeVariance). All four are 16-bit
 *   wire ints unpacked with << 5; the ctor default lifetime is 1000. A zero
 *   delay explodes inside onAdd.
 * - Explosion::explode: when the shape has an "ambient" sequence, mEndingMS
 *   is REPLACED by round(sequenceDuration / |playSpeed| × 1000). The
 *   datablock's lifetimeMS is ignored for shape explosions. The duration
 *   comes from the loaded shape (see shapeSequences.ts).
 * - Explosion::processTick: mCurrMS += 32; deleted once mEndingMS <= mCurrMS;
 *   otherwise explode() once mDelayMS < mCurrMS. mCurrMS is never reset, so
 *   the delay counts against the lifetime and the size keyframes start at
 *   t = mCurrMS / mEndingMS. explode() also spawns the sub-explosions, whose
 *   own onAdd (and delay) starts then.
 *
 * Streaming emitters (emitter[0..3]) are fed by Explosion::advanceTime for as
 * long as the explosion lives, and each ParticleEmitter additionally stops at
 * its own datablock lifetimeMS; particles already emitted live out their
 * lifetime (deleteWhenEmpty).
 */

const EXPLOSION_TICK_MS = 32;
const LIFETIME_SHIFT = 5;
/** playSpeed is packed as value × 20 on the wire. */
const PLAY_SPEED_SCALE = 20;

export function explosionPlaySpeed(
  expBlock: Record<string, unknown> | undefined,
): number {
  const raw = expBlock?.playSpeed;
  return (typeof raw === "number" ? raw : PLAY_SPEED_SCALE) / PLAY_SPEED_SCALE;
}

function randomIntInclusive(variance: number, random: () => number): number {
  // Engine: randI() % (2·variance + 1) − variance.
  if (variance <= 0) return 0;
  return Math.floor(random() * (2 * variance + 1)) - variance;
}

function wireMS(raw: unknown, defaultMS: number): number {
  return (
    (typeof raw === "number" ? raw : defaultMS >> LIFETIME_SHIFT) <<
    LIFETIME_SHIFT
  );
}

interface ExplosionTiming {
  /** ms after onAdd at which explode() runs; 0 runs it inside onAdd. */
  delayMS: number;
  /** mEndingMS from onAdd: lifetimeMS ± variance. Governs an explosion
   *  that is still waiting on its delay. */
  armedLifetimeMS: number;
  /** mEndingMS after explode(): the shape's ambient duration / playSpeed,
   *  else armedLifetimeMS. Counted from onAdd, not from explode(). */
  lifetimeMS: number;
}

export function resolveExplosionTiming(
  expBlock: Record<string, unknown> | undefined,
  ambientDurationSec: number | undefined,
  random: () => number = Math.random,
): ExplosionTiming {
  const delayMS =
    wireMS(expBlock?.delayMS, 0) +
    randomIntInclusive(wireMS(expBlock?.delayVariance, 0), random);
  const armedLifetimeMS =
    wireMS(expBlock?.lifetimeMS, 1000) +
    randomIntInclusive(wireMS(expBlock?.lifetimeVariance, 0), random);
  const playSpeed = explosionPlaySpeed(expBlock);
  const lifetimeMS =
    ambientDurationSec != null && ambientDurationSec > 0 && playSpeed !== 0
      ? Math.round((ambientDurationSec / Math.abs(playSpeed)) * 1000)
      : armedLifetimeMS;
  return { delayMS: Math.max(0, delayMS), armedLifetimeMS, lifetimeMS };
}

/**
 * Ticks after onAdd at which processTick first sees mDelayMS < mCurrMS
 * (mCurrMS = 32 × ticks); 0 when there is no delay (explode() in onAdd).
 */
export function explosionExplodeTicks(delayMS: number): number {
  return delayMS > 0 ? Math.floor(delayMS / EXPLOSION_TICK_MS) + 1 : 0;
}

/** Ticks until processTick deletes an explosion with this lifetime. */
export function explosionLifetimeTicks(lifetimeMS: number): number {
  return Math.max(1, Math.ceil(lifetimeMS / EXPLOSION_TICK_MS));
}
