import {
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  DataTexture,
  Float32BufferAttribute,
  NearestFilter,
  NoColorSpace,
  RedFormat,
  UnsignedByteType,
} from "three";
import { TERRAIN_SIZE, terrainHeightToWorld } from "../terrain";

/**
 * Create terrain geometry with Torque-style alternating diagonal triangulation.
 *
 * Torque splits each grid square into two triangles, but alternates the diagonal
 * direction in a checkerboard pattern: ((x ^ y) & 1) == 0 determines Split45.
 *
 * - Split45 (/): diagonal from (x,y) to (x+1,y+1) - bottom-left to top-right
 * - Split135 (\): diagonal from (x+1,y) to (x,y+1) - bottom-right to top-left
 *
 * This creates more accurate terrain, especially on ridges and peaks where the
 * zigzag pattern of alternating triangles better represents the heightmap data.
 *
 * Geometry is created in X-Y plane (like PlaneGeometry) then rotated to match
 * terrain orientation.
 */
export function createTerrainGeometry(
  size: number,
  segments: number,
): BufferGeometry {
  const geometry = new BufferGeometry();
  const vertexCount = (segments + 1) * (segments + 1);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  // Pre-allocate index buffer: segments² squares × 2 triangles × 3 indices
  // Use Uint32Array since vertex count (257² = 66049) exceeds Uint16 max (65535)
  const indexCount = segments * segments * 6;
  const indices = new Uint32Array(indexCount);
  let indexOffset = 0;
  const segmentSize = size / segments;
  // Create vertices in X-Y plane (same as PlaneGeometry)
  // PlaneGeometry goes from top-left to bottom-right with UVs 0→1
  // X: -size/2 to +size/2 (left to right)
  // Y: +size/2 to -size/2 (top to bottom in initial X-Y plane)
  for (let row = 0; row <= segments; row++) {
    for (let col = 0; col <= segments; col++) {
      const idx = row * (segments + 1) + col;
      // Position in X-Y plane (Z=0), centered at origin
      positions[idx * 3] = col * segmentSize - size / 2; // X: -size/2 to +size/2
      positions[idx * 3 + 1] = size / 2 - row * segmentSize; // Y: +size/2 to -size/2
      positions[idx * 3 + 2] = 0; // Z: 0 (will be displaced after rotation)
      // Default normal pointing +Z (out of plane, will become +Y after rotation)
      normals[idx * 3] = 0;
      normals[idx * 3 + 1] = 0;
      normals[idx * 3 + 2] = 1;
      // UV coordinates (0 to 1), matching PlaneGeometry
      uvs[idx * 2] = col / segments;
      uvs[idx * 2 + 1] = 1 - row / segments; // Flip V so row 0 is at V=1
    }
  }
  // Create triangle indices with Torque-style alternating diagonals
  // Using CCW winding for front face (Three.js default)
  for (let row = 0; row < segments; row++) {
    for (let col = 0; col < segments; col++) {
      // In this layout (Y decreasing with row):
      // a---b   (row)
      // |   |
      // c---d   (row+1)
      const a = row * (segments + 1) + col;
      const b = a + 1;
      const c = (row + 1) * (segments + 1) + col;
      const d = c + 1;
      // Torque's split decision: ((x ^ y) & 1) == 0 means Split45
      const split45 = ((col ^ row) & 1) === 0;
      if (split45) {
        // Split45: diagonal from a to d (top-left to bottom-right in screen space)
        // Triangle 1: a, c, d (CCW from front)
        // Triangle 2: a, d, b (CCW from front)
        indices[indexOffset++] = a;
        indices[indexOffset++] = c;
        indices[indexOffset++] = d;
        indices[indexOffset++] = a;
        indices[indexOffset++] = d;
        indices[indexOffset++] = b;
      } else {
        // Split135: diagonal from b to c (top-right to bottom-left in screen space)
        // Triangle 1: a, c, b (CCW from front)
        // Triangle 2: b, c, d (CCW from front)
        indices[indexOffset++] = a;
        indices[indexOffset++] = c;
        indices[indexOffset++] = b;
        indices[indexOffset++] = b;
        indices[indexOffset++] = c;
        indices[indexOffset++] = d;
      }
    }
  }
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  // Apply same rotations as the original PlaneGeometry approach:
  // rotateX(-90°) puts the X-Y plane into X-Z (horizontal), with +Y becoming up
  // rotateY(-90°) rotates around Y axis to match terrain coordinate system
  geometry.rotateX(-Math.PI / 2);
  geometry.rotateY(-Math.PI / 2);
  return geometry;
}

/** Displace vertices and compute smooth normals from the periodic heightfield. */
export function displaceTerrainAndComputeNormals(
  geometry: BufferGeometry,
  heightMap: Uint16Array,
  squareSize: number,
): void {
  const posAttr = geometry.attributes.position;
  const uvAttr = geometry.attributes.uv;
  const normalAttr = geometry.attributes.normal;
  const positions = posAttr.array as Float32Array;
  const uvs = uvAttr.array as Float32Array;
  const normals = normalAttr.array as Float32Array;
  const vertexCount = posAttr.count;
  const mask = TERRAIN_SIZE - 1;
  const getHeight = (col: number, row: number): number =>
    terrainHeightToWorld(heightMap[(row & mask) * TERRAIN_SIZE + (col & mask)]);

  for (let i = 0; i < vertexCount; i++) {
    const col = Math.floor(uvs[i * 2] * TERRAIN_SIZE);
    const row = Math.floor(uvs[i * 2 + 1] * TERRAIN_SIZE);
    positions[i * 3 + 1] = getHeight(col, row);
    // Rows run along world +X and columns along +Z. Sample both sides
    // of each vertex, so the two copies of an edge have the same normal.
    const nx = (getHeight(col, row - 1) - getHeight(col, row + 1)) / 2;
    const nz = (getHeight(col - 1, row) - getHeight(col + 1, row)) / 2;
    const len = Math.sqrt(nx * nx + squareSize * squareSize + nz * nz);
    normals[i * 3] = nx / len;
    normals[i * 3 + 1] = squareSize / len;
    normals[i * 3 + 2] = nz / len;
  }
  posAttr.needsUpdate = true;
  normalAttr.needsUpdate = true;
}

/**
 * Create a visibility mask texture from emptySquares data.
 */
export function createVisibilityMask(emptySquares: number[]): DataTexture {
  const maskData = new Uint8Array(TERRAIN_SIZE * TERRAIN_SIZE);
  maskData.fill(255); // Start with everything visible
  for (const squareId of emptySquares) {
    const x = squareId & 0xff;
    const y = (squareId >> 8) & 0xff;
    const count = squareId >> 16;
    const rowOffset = y * TERRAIN_SIZE;
    for (let i = 0; i < count; i++) {
      const index = rowOffset + x + i;
      if (index < maskData.length) {
        maskData[index] = 0;
      }
    }
  }
  const texture = new DataTexture(
    maskData,
    TERRAIN_SIZE,
    TERRAIN_SIZE,
    RedFormat,
    UnsignedByteType,
  );
  texture.colorSpace = NoColorSpace;
  texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}
