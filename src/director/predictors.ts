/**
 * Anticipation from present state — the causal replacements for the
 * oracle planner's future knowledge. A real director reads the play:
 * an attacker diving at the stand means a grab is coming, a carrier
 * closing on their own stand with the escort ahead means a cap is
 * likely. These are inferences, so they will sometimes be wrong; that
 * is authentic broadcasting, and the commentary can play it honestly.
 */
import type { CausalView } from "./causalView";
import { dist } from "./geometry";

/** How far back a player's motion is differenced for closing speed. */
const PREDICT_MOTION_WINDOW_SEC = 3;
/** Attackers further out than this never count toward a grab ETA. */
const PREDICT_GRAB_RANGE = 400;
/** Minimum closing speed (u/s) before an approach reads as an attack
 *  run — below it players are milling, not diving. */
const PREDICT_MIN_CLOSING_SPEED = 12;
/** Cap likelihood weights: distance closed, speed toward home, and
 *  whether the carrier's own flag is home (they can actually score). */
const CAP_DISTANCE_WEIGHT = 0.5;
const CAP_SPEED_WEIGHT = 0.3;
const CAP_OWN_FLAG_WEIGHT = 0.2;
/** Speed toward home that saturates the speed term (a full ski run). */
const CAP_FULL_SPEED = 40;

/**
 * Seconds until the most imminent enemy reaches this flag's position,
 * from their distance and closing speed — or null when nobody is on an
 * attack run. Works for flags at the stand (grab anticipation) and on
 * the ground (somebody diving on the drop).
 */
export function approachEta(view: CausalView, slot: number): number | null {
  return inboundAttacker(view, slot)?.eta ?? null;
}

/**
 * The most imminent enemy closing on this flag: who they are, how long
 * until they reach it, and how fast they are moving. The identity is
 * what lets the broadcast RIDE the incoming capper instead of only
 * watching the stand they are diving at.
 */
export function inboundAttacker(
  view: CausalView,
  slot: number,
): {
  targetId: number;
  eta: number;
  speed: number;
  /**
   * How much this reads as a CAPPER dive rather than a base push,
   * 0..1. Closing fast on a base says nothing by itself — a heavy
   * with an energy pack skiing in at 60 u/s is going for generators,
   * and framing it as "attacker inbound on the stand" is a promise
   * the play never keeps. Armor class is the signal available at
   * decision time (their raid damage lands seconds later, outside any
   * peek); live demolition nearby confirms it.
   */
  likelihood: number;
} | null {
  const flag = view.flagAt(slot);
  if (!flag || flag.status === "held") return null;
  let best: {
    targetId: number;
    eta: number;
    speed: number;
    likelihood: number;
  } | null = null;
  const players = view.playersAt();
  const before = new Map(
    view
      .playersAt(view.now - PREDICT_MOTION_WINDOW_SEC)
      .map((p) => [p.targetId, p]),
  );
  for (const p of players) {
    // Same-team players return flags too — approach is approach; the
    // scorer decides what an arrival would mean.
    if (p.teamId != null && p.teamId === slot && flag.status === "home") {
      continue;
    }
    const d = dist(p.pos, flag.pos);
    if (d > PREDICT_GRAB_RANGE) continue;
    const prev = before.get(p.targetId);
    if (!prev) continue;
    const dPrev = dist(prev.pos, flag.pos);
    const closing = (dPrev - d) / PREDICT_MOTION_WINDOW_SEC;
    if (closing < PREDICT_MIN_CLOSING_SPEED) continue;
    const eta = d / closing;
    const byArmor =
      p.armor === "light"
        ? 1
        : p.armor === "medium"
          ? 0.8
          : p.armor === "heavy"
            ? 0.3
            : 0.6;
    const raiding = view.dataset.structures.some(
      (st) =>
        st.to > st.from &&
        st.timeSec <= view.now &&
        view.now - st.timeSec <= RAID_MEMORY_SEC &&
        dist(st.pos, p.pos) <= RAID_NEAR_RANGE,
    );
    const likelihood = byArmor * (raiding ? 0.4 : 1);
    // Soonest arrival still wins, but a plausible capper outranks a
    // marginally earlier wrecking ball.
    const rank = eta / Math.max(0.2, likelihood);
    const bestRank = best
      ? best.eta / Math.max(0.2, best.likelihood)
      : Infinity;
    if (rank < bestRank) {
      best = { targetId: p.targetId, eta, speed: closing, likelihood };
    }
  }
  return best;
}

/** How long a demolition nearby marks somebody as a raider, and how
 *  close it has to be to count. */
const RAID_MEMORY_SEC = 15;
const RAID_NEAR_RANGE = 50;

/**
 * How likely the current carry is to score, 0..1 — the causal stand-in
 * for the oracle's ends-in-cap bonus. Blends how much of the map the
 * carrier has already closed, how fast they are moving toward their
 * own stand, and whether their team's flag is home to score on.
 */
export function capLikelihood(view: CausalView, slot: number): number {
  const flag = view.flagAt(slot);
  if (!flag || flag.status !== "held") return 0;
  const home = view.carryDestination(slot);
  if (!home) return 0;
  const span = mapSpan(view);
  if (span <= 0) return 0;
  const d = dist(flag.pos, home);
  const closed = Math.min(1, Math.max(0, 1 - d / span));
  const before = view.flagAt(slot, view.now - PREDICT_MOTION_WINDOW_SEC);
  let speedToward = 0;
  if (before && view.now - before.timeSec <= PREDICT_MOTION_WINDOW_SEC + 3) {
    const dBefore = dist(before.pos, home);
    speedToward = Math.max(
      0,
      (dBefore - d) / Math.max(0.5, view.now - before.timeSec),
    );
  }
  const speed = Math.min(1, speedToward / CAP_FULL_SPEED);
  // The OTHER flag being home is what makes the cap possible now.
  const otherSlot = view.flagSlots().find((s) => s !== slot);
  const ownFlagHome =
    otherSlot != null && view.flagAt(otherSlot)?.status === "home" ? 1 : 0;
  return (
    closed * CAP_DISTANCE_WEIGHT +
    speed * CAP_SPEED_WEIGHT +
    ownFlagHome * CAP_OWN_FLAG_WEIGHT
  );
}

/** Whether anyone from the owning team is converging on this dropped
 *  flag — the causal "return soon" signal. */
export function returnConverging(view: CausalView, slot: number): boolean {
  const flag = view.flagAt(slot);
  if (!flag || flag.status !== "field") return false;
  const before = new Map(
    view
      .playersAt(view.now - PREDICT_MOTION_WINDOW_SEC)
      .map((p) => [p.targetId, p]),
  );
  for (const p of view.playersAt()) {
    if (p.teamId !== slot) continue;
    const d = dist(p.pos, flag.pos);
    if (d > PREDICT_GRAB_RANGE) continue;
    const prev = before.get(p.targetId);
    if (!prev) continue;
    const closing = (dist(prev.pos, flag.pos) - d) / PREDICT_MOTION_WINDOW_SEC;
    if (closing >= PREDICT_MIN_CLOSING_SPEED || d <= 30) return true;
  }
  return false;
}

/** The map's base-to-base span (static rigging knowledge). */
export function mapSpan(view: CausalView): number {
  const [a, b] = view.stands;
  return a && b ? dist(a.pos, b.pos) : 0;
}
