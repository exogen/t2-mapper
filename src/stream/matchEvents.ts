import { stripTaggedStringMarkup } from "../../relay/shared";

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
