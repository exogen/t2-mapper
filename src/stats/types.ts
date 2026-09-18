/** Compact, equally weighted position samples, one per player per interval.
 * Horizontal coordinates are Three.js space: X = Torque y, Z = Torque x. */
export interface PositionSamples {
  count: number;
  x: Float32Array;
  z: Float32Array;
  /** Seconds since kickoff, or the recorded interval's start if kickoff is missing. */
  t: Float32Array;
  team: Uint8Array;
  /** Scan-local player key, grouping names without clan tags (case-insensitive). */
  playerId: Float64Array;
}

export interface StatsPlayer {
  id: number;
  name: string;
  teamId: number;
  sampleCount: number;
}

export interface MatchStats {
  /** Unique within this demo, even when a mission is played repeatedly. */
  id: number;
  /** Playback interval begins with this game's loading / pre-match period. */
  fromSec: number;
  /** First ready scene for this game; null if the demo ends while loading. */
  sceneFromSec: number | null;
  missionName: string | null;
  /** Null when the recording omits kickoff or ends during warmup. */
  matchStartSec: number | null;
  matchEndSec: number;
  /** True only when both kickoff and the match's end were recorded. */
  matchComplete: boolean;
  players: StatsPlayer[];
  positionSamples: PositionSamples;
}

export interface StatsData {
  sampleIntervalSec: number;
  /** Chronological matches, never keyed or combined by mission name. */
  matches: MatchStats[];
}
