import { describe, expect, it } from "vitest";
import { IDENTITY_MATRIX } from "../scene/types";
import type { SceneInteriorInstance, SceneTerrainBlock } from "../scene/types";
import {
  DEFAULT_TERRAIN_SQUARE_SIZE,
  INTERIOR_MODEL_ROTATION_Y,
  SHAPE_MODEL_ROTATION_Y,
  forceFieldCollider,
  interiorPlacement,
  streamEntityPlacement,
  terrainCollisionInput,
} from "./placement";

function interior(
  overrides: Partial<SceneInteriorInstance> = {},
): SceneInteriorInstance {
  return {
    className: "InteriorInstance",
    ghostIndex: 1,
    interiorFile: "bunker.dif",
    transform: { ...IDENTITY_MATRIX, position: { x: 1, y: 2, z: 3 } },
    scale: { x: 1, y: 2, z: 3 },
    showTerrainInside: false,
    skinBase: "base",
    alarmState: false,
    ...overrides,
  };
}

describe("interiorPlacement", () => {
  it("swizzles Torque position into three's axis order", () => {
    // Torque is X-forward/Z-up, three is Y-up: three = (y, z, x).
    expect(interiorPlacement(interior()).position).toEqual([2, 3, 1]);
  });

  it("swizzles scale the same way", () => {
    expect(interiorPlacement(interior()).scale).toEqual([2, 3, 1]);
  });

  it("produces an identity rotation for an identity transform", () => {
    const { quaternion } = interiorPlacement(interior());
    expect(quaternion.x).toBeCloseTo(0);
    expect(quaternion.y).toBeCloseTo(0);
    expect(quaternion.z).toBeCloseTo(0);
    expect(Math.abs(quaternion.w)).toBeCloseTo(1);
  });

  it("produces a normalized rotation for a rotated transform", () => {
    // 90° yaw about Torque Z, row-major.
    const { quaternion } = interiorPlacement(
      interior({
        transform: {
          elements: [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
          position: { x: 0, y: 0, z: 0 },
        },
      }),
    );
    expect(quaternion.length()).toBeCloseTo(1);
  });
});

describe("streamEntityPlacement", () => {
  // This asymmetry caused a real parity failure: a headless build put
  // the map's statics at (449.22, -43.25, 148.36) rotated -45° where
  // the browser had (-43.25, 148.36, 449.22) at +45°. Position needs
  // the swizzle, rotation must NOT be touched, and the model sits
  // under a further +90° yaw.
  it("swizzles position out of Torque space", () => {
    expect(
      streamEntityPlacement({ position: [449.22, -43.25, 148.36] }).position,
    ).toEqual([-43.25, 148.36, 449.22]);
  });

  it("passes rotation through untouched — it is already a three quaternion", () => {
    const rotation: [number, number, number, number] = [0, -0.3855, 0, 0.9227];
    expect(streamEntityPlacement({ rotation }).rotation).toEqual(rotation);
  });

  it("defaults to the origin and identity", () => {
    expect(streamEntityPlacement({})).toEqual({
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    });
  });

  it("rotates shapes opposite to interiors", () => {
    // Same magnitude, opposite sign — mixing them up is a quarter turn.
    expect(SHAPE_MODEL_ROTATION_Y).toBeCloseTo(-INTERIOR_MODEL_ROTATION_Y);
  });
});

describe("terrainCollisionInput", () => {
  const terrain = { heightMap: new Uint16Array(4) };
  const block = (overrides: Partial<SceneTerrainBlock> = {}) =>
    ({
      className: "TerrainBlock",
      ghostIndex: 1,
      terrFileName: "Damnation.ter",
      detailTextureName: "detail",
      squareSize: 8,
      ...overrides,
    }) as SceneTerrainBlock;

  it("passes through the ghost's square size", () => {
    expect(
      terrainCollisionInput(block({ squareSize: 16 }), terrain).squareSize,
    ).toBe(16);
  });

  it("falls back to Torque's default when the ghost omits it", () => {
    expect(
      terrainCollisionInput(block({ squareSize: 0 }), terrain).squareSize,
    ).toBe(DEFAULT_TERRAIN_SQUARE_SIZE);
  });

  it("defaults empty square runs to an empty list", () => {
    expect(terrainCollisionInput(block(), terrain).emptySquareRuns).toEqual([]);
  });
});

describe("forceFieldCollider", () => {
  const base = {
    position: [1, 2, 3] as [number, number, number],
    rotation: [0, 0, 0, 1] as [number, number, number, number],
    forceFieldData: { dimensions: [4, 5, 6] as [number, number, number] },
  };

  it("returns null without dimensions", () => {
    expect(forceFieldCollider({ position: [0, 0, 0] })).toBeNull();
  });

  it("builds a corner-origin box from the dimensions", () => {
    const collider = forceFieldCollider(base)!;
    expect(collider.box.min.toArray()).toEqual([0, 0, 0]);
    expect(collider.box.max.toArray()).toEqual([4, 5, 6]);
  });

  it("places the box via the matrix, leaving scale at 1", () => {
    const collider = forceFieldCollider(base)!;
    expect(collider.matrix.elements.slice(12, 15)).toEqual([1, 2, 3]);
  });

  it("collides only when closed, matching Torque", () => {
    expect(forceFieldCollider(base)!.enabled).toBe(true);
    expect(forceFieldCollider({ ...base, fieldOpen: true })!.enabled).toBe(
      false,
    );
  });
});
