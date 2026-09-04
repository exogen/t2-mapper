/**
 * Where the CastGenius button starts a recording.
 *
 * A demo's head is dead air — a tournament demo can spend a quarter of
 * an hour on team-picking before the whistle — and the broadcast may
 * open before the plan's first scene. Pure, so the rule is testable
 * without the engine.
 */

/** Lead-in before the commentary's first line: enough that demo-seek
 *  tick granularity and clock settle can't swallow the opening word,
 *  and a beat of the venue before anyone speaks. The audio player
 *  pre-buffers at the same position. */
export const DIRECTOR_INTRO_LEAD_SEC = 6;
/**
 * The demo time to seek to when directing begins, or null to stay put.
 *
 * In order: the commentary's first line less the lead-in, when a track
 * is loaded — that is where the broadcast starts, old cast or new. (A
 * new cast's hosts come on minutes before its skip mark, so no
 * "intro too early" sanity bound: the track is chosen by name beside
 * the cast, and its first line is trusted.) Otherwise the plan's
 * `skipToSec`, the director's own mark past the team-picking dead air.
 * Only ever forward: a viewer who has already seeked into the match is
 * never dragged back.
 */
export function directorStartSec(input: {
  /** The playhead now. */
  nowSec: number;
  /** Demo time of the commentary track's first line, if one is loaded. */
  introSec: number | null | undefined;
  skipToSec: number | null | undefined;
}): number | null {
  const { nowSec, introSec, skipToSec } = input;
  const target =
    introSec != null
      ? Math.max(0, introSec - DIRECTOR_INTRO_LEAD_SEC)
      : (skipToSec ?? null);
  if (target == null || target <= nowSec) return null;
  return target;
}
