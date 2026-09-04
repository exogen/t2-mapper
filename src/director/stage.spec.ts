import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DirectorDataset,
  DirectorFlagSample,
  DirectorVec3,
  Shot,
  ShotPlan,
} from "./types";

/**
 * A synthetic collision world: flat terrain at Torque z=0 plus a set of
 * thin axis-aligned wall boxes (thin, like real interior geometry, so a
 * ray cast from inside a room exits cleanly instead of hitting a solid
 * at t=0).
 */
const world = vi.hoisted(() => ({
  boxes: [] as {
    min: [number, number, number];
    max: [number, number, number];
  }[],
}));

type V3 = [number, number, number];

const rayBox = vi.hoisted(
  () =>
    function rayBox(
      start: number[],
      end: number[],
      box: { min: number[]; max: number[] },
    ): number | null {
      let tmin = 0;
      let tmax = 1;
      for (let i = 0; i < 3; i++) {
        const d = end[i] - start[i];
        if (Math.abs(d) < 1e-9) {
          if (start[i] < box.min[i] || start[i] > box.max[i]) return null;
          continue;
        }
        let t0 = (box.min[i] - start[i]) / d;
        let t1 = (box.max[i] - start[i]) / d;
        if (t0 > t1) [t0, t1] = [t1, t0];
        tmin = Math.max(tmin, t0);
        tmax = Math.min(tmax, t1);
        if (tmin > tmax) return null;
      }
      return tmin;
    },
);

const inside = vi.hoisted(
  () =>
    function inside(
      p: number[],
      box: { min: number[]; max: number[] },
      margin: number,
    ): boolean {
      for (let i = 0; i < 3; i++) {
        if (p[i] < box.min[i] - margin || p[i] > box.max[i] + margin) {
          return false;
        }
      }
      return true;
    },
);

const terrainRay = vi.hoisted(
  () =>
    function terrainRay(start: number[], end: number[]) {
      const z0 = start[2];
      const z1 = end[2];
      if (z0 > 0 === z1 > 0 || z0 === z1) return null;
      const t = z0 / (z0 - z1);
      return {
        t,
        point: [
          start[0] + (end[0] - start[0]) * t,
          start[1] + (end[1] - start[1]) * t,
          0,
        ] as V3,
        normal: [0, 0, 1] as V3,
      };
    },
);

vi.mock("../collision/terrainCollision", () => ({
  castTerrainRay: (start: number[], end: number[]) => terrainRay(start, end),
}));

vi.mock("../collision/worldCollision", () => ({
  castWorldRay: (start: number[], end: number[]) => {
    const ground = terrainRay(start, end);
    let best: {
      t: number;
      point: V3;
      normal: V3;
      source: string;
    } | null = ground ? { ...ground, source: "terrain" } : null;
    for (const box of world.boxes) {
      // A ray that STARTS inside a solid reports nothing, matching the
      // real BVH (it crosses only backfaces on the way out). This is
      // not a detail: it is exactly why a camera buried in a ceiling
      // slab still scored a clear sight line to the subject below it.
      if (inside(start, box, 0)) continue;
      const t = rayBox(start, end, box);
      if (t != null && (!best || t < best.t)) {
        best = {
          t,
          point: [
            start[0] + (end[0] - start[0]) * t,
            start[1] + (end[1] - start[1]) * t,
            start[2] + (end[2] - start[2]) * t,
          ],
          normal: [0, 0, 1],
          source: "interior",
        };
      }
    }
    return best;
  },
  // Matches the model above: the ground plane is z=0 and interiors are
  // the boxes. A camera under the floor or inside a wall is buried.
  pointObstructed: (p: number[], radius: number) =>
    p[2] < 0 || world.boxes.some((box) => inside(p, box, radius)),
}));

import { midAim, stagePlan } from "./stage";

const ANCHOR: DirectorVec3 = [0, 0, 1];

function makeDataset(
  flagPosAt: (t: number) => DirectorVec3,
  playerSamples: DirectorDataset["playerSamples"] = [],
): DirectorDataset {
  const flagSamples: DirectorFlagSample[] = [];
  for (let t = 0; t <= 20; t += 0.5) {
    flagSamples.push({
      timeSec: t,
      slot: 1,
      pos: flagPosAt(t),
      carrierTargetId: null,
      status: "home",
    });
  }
  return {
    durationSec: 20,
    flagSampleStepSec: 0.5,
    playerSampleStepSec: 1,
    gameClassName: "CTFGame",
    teams: [{ teamId: 1, name: "Storm" }],
    flagStands: [{ slot: 1, teamId: 1, name: "Storm", pos: ANCHOR }],
    events: [],
    flagSamples,
    playerSamples,
    structures: [],
    structureInventory: [],
    mortarShots: [],
    deaths: [],
    stations: [],
    playerNames: [],
    scoreSamples: [],
  };
}

function fixedShot(
  overrides?: Partial<Extract<Shot, { kind: "fixedOrbit" }>>,
): Shot {
  return {
    kind: "fixedOrbit",
    center: ANCHOR,
    radius: 50,
    startAngle: 0,
    angularSpeed: 0,
    lookSubject: { type: "flag", slot: 1 },
    startSec: 0,
    endSec: 10,
    transitionIn: "cut",
    reason: "test shot",
    ...overrides,
  };
}

function makePlan(shots: Shot[]): ShotPlan {
  return { contractVersion: 1, gameMode: "ctf", shots, coverage: [] };
}

/** Four thin walls + roof around the anchor: an 12x12 room, 8m tall. */
function enclose(): void {
  const lo = -6;
  const hi = 6;
  world.boxes.push(
    { min: [lo - 1, lo, -1], max: [lo, hi, 8] },
    { min: [hi, lo, -1], max: [hi + 1, hi, 8] },
    { min: [lo, lo - 1, -1], max: [hi, lo, 8] },
    { min: [lo, hi, -1], max: [hi, hi + 1, 8] },
    { min: [lo, lo, 8], max: [hi, hi, 10] },
  );
}

beforeEach(() => {
  world.boxes = [];
});

describe("stagePlan", () => {
  it("solves an unobstructed placement at full visibility", () => {
    const plan = makePlan([fixedShot()]);
    const report = stagePlan(
      plan,
      makeDataset(() => ANCHOR),
    );
    const shot = plan.shots[0] as Extract<Shot, { kind: "fixedOrbit" }>;
    // Composition may legitimately choose a tighter standoff than the
    // planned radius (sizeFit), so "clean" is not guaranteed — a fully
    // visible solved placement is.
    expect(report.fixedShots).toBe(1);
    expect(report.clean + report.adjusted).toBe(1);
    expect(shot.staged).toMatchObject({ visibility: 1 });
  });

  it("swings to a bearing that can see past a wall on the planned one", () => {
    // A wall hard against the anchor's +Torque-y side (the bearing-0
    // eye direction), too close for even the minimum standoff, wide
    // enough that only the perpendicular bearings escape it.
    world.boxes.push({ min: [-30, 2, -1], max: [30, 4, 40] });
    const plan = makePlan([fixedShot()]);
    const report = stagePlan(
      plan,
      makeDataset(() => ANCHOR),
    );
    const shot = plan.shots[0] as Extract<Shot, { kind: "fixedOrbit" }>;
    expect(report).toMatchObject({ fixedShots: 1, adjusted: 1 });
    expect(shot.staged).toBeDefined();
    // Any bearing at least perpendicular to the walled one is fine —
    // composition (openness) picks among the clear ones.
    expect(Math.abs(shot.staged!.angle)).toBeGreaterThanOrEqual(
      Math.PI / 2 - 1e-6,
    );
    expect(shot.staged!.visibility).toBe(1);
  });

  it("rejects a placement whose camera is buried in geometry", () => {
    // A slab spanning everything ABOVE the anchor, with the anchor
    // itself in clear air beneath it. Every lifted eye lands inside the
    // slab, and from in there the ray DOWN to the subject is
    // unobstructed — so the sight-line test alone scores it a perfect
    // 1.00. That is how a basement generator got filmed from inside
    // the ceiling above it, and rendered as a faceful of sky.
    world.boxes.push({ min: [-60, -60, 0.5], max: [60, 60, 60] });
    const plan = makePlan([fixedShot()]);
    const report = stagePlan(
      plan,
      makeDataset(() => ANCHOR),
    );
    // It may land anywhere the repair ladder can reach, but it must not
    // be published as a solved placement inside the slab.
    expect(report.clean + report.adjusted + report.tight).toBe(0);
    const solved = plan.shots[0] as Partial<
      Extract<Shot, { kind: "fixedOrbit" }>
    >;
    if (solved.staged) {
      expect(
        ANCHOR[2] + solved.staged.liftFactor * solved.staged.radius,
      ).toBeLessThan(4);
    }
  });

  it("keeps a placement the planner already solved", () => {
    // The free-space grid can place a camera BELOW its subject (a
    // basement generator seen from the floor it stands on). The
    // staging search cannot even express that — it casts outward from
    // the anchor and the floor is immediately in the way — so a
    // pre-solved placement must be kept, not re-derived.
    const shot = fixedShot();
    const presolved = {
      angle: 1.2,
      radius: 18.3,
      liftFactor: -0.7,
      visibility: 1,
    };
    (shot as Extract<Shot, { kind: "fixedOrbit" }>).staged = { ...presolved };
    const plan = makePlan([shot]);
    const report = stagePlan(
      plan,
      makeDataset(() => ANCHOR),
    );
    expect(report).toMatchObject({ fixedShots: 1, presolved: 1 });
    expect(
      (plan.shots[0] as Extract<Shot, { kind: "fixedOrbit" }>).staged,
    ).toEqual(presolved);
  });

  it("folds a shot that repeats the one before it", () => {
    // The reported case: a line-up block re-armed and replayed its
    // first pass, so the same sweep ran twice back to back.
    world.boxes = [];
    const sweep = (startSec: number, endSec: number): Shot =>
      ({
        kind: "sweep",
        from: [112, -512, 10],
        to: [58, -595, 10],
        target: [80, -550, 1],
        pathSolved: true,
        startSec,
        endSec,
        transitionIn: "cut",
        reason: "Pre-match — Inferno line-up (19)",
        role: "rosterWide",
      }) as Shot;
    const plan = makePlan([sweep(0, 11.5), sweep(11.5, 23)]);
    const report = stagePlan(
      plan,
      makeDataset(() => ANCHOR),
    );
    expect(report.merged).toBe(1);
    expect(plan.shots).toHaveLength(1);
    // One longer shot, not a hitch — the time is kept.
    expect(plan.shots[0].startSec).toBe(0);
    expect(plan.shots[0].endSec).toBe(23);
  });

  it("leaves two different shots of the same subject alone", () => {
    world.boxes = [];
    const base = {
      kind: "sweep" as const,
      target: [80, -550, 1] as DirectorVec3,
      pathSolved: true,
      transitionIn: "cut" as const,
      reason: "Pre-match — Inferno line-up (19)",
      role: "rosterWide" as const,
    };
    const plan = makePlan([
      {
        ...base,
        from: [112, -512, 10],
        to: [58, -595, 10],
        startSec: 0,
        endSec: 11.5,
      } as Shot,
      {
        ...base,
        from: [58, -595, 10],
        to: [112, -512, 10],
        startSec: 11.5,
        endSec: 23,
      } as Shot,
    ]);
    const report = stagePlan(
      plan,
      makeDataset(() => ANCHOR),
    );
    expect(report.merged).toBe(0);
    expect(plan.shots).toHaveLength(2);
  });

  it("does not let one shot absorb every dropped neighbour", () => {
    // A run of unwatchable shots all landed their time on the same
    // neighbour, turning a six-second portrait into a seventy-second
    // stare. Absorbing is right in small doses, absurd in large ones.
    world.boxes = [];
    const good: Shot = {
      kind: "fixedOrbit",
      center: ANCHOR,
      radius: 12,
      startAngle: 0,
      angularSpeed: 0,
      heightFactor: 0.2,
      startSec: 0,
      endSec: 6,
      transitionIn: "cut",
      reason: "Pre-match — pick up somebody",
      role: "signing",
    } as Shot;
    // Six shots that cannot be watched: buried in a slab.
    // pathSolved so staging leaves them to the audit — without it the
    // sweep pass lifts or trims them and nothing is ever dropped, which
    // is how the first version of this test passed while the cap was
    // broken.
    const bad = (i: number): Shot =>
      ({
        kind: "sweep",
        from: [500, 500, -80],
        to: [520, 500, -80],
        target: [510, 505, -80],
        pathSolved: true,
        startSec: 6 + i * 11,
        endSec: 17 + i * 11,
        transitionIn: "cut",
        reason: `Pre-match — bad ${i}`,
        role: "tourMove",
      }) as Shot;
    const plan = makePlan([good, ...[0, 1, 2, 3, 4, 5].map(bad)]);
    stagePlan(
      plan,
      makeDataset(() => ANCHOR),
    );
    // The bad ones must actually be gone, or this proves nothing.
    expect(plan.shots.map((x) => x.reason)).not.toContain("Pre-match — bad 0");
    const kept = plan.shots[0];
    expect(kept.role).toBe("signing");
    expect(kept.endSec - kept.startSec).toBeLessThanOrEqual(14);
  });

  it("walks an unshootable roofed flag down to a doorway watch", () => {
    // The fixed pass converts to a follow; the follow pass then finds
    // the room too small for ANY orbit and, since the flag is roofed,
    // lands on the building's mouth.
    enclose();
    const plan = makePlan([fixedShot()]);
    const report = stagePlan(
      plan,
      makeDataset(() => ANCHOR),
    );
    expect(report).toMatchObject({
      fixedShots: 1,
      follow: 1,
      followShots: 1,
      followConverted: 1,
    });
    expect(plan.shots[0]).toMatchObject({
      kind: "fixedOrbit",
      doorwayOf: [0, 0, 1],
      startSec: 0,
      endSec: 10,
      reason: "test shot",
    });
  });

  it("turns a roofed anchor-only shot into a doorway watch", () => {
    enclose();
    const plan = makePlan([fixedShot({ lookSubject: undefined })]);
    const report = stagePlan(
      plan,
      makeDataset(() => ANCHOR),
    );
    const shot = plan.shots[0] as Extract<Shot, { kind: "fixedOrbit" }>;
    expect(report).toMatchObject({ fixedShots: 1, doorway: 1 });
    expect(shot.doorwayOf).toEqual(ANCHOR);
  });

  it("ignores samples beyond the re-anchor range (capture teleports)", () => {
    // The flag sits at the anchor, then teleports 700m away mid-shot —
    // the runtime holds the scene there, so the far half must not count
    // as "blocked" and must not force a conversion.
    const plan = makePlan([fixedShot()]);
    const report = stagePlan(
      plan,
      makeDataset((t) => (t < 5 ? ANCHOR : [700, 0, 1])),
    );
    const shot = plan.shots[0] as Extract<Shot, { kind: "fixedOrbit" }>;
    expect(report.fixedShots).toBe(1);
    expect(report.clean + report.adjusted).toBe(1);
    expect(shot.staged).toMatchObject({ visibility: 1 });
  });

  it("pulls a follow shot's distance in to what its space allows", () => {
    // A 24x24 room: standoff room is ~10.5m on every bearing, so a 25m
    // follow sees nothing but wall — the 9m rung fits.
    const lo = -12;
    const hi = 12;
    world.boxes.push(
      { min: [lo - 1, lo, -1], max: [lo, hi, 8] },
      { min: [hi, lo, -1], max: [hi + 1, hi, 8] },
      { min: [lo, lo - 1, -1], max: [hi, lo, 8] },
      { min: [lo, hi, -1], max: [hi, hi + 1, 8] },
      { min: [lo, lo, 8], max: [hi, hi, 10] },
    );
    const plan = makePlan([
      {
        kind: "followFlag",
        slot: 1,
        distance: 25,
        pitch: 0.16,
        startSec: 0,
        endSec: 10,
        transitionIn: "cut",
        reason: "carrier holed up",
      },
    ]);
    const report = stagePlan(
      plan,
      makeDataset(() => ANCHOR),
    );
    expect(report).toMatchObject({ followShots: 1, followPulledIn: 1 });
    // The square room's corner bearings offer ~15.7m, so the 0.6 rung
    // (15m) fits without dropping all the way to the 9m floor.
    expect(
      (plan.shots[0] as Extract<Shot, { kind: "followFlag" }>).distance,
    ).toBeCloseTo(15, 5);
  });

  it("drops an indoor roster wide rather than orbiting the squad's centroid", () => {
    // The squad stands in the enclosed room; the wide pass over them
    // flies through its roof. Converting that to an orbit put a camera
    // in the room with the ceiling on the lens (Raindance, 4:58).
    enclose();
    const playerSamples = [];
    for (let t = 0; t <= 10; t++) {
      playerSamples.push({
        timeSec: t,
        targetId: 7,
        teamId: 1,
        pos: [0, 0, 1] as DirectorVec3,
        armor: "light" as const,
      });
    }
    const plan = makePlan([
      {
        kind: "sweep",
        role: "rosterWide",
        from: [-10, -8, 9],
        to: [10, -8, 9],
        target: [0, 0, 2],
        startSec: 0,
        endSec: 10,
        moveSec: 10,
        transitionIn: "cut",
        reason: "Pre-match — Storm line-up (1)",
      },
    ]);
    const report = stagePlan(
      plan,
      makeDataset(() => ANCHOR, playerSamples),
    );
    expect(report.sweepConverted).toBe(0);
    expect(plan.shots.some((s) => s.kind === "fixedOrbit")).toBe(false);
  });

  it("moves an unwatchable shooter-follow to its aim target", () => {
    // The shooter sits in a room too small for any orbit at all; the
    // shot knows what they are shelling — the camera goes there.
    enclose();
    const playerSamples = [];
    for (let t = 0; t <= 10; t++) {
      playerSamples.push({
        timeSec: t,
        targetId: 7,
        teamId: 1,
        pos: [0, 0, 1] as DirectorVec3,
        armor: "heavy" as const,
      });
    }
    const plan = makePlan([
      {
        kind: "followPlayer",
        targetId: 7,
        distance: 30,
        pitch: 0.16,
        aim: { mode: "toward", target: [300, 0, 1] },
        startSec: 0,
        endSec: 10,
        transitionIn: "cut",
        reason: "Mortar fire — crew raining mortars",
        topic: "bombardment",
      },
    ]);
    const report = stagePlan(
      plan,
      makeDataset(() => ANCHOR, playerSamples),
    );
    expect(report).toMatchObject({ followShots: 1, followConverted: 1 });
    const converted = plan.shots[0] as Extract<Shot, { kind: "fixedOrbit" }>;
    expect(converted.kind).toBe("fixedOrbit");
    expect(converted.center).toEqual([300, 0, 1]);
    expect(converted.reason).toBe("Mortar fire — crew raining mortars");
    // The story survives the change of mechanism: a converted shot
    // used to reach the booth with its topic gone.
    expect(converted.topic).toBe("bombardment");
    expect(converted.staged).toMatchObject({ visibility: 1 });
  });

  it("leaves doorway watches alone", () => {
    const plan = makePlan([
      fixedShot({ doorwayOf: ANCHOR, lookSubject: undefined }),
    ]);
    const report = stagePlan(
      plan,
      makeDataset(() => ANCHOR),
    );
    expect(report.fixedShots).toBe(0);
    expect((plan.shots[0] as { staged?: unknown }).staged).toBeUndefined();
  });
});

describe("timeline integrity", () => {
  it("leaves no hole when a dropped shot's time fits nowhere", () => {
    // ShotPlan promises contiguous coverage and the runtime relies on
    // it: a hole is an index the playhead falls through, which reads as
    // the broadcast ending. A drop cannot always hand its seconds to a
    // neighbour — the neighbour may be capped, or may fail its own
    // check once stretched — so the seam has to be closed regardless.
    world.boxes = [];
    const at = (startSec: number, endSec: number, reason: string): Shot =>
      ({
        kind: "fixedOrbit",
        center: ANCHOR,
        radius: 12,
        startAngle: 0,
        angularSpeed: 0,
        heightFactor: 0.2,
        startSec,
        endSec,
        transitionIn: "cut",
        reason,
        role: "signing",
      }) as Shot;
    // A SWEEP, and one the planner marked solved — so staging leaves
    // it alone (no anchor lifting, no repair ladder) and the audit is
    // the first thing to look at it. A fixedOrbit here is rescued by
    // surfaceLiftedAnchor before the audit runs, which is how the
    // first version of this test passed without dropping anything.
    const buried: Shot = {
      kind: "sweep",
      from: [0, 0, -90],
      to: [10, 0, -90],
      target: [5, 5, -90],
      pathSolved: true,
      startSec: 6,
      endSec: 40,
      transitionIn: "cut",
      reason: "unwatchable",
      role: "tourMove",
    } as Shot;
    const plan = makePlan([at(0, 6, "a"), buried, at(40, 50, "b")]);
    stagePlan(
      plan,
      makeDataset(() => ANCHOR),
    );
    // It must actually have been dropped, or this proves nothing.
    expect(plan.shots.map((x) => x.reason)).not.toContain("unwatchable");
    expect(plan.shots.length).toBe(2);
    for (let i = 1; i < plan.shots.length; i++) {
      expect(plan.shots[i].startSec).toBeLessThanOrEqual(
        plan.shots[i - 1].endSec + 1e-6,
      );
      // ...and no shot may start before the one before it ends early.
      expect(plan.shots[i].startSec).toBeGreaterThanOrEqual(
        plan.shots[i - 1].startSec,
      );
    }
  });
});

describe("midAim", () => {
  // What a sweep is ABOUT, which is not where it starts looking. A pan
  // deliberately aims off to one side at first so the subject crosses
  // the frame, so its `target` sits half a pan-width from the thing
  // itself. Centring the fallback orbit there put the generator beside
  // the shot and slowly rotated it out of view.
  const pan = (target: DirectorVec3, targetTo?: DirectorVec3): Shot =>
    ({
      kind: "sweep",
      from: [-20, -14, 3],
      to: [20, -14, 3],
      target,
      ...(targetTo ? { targetTo } : {}),
      startSec: 0,
      endSec: 12,
      transitionIn: "cut",
      reason: "Pre-match — tracking across the Storm generator",
      role: "tourMove",
    }) as Shot;

  it("is the middle of the aim's travel, which is the subject", () => {
    // Real numbers, off the Inferno generator at (150, -58): its pan
    // aims from (171, -63) to (130, -52). The start alone is 21m out.
    const shot = pan([171, -63, 101], [130, -52, 101]) as Extract<
      Shot,
      { kind: "sweep" }
    >;
    const mid = midAim(shot);
    expect(mid[0]).toBeCloseTo(150.5, 6);
    expect(mid[1]).toBeCloseTo(-57.5, 6);
    expect(
      Math.hypot(mid[0] - shot.target[0], mid[1] - shot.target[1]),
    ).toBeGreaterThan(20);
  });

  it("is the target itself when the aim does not travel", () => {
    // A push-in or a pass-by holds one aim point; that IS the subject.
    const shot = pan([150, -58, 101]) as Extract<Shot, { kind: "sweep" }>;
    expect(midAim(shot)).toEqual([150, -58, 101]);
  });
});
