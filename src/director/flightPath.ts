/**
 * The curve a sweep actually flies.
 *
 * A sweep is normally a straight line, which is fine for a pass across
 * a rank of players and wrong for crossing a map: to clear the one
 * ridge in the middle, a straight line has to sit at the height of that
 * ridge for its whole length, so the shot opens a hundred metres above
 * the flag it is supposed to be leaving.
 *
 * With waypoints the camera rises only where it has to. Plan-time
 * validation and the runtime both sample through here, so what was
 * checked is what gets flown.
 */
import { CatmullRomCurve3, Vector3 } from "three";
import type { DirectorVec3, Shot } from "./types";

type Sweep = Extract<Shot, { kind: "sweep" }>;

/** Curves are immutable per shot, and sampled many times a frame. */
const curves = new WeakMap<Sweep, CatmullRomCurve3>();

function curveFor(shot: Sweep): CatmullRomCurve3 | null {
  if (!shot.via || shot.via.length === 0) return null;
  let curve = curves.get(shot);
  if (!curve) {
    curve = new CatmullRomCurve3(
      [shot.from, ...shot.via, shot.to].map(
        (p) => new Vector3(p[0], p[1], p[2]),
      ),
      false,
      // Centripetal parameterisation: uniform overshoots on unevenly
      // spaced points, which here means dipping back into the hill the
      // waypoints were placed to clear.
      "centripetal",
    );
    curves.set(shot, curve);
  }
  return curve;
}

const _sample = new Vector3();

/**
 * Camera position at `f` (0..1) along a sweep, in TORQUE space.
 * Straight sweeps keep their exact old behaviour.
 */
export function flightPointAt(
  shot: Sweep,
  f: number,
  out: DirectorVec3 = [0, 0, 0],
): DirectorVec3 {
  const curve = curveFor(shot);
  if (!curve) {
    out[0] = shot.from[0] + (shot.to[0] - shot.from[0]) * f;
    out[1] = shot.from[1] + (shot.to[1] - shot.from[1]) * f;
    out[2] = shot.from[2] + (shot.to[2] - shot.from[2]) * f;
    return out;
  }
  curve.getPoint(Math.min(1, Math.max(0, f)), _sample);
  out[0] = _sample.x;
  out[1] = _sample.y;
  out[2] = _sample.z;
  return out;
}
