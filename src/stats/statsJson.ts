import type { StatsAnchor, StatsData, PositionSamples } from "./types";

/**
 * Parses a stat-bot match export (schema_version 4) into source-agnostic
 * stats data. Pure and throwing: errors carry user-readable messages for
 * the stats panel. Coordinates are converted from Torque (x, y horizontal)
 * to Three space here (Three X = Torque y, Three Z = Torque x) so nothing
 * downstream needs to know about the source coordinate system.
 */
export function parseStatsJson(text: string, sourceLabel: string): StatsData {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    throw new Error("Not a valid JSON file.");
  }
  if (typeof root !== "object" || root === null) {
    throw new Error("Unexpected JSON structure (not an object).");
  }
  const data = root as Record<string, unknown>;

  if (typeof data.schema_version !== "number") {
    throw new Error("Not a match stats file (missing schema_version).");
  }

  const match = data.match as Record<string, unknown> | undefined;
  const missionName = typeof match?.map === "string" ? match.map : "";
  if (!missionName) {
    throw new Error("Match stats file has no map name (match.map).");
  }

  const rawSamples = data.position_samples;
  if (!Array.isArray(rawSamples) || rawSamples.length === 0) {
    throw new Error("This file contains no position samples.");
  }

  const count = rawSamples.length;
  const samples: PositionSamples = {
    count,
    x: new Float32Array(count),
    z: new Float32Array(count),
    t: new Float32Array(count),
    team: new Uint8Array(count),
    playerId: new Float64Array(count),
  };

  let valid = 0;
  for (const raw of rawSamples) {
    const s = raw as Record<string, unknown>;
    const torqueX = s.x;
    const torqueY = s.y;
    const team = s.e;
    if (
      typeof torqueX !== "number" ||
      typeof torqueY !== "number" ||
      !Number.isFinite(torqueX) ||
      !Number.isFinite(torqueY) ||
      (team !== 1 && team !== 2)
    ) {
      continue;
    }
    samples.x[valid] = torqueY; // Three X = Torque y
    samples.z[valid] = torqueX; // Three Z = Torque x
    samples.t[valid] = typeof s.t === "number" ? s.t : 0;
    samples.team[valid] = team;
    samples.playerId[valid] = typeof s.g === "number" ? s.g : 0;
    valid++;
  }
  if (valid === 0) {
    throw new Error("No usable position samples in this file.");
  }
  samples.count = valid;

  const anchors: StatsData["anchors"] = {};
  const rawAnchors = data.map_anchors as Record<string, unknown> | undefined;
  const storm = parseAnchor(rawAnchors?.storm_flag);
  const inferno = parseAnchor(rawAnchors?.inferno_flag);
  if (storm) anchors.storm = storm;
  if (inferno) anchors.inferno = inferno;

  return {
    missionName,
    sourceLabel,
    gametype: typeof match?.gametype === "string" ? match.gametype : undefined,
    lengthSec:
      typeof match?.length_sec === "number" ? match.length_sec : undefined,
    anchors,
    positionSamples: samples,
  };
}

function parseAnchor(raw: unknown): StatsAnchor | undefined {
  const a = raw as Record<string, unknown> | undefined;
  if (
    a &&
    typeof a.x === "number" &&
    typeof a.y === "number" &&
    Number.isFinite(a.x) &&
    Number.isFinite(a.y)
  ) {
    // Torque (x, y) horizontal → Three (z, x); altitude dropped.
    return { x: a.y, z: a.x };
  }
  return undefined;
}
