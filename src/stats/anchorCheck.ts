import type { StatsData } from "./types";

export interface FlagPosition {
  teamId: number;
  x: number;
  z: number;
}

/**
 * Sanity-checks the data's flag anchors against the loaded mission's flag
 * positions (all in Three coords). Returns a user-facing warning when an
 * anchor definitely mismatches its team's flag, or null when everything
 * matches — or when the map simply has no flags to compare against (non-CTF
 * missions shouldn't warn).
 */
export function checkAnchors(
  anchors: StatsData["anchors"],
  flags: FlagPosition[],
  epsilon = 2,
): string | null {
  const pairs: Array<[{ x: number; z: number } | undefined, number]> = [
    [anchors.storm, 1],
    [anchors.inferno, 2],
  ];
  for (const [anchor, teamId] of pairs) {
    if (!anchor) continue;
    const teamFlags = flags.filter((f) => f.teamId === teamId);
    if (teamFlags.length === 0) continue;
    const matches = teamFlags.some(
      (f) => Math.hypot(f.x - anchor.x, f.z - anchor.z) <= epsilon,
    );
    if (!matches) {
      return (
        "Flag positions in this file don't match the loaded map — " +
        "is this the right mission or version?"
      );
    }
  }
  return null;
}
