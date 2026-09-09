/** A tiny authored DIF, independent of Blender and the asset checkout. */
export function createDIFTestBuffer(
  options: {
    details?: number;
    preview?: boolean;
    axisEncoding?: number;
    alarm?: boolean;
    materialNames?: string[];
    surfacePairs?: number;
    /** Closed box with an invisible bottom and a six-plane BSP/hull. */
    collision?: boolean;
    vehicleCollision?: "empty" | "box";
    resourceObjects?: boolean;
  } = {},
) {
  const bytes: number[] = [];
  const offsets: Record<string, number> = {};
  const u8 = (v: number) => bytes.push(v & 255);
  const u16 = (v: number) => {
    u8(v);
    u8(v >>> 8);
  };
  const u32 = (v: number) => {
    u16(v);
    u16(v >>> 16);
  };
  const f32 = (v: number) => {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, v, true);
    bytes.push(...new Uint8Array(buffer));
  };
  const floats = (values: number[]) => values.forEach(f32);
  const string = (text: string) => {
    u8(text.length);
    for (const c of text) u8(c.charCodeAt(0));
  };
  const png = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=",
    ),
    (c) => c.charCodeAt(0),
  );
  const details = options.details ?? 1;
  const collision = options.collision ?? false;
  const surfaceCount = collision ? 5 : (options.surfacePairs ?? 1) * 2;
  const collisionRefs = [0, 0x80000000, 1, 2, 3, 4];
  u32(44);
  u8(options.preview ? 1 : 0);
  if (options.preview) bytes.push(...png);
  u32(details);
  for (let detail = 0; detail < details; detail++) {
    offsets.interiorVersion = bytes.length;
    u32(0);
    u32(detail);
    u32(100 >> detail);
    floats([0, 0, collision ? -2 : 0, 3, 2, 0]); // box
    floats([1.5, 1, 0, 2]); // sphere
    u8(options.alarm ? 1 : 0);
    u32(0); // no animated state entries
    u32(collision ? 6 : 1);
    floats([0, 0, 1]); // normal
    if (collision) floats([0, 0, -1, -1, 0, 0, 1, 0, 0, 0, -1, 0, 0, 1, 0]);
    u32(collision ? 6 : 1);
    for (let i = 0; i < (collision ? 6 : 1); i++) {
      u16(i);
      f32([0, -2, 0, -3, 0, -2][i]);
    }
    u32(collision ? 8 : 4);
    floats([0, 0, 0, 0, 2, 0, 3, 0, 0, 3, 2, 0]);
    if (collision) floats([0, 0, -2, 0, 2, -2, 3, 0, -2, 3, 2, -2]);
    u32(4);
    bytes.push(0, 0, 0, 0); // visibility
    u32(1);
    floats([0.25, 0, 0, 0.125, 0, 0.5, 0, -0.25]);
    u32(collision ? 6 : 0);
    offsets.bspNodes = bytes.length;
    if (collision)
      for (let i = 0; i < 6; i++) {
        u16(i);
        u16(0x8000);
        u16(i === 5 ? 0xc000 : i + 1);
      }
    u32(collision ? 1 : 0);
    if (collision) {
      u32(0);
      u16(6);
    }
    u8(1);
    const names = options.materialNames ?? [
      detail === 0 ? "test" : `test-lod${detail}`,
    ];
    u32(names.length);
    for (const name of names) {
      u8(name.length);
      for (const char of name) u8(char.charCodeAt(0));
    }
    u32(collision ? 24 : 8);
    offsets.pointIndex = bytes.length;
    (collision
      ? [0, 1, 2, 3, 4, 6, 7, 5, 0, 4, 1, 5, 2, 3, 6, 7, 0, 2, 4, 6, 1, 5, 3, 7]
      : [0, 1, 2, 3, 1, 0, 3, 2]
    ).forEach(u32);
    u32(0); // winding indices
    u32(0);
    u32(0);
    u32(0);
    u32(0); // zones, surfaces, portals, portal data
    u32(surfaceCount);
    for (let surface = 0; surface < surfaceCount; surface++) {
      offsets.surface = bytes.length;
      const plane = collision
        ? [0, 2, 3, 4, 5][surface]
        : surface % 2
          ? 0x8000
          : 0;
      u32(collision ? plane * 4 : (surface % 2) * 4);
      u8(4);
      u16(plane);
      u16(0);
      u32(0);
      u8(surface % 2 ? 16 : 0);
      u32(15);
      u16(((options.axisEncoding ?? 0) << 13) | (3 << 6) | 2);
      f32(0.125);
      f32(0.5);
      u16(0);
      u32(0);
      bytes.push(0, 0, 1, 1);
    }
    u32(surfaceCount);
    for (let i = 0; i < surfaceCount; i++) u8(0); // normal maps
    u32(options.alarm ? surfaceCount : 0);
    if (options.alarm) {
      for (let i = 0; i < surfaceCount; i++) u8(1);
    }
    u32(collision ? 1 : 0);
    if (collision) {
      u32(4);
      u16(1);
      u8(0);
      u8(4);
    }
    u32(options.alarm ? 2 : 1);
    offsets.png = bytes.length;
    bytes.push(...png);
    u8(1);
    if (options.alarm) {
      bytes.push(...png);
      u8(1);
    }
    u32(collision ? 6 : 0);
    offsets.solidLeafSurfaces = bytes.length;
    if (collision) collisionRefs.forEach(u32);
    for (let i = 0; i < 3; i++) u32(0); // lights, states, state data
    u32(0);
    u32(0); // state buffer + flags
    u32(0);
    u32(0); // names, mirrors
    u32(collision ? 1 : 0);
    if (collision) {
      u32(0);
      u16(8);
      floats([0, 3, 0, 2, -2, 0]);
      u32(0);
      u16(6);
      u32(0);
      u32(0);
      u32(0);
      u32(0);
    }
    u32(0); // emit strings
    u32(collision ? 8 : 0);
    if (collision) for (let i = 0; i < 8; i++) u32(i);
    u32(collision ? 6 : 0);
    if (collision) for (let i = 0; i < 6; i++) u16(i);
    u32(0); // emit string indices
    u32(collision ? 6 : 0);
    if (collision) collisionRefs.forEach(u32);
    for (let i = 0; i < 3; i++) u32(0); // polygon lists
    for (let i = 0; i < 256; i++) {
      u32(0);
      u32(collision ? 1 : 0);
    }
    u32(collision ? 1 : 0);
    if (collision) u16(0);
    u32(0); // bin indices + mode
    bytes.push(0, 0, 0, 255, 0, 0, 0, 255);
    for (let i = 0; i < 4; i++) u32(0); // extensions
  }
  u32(0); // subobjects
  u32(options.resourceObjects ? 1 : 0);
  if (options.resourceObjects) {
    string("trigger");
    u32(1);
    floats([1, 2, 3]);
    u32(1);
    floats([0, 0, 1, -3]);
    u32(1);
    [0, 0, 0, 0].forEach(u32);
    floats([4, 5, 6]);
  }
  u32(options.resourceObjects ? 1 : 0);
  if (options.resourceObjects) {
    string("path");
    u32(1);
    floats([1, 2, 3, 0, 0, 0, 1]);
    u32(100);
    u32(100);
    u8(1);
  }
  u32(options.resourceObjects ? 1 : 0);
  if (options.resourceObjects) {
    string("follower");
    u32(0);
    u32(0);
    floats([1, 2, 3]);
    u32(1);
    string("trigger");
  }
  u32(0); // reserved force fields
  u32(options.resourceObjects ? 1 : 0);
  if (options.resourceObjects) {
    string("node");
    floats([1, 2, 3]);
  }
  offsets.vehiclePresence = bytes.length;
  u32(options.vehicleCollision ? 1 : 0);
  if (options.vehicleCollision) {
    offsets.vehicleVersion = bytes.length;
    u32(0);
    const box = options.vehicleCollision === "box";
    u32(box ? 1 : 0);
    if (box) {
      u32(0);
      u16(8);
      floats([0, 1, 0, 2, -2, 0]);
      u32(0);
      u16(6);
      u32(0);
      u32(0);
      u32(0);
      u32(0);
    }
    const polygons = [
      [0, 1, 3, 2],
      [4, 6, 7, 5],
      [0, 4, 5, 1],
      [2, 3, 7, 6],
      [0, 2, 6, 4],
      [1, 5, 7, 3],
    ];
    const hullPoints = [2, 0, 3, 1, 6, 4, 7, 5];
    const featureStream = (faces: number[]) => [
      8,
      ...Array.from({ length: 8 }, (_, i) => hullPoints.indexOf(i)),
      3,
      0,
      1,
      1,
      3,
      3,
      2, // edge references into the emitted points
      faces.length,
      ...faces.flatMap((i) => [4, 255, ...polygons[i]]), // vehicle plane slot is unused
    ];
    const first = featureStream([0, 1, 2, 3]);
    const emit = [...first, ...featureStream([2, 3, 4, 5])];
    u32(box ? emit.length : 0);
    offsets.vehicleEmit = bytes.length;
    if (box) bytes.push(...emit);
    u32(box ? 8 : 0);
    offsets.vehicleHullIndices = bytes.length;
    if (box) hullPoints.forEach(u32);
    u32(box ? 6 : 0);
    if (box) for (let i = 0; i < 6; i++) u16(i);
    u32(box ? 8 : 0);
    offsets.vehicleEmitIndices = bytes.length;
    if (box) for (let i = 0; i < 8; i++) u32(i < 4 ? 0 : first.length);
    u32(box ? 6 : 0);
    offsets.vehicleSurfaceIndices = bytes.length;
    if (box) for (let i = 0; i < 6; i++) u32(0xc0000000 | i);
    for (let i = 0; i < 3; i++) u32(0); // polygon-list acceleration arrays
    u32(box ? 6 : 0);
    if (box)
      for (let i = 0; i < 6; i++) {
        u32(i * 4);
        u16(i);
        u8(0);
        u8(4);
      }
    u32(box ? 8 : 0);
    if (box)
      floats([
        0, 0, 0, 0, 2, 0, 1, 0, 0, 1, 2, 0, 0, 0, -2, 0, 2, -2, 1, 0, -2, 1, 2,
        -2,
      ]);
    u32(box ? 6 : 0);
    if (box)
      floats([
        0, 0, 1, 0, 0, 0, -1, -2, -1, 0, 0, 0, 1, 0, 0, -1, 0, -1, 0, 0, 0, 1,
        0, -2,
      ]);
    u32(box ? 24 : 0);
    // Real files can retain pre-compaction winding indices: contact geometry
    // must use feature streams, not these authoring records.
    if (box) polygons.flat().forEach((index) => u32(index + 100));
    u32(0); // winding indices
  }
  u32(0); // resource expansion
  return { buffer: new Uint8Array(bytes).buffer, offsets, png };
}
