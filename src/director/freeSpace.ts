/**
 * A precomputed map of where a camera can actually SIT.
 *
 * The director used to place cameras geometrically and then let the
 * staging pass discover, ray by ray, that the result was inside a wall
 * or had no sight line — which produced exactly the log the user saw:
 *
 *     visibility: subject behind geometry — re-anchoring (angle 108°, r×0.91)
 *     travel: cut (flight path passes through geometry)
 *
 * Re-anchoring is a scramble after the fact. It is cheaper and far more
 * stable to know the free space up front and only ever propose shots
 * that live in it.
 *
 * ## Shape
 *
 * One axis-aligned box around every flag stand and permanent base
 * asset (team-agnostic — the playing area is the union of both bases
 * and the ground between), sampled on a grid. A cell is USABLE when it
 * is clear of terrain and has room around it; everything else is
 * discarded once, at build time.
 *
 * ## Cost
 *
 * The grid is the expensive part, so it is built in two stages. The
 * terrain test is arithmetic (`terrainHeightAt`) and rejects most of
 * the volume for free — on Damnation the box spans z 88..173 while the
 * terrain beneath it runs to 191, so a large share of cells are solid
 * rock. Only survivors pay for raycasts. Measured throughput is about
 * 0.11M rays/sec, so the ray stage is what sets the practical grid
 * step.
 */
import type { DirectorDataset, DirectorVec3 } from "./types";
import { castWorldRay, pointObstructed } from "../collision/worldCollision";
import { isPointSubmerged } from "../collision/waterLevel";
import { subjectVisible } from "./shotPath";

/**
 * Default sampling step, in world units.
 *
 * Was 8, set by raycast throughput. A Tribes 2 corridor is about 8
 * wide and 6 to 8 high, so at 8 whether it held ANY cell came down to
 * where the lattice happened to fall — Wilderzone's spawn corridors had
 * none, and every pick-up standing in one went unfilmed. Measured on
 * Wilderzone: 8 → 0.5s build, no sighted spot for a player in one; 6 →
 * 1.0s, ten spots, the nearest 5.6 units off; 4 → 3.3s and, by lattice
 * luck, two. Six buys the corridors for double the build.
 */
export const FREE_SPACE_STEP = 6;
/**
 * Room a camera needs around it.
 *
 * MEASURED, not chosen: base hardware sits in tight interior rooms, and
 * filmability falls off a cliff above this. Across 24 Damnation
 * landmarks — 6u: 5 filmable. 4u: 7. 3u: 13. 2u: 14. Three units buys
 * almost all of it while still keeping the camera off the walls.
 */
export const FREE_SPACE_CLEARANCE = 3;
/** The least room a camera can work in at all. Cells between this and
 *  `FREE_SPACE_CLEARANCE` are usable but penalised. */
const TIGHT_CLEARANCE = 1.5;
/** Cell states. */
const FREE_ROOMY = 1;
const FREE_TIGHT = 2;
/** Headroom above the tallest asset: cameras want to get above things. */
const CEILING_MARGIN = 120;
/** Room BELOW the lowest asset. Smaller than the ceiling margin —
 *  under-slung cameras are for basements and gantries, not for
 *  sampling the rock under the map. */
const FLOOR_MARGIN = 40;
/**
 * Only build cells within this of an asset.
 *
 * The grid exists to place cameras NEAR subjects, and a camera further
 * than this is not filming anything. The full bounding box is mostly
 * empty sky — 89% of it tested as usable and none of that was ever a
 * candidate. Measured on Damnation: the box is 2044k cells, of which
 * 430k (21%) lie within 100 units of an asset, so the mask removes
 * about 79% of the work.
 *
 * Must be >= the widest `maxDist` any caller searches, or the search
 * will look at cells the grid never built and see them as solid.
 */
export const FREE_SPACE_ASSET_RADIUS = 100;

/** What the grid was built around, for the debug overlay. */
export interface FreeSpaceAnchor {
  pos: DirectorVec3;
  /** Why this point anchors a neighbourhood: the asset, its side, and
   *  when it was first seen. */
  label: string;
}

export interface FreeSpaceGrid {
  readonly step: number;
  readonly lo: DirectorVec3;
  /** The assets whose neighbourhoods were sampled. */
  readonly anchors: readonly FreeSpaceAnchor[];
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  /** Usable cells, one byte each (1 = a camera fits here). */
  readonly free: Uint8Array;
  /** Cells the build actually examined. A cell outside every asset's
   *  reach was never tested, and reads as unknown — not as solid. */
  readonly tested: Uint8Array;
  /** How far from an asset cells were built. A search beyond this
   *  would read untested cells as solid, so `cameraSpotFor` clamps to
   *  it rather than leaving the two to disagree. */
  readonly assetRadius: number;
  /** Cells kept, and cells tested — for logging and tuning. */
  readonly usable: number;
  readonly total: number;
  readonly buildMs: number;
}

function idx(g: FreeSpaceGrid, ix: number, iy: number, iz: number): number {
  return (iz * g.ny + iy) * g.nx + ix;
}

/** Whether a world point sits in a usable cell. */
export function isFree(g: FreeSpaceGrid, p: DirectorVec3): boolean {
  const ix = Math.round((p[0] - g.lo[0]) / g.step);
  const iy = Math.round((p[1] - g.lo[1]) / g.step);
  const iz = Math.round((p[2] - g.lo[2]) / g.step);
  if (ix < 0 || iy < 0 || iz < 0 || ix >= g.nx || iy >= g.ny || iz >= g.nz) {
    // Outside the built volume is unknown, not free: refuse rather than
    // guess, so callers fall back to their old behaviour.
    return false;
  }
  return g.free[idx(g, ix, iy, iz)] !== 0;
}

/**
 * What the grid knows about a world point. "unknown" is outside the
 * built volume or a cell the build never reached — not evidence either
 * way, so a caller vetoing on the grid's word lets it through.
 */
export function roomAt(
  g: FreeSpaceGrid,
  p: DirectorVec3,
): "roomy" | "tight" | "solid" | "unknown" {
  const ix = Math.round((p[0] - g.lo[0]) / g.step);
  const iy = Math.round((p[1] - g.lo[1]) / g.step);
  const iz = Math.round((p[2] - g.lo[2]) / g.step);
  if (ix < 0 || iy < 0 || iz < 0 || ix >= g.nx || iy >= g.ny || iz >= g.nz) {
    return "unknown";
  }
  const i = idx(g, ix, iy, iz);
  if (!g.tested[i]) return "unknown";
  const state = g.free[i];
  return state === FREE_ROOMY
    ? "roomy"
    : state === FREE_TIGHT
      ? "tight"
      : "solid";
}

/**
 * Does every one of these camera positions sit in roomy space, as far
 * as the grid can tell? A wide pass is judged by this: a path check
 * with the two-unit camera clearance let a line-up orbit sit in a room
 * with the ceiling 2.6 units over the lens, which the grid's own
 * clearance would have refused.
 */
export function eyesRoomy(
  g: FreeSpaceGrid,
  eyes: readonly DirectorVec3[],
): boolean {
  for (const eye of eyes) {
    const room = roomAt(g, eye);
    if (room === "tight" || room === "solid") return false;
  }
  return true;
}

export function cellCenter(
  g: FreeSpaceGrid,
  ix: number,
  iy: number,
  iz: number,
): DirectorVec3 {
  return [g.lo[0] + ix * g.step, g.lo[1] + iy * g.step, g.lo[2] + iz * g.step];
}

/**
 * Is there room for a camera here?
 *
 * One sphere query against the BVH, not a bundle of rays. Six axis
 * raycasts cost six tree descents AND miss anything sitting between the
 * axes — a corner within clearance reads as free. `pointObstructed`
 * asks the question directly and stops at the first overlapping
 * triangle.
 */
function hasRoom(p: DirectorVec3, clearance: number): boolean {
  // ARCHITECTURE ONLY — terrain and interiors, not the hardware sitting
  // in the rooms. Counting statics here made every generator unfilmable:
  // the grid treated the generator's own mesh as an obstruction, so no
  // cell in its room was ever free and there was nowhere to film it
  // from. Walls and ground decide where a camera fits; whether the
  // SUBJECT is in the way is what the sight test is for.
  if (pointObstructed(p, clearance, { includeStatics: false })) return false;
  // A submerged lens is not a camera position, whatever the geometry
  // says. Damnation's base basement holds a pool whose surface sits at
  // z=88.7, and the grid happily placed the generator's camera 0.84m
  // under it: clear of every wall, a clean sight line up to the subject
  // (which is above the waterline), and a picture that was nothing but
  // green fog. The margin keeps the lens off the waterline too, since a
  // half-submerged camera is just as unusable.
  return !isPointSubmerged(p[0], p[1], p[2] - WATERLINE_MARGIN);
}
/** How far clear of a liquid surface a camera has to sit. */
const WATERLINE_MARGIN = 2;

/**
 * Build the grid from the assets standing at `nowSec`.
 *
 * MUST be called inside the world's collision context (see
 * world/nodeCollisionContext) — every cell test raycasts.
 */
/**
 * A grid being built, a slice of work at a time.
 *
 * Half a second of raycasting is a frozen picture if it happens in one
 * go, and a live cast cannot scan ahead to get it over with before
 * playback — the future has not arrived yet. So the build is
 * RESUMABLE: the director pumps it a few milliseconds per tick and
 * simply does not plan landmark shots until `grid` appears.
 */
export interface FreeSpaceBuild {
  /**
   * Examine up to `chunks` more chunks of cells. Returns true when
   * finished.
   *
   * Budgeted in WORK, not wall-clock. A time budget makes the number of
   * ticks the build takes depend on the machine — and since the
   * director cannot plan landmark shots until it finishes, that makes
   * the CAST depend on the machine. Measured: the same demo produced
   * 219, 223 and 219 shots on three consecutive runs.
   */
  step(chunks: number): boolean;
  /** The finished grid, or null while still building. */
  readonly grid: FreeSpaceGrid | null;
}

/** Cells examined per chunk — the unit `step` counts. */
const BUILD_CHUNK_CELLS = 512;

/**
 * When the grid may be built: the protocol's "world complete" plus a
 * short settle. GhostAlwaysDone says every always-ghosted object has
 * been SENT; the trackers see them a sample later — Raindance reports
 * the world complete at 3.97s and its first base asset at 4.50s. Built
 * on the signal alone, the grid had two anchors, the flag stands, and
 * covered nothing else.
 */
export function gridBuildSec(dataset: DirectorDataset): number | null {
  const complete = dataset.matchFacts?.worldCompleteSec;
  return complete == null ? null : complete + WORLD_SETTLE_SEC;
}

/** Samples between GhostAlwaysDone and the last always-ghost landing in
 *  the trackers, with a margin. */
const WORLD_SETTLE_SEC = 1.5;

export function createFreeSpaceBuild(
  dataset: DirectorDataset,
  nowSec: number,
  options: { step?: number; clearance?: number; assetRadius?: number } = {},
): FreeSpaceBuild | null {
  const step = options.step ?? FREE_SPACE_STEP;
  const clearance = options.clearance ?? FREE_SPACE_CLEARANCE;
  const started = Date.now();

  // Team-agnostic: the playing area is both bases and everything
  // between them. Every structure standing by `nowSec` counts —
  // deployables included, so a grid built mid-match reaches out to
  // wherever players have put turrets and stations.
  const teamName = (teamId: number | null | undefined) =>
    dataset.teams?.find((t) => t.teamId === teamId)?.name ?? "neutral";
  const labelled: FreeSpaceAnchor[] = [
    ...dataset.flagStands.map((s) => ({
      pos: s.pos,
      label: `${teamName(s.teamId)} flag stand`,
    })),
    ...dataset.structureInventory
      .filter((s) => s.firstSeenSec <= nowSec)
      .map((s) => ({
        pos: s.pos,
        label: `${teamName(s.teamId)} ${s.name} (seen ${s.firstSeenSec.toFixed(1)}s)`,
      })),
  ];
  const anchors = labelled.map((a) => a.pos);
  if (anchors.length < 2) return null;

  const lo: DirectorVec3 = [Infinity, Infinity, Infinity];
  const hi: DirectorVec3 = [-Infinity, -Infinity, -Infinity];
  for (const a of anchors) {
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], a[i]);
      hi[i] = Math.max(hi[i], a[i]);
    }
  }
  // Cameras stand off from what they film and rise above it, so the
  // usable volume is wider and much taller than the assets themselves.
  const pad = 60;
  lo[0] -= pad;
  lo[1] -= pad;
  hi[0] += pad;
  hi[1] += pad;
  hi[2] += CEILING_MARGIN;
  // ...and DOWN, which this used to skip. Without it the grid's floor
  // is the lowest asset on the map, so a subject in a basement can
  // only ever be filmed from level with it or above — the half of the
  // room a camera would actually want was never sampled.
  lo[2] -= FLOOR_MARGIN;

  const nx = Math.floor((hi[0] - lo[0]) / step) + 1;
  const ny = Math.floor((hi[1] - lo[1]) / step) + 1;
  const nz = Math.floor((hi[2] - lo[2]) / step) + 1;
  const free = new Uint8Array(nx * ny * nz);
  // Walk each asset's own neighbourhood rather than the whole box,
  // deduping as we go. Testing every cell against every anchor would be
  // cells x anchors distance checks (49M here) before a single geometry
  // query; per-asset boxes are ~3M and touch each cell once.
  const tested = new Uint8Array(nx * ny * nz);
  const grid: FreeSpaceGrid = {
    step,
    lo,
    anchors: labelled,
    assetRadius: options.assetRadius ?? FREE_SPACE_ASSET_RADIUS,
    nx,
    ny,
    nz,
    free,
    tested,
    usable: 0,
    total: nx * ny * nz,
    buildMs: 0,
  };

  const reach = options.assetRadius ?? FREE_SPACE_ASSET_RADIUS;
  const cells = Math.ceil(reach / step);
  const reach2 = reach * reach;
  let usable = 0;
  let considered = 0;
  function* walk(): Generator<void> {
    let sinceCheck = 0;
    for (const a of anchors) {
      const ax = Math.round((a[0] - lo[0]) / step);
      const ay = Math.round((a[1] - lo[1]) / step);
      const az = Math.round((a[2] - lo[2]) / step);
      const z0 = Math.max(0, az - cells);
      const z1 = Math.min(nz - 1, az + cells);
      const y0 = Math.max(0, ay - cells);
      const y1 = Math.min(ny - 1, ay + cells);
      const x0 = Math.max(0, ax - cells);
      const x1 = Math.min(nx - 1, ax + cells);
      for (let iz = z0; iz <= z1; iz++) {
        const z = lo[2] + iz * step;
        for (let iy = y0; iy <= y1; iy++) {
          const y = lo[1] + iy * step;
          for (let ix = x0; ix <= x1; ix++) {
            const i = (iz * ny + iy) * nx + ix;
            if (tested[i]) continue;
            const x = lo[0] + ix * step;
            const dx = x - a[0];
            const dy = y - a[1];
            const dz = z - a[2];
            if (dx * dx + dy * dy + dz * dz > reach2) continue;
            tested[i] = 1;
            considered++;
            // NO separate terrain shortcut here. There used to be one —
            // "below ground is never usable" — and it silently undid the
            // basement handling in `pointObstructed`: every cell under a
            // base was discarded before the roof check could rule it
            // legal, which is why the generators looked unfilmable when
            // they in fact have 8 units of open air around them.
            // `pointObstructed` tests terrain FIRST and returns early, so
            // it is already the cheap path.
            // Two tiers. A cramped room may offer nothing at the
            // comfortable clearance — Damnation's generator has no
            // sighted spot inside 16m at 3m clearance, but one at 10m if
            // the lens may pass within 1.5m of a wall. Rejecting those
            // outright left the only options 21m back with the room's
            // walls filling the frame, so record them and let the search
            // prefer roomy ones on cost.
            if (++sinceCheck >= BUILD_CHUNK_CELLS) {
              sinceCheck = 0;
              yield;
            }
            if (!hasRoom([x, y, z], TIGHT_CLEARANCE)) continue;
            free[i] = hasRoom([x, y, z], clearance) ? FREE_ROOMY : FREE_TIGHT;
            usable++;
          }
        }
      }
    }
  }

  const work = walk();
  let built: FreeSpaceGrid | null = null;
  return {
    step(chunks: number): boolean {
      if (built) return true;
      for (let i = 0; i < chunks; i++) {
        if (work.next().done === true) {
          built = {
            ...grid,
            usable,
            total: considered,
            buildMs: Date.now() - started,
          };
          return true;
        }
      }
      return false;
    },
    get grid() {
      return built;
    },
  };
}

/**
 * Build one outright, for callers with no frame loop to protect.
 *
 * The director does NOT use this — it pumps `createFreeSpaceBuild` a
 * few milliseconds at a time — so a test written against this alone
 * would leave the resumable path uncovered. See the stepping tests.
 */
export function buildFreeSpace(
  dataset: DirectorDataset,
  nowSec: number,
  options: { step?: number; clearance?: number; assetRadius?: number } = {},
): FreeSpaceGrid | null {
  const build = createFreeSpaceBuild(dataset, nowSec, options);
  if (!build) return null;
  build.step(Number.POSITIVE_INFINITY);
  return build.grid;
}

/**
 * A camera position for filming `subject`: free space, roughly the
 * wanted distance away, and with an actual sight line to the subject.
 *
 * This replaces "place it geometrically and let staging re-anchor when
 * it fails". Candidates are drawn from the grid, so every one of them
 * is known-clear before line of sight is even tested.
 *
 * Returns null when the subject is unfilmable from anywhere nearby —
 * the caller should then pick a different subject rather than stage a
 * shot of a wall.
 */
export function cameraSpotsFor(
  g: FreeSpaceGrid,
  /** The point a shot of this subject will AIM at. Searching against
   *  the anchor instead looks for a view of the ground the subject
   *  stands on — and disagreed with the planner, which validates the
   *  aim, so the grid kept proposing points the planner threw out. */
  subject: DirectorVec3,
  options: {
    wantDist: number;
    /** Preferred bearing (radians); ties break toward it. */
    bearing?: number;
    /** Hard ceiling on how far the camera may end up. */
    maxDist?: number;
  },
): DirectorVec3[] {
  const { wantDist } = options;
  // Never search past where cells were actually built: beyond the
  // grid's reach every lookup reports solid, which would silently look
  // like "unfilmable" rather than "not built".
  const maxDist = Math.min(options.maxDist ?? wantDist * 3, g.assetRadius);
  const bearing = options.bearing;

  // SEARCH THE GRID, do not sample a ring. Ring sampling only ever
  // proposes positions the caller already imagined, and measurement
  // showed that fails almost completely for base hardware: on Damnation
  // a ring around a generator has ZERO clearance at any radius, and
  // most indoor assets had no sighted ring position out to 60 units.
  // The whole point of the grid is that it knows about the doorway the
  // ring never tries.
  const r = Math.ceil(maxDist / g.step);
  const cx = Math.round((subject[0] - g.lo[0]) / g.step);
  const cy = Math.round((subject[1] - g.lo[1]) / g.step);
  const cz = Math.round((subject[2] - g.lo[2]) / g.step);

  const shortlist: { p: DirectorVec3; cost: number }[] = [];
  for (let iz = Math.max(0, cz - r); iz < Math.min(g.nz, cz + r + 1); iz++) {
    for (let iy = Math.max(0, cy - r); iy < Math.min(g.ny, cy + r + 1); iy++) {
      for (
        let ix = Math.max(0, cx - r);
        ix < Math.min(g.nx, cx + r + 1);
        ix++
      ) {
        const tier = g.free[(iz * g.ny + iy) * g.nx + ix];
        if (tier === 0) continue;
        const p = cellCenter(g, ix, iy, iz);
        const dx = p[0] - subject[0];
        const dy = p[1] - subject[1];
        const dz = p[2] - subject[2];
        const d = Math.hypot(dx, dy, dz);
        if (d < 2 || d > maxDist) continue;
        // Cost before the expensive test, so the cheapest candidates
        // are tried first and a good one short-circuits the rest.
        let cost = Math.abs(d - wantDist) / wantDist;
        if (bearing != null) {
          const ang = Math.atan2(dx, dy);
          let diff = Math.abs(ang - bearing) % (Math.PI * 2);
          if (diff > Math.PI) diff = Math.PI * 2 - diff;
          cost += (diff / Math.PI) * 0.5;
        }
        // A camera below its subject films the underside of things.
        if (dz < 0) cost += 0.4;
        // Working room, when there is a choice.
        if (tier === FREE_TIGHT) cost += TIGHT_PENALTY;
        // Keep the lens near eye level. Open space is mostly OVERHEAD,
        // so rewarding openness alone walks the camera up into a
        // near-vertical look-down — the same "all you see is ground
        // going past" problem the flyovers had.
        const elev = Math.abs(
          Math.atan2(dz, Math.max(1e-3, Math.hypot(dx, dy))),
        );
        if (elev > ELEV_COMFORT) {
          cost +=
            ((elev - ELEV_COMFORT) / (Math.PI / 2 - ELEV_COMFORT)) *
            ELEV_WEIGHT;
        }
        // Keep the cheap ranking cheap: this loop runs over thousands of
        // cells, so nothing here raycasts except the sight test.
        if (
          shortlist.length === SHORTLIST &&
          cost >= shortlist[SHORTLIST - 1].cost
        ) {
          continue;
        }
        if (!subjectVisible(p, subject)) continue;
        shortlist.push({ p, cost });
        shortlist.sort((a, b) => a.cost - b.cost);
        if (shortlist.length > SHORTLIST) shortlist.length = SHORTLIST;
      }
    }
  }

  // Now spend real rays, but only on the finalists. Distance and
  // elevation cannot tell a clean view from one with a wall across
  // half of it, and that — not a buried camera — is what made the
  // generator shot unwatchable.
  return shortlist
    .map((c) => ({
      p: c.p,
      cost: c.cost + (1 - frameOpenness(c.p, subject)) * OPENNESS_WEIGHT,
    }))
    .sort((a, b) => a.cost - b.cost)
    .map((c) => c.p);
}

/** The single best spot, for callers with nothing to retry with. */
export function cameraSpotFor(
  g: FreeSpaceGrid,
  subject: DirectorVec3,
  options: { wantDist: number; bearing?: number; maxDist?: number },
): DirectorVec3 | null {
  return cameraSpotsFor(g, subject, options)[0] ?? null;
}

/**
 * How much of the frame is wall.
 *
 * A fan of rays around the view axis, counting those that get most of
 * the way to the subject before hitting something. This is the question
 * clearance around the lens cannot answer: the camera that produced the
 * bad generator shot had 5.4m of room and a wall filling the left of
 * the picture.
 */
function frameOpenness(from: DirectorVec3, subject: DirectorVec3): number {
  const dx = subject[0] - from[0];
  const dy = subject[1] - from[1];
  const dz = subject[2] - from[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-3) return 1;
  const fx = dx / len;
  const fy = dy / len;
  const fz = dz / len;
  // Any two axes perpendicular to the view: one horizontal, one the
  // cross product, so the fan spreads across the frame.
  const hn = Math.max(1e-6, Math.hypot(fx, fy));
  const rx = -fy / hn;
  const ry = fx / hn;
  const ux = ry * fz;
  const uy = -rx * fz;
  const uz = rx * fy - ry * fx;
  const un = Math.max(1e-6, Math.hypot(ux, uy, uz));
  // Count a ray as clear if it survives most of the way to the subject.
  const reach = len * 0.9;
  let open = 0;
  for (const [a, b] of FRAME_FAN) {
    const sx = fx + (rx * a + (ux / un) * b) * FRAME_FAN_SPREAD;
    const sy = fy + (ry * a + (uy / un) * b) * FRAME_FAN_SPREAD;
    const sz = fz + (uz / un) * b * FRAME_FAN_SPREAD;
    const n = Math.max(1e-6, Math.hypot(sx, sy, sz));
    const to: DirectorVec3 = [
      from[0] + (sx / n) * reach,
      from[1] + (sy / n) * reach,
      from[2] + (sz / n) * reach,
    ];
    const hit = castWorldRay(from, to, { includeStatics: false });
    if (!hit) open++;
  }
  return open / FRAME_FAN.length;
}
/** Offsets across the frame, in `FRAME_FAN_SPREAD` units. */
const FRAME_FAN: [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
];
/** Tangent of the fan's half-angle — roughly a 40 degree frame. */
const FRAME_FAN_SPREAD = 0.36;
/** Finalists that earn a real ray fan. */
const SHORTLIST = 12;
/** Cost of standing somewhere merely usable rather than comfortable. */
const TIGHT_PENALTY = 0.35;

/**
 * Can this camera see the subject?
 *
 * NOT "is the ray to its centre unobstructed" — a solid object blocks
 * its own centre, so that test fails for literally every piece of map
 * hardware. Measured on a Damnation generator: 3087 free cells within
 * 40 units, ZERO of which "could see it", because every ray stopped on
 * the generator's own mesh a metre short of the point being tested.
 *
 * The question is whether the first thing the ray meets IS the subject.
 */
/**
 * How far an orbit can actually turn before it hits something.
 *
 * `cameraSpotFor` validates a POINT, but `fixedOrbit` does not stay on
 * it — it swings the camera around a circle, and on Damnation most base
 * hardware sits in a room whose walls the circle immediately enters.
 * That is why placing shots from the grid did not, on its own, reduce
 * re-anchoring: the start was clean and the rest of the arc was not.
 *
 * Walks outward from `startAngle` in both directions, in `step` radians,
 * and returns the free span each way. A landmark with no room to turn
 * comes back {0, 0}, which the caller should render as a locked-off
 * camera rather than an orbit through a wall.
 */
export function orbitArc(
  g: FreeSpaceGrid,
  center: DirectorVec3,
  /** The point the orbit LOOKS at — an asset's middle, a person's
   *  chest. Testing the anchor instead asks about the ground it stands
   *  on, which is not what the shot shows. */
  aim: DirectorVec3,
  radius: number,
  heightFactor: number,
  startAngle: number,
  limit = Math.PI,
  step = Math.PI / 24,
): { cw: number; ccw: number } {
  const at = (angle: number): DirectorVec3 => [
    // Matches the fixedOrbit convention: camera at (sin θ, cos θ)·r.
    center[0] + Math.sin(angle) * radius,
    center[1] + Math.cos(angle) * radius,
    center[2] + heightFactor * radius,
  ];
  const walk = (dir: 1 | -1): number => {
    let travelled = 0;
    for (let a = step; a <= limit + 1e-6; a += step) {
      const p = at(startAngle + dir * a);
      if (!isFree(g, p) || !subjectVisible(p, aim)) break;
      travelled = a;
    }
    return travelled;
  };
  return { cw: walk(1), ccw: walk(-1) };
}

/** How much a blocked-looking view is penalised, against distance. */
const OPENNESS_WEIGHT = 1.4;
/** Steepest look-down that still reads as a camera rather than a map
 *  view (radians above the horizontal). */
const ELEV_COMFORT = 0.6;
/** Penalty at a fully vertical view, scaled linearly from comfort. */
const ELEV_WEIGHT = 1.2;

/**
 * Landmarks a camera can actually be pointed at.
 *
 * Some map hardware cannot be filmed from anywhere: on Damnation every
 * generator is embedded in solid geometry with ZERO clearance at any
 * radius, so a ring around it is entirely inside walls. Planning shots
 * of those and letting the staging pass discover the problem is what
 * produced the endless "subject behind geometry — re-anchoring" churn.
 * Ask once, up front, and simply do not plan them.
 */
export function filmable<
  T extends { pos: DirectorVec3; radius: number; aimLift?: number },
>(g: FreeSpaceGrid, landmarks: readonly T[]): T[] {
  return landmarks.filter(
    (m) =>
      cameraSpotFor(g, aimOf(m), {
        wantDist: m.radius,
        maxDist: m.radius * 4,
      }) != null,
  );
}

/** Where a shot of this subject will point: its middle, not its foot. */
export function aimOf(subject: {
  pos: DirectorVec3;
  aimLift?: number;
}): DirectorVec3 {
  return [
    subject.pos[0],
    subject.pos[1],
    subject.pos[2] + (subject.aimLift ?? 0),
  ];
}
