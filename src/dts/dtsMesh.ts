import { DTSAllocation, DTSStream, type DTSNumbers } from "./dtsReader";
import {
  DTSMeshType,
  type DTSMeshData,
  type DTSPrimitive,
  type DTSVec3,
} from "./dtsTypes";

export const dtsVec3 = (r: Pick<DTSNumbers, "f32">): DTSVec3 => [
  r.f32(),
  r.f32(),
  r.f32(),
];
export const dtsBounds = (r: Pick<DTSNumbers, "f32">) => ({
  min: dtsVec3(r),
  max: dtsVec3(r),
});

function emptyMesh(type: number): DTSMeshData {
  return {
    type: type & 7,
    flags: type & ~7,
    parentMesh: -1,
    numFrames: 0,
    numMaterialFrames: 0,
    verticesPerFrame: 0,
    bounds: { min: [0, 0, 0], max: [0, 0, 0] },
    center: [0, 0, 0],
    radius: 0,
    vertices: new Float32Array(),
    normals: new Float32Array(),
    encodedNormals: new Uint8Array(),
    uv: new Float32Array(),
    uv2: new Float32Array(),
    colors: new Uint32Array(),
    primitives: [],
    indices: new Uint16Array(),
    mergeIndices: new Uint16Array(),
  };
}

function primitives(r: DTSNumbers, wide: boolean): DTSPrimitive[] {
  const n = r.count();
  const result = Array.from({ length: n }, () => ({
    start: 0,
    count: 0,
    material: 0,
  }));
  if (wide) {
    for (const p of result) {
      p.start = r.u32();
      p.count = r.u32();
      p.material = r.u32();
    }
  } else {
    for (const p of result) {
      p.start = r.u16();
      p.count = r.u16();
    }
    for (const p of result) p.material = r.u32();
  }
  return result;
}

function readSorted(r: DTSNumbers) {
  return {
    clusters: Array.from({ length: r.count() }, () => {
      const startPrimitive = r.i32(),
        endPrimitive = r.i32();
      // Leaf clusters can carry NaN sentinel planes; the engine never tests them.
      const bits = r.uints(4),
        plane = new Float32Array(bits.buffer, bits.byteOffset, 4);
      const frontCluster = r.i32(),
        backCluster = r.i32();
      if (frontCluster !== backCluster && !plane.every(Number.isFinite))
        r.fail("non-finite sorted cluster plane");
      return {
        startPrimitive,
        endPrimitive,
        normal: [plane[0], plane[1], plane[2]] as DTSVec3,
        k: plane[3],
        frontCluster,
        backCluster,
      };
    }),
    startCluster: r.ints(r.count()),
    firstVerts: r.ints(r.count()),
    numVerts: r.ints(r.count()),
    firstTVerts: r.ints(r.count()),
    alwaysWriteDepth: r instanceof DTSStream ? r.u8() !== 0 : r.i32() !== 0,
  };
}

export function readDTSMesh(
  r: DTSAllocation,
  version: number,
  type: number,
): DTSMeshData {
  const mesh = emptyMesh(type);
  if (mesh.type === DTSMeshType.Null) return mesh;
  if (mesh.type === DTSMeshType.Decal) {
    if (version < 20) {
      r.guard();
      r.ints(15);
    }
    mesh.primitives = primitives(r, false);
    mesh.indices = r.ushorts(r.count());
    if (version < 20) {
      r.ints(3);
      r.guard();
    }
    const n = r.count();
    mesh.decal = {
      startPrimitive: r.ints(n),
      texgenS: r.floats(n * 4),
      texgenT: r.floats(n * 4),
      materialIndex: r.i32(),
    };
    r.guard();
    return mesh;
  }
  if (
    mesh.type !== DTSMeshType.Standard &&
    mesh.type !== DTSMeshType.Skin &&
    mesh.type !== DTSMeshType.Sorted
  )
    r.fail(`unsupported mesh type ${mesh.type}`);
  r.guard();
  mesh.numFrames = r.count();
  mesh.numMaterialFrames = r.count();
  mesh.parentMesh = r.i32();
  mesh.bounds = dtsBounds(r);
  mesh.center = dtsVec3(r);
  mesh.radius = r.f32();
  const own = mesh.parentMesh < 0;
  const vertices = r.count();
  if (own) mesh.vertices = r.floats(vertices * 3);
  const uv = r.count();
  if (own) mesh.uv = r.floats(uv * 2);
  if (version > 25) {
    const uv2 = r.count();
    if (own) mesh.uv2 = r.floats(uv2 * 2);
    const colors = r.count();
    if (own) mesh.colors = r.uints(colors);
  }
  if (own) {
    mesh.normals = r.floats(vertices * 3);
    if (version > 21) mesh.encodedNormals = r.bytes(vertices);
  }
  mesh.primitives = primitives(r, version > 25);
  mesh.indices = version > 25 ? r.uints(r.count()) : r.ushorts(r.count());
  mesh.mergeIndices = r.ushorts(r.count());
  mesh.verticesPerFrame = r.count();
  mesh.flags |= r.u32();
  r.guard();
  if (mesh.type === DTSMeshType.Skin) {
    const n = r.count();
    const initialVertices = own ? r.floats(n * 3) : new Float32Array();
    const initialNormals = own ? r.floats(n * 3) : new Float32Array();
    const encodedNormals = own && version > 21 ? r.bytes(n) : new Uint8Array();
    const transforms = r.count();
    const inverseBindMatrices = own
      ? r.floats(transforms * 16)
      : new Float32Array();
    const influences = r.count();
    mesh.skin = {
      initialVertices,
      initialNormals,
      encodedNormals,
      inverseBindMatrices,
      vertexIndices: own ? r.ints(influences) : new Int32Array(),
      boneIndices: own ? r.ints(influences) : new Int32Array(),
      weights: own ? r.floats(influences) : new Float32Array(),
      nodeIndices: new Int32Array(),
    };
    const nodes = r.count();
    if (own) mesh.skin.nodeIndices = r.ints(nodes);
    r.guard();
  } else if (mesh.type === DTSMeshType.Sorted) {
    mesh.sorted = readSorted(r);
    r.guard();
  }
  return mesh;
}

/** DTS 15–18 meshes are sequential, without lanes, guards, or shared parents. */
export function readOldDTSMesh(
  r: DTSStream,
  version: number,
  type: number,
): DTSMeshData {
  const mesh = emptyMesh(type);
  if (mesh.type === DTSMeshType.Null) return mesh;
  mesh.numFrames = r.count();
  mesh.numMaterialFrames = r.count();
  mesh.vertices = r.floats(r.count(12) * 3);
  mesh.uv = r.floats(r.count(8) * 2);
  r.u32(); // legacy normal count (the vertex count is authoritative)
  mesh.normals = r.floats(mesh.vertices.length);
  mesh.primitives = Array.from(
    { length: r.count(version < 18 ? 12 : 8) },
    () => ({
      start: version < 18 ? r.u32() & 0xffff : r.u16(),
      count: version < 18 ? r.u32() & 0xffff : r.u16(),
      material: r.u32(),
    }),
  );
  const indices = r.count(version < 18 ? 4 : 2);
  mesh.indices =
    version < 18 ? Uint16Array.from(r.uints(indices)) : r.ushorts(indices);
  mesh.verticesPerFrame = r.count();
  mesh.flags |= r.u32();
  if (mesh.type === DTSMeshType.Skin) {
    const initialVertices = r.floats(r.count(12) * 3);
    r.u32();
    const initialNormals = r.floats(initialVertices.length);
    const inverseBindMatrices = r.floats(r.count(64) * 16);
    const influences = r.count(4);
    const vertexIndices = r.ints(influences);
    r.u32();
    const boneIndices = r.ints(influences);
    const nodeIndices = r.ints(r.count(4));
    r.u32();
    const weights = r.floats(influences);
    mesh.skin = {
      initialVertices,
      initialNormals,
      encodedNormals: new Uint8Array(),
      inverseBindMatrices,
      vertexIndices,
      boneIndices,
      nodeIndices,
      weights,
    };
  } else if (mesh.type === DTSMeshType.Sorted) mesh.sorted = readSorted(r);
  else if (mesh.type === DTSMeshType.Decal) {
    const startPrimitive = r.ints(r.count(4));
    if (version >= 17) {
      r.ints(r.count(4));
      r.ints(r.count(4));
    }
    mesh.decal = {
      startPrimitive,
      texgenS: new Float32Array(),
      texgenT: new Float32Array(),
      materialIndex: r.i32(),
    };
  } else if (mesh.type !== DTSMeshType.Standard)
    r.fail(`unsupported mesh type ${mesh.type}`);
  // Older files have no mesh bounds; derive them from every frame.
  for (let axis = 0; axis < 3; axis++) {
    let min = Infinity,
      max = -Infinity;
    for (let i = axis; i < mesh.vertices.length; i += 3) {
      min = Math.min(min, mesh.vertices[i]);
      max = Math.max(max, mesh.vertices[i]);
    }
    mesh.bounds.min[axis] = Number.isFinite(min) ? min : 0;
    mesh.bounds.max[axis] = Number.isFinite(max) ? max : 0;
    mesh.center[axis] = (mesh.bounds.min[axis] + mesh.bounds.max[axis]) / 2;
  }
  for (let i = 0; i < mesh.vertices.length; i += 3)
    mesh.radius = Math.max(
      mesh.radius,
      Math.hypot(
        mesh.vertices[i] - mesh.center[0],
        mesh.vertices[i + 1] - mesh.center[1],
        mesh.vertices[i + 2] - mesh.center[2],
      ),
    );
  return mesh;
}
