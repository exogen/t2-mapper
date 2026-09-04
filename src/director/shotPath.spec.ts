/**
 * The whole-path check. A shot's camera positions are known up front,
 * so nothing that spends its time inside a wall — or never shows its
 * subject — should ever be published.
 */
import { describe, expect, it, vi } from "vitest";
import type { DirectorVec3, Shot } from "./types";

/** Solid below z=0; boxes are solids in Torque space. */
const world = vi.hoisted(() => ({
  boxes: [] as { min: number[]; max: number[] }[],
}));
const inside = vi.hoisted(
  () => (p: number[], b: { min: number[]; max: number[] }, m: number) =>
    p.every((v, i) => v >= b.min[i] - m && v <= b.max[i] + m),
);

vi.mock("../collision/worldCollision", () => ({
  pointObstructed: (p: number[], r: number) =>
    p[2] - r < 0 || world.boxes.some((b) => inside(p, b, r)),
  // A ray starting inside a solid reports NOTHING — real backface
  // behaviour, and the reason a buried camera used to read as having a
  // clear view of everything.
  castWorldRay: (start: number[], end: number[]) => {
    if (world.boxes.some((b) => inside(start, b, 0))) return null;
    let best: { t: number; point: number[] } | null = null;
    for (const b of world.boxes) {
      // Proper slab test, not a midpoint sample: a ridge between the
      // camera and its aim sits nowhere near the halfway mark.
      let tmin = 0;
      let tmax = 1;
      let miss = false;
      for (let i = 0; i < 3 && !miss; i++) {
        const d = end[i] - start[i];
        if (Math.abs(d) < 1e-9) {
          if (start[i] < b.min[i] || start[i] > b.max[i]) miss = true;
          continue;
        }
        let t0 = (b.min[i] - start[i]) / d;
        let t1 = (b.max[i] - start[i]) / d;
        if (t0 > t1) [t0, t1] = [t1, t0];
        tmin = Math.max(tmin, t0);
        tmax = Math.min(tmax, t1);
        if (tmin > tmax) miss = true;
      }
      if (miss) continue;
      if (!best || tmin < best.t) {
        best = {
          t: tmin,
          point: start.map((v, i) => v + (end[i] - v) * tmin),
        };
      }
    }
    return best ? { ...best, normal: [0, 0, 1], source: "interior" } : null;
  },
}));

const { inspectShot, plannerSolved, shotPoseAt, subjectVisible } =
  await import("./shotPath");
const { subjectViewBlocked } = await import("./cameraRig");
const { Vector3 } = await import("three");

function orbit(over: Partial<Extract<Shot, { kind: "fixedOrbit" }>>): Shot {
  return {
    kind: "fixedOrbit",
    center: [0, 0, 10],
    radius: 20,
    startAngle: 0,
    angularSpeed: 0,
    heightFactor: 0.2,
    startSec: 0,
    endSec: 10,
    transitionIn: "cut",
    reason: "test",
    ...over,
  } as Shot;
}

describe("inspectShot", () => {
  it("passes a clear orbit in the open", () => {
    world.boxes = [];
    expect(inspectShot(orbit({}))?.ok).toBe(true);
  });

  it("rejects an orbit whose camera sits inside a solid", () => {
    // A slab covering everything the orbit's camera ring passes through.
    world.boxes = [{ min: [-60, -60, 8], max: [60, 60, 60] }];
    const report = inspectShot(orbit({}))!;
    expect(report.buried).toBe(report.samples);
    expect(report.ok).toBe(false);
  });

  it("rejects an orbit that swings behind a wall part-way through", () => {
    // Solid across the +Y half. The camera sits at (sin th, cos th)*r,
    // so th = PI starts it at -Y, in the clear, and a half turn walks
    // it into the wall.
    world.boxes = [{ min: [-60, 5, 0], max: [60, 60, 60] }];
    const spinning = orbit({ startAngle: Math.PI, angularSpeed: Math.PI / 10 });
    const still = orbit({ startAngle: Math.PI, angularSpeed: 0 });
    // The stationary camera is fine; only the one that turns into the
    // wall fails — which a single start-point check cannot tell apart.
    expect(inspectShot(still)?.ok).toBe(true);
    expect(inspectShot(spinning)?.ok).toBe(false);
  });

  it("rejects a sweep that flies through geometry", () => {
    world.boxes = [{ min: [-5, -60, 0], max: [5, 60, 60] }];
    const sweep = {
      kind: "sweep",
      from: [-30, 0, 12],
      to: [30, 0, 12],
      target: [0, 40, 10],
      startSec: 0,
      endSec: 10,
      transitionIn: "cut",
      reason: "test",
    } as Shot;
    expect(inspectShot(sweep)?.ok).toBe(false);
  });

  it("has no opinion on shots whose path depends on a player", () => {
    world.boxes = [];
    const follow = {
      kind: "followPlayer",
      targetId: 1,
      startSec: 0,
      endSec: 10,
      transitionIn: "cut",
      reason: "test",
    } as Shot;
    expect(inspectShot(follow)).toBeNull();
  });
});

describe("aimIsHeading", () => {
  it("judges a flyover on camera clearance alone", () => {
    // An establishing run aims at the horizon. Requiring that point to
    // be "visible" rejected every flyover on the map.
    world.boxes = [];
    const base = {
      kind: "sweep" as const,
      from: [-200, 0, 120],
      to: [200, 0, 120],
      // A look-ahead a long way off, behind a ridge.
      target: [600, 0, 90],
      startSec: 0,
      endSec: 10,
      transitionIn: "cut" as const,
      reason: "flyover",
    };
    world.boxes = [{ min: [380, -60, 0], max: [420, 60, 200] }];
    expect(inspectShot(base as Shot)?.ok).toBe(false);
    expect(inspectShot({ ...base, aimIsHeading: true } as Shot)?.ok).toBe(true);
  });

  it("still rejects a flyover that flies into a hill", () => {
    world.boxes = [{ min: [-20, -60, 0], max: [20, 60, 200] }];
    const shot = {
      kind: "sweep",
      from: [-200, 0, 120],
      to: [200, 0, 120],
      target: [600, 0, 90],
      aimIsHeading: true,
      startSec: 0,
      endSec: 10,
      transitionIn: "cut",
      reason: "flyover",
    } as Shot;
    expect(inspectShot(shot)?.ok).toBe(false);
  });
});

describe("establishing fly-by", () => {
  /** A run from one landmark to another, rising over a ridge between. */
  function flyBy(overrides: Partial<Record<string, unknown>> = {}): Shot {
    return {
      kind: "sweep",
      from: [-200, 0, 40],
      to: [200, 0, 40],
      via: [
        [-100, 0, 90],
        [0, 0, 120],
        [100, 0, 90],
      ],
      target: [-260, 0, 40],
      targetTo: [260, 0, 40],
      startSec: 0,
      endSec: 12,
      transitionIn: "cut",
      reason: "across the map",
      ...overrides,
    } as Shot;
  }

  it("is judged on its ends, not on the aim mid-route", () => {
    // The straight line between two flag stands runs through the hill
    // in the middle, so every intermediate aim point is underground.
    // What matters is that it opens on one flag and arrives on the far
    // one without the camera ever touching the world.
    world.boxes = [{ min: [-40, -60, 0], max: [40, 60, 70] }];
    expect(inspectShot(flyBy())?.ok).toBe(true);
  });

  it("is rejected when the route clips the ridge it should clear", () => {
    // Same run, but the obstruction now reaches above the curve.
    world.boxes = [{ min: [-40, -60, 0], max: [40, 60, 200] }];
    expect(inspectShot(flyBy())?.ok).toBe(false);
  });

  it("is rejected when it cannot see the flag it starts on", () => {
    world.boxes = [{ min: [-250, -60, 0], max: [-210, 60, 200] }];
    const report = inspectShot(flyBy())!;
    expect(report.ok).toBe(false);
    // The camera itself is fine — it is the opening frame that fails.
    expect(report.buried).toBe(0);
  });

  const pitchAt = (shot: Shot, f: number) => {
    const { eye, aim } = shotPoseAt(shot, f)!;
    return Math.atan2(
      aim[2] - eye[2],
      Math.hypot(aim[0] - eye[0], aim[1] - eye[1]),
    );
  };

  // The real run bows sideways, so mid-route the aim is off to one side
  // of the camera rather than straight beneath it.
  const bowed = {
    via: [
      [-100, 30, 90],
      [0, 40, 120],
      [100, 30, 90],
    ] as DirectorVec3[],
  };
  const cap = (14 * Math.PI) / 180;

  it("looks down no steeper than its pitch cap mid-route", () => {
    // Uncapped, the aim slides along the ground while the camera is
    // eighty metres up over the ridge: it stares at its feet.
    expect(pitchAt(flyBy(bowed), 0.5)).toBeLessThan(-cap - 0.3);
    const capped = flyBy({ ...bowed, maxPitch: cap });
    for (const f of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      expect(pitchAt(capped, f)).toBeGreaterThanOrEqual(-cap - 1e-9);
    }
    expect(pitchAt(capped, 0.5)).toBeCloseTo(-cap, 6);
  });

  it("still opens and arrives exactly on its targets", () => {
    // The ends are what the path check judges the shot on. The cap
    // fades out toward them, never moving the opening or closing aim.
    const plain = flyBy(bowed);
    const capped = flyBy({ ...bowed, maxPitch: cap });
    expect(shotPoseAt(capped, 0)!.aim).toEqual(shotPoseAt(plain, 0)!.aim);
    expect(shotPoseAt(capped, 1)!.aim).toEqual(shotPoseAt(plain, 1)!.aim);
    // And fades in over the first 15% of the path rather than snapping
    // on: the share of the needed lift actually applied grows with f.
    // A run that is high from the start, so the cap binds throughout.
    const high = {
      from: [-200, 0, 120] as DirectorVec3,
      to: [200, 0, 120] as DirectorVec3,
      via: [
        [-100, 30, 120],
        [0, 40, 120],
        [100, 30, 120],
      ] as DirectorVec3[],
    };
    const applied = (f: number) => {
      const { eye, aim } = shotPoseAt(flyBy(high), f)!;
      const horiz = Math.hypot(aim[0] - eye[0], aim[1] - eye[1]);
      const needed = eye[2] - horiz * Math.tan(cap) - aim[2];
      expect(needed).toBeGreaterThan(0);
      const lifted = shotPoseAt(flyBy({ ...high, maxPitch: cap }), f)!;
      return (lifted.aim[2] - aim[2]) / needed;
    };
    expect(applied(0.05)).toBeCloseTo(1 / 3, 6);
    expect(applied(0.1)).toBeCloseTo(2 / 3, 6);
    expect(applied(0.15)).toBeCloseTo(1, 6);
    expect(applied(0.9)).toBeCloseTo(2 / 3, 6);
  });
});

describe("plannerSolved", () => {
  it("recognises a solved orbit and a solved sweep alike", () => {
    // One idea, recorded two ways. The staging pass AND the runtime's
    // terrain rail both have to honour it: an orbit re-derived here put
    // a basement camera in the ceiling, and the rail lifted a
    // chest-height portrait four metres without re-aiming it.
    const orbit = {
      kind: "fixedOrbit",
      center: [0, 0, 10],
      radius: 8,
      startSec: 0,
      endSec: 6,
      transitionIn: "cut",
      reason: "x",
    } as Shot;
    expect(plannerSolved(orbit)).toBe(false);
    expect(
      plannerSolved({
        ...orbit,
        staged: { angle: 0, radius: 8, liftFactor: -0.1, visibility: 1 },
      } as Shot),
    ).toBe(true);

    const sweep = {
      kind: "sweep",
      from: [0, 0, 10],
      to: [10, 0, 10],
      target: [5, 5, 10],
      startSec: 0,
      endSec: 6,
      transitionIn: "cut",
      reason: "x",
    } as Shot;
    expect(plannerSolved(sweep)).toBe(false);
    expect(plannerSolved({ ...sweep, pathSolved: true } as Shot)).toBe(true);
  });

  it("claims nothing about shots it cannot solve up front", () => {
    // A follow's path depends on where its subject goes, so the rail
    // must keep working on it.
    expect(
      plannerSolved({
        kind: "followPlayer",
        targetId: 1,
        startSec: 0,
        endSec: 6,
        transitionIn: "cut",
        reason: "x",
      } as Shot),
    ).toBe(false);
  });
});

describe("one visibility test", () => {
  it("answers exactly what the runtime's rail answers", () => {
    // These were two implementations whose tolerances ran in different
    // directions — a lateral halo in the runtime, a vertical spread in
    // the planner. The planner certified placements the rail then
    // rejected a beat into the shot, and the viewer watched the camera
    // correct itself. Measured on a real demo: 15 disagreements across
    // 485 sampled camera positions, now 0.
    world.boxes = [{ min: [-4, -60, 0], max: [4, 60, 60] }];
    const eye: DirectorVec3 = [-30, 0, 10];
    const behindTheWall: DirectorVec3 = [30, 0, 10];
    const inTheOpen: DirectorVec3 = [-60, 0, 10];
    // Whatever the answers are, both callers must get the SAME one.
    for (const aim of [behindTheWall, inTheOpen]) {
      const three = (v: DirectorVec3) => new Vector3(v[1], v[2], v[0]);
      expect(subjectVisible(eye, aim)).toBe(
        !subjectViewBlocked(three(eye), three(aim)),
      );
    }
  });

  it("still refuses a camera buried in the world", () => {
    // The one thing the rail's test does not cover: a lens inside a
    // solid reports every ray clear, because it only crosses backfaces.
    world.boxes = [{ min: [-60, -60, 0], max: [60, 60, 60] }];
    expect(subjectVisible([0, 0, 30], [0, 0, 40])).toBe(false);
  });
});
