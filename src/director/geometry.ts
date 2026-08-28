/**
 * Small geometric helpers shared across the planner. Positions are
 * Torque-space [x, y, z] triples throughout; the runtime converts to
 * Three's axis order when it writes the camera.
 */
import type { DirectorVec3 } from "./types";
import { DIRECTOR_SWEEP_MAX_SPEED } from "./tunables";

export function dist(a: DirectorVec3, b: DirectorVec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function centroid(points: DirectorVec3[]): DirectorVec3 {
  const sum: DirectorVec3 = [0, 0, 0];
  for (const p of points) {
    sum[0] += p[0];
    sum[1] += p[1];
    sum[2] += p[2];
  }
  const n = Math.max(points.length, 1);
  return [sum[0] / n, sum[1] / n, sum[2] / n];
}

/**
 * Orbit-yaw bearing from one Torque position toward another, in the
 * (cos, 0, sin) Three-space forward convention orbitOverrideYaw uses
 * (Three x = Torque y, Three z = Torque x).
 */
export function bearingYaw(from: DirectorVec3, to: DirectorVec3): number {
  return Math.atan2(to[0] - from[0], to[1] - from[1]);
}

/** The centre of a set of points and how far the set reaches from it —
 *  the two numbers every "frame this group" decision needs. */
export function boundingSpread(points: DirectorVec3[]): {
  center: DirectorVec3;
  spread: number;
} {
  const center = centroid(points);
  return {
    center,
    spread: Math.max(...points.map((p) => dist(p, center))),
  };
}

/** Clamp a pass's travel so the camera never races along its path. */
export function sweepTravel(span: number, wanted: number): number {
  return Math.min(wanted, span * DIRECTOR_SWEEP_MAX_SPEED);
}
