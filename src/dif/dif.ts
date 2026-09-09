/**
 * Tribes 2 DIF resource v44 / Interior v0 reader. Coordinates stay in Torque
 * space here; difLoader.ts builds Three.js geometry from the parsed surfaces.
 *
 * Sources: io_dif's hxDif.py / import_dif.py, checked against build 25034's
 * Interior::read (FUN_00513140), plane reader (FUN_00516190), and packed
 * lightmap texgen reader (FUN_00515fc0) in Tribes2.exe.c. Later Torque engine
 * DIF variants are deliberately rejected instead of guessed from the bytes.
 */
export const DIFSurfaceFlags = {
  Detail: 1 << 0,
  Ambiguous: 1 << 1,
  Orphan: 1 << 2,
  SharedLightmaps: 1 << 3,
  OutsideVisible: 1 << 4,
} as const;

type Vec3 = [number, number, number];
type Plane = [number, number, number, number];

export interface DIFSurface {
  windingStart: number;
  windingCount: number;
  planeIndex: number;
  textureIndex: number;
  texGenIndex: number;
  flags: number;
  fanMask: number;
  lightMapTexGen: [Plane, Plane];
  lightCount: number;
  lightStateInfoStart: number;
  mapOffset: [number, number];
  mapSize: [number, number];
}

export interface DIFInterior {
  detailLevel: number;
  minPixels: number;
  boundingBox: { min: Vec3; max: Vec3 };
  boundingSphere: { center: Vec3; radius: number };
  hasAlarmState: boolean;
  normals: Vec3[];
  planes: { normalIndex: number; distance: number }[];
  points: Vec3[];
  texGen: [Plane, Plane][];
  materialNames: string[];
  windings: number[];
  surfaces: DIFSurface[];
  normalLightMapIndices: Uint8Array;
  alarmLightMapIndices: Uint8Array;
  lightMaps: { png: Uint8Array<ArrayBuffer>; keep: boolean }[];
  bspNodes: { planeIndex: number; frontIndex: number; backIndex: number }[];
  solidLeaves: { surfaceStart: number; surfaceCount: number }[];
  solidLeafSurfaces: number[];
  nullSurfaces: Pick<
    DIFSurface,
    "windingStart" | "windingCount" | "planeIndex" | "flags"
  >[];
  convexHulls: DIFConvexHull[];
  hullIndices: number[];
  hullPlaneIndices: number[];
  hullSurfaceIndices: number[];
  coordBins: { start: number; count: number }[];
  coordBinIndices: number[];
}

export interface DIFConvexHull {
  hullStart: number;
  hullCount: number;
  min: Vec3;
  max: Vec3;
  surfaceStart: number;
  surfaceCount: number;
  planeStart: number;
}

export interface DIFFile {
  /** Detail levels in file order; the first is the highest detail. */
  interiors: DIFInterior[];
  subObjects: DIFInterior[];
  /** Resource-level hull set used by detail 0 for VehicleObjectType. */
  vehicleCollision: DIFVehicleCollisionData | null;
}

export interface DIFVehicleCollisionData {
  convexHulls: DIFConvexHull[];
  hullIndices: number[];
  hullPlaneIndices: number[];
  hullSurfaceIndices: number[];
  nullSurfaces: DIFInterior["nullSurfaces"];
  points: Vec3[];
  planes: Plane[];
  windings: number[];
  /** Compact point indices decoded from each hull's support-vertex feature streams. */
  hullPolygons: number[][][];
}

class DIFReader {
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly view: DataView<ArrayBuffer>;
  offset = 0;
  section = "header";

  constructor(buffer: ArrayBuffer) {
    this.bytes = new Uint8Array(buffer);
    this.view = new DataView(buffer);
  }

  fail(message: string): never {
    throw new Error(`DIF ${this.section} at byte ${this.offset}: ${message}`);
  }

  require(size: number) {
    if (
      !Number.isSafeInteger(size) ||
      size < 0 ||
      size > this.bytes.length - this.offset
    ) {
      this.fail(
        `truncated data (need ${size} bytes, have ${this.bytes.length - this.offset})`,
      );
    }
  }

  skip(size: number) {
    this.require(size);
    this.offset += size;
  }

  u8(): number {
    this.require(1);
    return this.view.getUint8(this.offset++);
  }
  u16(): number {
    this.require(2);
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }
  u32(): number {
    this.require(4);
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }
  f32(): number {
    this.require(4);
    const value = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    if (!Number.isFinite(value)) this.fail("non-finite float");
    return value;
  }
  vec3(): Vec3 {
    return [this.f32(), this.f32(), this.f32()];
  }
  plane(): Plane {
    return [...this.vec3(), this.f32()];
  }

  count(section: string, stride: number): number {
    this.section = section;
    const count = this.u32();
    this.require(count * stride);
    return count;
  }
  array<T>(section: string, stride: number, read: () => T): T[] {
    const count = this.count(section, stride);
    return Array.from({ length: count }, read);
  }
  skipArray(section: string, stride: number) {
    this.skip(this.count(section, stride) * stride);
  }
  byteArray(section: string): Uint8Array {
    const count = this.count(section, 1);
    const start = this.offset;
    this.skip(count);
    return this.bytes.subarray(start, this.offset);
  }
  string(): string {
    const length = this.u8();
    this.require(length);
    let value = "";
    for (let i = 0; i < length; i++) value += String.fromCharCode(this.u8());
    return value;
  }
  index(index: number, length: number, name: string) {
    if (index >= length)
      this.fail(`invalid ${name} index ${index} (count ${length})`);
  }

  /** PNG has no DIF length prefix. Walk chunks, never scan compressed bytes. */
  png(): Uint8Array<ArrayBuffer> {
    const start = this.offset;
    for (const byte of [137, 80, 78, 71, 13, 10, 26, 10]) {
      if (this.u8() !== byte) this.fail("invalid PNG signature");
    }
    let first = true;
    for (;;) {
      this.require(12);
      const size = this.view.getUint32(this.offset, false);
      this.skip(4);
      const type = String.fromCharCode(
        this.u8(),
        this.u8(),
        this.u8(),
        this.u8(),
      );
      if (first && (type !== "IHDR" || size !== 13))
        this.fail("invalid PNG header");
      first = false;
      this.skip(size + 4); // payload + CRC
      if (type === "IEND") {
        if (size !== 0) this.fail("invalid PNG end chunk");
        return this.bytes.subarray(start, this.offset);
      }
    }
  }
}

function readLightMapTexGen(r: DIFReader): [Plane, Plane] {
  const word = r.u16();
  const s: Plane = [0, 0, 0, r.f32()];
  const t: Plane = [0, 0, 0, r.f32()];
  const axes = [
    [0, 1],
    [0, 2],
    [1, 0],
    [1, 2],
    [2, 0],
    [2, 1],
  ][word >>> 13];
  if (!axes) r.fail(`invalid lightmap axis encoding ${word >>> 13}`);
  // Match the executable's unsigned x86 shifts (the shift count uses 5 bits).
  s[axes[0]] = 1 / 2 ** ((word >>> 6) & 31);
  t[axes[1]] = 1 / 2 ** (word & 31);
  return [s, t];
}

function readConvexHulls(r: DIFReader, section: string): DIFConvexHull[] {
  return r.array<DIFConvexHull>(section, 52, () => {
    const hullStart = r.u32(),
      hullCount = r.u16();
    const minX = r.f32(),
      maxX = r.f32(),
      minY = r.f32(),
      maxY = r.f32(),
      minZ = r.f32(),
      maxZ = r.f32();
    const surfaceStart = r.u32(),
      surfaceCount = r.u16(),
      planeStart = r.u32();
    r.skip(12); // poly-list acceleration offsets
    return {
      hullStart,
      hullCount,
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
      surfaceStart,
      surfaceCount,
      planeStart,
    };
  });
}

function readInterior(r: DIFReader): DIFInterior {
  r.section = "interior header";
  const version = r.u32();
  if (version !== 0)
    r.fail(
      `unsupported interior version ${version}; expected Tribes 2 version 0`,
    );
  const detailLevel = r.u32();
  const minPixels = r.u32();
  const boundingBox = { min: r.vec3(), max: r.vec3() };
  const boundingSphere = { center: r.vec3(), radius: r.f32() };
  const hasAlarmState = r.u8() !== 0;
  r.u32(); // numLightStateEntries
  const normals = r.array("normals", 12, () => r.vec3());
  const planes = r.array("planes", 6, () => {
    const normalIndex = r.u16();
    r.index(normalIndex, normals.length, "normal");
    return { normalIndex, distance: r.f32() };
  });
  const points = r.array("points", 12, () => r.vec3());
  r.skipArray("point visibility", 1);
  const texGen = r.array<[Plane, Plane]>("texture planes", 32, () => [
    r.plane(),
    r.plane(),
  ]);
  const bspNodes = r.array("BSP nodes", 6, () => ({
    planeIndex: r.u16(),
    frontIndex: r.u16(),
    backIndex: r.u16(),
  }));
  const solidLeaves = r.array("BSP solid leaves", 6, () => ({
    surfaceStart: r.u32(),
    surfaceCount: r.u16(),
  }));
  r.section = "material list";
  const materialVersion = r.u8();
  if (materialVersion !== 1)
    r.fail(`unsupported material list version ${materialVersion}`);
  const materialNames = r.array("material names", 1, () => r.string());
  const windings = r.array("windings", 4, () => {
    const index = r.u32();
    r.index(index, points.length, "point");
    return index;
  });
  r.skipArray("winding indices", 8);
  r.skipArray("zones", 12);
  r.skipArray("zone surfaces", 2);
  r.skipArray("zone portals", 2);
  r.skipArray("portals", 12);
  const surfaces = r.array<DIFSurface>("surfaces", 38, () => {
    const windingStart = r.u32();
    const windingCount = r.u8();
    if (windingCount < 3 || windingStart + windingCount > windings.length) {
      r.fail(`invalid surface winding range ${windingStart} + ${windingCount}`);
    }
    const planeIndex = r.u16();
    r.index(planeIndex & 0x7fff, planes.length, "plane");
    const textureIndex = r.u16();
    r.index(textureIndex, materialNames.length, "material");
    const texGenIndex = r.u32();
    r.index(texGenIndex, texGen.length, "texture plane");
    return {
      windingStart,
      windingCount,
      planeIndex,
      textureIndex,
      texGenIndex,
      flags: r.u8(),
      fanMask: r.u32(),
      lightMapTexGen: readLightMapTexGen(r),
      lightCount: r.u16(),
      lightStateInfoStart: r.u32(),
      mapOffset: [r.u8(), r.u8()],
      mapSize: [r.u8(), r.u8()],
    };
  });
  const normalLightMapIndices = r.byteArray("normal lightmap indices");
  const alarmLightMapIndices = r.byteArray("alarm lightmap indices");
  const nullSurfaces = r.array("null surfaces", 8, () => ({
    windingStart: r.u32(),
    planeIndex: r.u16(),
    flags: r.u8(),
    windingCount: r.u8(),
  }));
  const lightMaps = r.array("lightmaps", 58, () => ({
    png: r.png(),
    keep: r.u8() !== 0,
  }));
  for (const [name, indices] of [
    ["normal", normalLightMapIndices],
    ["alarm", alarmLightMapIndices],
  ] as const) {
    if (
      indices.length !== surfaces.length &&
      !(name === "alarm" && !hasAlarmState && indices.length === 0)
    ) {
      r.fail(
        `${name} lightmap index count ${indices.length} does not match ${surfaces.length} surfaces`,
      );
    }
    for (const index of indices) {
      if (index !== 0xff) r.index(index, lightMaps.length, `${name} lightmap`);
    }
  }

  const solidLeafSurfaces = r.array("solid leaf surfaces", 4, () => r.u32());
  r.skipArray("animated lights", 16);
  r.skipArray("light states", 13);
  r.skipArray("light state data", 10);
  const stateBufferSize = r.count("light state buffer", 1);
  r.u32(); // flags
  r.skip(stateBufferSize);
  r.skipArray("light names", 1);
  const mirrorCount = r.count("mirror subobjects", 36);
  for (let i = 0; i < mirrorCount; i++) {
    const key = r.u32();
    if (key !== 1) r.fail(`unsupported interior subobject ${key}`);
    r.skip(32);
  }
  const convexHulls = readConvexHulls(r, "convex hulls");
  r.skipArray("hull emit strings", 1);
  const hullIndices = r.array("hull indices", 4, () => r.u32());
  const hullPlaneIndices = r.array("hull plane indices", 2, () => r.u16());
  r.skipArray("hull emit string indices", 4);
  const hullSurfaceIndices = r.array("hull surface indices", 4, () => r.u32());
  r.skipArray("poly list planes", 2);
  r.skipArray("poly list points", 4);
  r.skipArray("poly list strings", 1);
  r.section = "coordinate bins";
  const coordBins = Array.from({ length: 256 }, () => ({
    start: r.u32(),
    count: r.u32(),
  }));
  const coordBinIndices = r.array("coordinate bin indices", 2, () => r.u16());
  r.u32(); // coordinate bin mode
  r.skip(8); // base/alarm ambient RGBA
  r.section = "interior extensions";
  for (let i = 0; i < 4; i++) {
    if (r.u32() !== 0) r.fail("unsupported interior extension");
  }
  r.section = "collision references";
  const range = (start: number, count: number, length: number) => {
    if (start + count > length)
      r.fail(`invalid range ${start} + ${count} (count ${length})`);
  };
  const surfaceIndex = (index: number) =>
    r.index(
      index & 0x7fffffff,
      index & 0x80000000 ? nullSurfaces.length : surfaces.length,
      "collision surface",
    );
  for (const surface of nullSurfaces) {
    range(surface.windingStart, surface.windingCount, windings.length);
    r.index(surface.planeIndex & 0x7fff, planes.length, "null surface plane");
  }
  for (const node of bspNodes) {
    r.index(node.planeIndex & 0x7fff, planes.length, "BSP plane");
    for (const child of [node.frontIndex, node.backIndex]) {
      if (!(child & 0x8000)) r.index(child, bspNodes.length, "BSP node");
      else if (child & 0x4000)
        r.index(child & 0x3fff, solidLeaves.length, "solid leaf");
    }
  }
  // Reject cycles once at load time, keeping hot BSP queries unguarded.
  const visited = new Uint8Array(bspNodes.length);
  const stack: number[] = bspNodes.length ? [0] : [];
  while (stack.length) {
    const index = stack.pop()!;
    if (index < 0) {
      visited[~index] = 2;
      continue;
    }
    if (index & 0x8000 || visited[index] === 2) continue;
    if (visited[index] === 1) r.fail("cyclic BSP tree");
    visited[index] = 1;
    stack.push(~index, bspNodes[index].backIndex, bspNodes[index].frontIndex);
  }
  for (const leaf of solidLeaves)
    range(leaf.surfaceStart, leaf.surfaceCount, solidLeafSurfaces.length);
  solidLeafSurfaces.forEach(surfaceIndex);
  hullSurfaceIndices.forEach(surfaceIndex);
  for (const index of hullIndices) r.index(index, points.length, "hull point");
  for (const index of hullPlaneIndices)
    r.index(index & 0x7fff, planes.length, "hull plane");
  for (const hull of convexHulls) {
    range(hull.hullStart, hull.hullCount, hullIndices.length);
    range(hull.surfaceStart, hull.surfaceCount, hullSurfaceIndices.length);
    // Hull planes are deduplicated; several surfaces can share one plane.
    range(hull.planeStart, 0, hullPlaneIndices.length);
  }
  for (const bin of coordBins)
    range(bin.start, bin.count, coordBinIndices.length);
  for (const index of coordBinIndices)
    r.index(index, convexHulls.length, "coordinate bin hull");
  return {
    detailLevel,
    minPixels,
    boundingBox,
    boundingSphere,
    hasAlarmState,
    normals,
    planes,
    points,
    texGen,
    materialNames,
    windings,
    surfaces,
    normalLightMapIndices,
    alarmLightMapIndices,
    lightMaps,
    bspNodes,
    solidLeaves,
    solidLeafSurfaces,
    nullSurfaces,
    convexHulls,
    hullIndices,
    hullPlaneIndices,
    hullSurfaceIndices,
    coordBins,
    coordBinIndices,
  };
}

/** Interior::readVehicleCollision, FUN_00515330: independent points and full planes. */
function readVehicleCollision(r: DIFReader): DIFVehicleCollisionData {
  r.section = "vehicle collision version";
  const version = r.u32();
  if (version !== 0) r.fail(`unsupported vehicle collision version ${version}`);
  const convexHulls = readConvexHulls(r, "vehicle convex hulls");
  const emitStrings = r.byteArray("vehicle hull emit strings");
  const hullIndices = r.array("vehicle hull indices", 4, () => r.u32());
  const hullPlaneIndices = r.array("vehicle hull plane indices", 2, () =>
    r.u16(),
  );
  const emitIndices = r.array("vehicle hull emit string indices", 4, () =>
    r.u32(),
  );
  const hullSurfaceIndices = r.array("vehicle hull surface indices", 4, () =>
    r.u32(),
  );
  r.skipArray("vehicle poly list planes", 2);
  r.skipArray("vehicle poly list points", 4);
  r.skipArray("vehicle poly list strings", 1);
  const nullSurfaces = r.array("vehicle null surfaces", 8, () => ({
    windingStart: r.u32(),
    planeIndex: r.u16(),
    flags: r.u8(),
    windingCount: r.u8(),
  }));
  const points = r.array("vehicle points", 12, () => r.vec3());
  const planes = r.array("vehicle planes", 16, () => r.plane());
  const windings = r.array("vehicle windings", 4, () => r.u32());
  r.skipArray("vehicle winding indices", 8);
  r.section = "vehicle collision references";
  const range = (start: number, count: number, length: number) => {
    if (start + count > length)
      r.fail(`invalid range ${start} + ${count} (count ${length})`);
  };
  for (const index of hullIndices)
    r.index(index, points.length, "vehicle hull point");
  // Vehicle windings can contain stale pre-compaction point indices. The
  // executable's getFeatures uses emit strings and hullIndices instead.
  for (const index of hullPlaneIndices)
    r.index(index & 0x7fff, planes.length, "vehicle hull plane");
  for (const index of hullSurfaceIndices) {
    if (!(index & 0x40000000)) r.fail(`invalid vehicle surface flag ${index}`);
    r.index(index & 0x3fffffff, nullSurfaces.length, "vehicle surface");
  }
  for (const surface of nullSurfaces) {
    range(surface.windingStart, surface.windingCount, windings.length);
    r.index(
      surface.planeIndex & 0x7fff,
      planes.length,
      "vehicle surface plane",
    );
  }
  for (const hull of convexHulls) {
    range(hull.hullStart, hull.hullCount, hullIndices.length);
    range(hull.surfaceStart, hull.surfaceCount, hullSurfaceIndices.length);
    range(hull.planeStart, 0, hullPlaneIndices.length);
    range(hull.hullStart, hull.hullCount, emitIndices.length);
  }
  const hullPolygons = convexHulls.map((hull) => {
    const polygons: number[][] = [];
    const seen = new Set<string>();
    const streams = new Set<number>();
    for (let vertex = 0; vertex < hull.hullCount; vertex++) {
      let cursor = emitIndices[hull.hullStart + vertex];
      if (streams.has(cursor)) continue;
      streams.add(cursor);
      const byte = () => {
        if (cursor >= emitStrings.length)
          r.fail("truncated vehicle feature stream");
        return emitStrings[cursor++];
      };
      const remap = Array.from({ length: byte() }, () => {
        const index = byte();
        r.index(index, hull.hullCount, "vehicle feature hull point");
        return hullIndices[hull.hullStart + index];
      });
      const edgeCount = byte();
      for (let i = 0; i < edgeCount * 2; i++)
        r.index(byte(), remap.length, "vehicle feature edge point");
      const polygonCount = byte();
      for (let i = 0; i < polygonCount; i++) {
        const count = byte();
        byte(); // plane slot; vehicle getFeatures derives normals from points
        if (count < 3) r.fail("invalid vehicle feature polygon");
        const polygon = Array.from({ length: count }, () => {
          const index = byte();
          r.index(index, remap.length, "vehicle feature polygon point");
          return remap[index];
        });
        // The same face is emitted from several support vertices.
        const key = [...polygon].sort((a, b) => a - b).join(",");
        if (!seen.has(key)) {
          seen.add(key);
          polygons.push(polygon);
        }
      }
    }
    return polygons;
  });
  return {
    convexHulls,
    hullIndices,
    hullPlaneIndices,
    hullSurfaceIndices,
    nullSurfaces,
    points,
    planes,
    windings,
    hullPolygons,
  };
}

/** Consume v44's resource records to reach vehicle data. The add-on's newer
 * Torque layout differs here; use build 25034's FUN_00526990 and record readers. */
function skipResourceObjects(r: DIFReader): void {
  const triggers = r.count("resource triggers", 25);
  for (let i = 0; i < triggers; i++) {
    r.string();
    r.skipArray("trigger points", 12);
    r.skipArray("trigger planes", 16);
    r.skipArray("trigger edges", 16);
    r.skip(12); // offset
  }
  const paths = r.count("resource paths", 10);
  for (let i = 0; i < paths; i++) {
    r.string();
    r.skipArray("path waypoints", 32); // position, quaternion, msToNext
    r.skip(5); // totalMS, looping
  }
  const followers = r.count("resource path followers", 25);
  for (let i = 0; i < followers; i++) {
    r.string();
    r.skip(20); // interior resource index, path index, offset
    const names = r.count("path follower triggers", 1);
    for (let j = 0; j < names; j++) r.string();
  }
  // This executable consumes only the reserved force-field count, no records.
  r.section = "resource force fields";
  if (r.u32() !== 0) r.fail("unsupported resource force fields");
  const nodes = r.count("resource AI nodes", 13);
  for (let i = 0; i < nodes; i++) {
    r.string();
    r.skip(12);
  }
}

/** Read Tribes 2 interiors, LODs and optional vehicle collision hulls. */
export function parseDIF(buffer: ArrayBuffer): DIFFile {
  const r = new DIFReader(buffer);
  const version = r.u32();
  if (version !== 44)
    r.fail(
      `unsupported resource version ${version}; expected Tribes 2 version 44`,
    );
  if (r.u8() !== 0) r.png(); // optional editor preview
  const count = r.count("detail levels", 4);
  if (count === 0) r.fail("no detail levels");
  const interiors = Array.from({ length: count }, () => readInterior(r));
  const subCount = r.count("subobjects", 4);
  const subObjects = Array.from({ length: subCount }, () => readInterior(r));
  skipResourceObjects(r);
  r.section = "vehicle collision presence";
  const vehicleCollision = r.u32() === 1 ? readVehicleCollision(r) : null;
  r.section = "resource expansion";
  r.u32(); // reserved, ignored by this executable
  return { interiors, subObjects, vehicleCollision };
}
