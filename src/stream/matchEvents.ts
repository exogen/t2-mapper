import { stripTaggedStringMarkup } from "../../relay/shared";

export { hasGameOverAnnouncement } from "../../relay/shared";

/**
 * `MsgMissionStart` is overloaded: the server broadcasts it for every
 * pre-match countdown tick ("Match starts in N seconds", from
 * `notifyMatchStart`), for an admin force, and for the real kickoff
 * ("Match started!" from `DefaultGame::startMatch`). Only the last of
 * those means play has begun.
 *
 * An admin force is NOT a kickoff: `DefaultGame::voteMatchStart` prints
 * "The admin has forced the match to start." and then calls
 * `startTourneyCountdown()` — it begins a countdown, which
 * `CancelCountdown` can still abort. A tournament demo can carry
 * several forced starts and cancelled countdowns minutes apart before
 * the one that completes (observed: forces at 821s and 1029s, real
 * kickoff at 1059s), so keying off the force would put the match start
 * four minutes early.
 *
 * Cancelled countdowns are handled for free: `CancelCountdown` sends no
 * message, and a cancelled countdown never reaches a kickoff body — so
 * the entry lands where play actually began.
 */
export function isRealMatchStart(rawBody: string): boolean {
  return stripTaggedStringMarkup(rawBody)
    .toLowerCase()
    .includes("match started");
}

export type MatchPhase =
  | { kind: "unknown" | "warmup"; startSec?: never }
  | { kind: "countdown"; startSec: number }
  | { kind: "running"; startSec: number | null };

export const UNKNOWN_PHASE: MatchPhase = { kind: "unknown" };
export const WARMUP: MatchPhase = { kind: "warmup" };

/** Timestamps in catch-up snapshots travel relative to the source clock. */
export function shiftMatchPhase(
  phase: MatchPhase,
  offsetSec: number,
): MatchPhase {
  if (phase.startSec == null) return phase;
  return { ...phase, startSec: phase.startSec + offsetSec };
}

export function matchCountdownSeconds(
  body: string,
  argument?: string,
): number | undefined {
  const match = /match starts in (\d+|%1) second/i.exec(body);
  if (!match) return;
  const seconds = Number(match[1] === "%1" ? argument : match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

/** A CTF scoreboard with points proves play is underway without dating kickoff. */
export function matchPhaseFromScoreboard(
  gameClass: string | null | undefined,
  teams: readonly { score: number }[],
): MatchPhase {
  return gameClass?.toLowerCase().includes("ctf") &&
    teams.some((team) => team.score > 0)
    ? { kind: "running", startSec: null }
    : UNKNOWN_PHASE;
}

/** checkTimeLimit sends the full match limit plus time remaining. Short start/end
 * announcements send the remaining time in both fields, rounded to fractional minutes. */
export function matchPhaseFromClock(
  phase: MatchPhase,
  limitMs: number,
  remainingMs: number,
  nowSec: number,
): MatchPhase {
  // Later HUD synchronizations (including the final-minute announcements)
  // must not move an established kickoff.
  if (phase.kind === "running" && phase.startSec !== null) return phase;
  if (
    !Number.isFinite(limitMs) ||
    !Number.isFinite(remainingMs) ||
    limitMs <= 0 ||
    remainingMs < 0
  )
    return phase;
  const elapsedMs = limitMs - remainingMs;
  if (elapsedMs > 1)
    return { kind: "running", startSec: nowSec - elapsedMs / 1000 };
  if (Math.abs(elapsedMs) <= 1) {
    const deadline = nowSec + remainingMs / 1000;
    // notifyMatchStart announces whole seconds before sending the exact clock.
    if (phase.kind === "countdown" && Math.abs(phase.startSec - deadline) <= 1)
      return { kind: "countdown", startSec: deadline };
    if (remainingMs > 60_000) return { kind: "running", startSec: nowSec };
  }
  return phase;
}
