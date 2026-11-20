import type { Box3, Vector3 } from "three";

const axes = ["x", "y", "z"] as const;

/** Box3F::collideLine clips the finite interval, reporting t=0 inside. */
export function segmentBoxEntry(
  start: Vector3,
  end: Vector3,
  box: Box3,
): number | null {
  let entry = 0;
  let exit = 1;
  for (const axis of axes) {
    const min = box.min[axis];
    const max = box.max[axis];
    if (min > max) return null;
    const origin = start[axis];
    const delta = end[axis] - origin;
    if (delta === 0) {
      if (origin < min || origin > max) return null;
      continue;
    }
    const fromMin = (min - origin) / delta;
    const fromMax = (max - origin) / delta;
    entry = Math.max(entry, Math.min(fromMin, fromMax));
    exit = Math.min(exit, Math.max(fromMin, fromMax));
    if (entry > exit) return null;
  }
  return entry <= exit ? entry : null;
}
