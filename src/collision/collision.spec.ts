import { describe, it, expect, afterEach } from "vitest";
import { BoxGeometry, Box3, Matrix4, Mesh, Vector3 } from "three";
import {
  castTerrainRay,
  decodeEmptySquares,
  setTerrainCollisionData,
} from "./terrainCollision";
import {
  castWorldRay,
  clearWorldColliders,
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
