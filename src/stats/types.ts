/**
 * Source-agnostic match stats data. v1 is populated from stat-bot JSON
 * exports (see statsJson.ts); a future demo-file scanner can produce the
 * same shape. Position samples feed the heatmap visualization; other
 * visualizations (kills, flag events, ...) can extend StatsData later.
 * All coordinates are Three.js space (converted at the source boundary):
 * Three X = Torque y, Three Z = Torque x.
 */

export type StatsTeamFilter = "all" | 1 | 2;

/**
 * Position samples in struct-of-arrays form.
 */
export interface PositionSamples {
  count: number;
  /**
   * Three X per sample.
   */
  x: Float32Array;
  /**
   * Three Z per sample.
   */
  z: Float32Array;
  /**
   * Seconds since match start.
   */
  t: Float32Array;
  /**
   * Team id: 1 = Storm, 2 = Inferno.
   */
  team: Uint8Array;
  /**
   * Source-specific player id (stat-bot `g`: Discord/TN guid when present,
   * else Torque client object id) — NOT a canonical key. Float64 because
   * guids exceed Int32 range.
   */
  playerId: Float64Array;
}

/**
 * A known world position from the source data (horizontal only), used to
 * sanity-check that the loaded mission matches the data.
 */
export interface StatsAnchor {
  x: number;
  z: number;
}

export interface StatsData {
  /**
   * Mission name as given by the source (e.g. `match.map`); resolved
   * against the manifest by the loader.
   */
  missionName: string;
  /**
   * Human-readable origin (e.g. the loaded file name).
   */
  sourceLabel: string;
  gametype?: string;
  lengthSec?: number;
  anchors: {
    storm?: StatsAnchor;
    inferno?: StatsAnchor;
  };
  positionSamples: PositionSamples;
}
