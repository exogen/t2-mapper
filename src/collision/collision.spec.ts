import { describe, it, expect, afterEach } from "vitest";
import { BoxGeometry, Box3, Matrix4, Mesh, Vector3 } from "three";
import {
  castTerrainRay,
  decodeEmptySquares,
  setTerrainCollisionData,
  terrainHeightAt,
} from "./terrainCollision";
import {
  castWorldRay,
  clearWorldColliders,
  firstInteriorFace,
  pointInsideInterior,
  registerForceFieldCollider,
  registerInteriorCollider,
  setForceFieldEnabled,
} from "./worldCollision";
import {
  buildLinearSegment,
  bounceVelocity,
  linearSegmentPosition,
  stepBallistic,
} from "./projectilePhysics";
import { setWaterInfo } from "./waterLevel";

const TERRAIN_SIZE = 256;

/** Flat heightmap at a uniform world height. */
function flatHeightMap(worldHeight: number): Uint16Array {
  const raw = Math.round((worldHeight / 2048) * 65535);
  return new Uint16Array(TERRAIN_SIZE * TERRAIN_SIZE).fill(raw);
}

afterEach(() => {
  setTerrainCollisionData(null);
  setWaterInfo(null);
  clearWorldColliders();
});

describe("terrainHeightAt", () => {
  it("reads the height map through a hole the ray walker skips", () => {
    // The origin square (col 128, row 128) is an empty square: a
    // bunker entrance. A ray finds open air there — correctly, for a
    // camera — but the map still has a height, and a generator sitting
    // 30m under it IS underground.
    const hole = 128 | (128 << 8) | (1 << 16);
    setTerrainCollisionData({
      heightMap: flatHeightMap(100),
      squareSize: 8,
      emptySquareRuns: [hole],
    });
    expect(castTerrainRay([2, 2, 200], [2, 2, 0])).toBeNull();
    expect(terrainHeightAt(2, 2)).toBeCloseTo(100, 2);
    // And it agrees with the ray wherever the ray does hit.
    const hit = castTerrainRay([40, 60, 200], [40, 60, 0])!;
    expect(terrainHeightAt(40, 60)).toBeCloseTo(hit.point[2], 2);
  });

  it("interpolates a slope on the same triangles as the ray", () => {
    const heightMap = flatHeightMap(0);
    for (let row = 0; row < TERRAIN_SIZE; row++) {
      for (let col = 0; col < TERRAIN_SIZE; col++) {
        heightMap[row * TERRAIN_SIZE + col] = Math.round(
          ((col * 0.5) / 2048) * 65535,
        );
      }
    }
    setTerrainCollisionData({ heightMap, squareSize: 8 });
    for (const [x, y] of [
      [3, 5],
      [13.7, -2.2],
      [-31, 17],
    ]) {
      const hit = castTerrainRay([x, y, 500], [x, y, -100])!;
      expect(terrainHeightAt(x, y)).toBeCloseTo(hit.point[2], 2);
    }
  });
});

describe("castTerrainRay", () => {
  it("hits flat terrain from above with an up normal", () => {
    setTerrainCollisionData({ heightMap: flatHeightMap(100), squareSize: 8 });
    const hit = castTerrainRay([10, 20, 200], [10, 20, 0]);
    expect(hit).not.toBeNull();
    expect(hit!.point[2]).toBeCloseTo(100, 2);
    expect(hit!.normal[2]).toBeCloseTo(1, 5);
    expect(hit!.t).toBeCloseTo(0.5, 3);
  });

  it("hits along a shallow trajectory crossing many squares", () => {
    setTerrainCollisionData({ heightMap: flatHeightMap(50), squareSize: 8 });
    const hit = castTerrainRay([-400, -400, 60], [400, 400, 40]);
    expect(hit).not.toBeNull();
    // z = 60 - 20t = 50 → t = 0.5
    expect(hit!.t).toBeCloseTo(0.5, 3);
    expect(hit!.point[2]).toBeCloseTo(50, 2);
  });

  it("misses when flying above the terrain", () => {
    setTerrainCollisionData({ heightMap: flatHeightMap(50), squareSize: 8 });
    expect(castTerrainRay([-500, 0, 80], [500, 0, 70])).toBeNull();
  });

  it("skims low squares but still hits a wall (height broadphase)", () => {
    // Flat floor at 0 with a ridge: all corners at col >= 130 raised to
    // world height 100. Square col 129 holds the sloped wall face.
    const heightMap = flatHeightMap(0);
    const raw = Math.round((100 / 2048) * 65535);
    for (let row = 0; row < TERRAIN_SIZE; row++) {
      for (let col = 130; col < TERRAIN_SIZE; col++) {
        heightMap[row * TERRAIN_SIZE + col] = raw;
      }
    }
    setTerrainCollisionData({ heightMap, squareSize: 8 });
    // Horizontal ray at z = 50 over the flat floor (skipped squares)
    // into the wall: face rises 0 → 100 across x 8..16, so z = 50 → x = 12.
    const hit = castTerrainRay([-400, 2, 50], [400, 2, 50]);
    expect(hit).not.toBeNull();
    expect(hit!.point[0]).toBeCloseTo(12, 2);
    expect(hit!.point[2]).toBeCloseTo(50, 2);
  });

  it("wraps outside the primary block (infinite tiling)", () => {
    setTerrainCollisionData({ heightMap: flatHeightMap(75), squareSize: 8 });
    const hit = castTerrainRay([5000, -3000, 100], [5000, -3000, 0]);
    expect(hit).not.toBeNull();
    expect(hit!.point[2]).toBeCloseTo(75, 2);
  });

  it("respects sloped triangles", () => {
    // Height rises with column: h(col) = col * 4 world units.
    const heightMap = new Uint16Array(TERRAIN_SIZE * TERRAIN_SIZE);
    for (let row = 0; row < TERRAIN_SIZE; row++) {
      for (let col = 0; col < TERRAIN_SIZE; col++) {
        heightMap[row * TERRAIN_SIZE + col] = Math.round(
          ((col * 4) / 2048) * 65535,
        );
      }
    }
    setTerrainCollisionData({ heightMap, squareSize: 8 });
    // At Torque x=0 → col 128 → height 512. Drop straight down.
    const hit = castTerrainRay([0, 4, 600], [0, 4, 400]);
    expect(hit).not.toBeNull();
    expect(hit!.point[2]).toBeCloseTo(512, 0);
    // Normal should lean against the +x slope.
    expect(hit!.normal[0]).toBeLessThan(0);
    expect(hit!.normal[2]).toBeGreaterThan(0);
  });

  it("passes through empty squares (terrain holes)", () => {
    // Hole at squares (col 128..129, row 128): run x=128, y=128, count=2.
    setTerrainCollisionData({
      heightMap: flatHeightMap(100),
      squareSize: 8,
      emptySquareRuns: [(2 << 16) | (128 << 8) | 128],
    });
    // Straight down inside the hole square: Torque (2, 2) → col 128.25.
    expect(castTerrainRay([2, 2, 200], [2, 2, 0])).toBeNull();
    // Outside the hole still hits.
    expect(castTerrainRay([-20, 2, 200], [-20, 2, 0])).not.toBeNull();
  });

  it("decodes empty square runs", () => {
    const set = decodeEmptySquares([(3 << 16) | (10 << 8) | 250]);
    expect(set.has(10 * 256 + 250)).toBe(true);
    expect(set.has(10 * 256 + 251)).toBe(true);
    expect(set.has(10 * 256 + ((250 + 2) & 0xff))).toBe(true);
    expect(set.size).toBe(3);
  });
});

describe("castWorldRay with interior colliders", () => {
  it("hits a box interior and reports Torque-space point/normal", () => {
    // A 10×10×10 box centered at Three-world origin. In Torque space that
    // spans [-5, 5]³ around origin as well (swizzle permutes axes).
    const mesh = new Mesh(new BoxGeometry(10, 10, 10));
    mesh.updateMatrixWorld(true);
    registerInteriorCollider("box", [mesh]);

    // Fire along Torque +x toward the box: Torque x maps to Three z.
    const hit = castWorldRay([-20, 0, 0], [20, 0, 0]);
    expect(hit).not.toBeNull();
    expect(hit!.source).toBe("interior");
    expect(hit!.point[0]).toBeCloseTo(-5, 4);
    expect(hit!.normal[0]).toBeCloseTo(-1, 4);
    expect(hit!.t).toBeCloseTo(15 / 40, 4);
  });

  it("hits from inside (double-sided) and honors transforms", () => {
    const mesh = new Mesh(new BoxGeometry(10, 10, 10));
    // Move the box +30 along Three x (= Torque y).
    mesh.position.set(30, 0, 0);
    mesh.updateMatrixWorld(true);
    registerInteriorCollider("box", [mesh]);

    const hit = castWorldRay([0, 30, -20], [0, 30, 20]);
    expect(hit).not.toBeNull();
    // Torque z maps to Three y: entry face at Torque z = -5.
    expect(hit!.point[2]).toBeCloseTo(-5, 4);
    expect(hit!.normal[2]).toBeCloseTo(-1, 4);
  });

  it("misses after the collider is unregistered", () => {
    const mesh = new Mesh(new BoxGeometry(10, 10, 10));
    mesh.updateMatrixWorld(true);
    registerInteriorCollider("box", [mesh]);
    clearWorldColliders();
    expect(castWorldRay([-20, 0, 0], [20, 0, 0])).toBeNull();
  });

  it("measures hits on a SCALED interior in world units", () => {
    // Interiors carry scale in real missions (Treasure Island has
    // "2 2 2" and "3.13 3.18 4.38"). The BVH is in mesh space, and a
    // distance read off the local ray came back in local units — at
    // half the true distance for a 2x interior — because Ray.applyMatrix4
    // renormalizes the direction the code was measuring the scale off.
    const mesh = new Mesh(new BoxGeometry(10, 10, 10));
    mesh.scale.set(2, 2, 2);
    mesh.updateMatrixWorld(true);
    registerInteriorCollider("box", [mesh]);

    // The box now spans [-10, 10]³: entry face at Torque x = -10.
    const hit = castWorldRay([-40, 0, 0], [40, 0, 0]);
    expect(hit).not.toBeNull();
    expect(hit!.point[0]).toBeCloseTo(-10, 4);
    expect(hit!.t).toBeCloseTo(30 / 80, 4);
    expect(hit!.normal[0]).toBeCloseTo(-1, 4);
  });

  it("measures hits on a NON-UNIFORMLY scaled interior in world units", () => {
    const mesh = new Mesh(new BoxGeometry(10, 10, 10));
    // Three (x, y, z) = Torque (y, z, x): the box becomes 30 wide in
    // Torque y, 20 tall in Torque z and 5 deep in Torque x.
    mesh.scale.set(3, 2, 0.5);
    mesh.updateMatrixWorld(true);
    registerInteriorCollider("box", [mesh]);

    // Along Torque x the faces sit at ±2.5; a segment that used to read
    // the hit at local distance 35 of 40 now reads 17.5 of 40.
    const hit = castWorldRay([-20, 0, 0], [20, 0, 0]);
    expect(hit).not.toBeNull();
    expect(hit!.point[0]).toBeCloseTo(-2.5, 4);
    expect(hit!.t).toBeCloseTo(17.5 / 40, 4);
    // Normals go through the normal matrix, so a non-uniform scale
    // still yields a unit normal against the ray.
    expect(hit!.normal[0]).toBeCloseTo(-1, 4);
    expect(Math.hypot(...hit!.normal)).toBeCloseTo(1, 6);

    // The inside test looks up from the point: the ceiling of this box
    // is 10 above the origin (Three y scaled 2x), met from behind.
    const roof = firstInteriorFace([0, 0, 0], [0, 0, 1], 400);
    expect(roof).not.toBeNull();
    expect(roof!.dist).toBeCloseTo(10, 4);
    expect(roof!.front).toBe(false);
    expect(pointInsideInterior([0, 0, 0])).toBe(true);
    // Just above the roof: nothing overhead. Just below the floor: the
    // floor's own front, so not inside.
    expect(pointInsideInterior([0, 0, 11])).toBe(false);
    expect(pointInsideInterior([0, 0, -11])).toBe(false);
    // A reach shorter than the true distance must miss — the old local
    // reading (5) would have found it.
    expect(firstInteriorFace([0, 0, 0], [0, 0, 1], 8)).toBeNull();
  });
});

describe("force field colliders", () => {
  it("collides only while enabled", () => {
    const box = new Box3(new Vector3(-2, 0, -2), new Vector3(2, 8, 2));
    registerForceFieldCollider("ff", new Matrix4(), box, true);
    // Box spans Three y ∈ [0, 8] → Torque z ∈ [0, 8]. Cross it at z=4.
    const hit = castWorldRay([0, -10, 4], [0, 10, 4]);
    expect(hit).not.toBeNull();
    expect(hit!.source).toBe("forcefield");

    setForceFieldEnabled("ff", false);
    expect(castWorldRay([0, -10, 4], [0, 10, 4])).toBeNull();
  });

  it("measures a scaled force field's hit in world units", () => {
    // A unit-ish local box scaled 4x along Three x (= Torque y): its
    // faces sit at Torque y = ±4, so a segment from y = -20 to 20 meets
    // it at t = 16/40 — not the 19/40 a local reading gives.
    const box = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
    const matrix = new Matrix4().makeScale(4, 1, 1);
    registerForceFieldCollider("ff", matrix, box, true);
    const hit = castWorldRay([0, -20, 0], [0, 20, 0]);
    expect(hit).not.toBeNull();
    expect(hit!.source).toBe("forcefield");
    expect(hit!.point[1]).toBeCloseTo(-4, 4);
    expect(hit!.t).toBeCloseTo(16 / 40, 4);
    expect(hit!.normal[1]).toBeCloseTo(-1, 4);
  });
});

describe("buildLinearSegment", () => {
  it("cuts the segment at a static hit and explodes there", () => {
    setTerrainCollisionData({ heightMap: flatHeightMap(0), squareSize: 8 });
    const seg = buildLinearSegment({
      start: [0, 0, 100],
      vel: [100, 0, -100],
      lifetimeMS: 5000,
      explodeOnDeath: false,
      explodeOnWaterImpact: false,
    });
    expect(seg.explodeAtEnd).toBe(true);
    expect(seg.msEnd).toBeCloseTo(1000, -2);
    expect(seg.endPoint[2]).toBeCloseTo(0, 2);

    const pos: [number, number, number] = [0, 0, 0];
    linearSegmentPosition(seg, 512, pos);
    expect(pos[0]).toBeCloseTo(51.2, 3);
    // Past the end, clamps to the hit point.
    linearSegmentPosition(seg, 999999, pos);
    expect(pos[2]).toBeCloseTo(0, 2);
  });

  it("runs the full lifetime when nothing is hit", () => {
    const seg = buildLinearSegment({
      start: [0, 0, 100],
      vel: [50, 0, 0],
      lifetimeMS: 3000,
      explodeOnDeath: false,
      explodeOnWaterImpact: false,
    });
    expect(seg.explodeAtEnd).toBe(false);
    expect(seg.msEnd).toBe(3008); // rounded up to a tick multiple
  });

  it("explodes on water when explodeOnWaterImpact is set", () => {
    setWaterInfo({
      surfaceZ: 20,
      waveMagnitude: 0,
      liquidType: 0,
      minX: 0,
      minY: 0,
      sizeX: 2048,
      sizeY: 2048,
    });
    const seg = buildLinearSegment({
      start: [0, 0, 100],
      vel: [0, 0, -80],
      lifetimeMS: 5000,
      explodeOnDeath: false,
      explodeOnWaterImpact: true,
    });
    expect(seg.explodeAtEnd).toBe(true);
    expect(seg.endPoint[2]).toBeCloseTo(20, 4);
  });
});

/**
 * Water behaviour, against LinearProjectile::createSegments. Values are
 * the real disc datablock from a demo:
 *   dryVelocity 95, wetVelocity 55, explodeOnWaterImpact true,
 *   reflectOnWaterImpactAngle 15.
 */
describe("water impact", () => {
  const pool = (liquidType: number) => ({
    surfaceZ: 20,
    waveMagnitude: 0,
    liquidType,
    minX: 0,
    minY: 0,
    sizeX: 2048,
    sizeY: 2048,
  });
  const DISC_REFLECT = 15;

  it("skips off water at a shallow angle instead of exploding", () => {
    setWaterInfo(pool(0));
    // ~8.5° below horizontal — inside the disc's 15° reflect window.
    const seg = buildLinearSegment({
      start: [0, 0, 25],
      vel: [94, 0, -14],
      lifetimeMS: 5024,
      explodeOnDeath: false,
      explodeOnWaterImpact: true,
      reflectOnWaterImpactAngle: DISC_REFLECT,
    });
    expect(seg.explodeAtEnd).toBe(false);
    expect(seg.next).toBeDefined();
    // Reflected about +Z: horizontal kept, vertical mirrored upward.
    expect(seg.next!.vel[0]).toBeCloseTo(94, 5);
    expect(seg.next!.vel[2]).toBeCloseTo(14, 5);
    expect(seg.next!.start[2]).toBeCloseTo(20, 5);
  });

  it("explodes when it arrives steeply", () => {
    setWaterInfo(pool(0));
    // 45° — well outside the reflect window.
    const seg = buildLinearSegment({
      start: [0, 0, 100],
      vel: [67, 0, -67],
      lifetimeMS: 5024,
      explodeOnDeath: false,
      explodeOnWaterImpact: true,
      reflectOnWaterImpactAngle: DISC_REFLECT,
    });
    expect(seg.explodeAtEnd).toBe(true);
    expect(seg.next).toBeUndefined();
    expect(seg.endPoint[2]).toBeCloseTo(20, 4);
  });

  it("never skips off LAVA — !hitWater forces the explosion", () => {
    // Identical shallow shot, but liquidType 6 is lava. WaterBlock::
    // isWater covers 0-3 only, and the engine ORs !hitWater into the
    // explode test.
    setWaterInfo(pool(6));
    const seg = buildLinearSegment({
      start: [0, 0, 25],
      vel: [94, 0, -14],
      lifetimeMS: 5024,
      explodeOnDeath: false,
      explodeOnWaterImpact: true,
      reflectOnWaterImpactAngle: DISC_REFLECT,
    });
    expect(seg.explodeAtEnd).toBe(true);
    expect(seg.next).toBeUndefined();
  });

  it("passes cleanly through when fired from underwater", () => {
    // createSegments guards the whole water block with
    // `if (mWetStart == false)`, so a shot from below never interacts
    // with the surface it exits through.
    setWaterInfo(pool(0));
    const seg = buildLinearSegment({
      start: [0, 0, 10],
      vel: [0, 0, 80],
      lifetimeMS: 5024,
      explodeOnDeath: false,
      explodeOnWaterImpact: true,
      reflectOnWaterImpactAngle: DISC_REFLECT,
      wetStart: true,
    });
    expect(seg.explodeAtEnd).toBe(false);
    expect(seg.next).toBeUndefined();
    expect(seg.endPoint[2]).toBeGreaterThan(20);
  });

  it("slows to wetVelocity when it passes through the surface", () => {
    // A chaingun round does not explode on water; it continues at
    // wetVelocity (750 dry, 280 wet).
    setWaterInfo(pool(0));
    const seg = buildLinearSegment({
      start: [0, 0, 100],
      vel: [0, 0, -750],
      lifetimeMS: 3008,
      explodeOnDeath: false,
      explodeOnWaterImpact: false,
      wetVel: [0, 0, -280],
    });
    expect(seg.next).toBeDefined();
    expect(seg.next!.start[2]).toBeCloseTo(20, 4);
    const wetSpeed = Math.hypot(...seg.next!.vel);
    expect(wetSpeed).toBeCloseTo(280, 4);
  });

  it("stops the underwater leg at the lake bed", () => {
    // The engine re-casts segment 1 against the static world. Without
    // that, a round that entered the water carries on straight through
    // the terrain below it.
    setTerrainCollisionData({ heightMap: flatHeightMap(0), squareSize: 8 });
    setWaterInfo(pool(0));
    const seg = buildLinearSegment({
      start: [0, 0, 100],
      vel: [0, 0, -750],
      lifetimeMS: 3008,
      explodeOnDeath: false,
      explodeOnWaterImpact: false,
      wetVel: [0, 0, -280],
    });
    expect(seg.next).toBeDefined();
    expect(seg.next!.explodeAtEnd).toBe(true);
    expect(seg.next!.endPoint[2]).toBeCloseTo(0, 2);
    setTerrainCollisionData(null);
  });

  it("stops a skipped round at whatever it skips into", () => {
    setTerrainCollisionData({ heightMap: flatHeightMap(40), squareSize: 8 });
    setWaterInfo({ ...pool(0), surfaceZ: 20 });
    const seg = buildLinearSegment({
      start: [0, 0, 25],
      vel: [94, 0, -14],
      lifetimeMS: 5024,
      explodeOnDeath: false,
      explodeOnWaterImpact: true,
      reflectOnWaterImpactAngle: DISC_REFLECT,
    });
    expect(seg.next).toBeDefined();
    // Skips up off the surface and into the terrain wall ahead.
    expect(seg.next!.explodeAtEnd).toBe(true);
    expect(seg.next!.msEnd).toBeLessThan(5024);
    setTerrainCollisionData(null);
  });

  it("uses the wet velocity vector as given, excess included", () => {
    // createSegments rebuilds it as direction*wetVelocity + excess, so
    // it is NOT the dry velocity rescaled — the caller composes it.
    setWaterInfo(pool(0));
    const wetVel: [number, number, number] = [12, 0, -280];
    const seg = buildLinearSegment({
      start: [0, 0, 100],
      vel: [0, 0, -750],
      lifetimeMS: 3008,
      explodeOnDeath: false,
      explodeOnWaterImpact: false,
      wetVel,
    });
    expect(seg.next!.vel).toEqual(wetVel);
  });

  it("tracks position along the second leg, not frozen at the surface", () => {
    setWaterInfo(pool(0));
    const seg = buildLinearSegment({
      start: [0, 0, 25],
      vel: [94, 0, -14],
      lifetimeMS: 5024,
      explodeOnDeath: false,
      explodeOnWaterImpact: true,
      reflectOnWaterImpactAngle: DISC_REFLECT,
    });
    const pos: [number, number, number] = [0, 0, 0];
    linearSegmentPosition(seg, seg.msEnd + 100, pos);
    // Climbing away from the surface after the skip.
    expect(pos[2]).toBeGreaterThan(20);
    expect(pos[0]).toBeGreaterThan(seg.endPoint[0]);
  });
});

describe("ballistic physics", () => {
  it("mirror-bounces with friction and elasticity", () => {
    // 45° impact onto flat ground.
    const v: [number, number, number] = [10, 0, -10];
    bounceVelocity(v, [0, 0, 1], 0.2, 0.5);
    // Reflected: (10, 0, 10); tangent (10,0,0)·0.2 removed → (8, 0, 10); ×0.5.
    expect(v[0]).toBeCloseTo(4, 5);
    expect(v[1]).toBeCloseTo(0, 5);
    expect(v[2]).toBeCloseTo(5, 5);
  });

  it("bounces off terrain while unarmed, explodes when armed", () => {
    setTerrainCollisionData({ heightMap: flatHeightMap(0), squareSize: 8 });
    const pos: [number, number, number] = [0, 0, 0.5];
    const vel: [number, number, number] = [5, 0, -20];
    const unarmed = stepBallistic(pos, vel, {
      gravityMod: 1,
      elasticity: 0.5,
      friction: 0.2,
      armed: false,
    });
    expect(unarmed.explodeAt).toBeNull();
    expect(vel[2]).toBeGreaterThan(0); // moving up after the bounce
    expect(pos[2]).toBeGreaterThan(0);

    const pos2: [number, number, number] = [0, 0, 0.5];
    const vel2: [number, number, number] = [5, 0, -20];
    const armed = stepBallistic(pos2, vel2, {
      gravityMod: 1,
      elasticity: 0.5,
      friction: 0.2,
      armed: true,
    });
    expect(armed.explodeAt).not.toBeNull();
    expect(armed.explodeAt!.point[2]).toBeCloseTo(0, 3);
    expect(vel2).toEqual([0, 0, 0]);
  });

  it("integrates gravity without collision when airborne", () => {
    const pos: [number, number, number] = [0, 0, 100];
    const vel: [number, number, number] = [10, 0, 0];
    stepBallistic(pos, vel, {
      gravityMod: 1,
      elasticity: 0.5,
      friction: 0.2,
      armed: false,
    });
    const dt = 0.032;
    expect(vel[2]).toBeCloseTo(-9.81 * dt, 6);
    expect(pos[0]).toBeCloseTo(10 * dt, 6);
    expect(pos[2]).toBeCloseTo(100 + vel[2] * dt, 6);
  });
});
