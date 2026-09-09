import { parseDTS } from "./dts";
import { BoxGeometry } from "three";
import { dtsVectors } from "./dtsGeometry";
import type { DTSSequence } from "./dtsTypes";

class Writer {
  bytes: number[] = [];
  u8(n: number) {
    this.bytes.push(n & 255);
  }
  u16(n: number) {
    this.u8(n);
    this.u8(n >>> 8);
  }
  u32(n: number) {
    this.u16(n);
    this.u16(n >>> 16);
  }
  f32(n: number) {
    const b = new ArrayBuffer(4);
    new DataView(b).setFloat32(0, n, true);
    this.raw(new Uint8Array(b));
  }
  raw(values: ArrayLike<number>) {
    for (let i = 0; i < values.length; i++) this.u8(values[i]);
  }
  string(value: string) {
    this.raw(new TextEncoder().encode(value));
  }
  ints(...values: number[]) {
    for (const value of values) this.u32(value);
  }
  floats(...values: number[]) {
    for (const value of values) this.f32(value);
  }
  pad() {
    while (this.bytes.length % 4) this.u8(0);
  }
  buffer() {
    return new Uint8Array(this.bytes).buffer;
  }
}

/** Small authored shape, independent of proprietary game files. */
export function createDTSTestBuffer(
  version = 24,
  detailName = "Detail1",
): ArrayBuffer {
  if (version < 19) return createOldDTSTestBuffer(version, detailName);
  if (version > 26) throw new Error("fixture versions: 19–26");
  const out = new Writer(),
    a = new Writer(),
    b = new Writer(),
    c = new Writer();
  let guardIndex = 0;
  const guard = () => {
    a.u32(guardIndex);
    b.u16(guardIndex);
    c.u8(guardIndex++);
  };
  // nodes, objects, decals, subshapes, IFLs; animation counts.
  a.ints(1, 1, 0, 1, 0);
  if (version < 22) a.u32(1);
  else a.ints(0, 0, 0, 0, 0);
  if (version > 23) a.u32(0);
  a.ints(1, 0, 0, 1, 1);
  if (version < 23) a.u32(0);
  a.ints(3, 1, 0);
  guard();
  a.floats(2, 2, 0, 0, 0, -1, -1, 0, 1, 1, 0);
  guard();
  a.ints(0, -1, -1, -1, -1);
  guard();
  a.ints(1, 1, 0, 0, -1, -1);
  guard();
  guard();
  guard(); // no decals/IFLs
  a.ints(0, 0, 0);
  guard();
  a.ints(1, 1, 0);
  guard();
  b.u16(0);
  b.u16(0);
  b.u16(0);
  b.u16(32767);
  a.floats(0, 0, 0);
  guard();
  if (version > 21) guard();
  if (version > 23) guard();
  a.f32(1);
  a.ints(0, 0);
  guard();
  guard();
  guard();
  a.ints(2, 0, 0);
  a.floats(1, 0, 0);
  a.u32(1);
  if (version >= 26) {
    a.ints(0, 0, 0, 0);
    a.f32(0);
    a.u32(0);
  }
  guard();
  a.u32(0);
  guard(); // standard mesh type
  a.ints(1, 1, -1);
  a.floats(-1, -1, 0, 1, 1, 0, 0, 0, 0, 2);
  a.u32(3);
  a.floats(-1, -1, 0, 1, -1, 0, 0, 1, 0);
  a.u32(3);
  a.floats(0, 0, 1, 0, 0.5, 1);
  if (version >= 26) a.ints(0, 0);
  a.floats(0, 0, -1, 0, 0, -1, 0, 0, -1);
  if (version > 21) c.raw([0, 0, 0]);
  a.u32(1);
  if (version > 25) a.ints(0, 3, 0x20000000);
  else {
    b.u16(0);
    b.u16(3);
    a.u32(0x20000000);
  }
  a.u32(3);
  for (const index of [0, 1, 2])
    if (version > 25) a.u32(index);
    else b.u16(index);
  a.ints(0, 3, 0);
  guard();
  guard();
  for (const name of ["Root", "Triangle", detailName]) {
    c.string(name);
    c.u8(0);
  }
  guard();
  if (version < 23) {
    a.ints(0, 0);
    guard();
    guard();
  }
  a.pad();
  b.pad();
  c.pad();
  out.ints(
    version,
    (a.bytes.length + b.bytes.length + c.bytes.length) / 4,
    a.bytes.length / 4,
    (a.bytes.length + b.bytes.length) / 4,
  );
  out.raw(a.bytes);
  out.raw(b.bytes);
  out.raw(c.bytes);
  out.u32(0); // sequences
  out.u8(1);
  out.u32(1);
  out.u8(4);
  out.string("test");
  out.ints(3, -1, -1, -1);
  if (version === 25) out.u32(0);
  out.f32(1);
  if (version > 20) out.f32(1);
  return out.buffer();
}
export function createDTSTestShape(version = 24) {
  return parseDTS(createDTSTestBuffer(version));
}

/** Two articulated opaque parts sharing one replaceable body skin. */
export function createDTSRigidTestShape() {
  const shape = createDTSTestShape();
  shape.names.push("child", "childMesh");
  shape.nodes.push({ ...shape.nodes[0], nameIndex: 3, parentIndex: 0 });
  shape.objects.push({
    ...shape.objects[0],
    nameIndex: 4,
    nodeIndex: 1,
    startMeshIndex: 1,
  });
  shape.meshes.push({ ...shape.meshes[0] });
  shape.objectStates.push({ ...shape.objectStates[0] });
  shape.subShapes[0].numNodes = 2;
  shape.subShapes[0].numObjects = 2;
  shape.defaultTranslations = new Float32Array([1, 2, 3, 2, 0, 0]);
  shape.defaultRotations = new Int16Array([0, 0, 0, 32767, 0, 0, 0, 32767]);
  shape.materials[0].name = "skins\\base.lmale";
  shape.translations = shape.defaultTranslations.slice(0, 3);
  shape.sequences = [
    createDTSSequence({ numKeyframes: 1, translationMatters: [0] }),
  ];
  return shape;
}

/** Render box with smaller, separately authored collision and LOS hulls. */
export function createDTSCollisionTestShape() {
  const shape = createDTSTestShape();
  const template = shape.meshes[0];
  shape.meshes = [20, 2, 4].map((size) => {
    const box = new BoxGeometry(size, size, size);
    const indices = new Uint16Array(box.index!.array);
    for (let i = 0; i < indices.length; i += 3)
      [indices[i], indices[i + 2]] = [indices[i + 2], indices[i]];
    return {
      ...template,
      vertices: dtsVectors(box.getAttribute("position").array as Float32Array),
      normals: dtsVectors(box.getAttribute("normal").array as Float32Array),
      uv: box.getAttribute("uv").array as Float32Array,
      indices,
      verticesPerFrame: box.getAttribute("position").count,
      primitives: [{ start: 0, count: indices.length, material: 0x20000000 }],
    };
  });
  shape.objects[0].numMeshes = 3;
  shape.names.push("Collision-1", "LOS-9");
  shape.details.push(
    { ...shape.details[0], nameIndex: 3, size: -1, objectDetail: 1 },
    { ...shape.details[0], nameIndex: 4, size: -9, objectDetail: 2 },
  );
  return shape;
}
export function createDTSSequence(
  overrides: Partial<DTSSequence> = {},
): DTSSequence {
  return {
    nameIndex: 0,
    flags: 0,
    numKeyframes: 0,
    duration: 1,
    priority: 0,
    firstGroundFrame: 0,
    numGroundFrames: 0,
    baseRotation: 0,
    baseTranslation: 0,
    baseScale: 0,
    baseObjectState: 0,
    baseDecalState: 0,
    firstTrigger: 0,
    numTriggers: 0,
    toolBegin: 0,
    rotationMatters: [],
    translationMatters: [],
    scaleMatters: [],
    decalMatters: [],
    iflMatters: [],
    visibilityMatters: [],
    frameMatters: [],
    materialFrameMatters: [],
    ...overrides,
  };
}

function createOldDTSTestBuffer(
  version: number,
  detailName: string,
): ArrayBuffer {
  if (version < 15 || version > 18) throw new Error("fixture versions: 15–26");
  const out = new Writer();
  out.u32(version);
  out.floats(2, 2, 0, 0, 0, -1, -1, 0, 1, 1, 0);
  out.ints(1, 0, -1);
  if (version < 17) out.u8(0);
  out.ints(1, 1, 1, 0, 0, 0, 0); // object, empty decals/IFLs
  out.ints(1, 0, 1, 0, 1, 0); // subshape starts + legacy vector counts
  if (version < 16) out.u32(0);
  if (version < 17) out.u32(0); // old keyframes
  out.u32(1);
  out.u16(0);
  out.u16(0);
  out.u16(0);
  out.u16(32767);
  out.floats(0, 0, 0);
  out.u32(1);
  out.f32(1);
  out.ints(0, 0);
  out.ints(0, 0); // object state, decals/triggers
  out.ints(1, 2, 0, 0);
  out.f32(1);
  out.u32(0); // detail, no sequences
  out.ints(1, 0, 1, 1, 3); // mesh count, type, frames, matframes, vertices
  out.floats(-1, -1, 0, 1, -1, 0, 0, 1, 0);
  out.u32(3);
  out.floats(0, 0, 1, 0, 0.5, 1);
  out.u32(3);
  out.floats(0, 0, -1, 0, 0, -1, 0, 0, -1);
  out.u32(1);
  if (version < 18) out.ints(0, 3);
  else {
    out.u16(0);
    out.u16(3);
  }
  out.u32(0x20000000);
  out.u32(3);
  for (const i of [0, 1, 2])
    if (version < 18) out.u32(i);
    else out.u16(i);
  out.ints(3, 0, 3); // verts per frame, flags, names
  for (const name of ["Root", "Triangle", detailName]) {
    out.u32(name.length);
    out.string(name);
  }
  out.u32(1);
  out.u8(1);
  out.u32(1);
  out.u8(4);
  out.string("test");
  out.ints(3, -1, -1, -1);
  out.f32(1);
  out.u32(0); // legacy skins
  return out.buffer();
}
