import {
  Box3,
  Sphere,
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";
import { DTS_NORMALS } from "./dtsNormals";
import {
  DTSPrimitiveFlags,
  type DTSMeshData,
  type DTSPrimitive,
} from "./dtsTypes";

/** Shape-local basis: Torque (x,y,z) → Three (-x,z,y), Y up, forward +Z.
 * World placement turns this into the mapper's (y,z,x) world basis. */
export const DTS_BASIS = new Matrix4().set(
  -1,
  0,
  0,
  0,
  0,
  0,
  1,
  0,
  0,
  1,
  0,
  0,
  0,
  0,
  0,
  1,
);
export function dtsVector(
  data: ArrayLike<number>,
  offset = 0,
  out = new Vector3(),
): Vector3 {
  return out.set(-data[offset], data[offset + 2], data[offset + 1]);
}
/** Torque QuatF::setMatrix uses the inverse of Three's quaternion convention. */
export function dtsQuaternion(
  data: ArrayLike<number>,
  offset = 0,
  out = new Quaternion(),
): Quaternion {
  return out
    .set(
      data[offset] / 32767,
      -data[offset + 2] / 32767,
      -data[offset + 1] / 32767,
      data[offset + 3] / 32767,
    )
    .normalize();
}
export function dtsVectors(data: Float32Array): Float32Array {
  const result = new Float32Array(data.length);
  for (let i = 0; i < data.length; i += 3) {
    result[i] = -data[i];
    result[i + 1] = data[i + 2];
    result[i + 2] = data[i + 1];
  }
  return result;
}

/** Torque winding is clockwise. Expand strips/fans once, preserving seams. */
export function dtsTriangles(
  mesh: DTSMeshData,
  primitive: DTSPrimitive,
): Uint32Array {
  const { start, count, material } = primitive;
  const type = material >>> 30;
  if (type === 3) throw new Error("DTS: invalid primitive topology");
  const output = new Uint32Array(
    (type ? Math.max(count - 2, 0) : Math.floor(count / 3)) * 3,
  );
  const at = (i: number) =>
    material & DTSPrimitiveFlags.Indexed ? mesh.indices[start + i] : start + i;
  let cursor = 0;
  const emit = (a: number, b: number, c: number) => {
    if (a !== b && a !== c && b !== c) {
      output[cursor++] = c;
      output[cursor++] = b;
      output[cursor++] = a;
    }
  };
  if (type === 0)
    for (let i = 0; i + 2 < count; i += 3) emit(at(i), at(i + 1), at(i + 2));
  else
    for (let i = 0; i + 2 < count; i++) {
      if (type === 1) emit(at(i + (i & 1)), at(i + 1 - (i & 1)), at(i + 2));
      else emit(at(0), at(i + 1), at(i + 2));
    }
  return output.subarray(0, cursor);
}

export interface DTSGeometryFrames {
  positions: BufferAttribute[];
  normals: BufferAttribute[];
  uv: BufferAttribute[];
  uv1: BufferAttribute[];
  colors: BufferAttribute[];
  triangles: Uint32Array[];
}

/** Buffers are shared by material partitions and instances; no vertex welding. */
export function buildDTSGeometry(mesh: DTSMeshData): {
  geometry: BufferGeometry;
  frames: DTSGeometryFrames;
} {
  const geometry = new BufferGeometry();
  const sourceVertices = mesh.skin?.initialVertices.length
    ? mesh.skin.initialVertices
    : mesh.vertices;
  const sourceNormals = mesh.skin?.initialNormals.length
    ? mesh.skin.initialNormals
    : mesh.normals;
  const positions = dtsVectors(sourceVertices),
    normals = dtsVectors(sourceNormals);
  const encoded = mesh.skin?.encodedNormals.length
    ? mesh.skin.encodedNormals
    : mesh.encodedNormals;
  if (mesh.flags & 0x10000000 && encoded.length * 3 >= normals.length) {
    for (let i = 0; i < normals.length / 3; i++) {
      const offset = encoded[i] * 3;
      normals[i * 3] = -DTS_NORMALS[offset];
      normals[i * 3 + 1] = DTS_NORMALS[offset + 2];
      normals[i * 3 + 2] = DTS_NORMALS[offset + 1];
    }
  }
  const vertexCount =
    mesh.verticesPerFrame ||
    mesh.sorted?.numVerts[0] ||
    sourceVertices.length / 3;
  const frames: DTSGeometryFrames = {
    positions: [],
    normals: [],
    uv: [],
    uv1: [],
    colors: [],
    triangles: mesh.primitives.map((p) => dtsTriangles(mesh, p)),
  };
  const frameCount = mesh.skin ? 1 : Math.max(mesh.numFrames, 1);
  const colors = new Uint8Array(mesh.colors.length * 4);
  for (let i = 0; i < mesh.colors.length; i++) {
    const c = mesh.colors[i];
    colors[i * 4] = c & 255;
    colors[i * 4 + 1] = (c >>> 8) & 255;
    colors[i * 4 + 2] = (c >>> 16) & 255;
    colors[i * 4 + 3] = c >>> 24;
  }
  for (let frame = 0; frame < frameCount; frame++) {
    const start = mesh.sorted?.firstVerts[frame] ?? frame * vertexCount;
    // numVerts was used only by glLockArraysEXT; several shipped trees
    // retain stale values larger than their actual vertex allocation.
    const next =
      mesh.sorted?.firstVerts[frame + 1] ?? sourceVertices.length / 3;
    const count = mesh.sorted ? next - start : vertexCount;
    if (start < 0 || (start + count) * 3 > positions.length)
      throw new Error("DTS: invalid mesh frame vertex range");
    frames.positions.push(
      new BufferAttribute(
        positions.subarray(start * 3, (start + count) * 3),
        3,
      ),
    );
    frames.normals.push(
      new BufferAttribute(normals.subarray(start * 3, (start + count) * 3), 3),
    );
    if (colors.length >= (start + count) * 4)
      frames.colors.push(
        new BufferAttribute(
          colors.subarray(start * 4, (start + count) * 4),
          4,
          true,
        ),
      );
  }
  for (
    let frame = 0;
    frame < Math.max(mesh.numMaterialFrames, frameCount, 1);
    frame++
  ) {
    const start =
      mesh.sorted?.firstTVerts[frame] ??
      (frame % Math.max(mesh.numMaterialFrames, 1)) * vertexCount;
    const count = mesh.sorted
      ? frames.positions[Math.min(frame, frames.positions.length - 1)].count
      : vertexCount;
    // DTS UVs and Three flipY=false textures both use a top-left origin.
    frames.uv.push(
      new BufferAttribute(mesh.uv.subarray(start * 2, (start + count) * 2), 2),
    );
    if (mesh.uv2.length >= (start + count) * 2)
      frames.uv1.push(
        new BufferAttribute(
          mesh.uv2.subarray(start * 2, (start + count) * 2),
          2,
        ),
      );
  }
  geometry.setAttribute("position", frames.positions[0]);
  if (frames.normals[0].count === frames.positions[0].count)
    geometry.setAttribute("normal", frames.normals[0]);
  if (frames.uv[0].count === frames.positions[0].count)
    geometry.setAttribute("uv", frames.uv[0]);
  if (frames.uv1[0]) geometry.setAttribute("uv1", frames.uv1[0]);
  if (frames.colors[0]) geometry.setAttribute("color", frames.colors[0]);
  // DTS frame indices are discrete, not blended. Selecting a shared frame
  // attribute avoids sampling every frame in a GPU morph shader (up to 70
  // frames in shipped effects) when only one frame contributes.
  let offset = 0;
  const indices = new Uint32Array(
    frames.triangles.reduce((n, a) => n + a.length, 0),
  );
  for (let i = 0; i < frames.triangles.length; i++) {
    const triangles = frames.triangles[i],
      primitive = mesh.primitives[i];
    indices.set(triangles, offset);
    geometry.addGroup(
      offset,
      triangles.length,
      primitive.material & DTSPrimitiveFlags.NoMaterial
        ? -1
        : primitive.material & DTSPrimitiveFlags.MaterialMask,
    );
    offset += triangles.length;
  }
  geometry.setIndex(
    new BufferAttribute(
      vertexCount <= 65536 ? new Uint16Array(indices) : indices,
      1,
    ),
  );
  if (!geometry.hasAttribute("normal")) geometry.computeVertexNormals();
  // Tribes 2 serializes mesh radii as truncated integers; other exporters
  // write float bits in the same slot. Derive Three's bounds from vertices
  // once, covering all frames so animation cannot outgrow the culling volume.
  const boundsPositions = new BufferAttribute(positions, 3);
  geometry.boundingBox = new Box3().setFromBufferAttribute(boundsPositions);
  const sphere = new Sphere();
  geometry.boundingBox.getCenter(sphere.center);
  const point = new Vector3();
  let radiusSquared = 0;
  for (let i = 0; i < boundsPositions.count; i++)
    radiusSquared = Math.max(
      radiusSquared,
      point
        .fromBufferAttribute(boundsPositions, i)
        .distanceToSquared(sphere.center),
    );
  sphere.radius = Math.sqrt(radiusSquared);
  geometry.boundingSphere = sphere;
  return { geometry, frames };
}

/** A geometry view with shared immutable attributes and morph buffers. */
export function shareDTSGeometry(source: BufferGeometry): BufferGeometry {
  const geometry = new BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes))
    geometry.setAttribute(name, attribute);
  geometry.morphAttributes = source.morphAttributes;
  geometry.morphTargetsRelative = source.morphTargetsRelative;
  geometry.setIndex(source.index);
  for (const group of source.groups)
    geometry.addGroup(group.start, group.count, group.materialIndex);
  geometry.boundingBox = source.boundingBox?.clone() ?? null;
  geometry.boundingSphere = source.boundingSphere?.clone() ?? null;
  geometry.setDrawRange(source.drawRange.start, source.drawRange.count);
  return geometry;
}
