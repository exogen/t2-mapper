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

/**
 * Displace terrain vertices on CPU and compute smooth normals from heightmap gradients.
 *
 * Height sampling uses NEAREST filtering to match the GPU DataTexture default:
 * texel = floor(uv * textureWidth), clamped to valid range.
 *
 * Normals use bilinear interpolation for smooth gradients, preventing banding
 * that would occur with face normals from computeVertexNormals().
 */
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
  // Helper to get height at heightmap coordinates with clamping (integer coords)
  const getHeightInt = (col: number, row: number): number => {
    col = Math.max(0, Math.min(TERRAIN_SIZE - 1, col));
    row = Math.max(0, Math.min(TERRAIN_SIZE - 1, row));
    return terrainHeightToWorld(heightMap[row * TERRAIN_SIZE + col]);
  };
  // Helper to get bilinearly interpolated height (matches GPU texture sampling)
  const getHeight = (col: number, row: number): number => {
    col = Math.max(0, Math.min(TERRAIN_SIZE - 1, col));
    row = Math.max(0, Math.min(TERRAIN_SIZE - 1, row));
    const col0 = Math.floor(col);
    const row0 = Math.floor(row);
    const col1 = Math.min(col0 + 1, TERRAIN_SIZE - 1);
    const row1 = Math.min(row0 + 1, TERRAIN_SIZE - 1);
    const fx = col - col0;
    const fy = row - row0;
    const h00 = terrainHeightToWorld(heightMap[row0 * TERRAIN_SIZE + col0]);
    const h10 = terrainHeightToWorld(heightMap[row0 * TERRAIN_SIZE + col1]);
    const h01 = terrainHeightToWorld(heightMap[row1 * TERRAIN_SIZE + col0]);
    const h11 = terrainHeightToWorld(heightMap[row1 * TERRAIN_SIZE + col1]);
    // Bilinear interpolation
    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;
    return h0 * (1 - fy) + h1 * fy;
  };
  // Process each vertex
  for (let i = 0; i < vertexCount; i++) {
    const u = uvs[i * 2];
    const v = uvs[i * 2 + 1];
    // Map UV to heightmap coordinates - must match Torque's terrain sampling.
    // Torque formula: floor(worldPos / squareSize) & BlockMask
    // UV 0→1 maps to world 0→2048, squareSize=8, so: floor(UV * 256) & 255
    // This wraps at edges for seamless terrain tiling.
    const col = Math.floor(u * TERRAIN_SIZE) & (TERRAIN_SIZE - 1);
    const row = Math.floor(v * TERRAIN_SIZE) & (TERRAIN_SIZE - 1);
    // Use direct integer sampling to match GPU nearest-neighbor filtering
    const height = getHeightInt(col, row);
    positions[i * 3 + 1] = height;
    // Compute normal using central differences on heightmap with smooth interpolation.
    // Use fractional coordinates for gradient sampling to get smooth normals.
    const colF = u * (TERRAIN_SIZE - 1);
    const rowF = v * (TERRAIN_SIZE - 1);
    const hL = getHeight(colF - 1, rowF); // left
    const hR = getHeight(colF + 1, rowF); // right
    const hD = getHeight(colF, rowF + 1); // down (increasing row)
    const hU = getHeight(colF, rowF - 1); // up (decreasing row)
    // Gradients in heightmap space (col increases = +U, row increases = +V)
    const dCol = (hR - hL) / 2; // height change per column
    const dRow = (hD - hU) / 2; // height change per row
    // Now map heightmap gradients to world-space normal
    // After rotateX(-PI/2) and rotateY(-PI/2):
    // - U direction (col) maps to world +Z
    // - V direction (row) maps to world +X
    //
    // For heightfield normal: n = normalize(-dh/dx, 1, -dh/dz) in world space
    // But we need the normal to face outward (toward the viewer), so use positive signs
    let nx = dRow;
    let ny = squareSize;
    let nz = dCol;
    // Normalize
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) {
      nx /= len;
      ny /= len;
      nz /= len;
    } else {
      nx = 0;
      ny = 1;
      nz = 0;
    }
    normals[i * 3] = nx;
    normals[i * 3 + 1] = ny;
    normals[i * 3 + 2] = nz;
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
