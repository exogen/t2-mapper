import { expect, it } from "vitest";
import { TERRAIN_SIZE } from "../terrain";
import {
  createTerrainGeometry,
  displaceTerrainAndComputeNormals,
} from "./terrainGeometry";

it("uses the same heights and normals at all four copies of the wrapped corner", () => {
  const size = TERRAIN_SIZE;
  const squareSize = 8;
  const heights = new Uint16Array(size * size).fill(100 * 32);
  heights[1] = 116 * 32;
  heights[size] = 116 * 32;
  const terrain = createTerrainGeometry(size * squareSize, size);
  displaceTerrainAndComputeNormals(terrain, heights, squareSize);
  const positions = terrain.getAttribute("position");
  const normals = terrain.getAttribute("normal");
  const stride = size + 1;
  const component = 1 / Math.sqrt(3);
  for (const i of [0, size, stride * size, stride * size + size]) {
    expect(positions.getY(i)).toBe(100);
    expect(normals.getX(i)).toBeCloseTo(-component);
    expect(normals.getY(i)).toBeCloseTo(component);
    expect(normals.getZ(i)).toBeCloseTo(-component);
  }
  terrain.dispose();
});
