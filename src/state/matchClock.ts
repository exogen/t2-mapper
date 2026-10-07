import type { StreamSnapshot } from "../stream/types";

export function matchClockAt(
  snapshot: Pick<
    StreamSnapshot,
    "matchClockMs" | "matchEnded" | "timeSec"
  > | null,
  timeSec: number,
): number | null {
  if (snapshot?.matchClockMs == null) return null;
  return (
    snapshot.matchClockMs +
    (snapshot.matchEnded ? 0 : (timeSec - snapshot.timeSec) * 1000)
  );
}
