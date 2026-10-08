import { FLAG_RETURN_SECONDS } from "../gameConstants";
import type { StreamSnapshot } from "./types";

function delayForType(type: string | null): number | null {
  switch (type?.trim().replace(/Game$/i, "").toLowerCase()) {
    case "ctf":
    case "capture the flag":
      return FLAG_RETURN_SECONDS.CTF;
    case "lctf":
      return FLAG_RETURN_SECONDS.LCTF;
    case "lakrabbit":
      return FLAG_RETURN_SECONDS.LakRabbit;
    default:
      return null;
  }
}

export function flagReturnDelaySec(
  gameClassName: string | null,
  missionTypeDisplayName: string | null,
): number | null {
  // Some LCTF servers use CTFGame but identify LCTF in the display name.
  return delayForType(missionTypeDisplayName) ?? delayForType(gameClassName);
}

/** Whole seconds for display; null means unsupported mode or an unobserved drop.
 * Pass playback time (streamClock.time), not wall time. Null team = Rabbit. */
export function flagReturnSecondsRemaining(
  snapshot: Pick<
    StreamSnapshot,
    "flagDroppedAtSec" | "flagReturnDelaySec" | "matchEndedAtSec" | "timeSec"
  > | null,
  teamId: number | null,
  timeSec: number,
): number | null {
  const droppedAtSec = snapshot?.flagDroppedAtSec[teamId ?? 0];
  if (droppedAtSec == null || snapshot?.flagReturnDelaySec == null) return null;
  // Snapshots lead the render clock by an interpolation tick. Disconnects
  // also reset that clock while leaving the final HUD snapshot visible.
  const now = Math.min(
    Math.max(timeSec, snapshot.timeSec),
    snapshot.matchEndedAtSec ?? Infinity,
  );
  // Quantize to milliseconds before rounding up for display: fractional
  // tick timestamps can otherwise add a second through floating-point error.
  const elapsedMs = Math.round((now - droppedAtSec) * 1000);
  return Math.max(0, Math.ceil(snapshot.flagReturnDelaySec - elapsedMs / 1000));
}
