import { afterEach, describe, expect, it } from "vitest";
import { BoxGeometry, Mesh, Vector3 } from "three";
import {
  castWorldRay,
  clearWorldColliders,
  registerInteriorCollider,
  registerStaticShapeCollider,
} from "../collision/worldCollision";
import { setTerrainCollisionData } from "../collision/terrainCollision";
import {
  approachAngle,
  clearStandoffWide,
  subjectViewBlocked,
  surfaceLiftedAnchor,
  findOpeningsByRay,
  findDoorwaysFromPaths,
  isRoofed,
  chooseClearPlacement,
  clearStandoff,
  easeInHold,
  viewBlocked,
} from "./cameraRig";

afterEach(() => {
  clearWorldColliders();
  setTerrainCollisionData(null);
});

/** Flat terrain at the given Torque-z height (heights are Uint16
 *  fixed-point over a 2048u range, like the real heightfield). */
function flatTerrain(height: number): void {
  const raw = Math.round((height / 2048) * 65535);
  setTerrainCollisionData({
    heightMap: new Uint16Array(256 * 256).fill(raw),
    squareSize: 8,
  });
}

/** A 20u cube of wall centred on the Three-space origin. */
function wallAtOrigin(): void {
  const mesh = new Mesh(new BoxGeometry(20, 20, 20));
  mesh.updateMatrixWorld(true);
  registerInteriorCollider("wall", [mesh]);
}

/** Two wall slabs at x=15 leaving a 2u slit at z=0: a centre ray from
 *  the origin to (30, 5, 0) threads the slit, but anything 2.5u to
 *  either side is masonry — the exact geometry that fooled the
 *  single-ray check into framing a wall. */
function slitWallAt(x: number, gap = 2): void {
  const upper = new Mesh(new BoxGeometry(2, 20, 10));
  upper.position.set(x, 5, gap / 2 + 5);
  upper.updateMatrixWorld(true);
  const lower = new Mesh(new BoxGeometry(2, 20, 10));
  lower.position.set(x, 5, -(gap / 2 + 5));
  lower.updateMatrixWorld(true);
  registerInteriorCollider("slit", [upper, lower]);
}

describe("static shape occluders", () => {
  it("blocks the camera but not projectile rays", () => {
    // A generator-sized prop between camera and subject: the director's
    // occlusion checks see it, while castWorldRay's default (projectile
    // physics) keeps colliding with exactly what it always did.
    const prop = new Mesh(new BoxGeometry(4, 10, 10));
    prop.position.set(15, 5, 0);
    prop.updateMatrixWorld(true);
    registerStaticShapeCollider("prop", [prop]);
    const camera = new Vector3(0, 5, 0);
    const subject = new Vector3(30, 5, 0);
    expect(viewBlocked(camera, subject)).toBe(true);
    // Torque (z, x, y) of the same segment — no statics by default.
    expect(castWorldRay([0, 0, 5], [0, 30, 5])).toBeNull();
    expect(
      castWorldRay([0, 0, 5], [0, 30, 5], { includeStatics: true })?.source,
    ).toBe("static");
  });
});

describe("chooseClearPlacement inward verification", () => {
  it("still frames a subject in an open pocket, pulled in", () => {
    // Same roof, but the subject stands clear of it: placements out in
    // the open verify fine and stay clear.
    const roof = new Mesh(new BoxGeometry(20, 0.5, 20));
    roof.position.set(100, 6.25, 100);
    roof.updateMatrixWorld(true);
    registerInteriorCollider("roof-far", [roof]);
    const placement = chooseClearPlacement([0, 30, 5], 30, 0.55, 0);
    expect(placement.clear).toBe(true);
  });
});

describe("subjectViewBlocked", () => {
  const camera = new Vector3(0, 5, 0);
  const subject = new Vector3(30, 5, 0);

  it("open ground is clear", () => {
    expect(subjectViewBlocked(camera, subject)).toBe(false);
  });

  it("rejects a sightline threading a slit in a wall", () => {
    slitWallAt(15);
    // The single centre ray passes — that is the bug this exists for.
    expect(viewBlocked(camera, subject)).toBe(false);
    expect(subjectViewBlocked(camera, subject)).toBe(true);
  });

  it("tolerates a subject standing against a wall on one side", () => {
    const slab = new Mesh(new BoxGeometry(2, 20, 10));
    slab.position.set(15, 5, 7.5);
    slab.updateMatrixWorld(true);
    registerInteriorCollider("one-side", [slab]);
    expect(subjectViewBlocked(camera, subject)).toBe(false);
  });

  it("blocked centre is blocked regardless of the halo", () => {
    wallAtOrigin();
    expect(
      subjectViewBlocked(new Vector3(-30, 5, 0), new Vector3(30, 5, 0)),
    ).toBe(true);
  });
});

describe("clearStandoffWide", () => {
  it("reports no room down a crack the centre ray threads", () => {
    // Slabs 4u from the subject: the centre ray escapes through the
    // slit, but both halo probes are walled in closer than the framing
    // floor allows.
    slitWallAt(26);
    const subject = new Vector3(30, 5, 0);
    const outward = new Vector3(-1, 0, 0);
    expect(clearStandoff(subject, outward, 25)).toBeGreaterThan(0);
    expect(clearStandoffWide(subject, outward, 25)).toBe(0);
  });

  it("returns the worst probe's room when all have some", () => {
    slitWallAt(15);
    const subject = new Vector3(30, 5, 0);
    const outward = new Vector3(-1, 0, 0);
    const wide = clearStandoffWide(subject, outward, 25);
    expect(wide).toBeGreaterThan(0);
    expect(wide).toBeLessThan(clearStandoff(subject, outward, 25));
  });

  it("matches clearStandoff on open ground", () => {
    const subject = new Vector3(30, 5, 0);
    const outward = new Vector3(-1, 0, 0);
    expect(clearStandoffWide(subject, outward, 25)).toBe(
      clearStandoff(subject, outward, 25),
    );
  });
});

describe("easeInHold", () => {
  it("covers the whole pass and is still moving when it ends", () => {
    expect(easeInHold(0)).toBe(0);
    expect(easeInHold(1)).toBe(1);
    // A broadcast pan is cut while still in motion: the last frames must
    // travel as far as the middle ones, unlike an ease-out.
    const nearEnd = easeInHold(1) - easeInHold(0.98);
    const middle = easeInHold(0.6) - easeInHold(0.58);
    expect(nearEnd).toBeGreaterThan(middle * 0.9);
  });

  it("starts gently rather than snapping into motion", () => {
    const firstStep = easeInHold(0.02) - easeInHold(0);
    const middle = easeInHold(0.6) - easeInHold(0.58);
    expect(firstStep).toBeLessThan(middle * 0.5);
  });

  it("is monotonic", () => {
    let last = -1;
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const v = easeInHold(Math.min(1, t));
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });
});

describe("approachAngle", () => {
  it("turns the short way around the circle", () => {
    // From just below +pi to just above -pi is a small step, not a
    // near-full rotation the long way.
    const next = approachAngle(3.1, -3.1, 0.2);
    expect(Math.abs(next - 3.1)).toBeLessThanOrEqual(0.2 + 1e-9);
    expect(next).toBeGreaterThan(3.1);
  });

  it("stops exactly on the target once within reach", () => {
    expect(approachAngle(1, 1.05, 0.5)).toBeCloseTo(1.05, 6);
  });
});

describe("clearStandoff", () => {
  it("returns the full distance in open space", () => {
    expect(clearStandoff(new Vector3(0, 0, 0), new Vector3(1, 0, 0), 30)).toBe(
      30,
    );
  });

  it("reports the room a wall leaves, not just blocked/clear", () => {
    // Subject 30u from the wall's face (the cube spans -10..10 in x), so
    // there is ~20u of room minus the clearance margin.
    wallAtOrigin();
    const room = clearStandoff(
      new Vector3(-30, 0, 0),
      new Vector3(1, 0, 0),
      100,
    );
    expect(room).toBeGreaterThan(15);
    expect(room).toBeLessThan(20);
  });

  it("returns 0 when not even the minimum standoff fits", () => {
    // Standing right against the wall: no room on that bearing at all.
    wallAtOrigin();
    expect(
      clearStandoff(new Vector3(-11, 0, 0), new Vector3(1, 0, 0), 100),
    ).toBe(0);
  });
});

describe("chooseClearPlacement", () => {
  it("keeps the planned bearing when nothing is in the way", () => {
    const placement = chooseClearPlacement([0, 0, 0], 20, 0.6, 1.25);
    expect(placement.clear).toBe(true);
    expect(placement.angle).toBeCloseTo(1.25, 6);
    expect(placement.radiusScale).toBe(1);
  });

  it("pulls in rather than giving up when a subject is boxed in", () => {
    // The subject sits inside the cube: no bearing has 40u of room, but
    // there IS room close in. Testing candidate positions from outside
    // would only ever report "blocked" here.
    wallAtOrigin();
    const placement = chooseClearPlacement([0, 0, 0], 40, 0.6, 0);
    expect(placement.clear).toBe(true);
    expect(placement.radiusScale).toBeLessThan(1);
    expect(placement.radiusScale).toBeGreaterThan(0);
  });

  it("refuses to shrink an area shot into a wall portrait", () => {
    // Same boxed-in geometry: a shot that frames a SUBJECT may pull in
    // (the subject fills a close frame), but an anonymous area anchor
    // pulled to a fraction of its intent frames nothing but the nearest
    // wall — the r×0.17 corridor parking spot.
    wallAtOrigin();
    const framing = chooseClearPlacement([0, 0, 0], 55, 0.6, 0);
    expect(framing.clear).toBe(true);
    const area = chooseClearPlacement([0, 0, 0], 55, 0.6, 0, {
      minScale: 0.35,
    });
    expect(area.clear).toBe(false);
  });

  it("never selects a camera closer than the framing floor", () => {
    // A cramped pocket: under 6m of room on every bearing (diagonals
    // included). A few metres of "room" fits a camera but not a SHOT —
    // accepting it parked the lens 2.9m from a dropped flag, a screen
    // full of cloth. Better to report no clear placement and hold the
    // wider frame.
    // 9u cube: even the roomier diagonal bearings offer only ~5.8m.
    const pocket = new Mesh(new BoxGeometry(9, 9, 9));
    pocket.position.set(0, 2, 0);
    pocket.updateMatrixWorld(true);
    registerInteriorCollider("pocket", [pocket]);
    const placement = chooseClearPlacement([0, 0, 0], 40, 0.6, 0);
    if (placement.clear) {
      const norm = Math.hypot(1, 0.6 * placement.heightScale);
      expect(40 * placement.radiusScale * norm).toBeGreaterThanOrEqual(7);
    } else {
      expect(placement.radiusScale).toBe(1);
    }
  });

  it("reports failure when there is no room at all", () => {
    // A wall tight around the AIM point leaves nowhere for a camera.
    // (The aim point sits ORBIT_LOOK_LIFT above the shot centre, so a box
    // around the centre alone would leave open air above it.)
    const mesh = new Mesh(new BoxGeometry(4, 4, 4));
    mesh.position.set(0, 2, 0);
    mesh.updateMatrixWorld(true);
    registerInteriorCollider("tight", [mesh]);
    const placement = chooseClearPlacement([0, 0, 0], 30, 0.6, 0);
    expect(placement.clear).toBe(false);
    expect(placement.radiusScale).toBe(1);
  });
});

describe("viewBlocked", () => {
  it("sees through open space and not through a wall", () => {
    expect(viewBlocked(new Vector3(-40, 0, 0), new Vector3(40, 0, 0))).toBe(
      false,
    );
    wallAtOrigin();
    expect(viewBlocked(new Vector3(-40, 0, 0), new Vector3(40, 0, 0))).toBe(
      true,
    );
  });

  it("detects a wall standing just short of the subject", () => {
    // The failure behind the "watching everyone through a rampart"
    // screenshot: with a 6-unit margin, a wall within 6u of the target
    // was inside the ignored stretch of the ray, so a subject standing
    // near the inside of a base wall read as visible from outside it.
    const wall = new Mesh(new BoxGeometry(2, 20, 20));
    wall.position.set(10, 0, 0);
    wall.updateMatrixWorld(true);
    registerInteriorCollider("thin-wall", [wall]);
    // Camera at x=40, subject at x=6: the wall (9..11) sits 3-5u from
    // the subject — between them, and outside the tightened margin.
    expect(viewBlocked(new Vector3(40, 0, 0), new Vector3(6, 0, 0))).toBe(true);
  });

  it("ignores geometry right at the subject", () => {
    // The margin exists so the floor a subject stands on, or a teammate
    // beside them, does not count as blocking them.
    wallAtOrigin();
    expect(viewBlocked(new Vector3(-14, 0, 0), new Vector3(-11, 0, 0))).toBe(
      false,
    );
  });
});

describe("findOpeningsByRay", () => {
  it("finds the one open side of a room", () => {
    // Three wall slabs around the origin, open toward +x (angle 0 in
    // the orbit convention is +x in Three-space).
    for (const [id, x, z] of [
      ["w-left", -8, 0],
      ["w-front", 0, 8],
      ["w-back", 0, -8],
    ] as const) {
      const wall = new Mesh(
        x !== 0 ? new BoxGeometry(2, 12, 18) : new BoxGeometry(18, 12, 2),
      );
      wall.position.set(x, 2, z);
      wall.updateMatrixWorld(true);
      registerInteriorCollider(id, [wall]);
    }
    const doors = findOpeningsByRay(new Vector3(0, 0, 0));
    expect(doors.length).toBeGreaterThan(0);
    // Every reported opening points out the +x gap, none through walls.
    for (const d of doors) {
      const dx = Math.cos(d.angle);
      expect(dx).toBeGreaterThan(0.5);
    }
  });

  it("reports nothing from a sealed room", () => {
    const box = new Mesh(new BoxGeometry(16, 12, 16));
    box.position.set(0, 2, 0);
    box.updateMatrixWorld(true);
    registerInteriorCollider("sealed", [box]);
    expect(findOpeningsByRay(new Vector3(0, 0, 0))).toEqual([]);
  });
});

describe("findDoorwaysFromPaths", () => {
  /** A roof slab over Torque x -20..0: indoors below it, sky beyond. */
  function roof(): void {
    // Torque [x, y, z] → Three (y, z, x): a slab high above the floor.
    const slab = new Mesh(new BoxGeometry(30, 2, 20));
    // Covers Torque x in [-20, 0], y in [-15, 15], at z ≈ 8.
    slab.position.set(0, 8, -10);
    slab.updateMatrixWorld(true);
    registerInteriorCollider("roof", [slab]);
  }

  it("classifies roofed vs open positions", () => {
    roof();
    expect(isRoofed([-10, 0, 0])).toBe(true);
    expect(isRoofed([10, 0, 0])).toBe(false);
  });

  it("finds the door where players cross the roof line, facing out", () => {
    roof();
    // Three players walk out through the roof edge at Torque x=0 (the
    // door), one walking elsewhere entirely.
    const samples = [];
    for (const [id, y] of [
      [1, -4],
      [2, 0],
      [3, 4],
    ]) {
      for (let t = 0; t <= 10; t++) {
        samples.push({
          timeSec: t,
          targetId: id,
          pos: [-12 + t * 2.5, y, 0] as [number, number, number],
        });
      }
    }
    for (let t = 0; t <= 10; t++) {
      samples.push({
        timeSec: t,
        targetId: 9,
        pos: [40, 40, 0] as [number, number, number],
      });
    }
    const doors = findDoorwaysFromPaths(samples, [-5, 0, 0], 60);
    expect(doors.length).toBe(1);
    // The crossings straddle x=0; outward points +x (out from under).
    expect(Math.abs(doors[0].pos[0])).toBeLessThanOrEqual(3);
    expect(doors[0].outward[0]).toBeGreaterThan(0.8);
    expect(doors[0].crossings).toBe(3);
  });

  it("ignores lone flips that never cluster", () => {
    roof();
    const samples = [];
    for (let t = 0; t <= 4; t++) {
      samples.push({
        timeSec: t,
        targetId: 1,
        pos: [-4 + t * 2.5, 0, 0] as [number, number, number],
      });
    }
    expect(findDoorwaysFromPaths(samples, [-5, 0, 0], 60)).toEqual([]);
  });
});

describe("surfaceLiftedAnchor", () => {
  it("lifts an anchor buried inside a hillside to the surface", () => {
    // The ski-club kickoff bug: a centroid across a slope landed inside
    // the hill; the camera framed dirt and every correction dug deeper.
    flatTerrain(150);
    const lifted = surfaceLiftedAnchor([9, -30, 100]);
    expect(lifted).not.toBeNull();
    expect(lifted![2]).toBeGreaterThanOrEqual(150);
    expect(lifted![0]).toBe(9);
  });

  it("leaves a surface anchor alone", () => {
    flatTerrain(150);
    expect(surfaceLiftedAnchor([9, -30, 151])).toBeNull();
  });

  it("leaves a roofed room built into the hillside alone", () => {
    // Turtle anchors legitimately sit below the local terrain surface
    // when the base is dug into a hill — lifting them would break the
    // inside shots the user rates highly.
    flatTerrain(150);
    // Room ceiling above the anchor. Torque [x, y, z] → Three (y, z, x):
    // the anchor [9, -30, 100] is Three (-30, 100, 9); put a slab above.
    const ceiling = new Mesh(new BoxGeometry(20, 2, 20));
    ceiling.position.set(-30, 110, 9);
    ceiling.updateMatrixWorld(true);
    registerInteriorCollider("ceiling", [ceiling]);
    expect(surfaceLiftedAnchor([9, -30, 100])).toBeNull();
  });
});
