/**
 * A comparable fingerprint of the built world.
 *
 * The point of this module is verifying that the headless world
 * builder places geometry exactly where the browser does. Rendering
 * both and comparing screenshots is the obvious approach and the wrong
 * one: a transposed rotation or a swizzled axis produces geometry that
 * looks entirely plausible in a picture while colliding in the wrong
 * places. Numbers catch that in one diff.
 *
 * Two layers, cheapest first:
 *
 * 1. `getColliderDump()` — where every collider ended up. A bad
 *    transform is obvious here, and it tells you WHICH interior.
 * 2. `raycastFingerprint()` — what the rays actually return. This is
 *    the one that matters, because rays are what `cameraRig` consumes;
 *    matrices can agree while a BVH disagrees.
 *
 * Both run in either stack — they read the shared collision registry,
 * not any scene graph — so the browser can emit the same JSON and the
 * two files diff directly.
 */

import { castWorldRay, getColliderDump } from "../collision/worldCollision";

/**
 * three-space (X-right, Y-up, Z-back) → Torque space (X, Y, Z-up).
 * The collider dump reports three-space boxes; every cast* function
 * takes Torque. Mixing them up is silent — the rays simply miss.
 */
function threeToTorque(v: [number, number, number]): [number, number, number] {
  return [v[2], v[0], v[1]];
}

/**
 * A deterministic lattice of downward probes in TORQUE space (X, Y,
 * Z-up — the space every cast* function takes; passing three-space
 * coordinates silently misses almost everything).
 */
export interface FingerprintOptions {
  /** Half-extent of the probe lattice, in world units. */
  extent?: number;
  /** Spacing between probes. */
  step?: number;
  /** Z to cast from, and to. */
  fromZ?: number;
  toZ?: number;
  /** Include mission statics (camera occluders). */
  includeStatics?: boolean;
}

export interface FingerprintProbe {
  x: number;
  y: number;
  /** null when the ray missed everything. */
  hit: {
    source: string;
    /** Rounded so float noise between builds doesn't read as a diff;
     *  a real placement error moves a hit far more than this. */
    z: number;
    normal: [number, number, number];
  } | null;
}

export interface WorldFingerprint {
  options: Required<FingerprintOptions>;
  probes: FingerprintProbe[];
  summary: { total: number; hits: number; bySource: Record<string, number> };
}

const round = (n: number, places = 3) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/**
 * Cast a fixed grid of rays and record what each one hit. Identical
 * inputs must produce identical output across stacks; if they do not,
 * the geometry differs even when the matrices agree.
 */
export function raycastFingerprint(
  options: FingerprintOptions = {},
): WorldFingerprint {
  const resolved: Required<FingerprintOptions> = {
    extent: options.extent ?? 800,
    step: options.step ?? 64,
    fromZ: options.fromZ ?? 1000,
    toZ: options.toZ ?? -200,
    includeStatics: options.includeStatics ?? true,
  };
  const { extent, step, fromZ, toZ, includeStatics } = resolved;

  const probes: FingerprintProbe[] = [];
  const bySource: Record<string, number> = {};
  let hits = 0;

  const probeAt = (x: number, y: number) => {
    const hit = castWorldRay([x, y, fromZ], [x, y, toZ], { includeStatics });
    if (hit) {
      hits++;
      bySource[hit.source] = (bySource[hit.source] ?? 0) + 1;
      probes.push({
        x,
        y,
        hit: {
          source: hit.source,
          z: round(hit.point[2]),
          normal: [
            round(hit.normal[0], 4),
            round(hit.normal[1], 4),
            round(hit.normal[2], 4),
          ],
        },
      });
    } else {
      probes.push({ x, y, hit: null });
    }
  };

  // A blind lattice covers terrain well but mostly misses buildings —
  // map props are small relative to any sane spacing. So probe the
  // lattice for broad coverage AND every registered collider's own
  // centre, which guarantees each piece of loaded geometry is actually
  // tested. Colliders are dumped in sorted order, so this stays
  // deterministic across stacks.
  for (let x = -extent; x <= extent; x += step) {
    for (let y = -extent; y <= extent; y += step) probeAt(x, y);
  }

  for (const collider of getColliderDump()) {
    const centre = threeToTorque([
      (collider.worldBoxMin[0] + collider.worldBoxMax[0]) / 2,
      (collider.worldBoxMin[1] + collider.worldBoxMax[1]) / 2,
      (collider.worldBoxMin[2] + collider.worldBoxMax[2]) / 2,
    ]);
    probeAt(round(centre[0], 2), round(centre[1], 2));
  }

  return {
    options: resolved,
    probes,
    summary: { total: probes.length, hits, bySource },
  };
}

export interface FingerprintDiff {
  matched: number;
  differing: {
    x: number;
    y: number;
    a: FingerprintProbe["hit"];
    b: FingerprintProbe["hit"];
  }[];
}

/** Compare two fingerprints probe by probe. */
export function diffFingerprints(
  a: WorldFingerprint,
  b: WorldFingerprint,
): FingerprintDiff {
  const key = (p: FingerprintProbe) => `${p.x},${p.y}`;
  const bByKey = new Map(b.probes.map((p) => [key(p), p]));
  const differing: FingerprintDiff["differing"] = [];
  let matched = 0;

  for (const probe of a.probes) {
    const other = bByKey.get(key(probe));
    if (!other) continue;
    const same =
      probe.hit === null
        ? other.hit === null
        : other.hit !== null &&
          probe.hit.source === other.hit.source &&
          probe.hit.z === other.hit.z;
    if (same) matched++;
    else differing.push({ x: probe.x, y: probe.y, a: probe.hit, b: other.hit });
  }

  return { matched, differing };
}
