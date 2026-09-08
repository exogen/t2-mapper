import { afterEach, describe, expect, it } from "vitest";
import { BoxGeometry, Mesh, Vector3 } from "three";
import {
  clearWorldColliders,
  registerInteriorCollider,
} from "./collision/worldCollision";
import { createInteriorSunOccluder } from "./terrainInteriorShadow";
import { bakeTerrainLightmap } from "./terrainLightmap";
import {
  LIGHTMAP_SIZE,
  LIGHTMAP_TEXELS_PER_SQUARE,
  TERRAIN_SIZE,
} from "./terrain";

/** Run a bake to completion and return its texture. */
function runBake(
  ...args: Parameters<typeof bakeTerrainLightmap>
): ReturnType<typeof bakeTerrainLightmap>["texture"] {
  const bake = bakeTerrainLightmap(...args);
  while (!bake.step(1000));
  return bake.texture;
}

const SQUARE_SIZE = 8;
/** Torque places the block at -squareSize * (TERRAIN_SIZE / 2) on both axes. */
const ORIGIN = {
  x: -SQUARE_SIZE * (TERRAIN_SIZE / 2),
  z: -SQUARE_SIZE * (TERRAIN_SIZE / 2),
};

/** Flat heightmap at a uniform world height (11.5 fixed point). */
function flatHeightMap(worldHeight: number): Uint16Array {
  return new Uint16Array(TERRAIN_SIZE * TERRAIN_SIZE).fill(worldHeight * 32);
}

/** The sun of a stock mission: Torque (0.577, 0.577, -0.577) pointing at the
 *  ground, which torqueToThree turns into Three (0.577, -0.577, 0.577). */
const SUN_DIRECTION = new Vector3(0.57735, -0.57735, 0.57735);

/** Direction toward the light, which is what the occluder wants. */
function towardSun(): Vector3 {
  return new Vector3(-SUN_DIRECTION.x, -SUN_DIRECTION.y, -SUN_DIRECTION.z);
}

/** A solid box interior at a Three-space position. */
function interiorBox(position: Vector3, size: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(size, size, size));
  mesh.position.copy(position);
  mesh.updateMatrixWorld(true);
  return mesh;
}

/** Read a texel by its Three-space world x/z. */
function texelAt(data: Uint8Array, worldX: number, worldZ: number): number {
  const perWorld = LIGHTMAP_TEXELS_PER_SQUARE / SQUARE_SIZE;
  const col = Math.round((worldZ - ORIGIN.z) * perWorld);
  const row = Math.round((worldX - ORIGIN.x) * perWorld);
  return data[row * LIGHTMAP_SIZE + col];
}

afterEach(() => {
  clearWorldColliders();
});

describe("generateTerrainLightmap", () => {
  it("lights flat ground with no occluder", () => {
    const texture = runBake(
      flatHeightMap(100),
      SUN_DIRECTION,
      SQUARE_SIZE,
      ORIGIN,
    );
    const data = texture.image.data as Uint8Array;
    expect(data).toHaveLength(LIGHTMAP_SIZE * LIGHTMAP_SIZE);
    // Flat ground, normal straight up, sun at 45 degrees: NdotL = 0.577.
    expect(texelAt(data, 0, 0) / 255).toBeCloseTo(0.57735, 2);
  });

  it("has no occluder when no interior is registered", () => {
    expect(createInteriorSunOccluder(towardSun())).toBeNull();
  });

  it("puts a building's shadow on the ground, and only there", () => {
    // A 40 m box sitting on 100 m ground at the world origin.
    registerInteriorCollider("hut", [interiorBox(new Vector3(0, 120, 0), 40)]);
    const occluder = createInteriorSunOccluder(towardSun());
    expect(occluder).not.toBeNull();

    const texture = runBake(
      flatHeightMap(100),
      SUN_DIRECTION,
      SQUARE_SIZE,
      ORIGIN,
      occluder,
    );
    const data = texture.image.data as Uint8Array;

    // Sun direction (from the sun) is Three (+x, -y, +z), so light travels
    // toward +x/+z and the shadow falls downstream on that side.
    expect(texelAt(data, 0, 0)).toBe(0);
    expect(texelAt(data, 25, 25)).toBe(0);
    // Upstream of the box, and far downstream where the sun ray clears the
    // roof long before reaching it, the ground keeps its full value.
    expect(texelAt(data, -200, -200) / 255).toBeCloseTo(0.57735, 2);
    expect(texelAt(data, 600, 600) / 255).toBeCloseTo(0.57735, 2);
  });

  it("averages the shadow edge instead of stair-stepping it", () => {
    // Flat ground isolates the edge: every lit texel carries the same
    // NdotL, so a value strictly between 0 and it is partial coverage.
    registerInteriorCollider("hut", [interiorBox(new Vector3(0, 120, 40), 40)]);
    const data = runBake(
      flatHeightMap(100),
      SUN_DIRECTION,
      SQUARE_SIZE,
      ORIGIN,
      createInteriorSunOccluder(towardSun()),
    ).image.data as Uint8Array;

    const full = Math.round(0.57735 * 255);
    let shadowed = 0;
    let partial = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i] === 0) shadowed++;
      else if (data[i] < full) partial++;
    }
    expect(shadowed).toBeGreaterThan(100);
    // Without the edge pass every texel is either 0 or `full`, so this is
    // exactly zero. The count itself tracks the shadow's perimeter, so it
    // scales with LIGHTMAP_TEXELS_PER_SQUARE; the floor stays valid at any
    // resolution this project would use.
    expect(partial).toBeGreaterThanOrEqual(10);
  });

  it("bakes a whole map with buildings inside a sane time budget", () => {
    // Sixteen buildings is what a stock CTF mission carries.
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      registerInteriorCollider(`b${i}`, [
        interiorBox(
          new Vector3(Math.cos(angle) * 500, 120, Math.sin(angle) * 500),
          40,
        ),
      ]);
    }
    const started = performance.now();
    runBake(
      flatHeightMap(100),
      SUN_DIRECTION,
      SQUARE_SIZE,
      ORIGIN,
      createInteriorSunOccluder(towardSun()),
    );
    const elapsed = performance.now() - started;
    // Generous: this guards against an accidental return to a per-texel
    // full-length ray march, which was seconds rather than milliseconds.
    expect(elapsed).toBeLessThan(4000);
  });
});
