/** DTS 15–26, following io_scene_dtst3d and TSShape::read/assembleShape. */
import {
  DTSAllocation,
  DTSStream,
  readDTSSet,
  type DTSNumbers,
} from "./dtsReader";
import { dtsBounds, dtsVec3, readDTSMesh, readOldDTSMesh } from "./dtsMesh";
import {
  DTSMeshType,
  DTSSequenceFlags,
  type DTSDetail,
  type DTSMaterialData,
  type DTSObjectState,
  type DTSSequence,
  type DTSShapeData,
} from "./dtsTypes";

export function readDTSSequence(
  r: DTSStream,
  version: number,
  nameIndex = r.i32(),
): DTSSequence {
  let flags = version > 21 ? r.u32() : 0;
  const first = r.u32();
  const numKeyframes = version < 17 ? r.u32() - first : first;
  if (numKeyframes < 0) r.fail("invalid sequence keyframe range");
  const duration = r.f32();
  if (version < 22) {
    if (r.u8()) flags |= DTSSequenceFlags.Blend;
    if (r.u8()) flags |= DTSSequenceFlags.Cyclic;
    if (r.u8()) flags |= DTSSequenceFlags.MakePath;
  }
  const priority = r.i32(),
    firstGroundFrame = r.i32(),
    numGroundFrames = r.u32();
  let baseRotation = 0,
    baseTranslation = 0,
    baseScale = 0,
    baseObjectState = 0,
    baseDecalState = 0;
  if (version > 21) {
    baseRotation = r.i32();
    baseTranslation = r.i32();
    baseScale = r.i32();
    baseObjectState = r.i32();
    baseDecalState = r.i32();
  } else if (version >= 17) {
    baseRotation = baseTranslation = r.i32();
    baseObjectState = r.i32();
    baseDecalState = r.i32();
  }
  const firstTrigger = r.i32(),
    numTriggers = r.u32(),
    toolBegin = r.f32();
  const rotationMatters = readDTSSet(r);
  const translationMatters =
    version < 22 ? rotationMatters.slice() : readDTSSet(r);
  const scaleMatters = version < 22 ? [] : readDTSSet(r);
  if (version < 17) readDTSSet(r); // obsolete object membership
  const decalMatters = readDTSSet(r),
    iflMatters = readDTSSet(r),
    visibilityMatters = readDTSSet(r),
    frameMatters = readDTSSet(r),
    materialFrameMatters = readDTSSet(r);
  if (version < 17) readDTSSet(r); // obsolete static transforms
  return {
    nameIndex,
    flags,
    numKeyframes,
    duration,
    priority,
    firstGroundFrame,
    numGroundFrames,
    baseRotation,
    baseTranslation,
    baseScale,
    baseObjectState,
    baseDecalState,
    firstTrigger,
    numTriggers,
    toolBegin,
    rotationMatters,
    translationMatters,
    scaleMatters,
    decalMatters,
    iflMatters,
    visibilityMatters,
    frameMatters,
    materialFrameMatters,
    ...(version < 17 ? { oldStartKeyframe: first } : {}),
  };
}

function readMaterials(r: DTSStream, version: number): DTSMaterialData[] {
  const materialVersion = r.u8();
  if (materialVersion !== 1)
    r.fail(`unsupported material list version ${materialVersion}`);
  const materials = Array.from({ length: r.count() }, () => ({
    name: r.string(r.u8()),
    flags: 0,
    reflectanceMap: -1,
    bumpMap: -1,
    detailMap: -1,
    detailScale: 1,
    reflectionAmount: 1,
  }));
  for (const m of materials) m.flags = r.u32();
  for (const m of materials) m.reflectanceMap = r.i32();
  for (const m of materials) m.bumpMap = r.i32();
  for (const m of materials) m.detailMap = r.i32();
  if (version === 25) r.ints(materials.length); // obsolete lightmap maps
  if (version > 11) for (const m of materials) m.detailScale = r.f32();
  if (version > 20) for (const m of materials) m.reflectionAmount = r.f32();
  return materials;
}

function emptyShape(version: number, exporterVersion: number): DTSShapeData {
  return {
    version,
    exporterVersion,
    radius: 0,
    tubeRadius: 0,
    center: [0, 0, 0],
    bounds: { min: [0, 0, 0], max: [0, 0, 0] },
    smallestVisibleSize: 0,
    smallestVisibleDetail: -1,
    nodes: [],
    objects: [],
    decals: [],
    iflMaterials: [],
    subShapes: [],
    defaultRotations: new Int16Array(),
    defaultTranslations: new Float32Array(),
    rotations: new Int16Array(),
    translations: new Float32Array(),
    uniformScales: new Float32Array(),
    alignedScales: new Float32Array(),
    arbitraryScaleFactors: new Float32Array(),
    arbitraryScaleRotations: new Int16Array(),
    groundTranslations: new Float32Array(),
    groundRotations: new Int16Array(),
    objectStates: [],
    decalStates: new Int32Array(),
    triggers: [],
    details: [],
    meshes: [],
    names: [],
    materials: [],
    skinDetails: [],
    sequences: [],
  };
}

const objectState = (r: DTSNumbers): DTSObjectState => ({
  visibility: r.f32(),
  frame: r.i32(),
  materialFrame: r.i32(),
});
function readDetail(r: DTSNumbers, version: number, legacy = false): DTSDetail {
  const detail: DTSDetail = {
    nameIndex: r.i32(),
    subShape: r.i32(),
    objectDetail: r.i32(),
    size: r.f32(),
    averageError: legacy ? -1 : r.f32(),
    maxError: legacy ? -1 : r.f32(),
    polyCount: legacy ? 0 : r.i32(),
  };
  if (version >= 26)
    detail.billboard = {
      dimension: r.i32(),
      detailLevel: r.i32(),
      equatorSteps: r.i32(),
      polarSteps: r.i32(),
      polarAngle: r.f32(),
      includePoles: r.i32() !== 0,
    };
  if (detail.subShape < 0 && version < 26) {
    const bits = detail.objectDetail >>> 0;
    detail.billboard = {
      equatorSteps: bits & 0x7f,
      polarSteps: (bits >>> 7) & 0x3f,
      polarAngle: (Math.PI / 128) * ((bits >>> 13) & 0x3f),
      detailLevel: (bits >>> 19) & 15,
      dimension: (bits >>> 23) & 255,
      includePoles: !!(bits & 0x80000000),
    };
  }
  return detail;
}

function readModernShape(stream: DTSStream, shape: DTSShapeData) {
  const r = new DTSAllocation(stream),
    v = shape.version;
  const nodes = r.count(),
    objects = r.count(),
    decals = r.count(),
    subShapes = r.count(),
    ifls = r.count();
  const rotations = v < 22 ? r.count() - nodes : r.count();
  const translations = v < 22 ? rotations : r.count();
  const uniform = v < 22 ? 0 : r.count(),
    aligned = v < 22 ? 0 : r.count(),
    arbitrary = v < 22 ? 0 : r.count();
  const ground = v > 23 ? r.count() : 0;
  const objectStates = r.count(),
    decalStates = r.count(),
    triggers = r.count(),
    details = r.count(),
    meshes = r.count();
  const skins = v < 23 ? r.count() : 0,
    names = r.count();
  shape.smallestVisibleSize = r.i32();
  shape.smallestVisibleDetail = r.i32();
  r.guard();
  shape.radius = r.f32();
  shape.tubeRadius = r.f32();
  shape.center = dtsVec3(r);
  shape.bounds = dtsBounds(r);
  r.guard();
  shape.nodes = Array.from({ length: nodes }, () => {
    const node = { nameIndex: r.i32(), parentIndex: r.i32() };
    r.ints(3);
    return node;
  });
  r.guard();
  shape.objects = Array.from({ length: objects }, () => {
    const object = {
      nameIndex: r.i32(),
      numMeshes: r.count(),
      startMeshIndex: r.i32(),
      nodeIndex: r.i32(),
    };
    r.ints(2);
    return object;
  });
  r.ints(skins * 6); // legacy runtime skin-object storage
  r.guard();
  shape.decals = Array.from({ length: decals }, () => {
    const decal = {
      nameIndex: r.i32(),
      numMeshes: r.count(),
      startMeshIndex: r.i32(),
      objectIndex: r.i32(),
    };
    r.i32();
    return decal;
  });
  r.guard();
  shape.iflMaterials = Array.from({ length: ifls }, () => ({
    nameIndex: r.i32(),
    materialSlot: r.i32(),
    firstFrame: r.i32(),
    firstFrameOffTimeIndex: r.i32(),
    numFrames: r.i32(),
  }));
  r.guard();
  shape.subShapes = Array.from({ length: subShapes }, () => ({
    firstNode: 0,
    numNodes: 0,
    firstObject: 0,
    numObjects: 0,
    firstDecal: 0,
    numDecals: 0,
  }));
  for (const s of shape.subShapes) s.firstNode = r.i32();
  for (const s of shape.subShapes) s.firstObject = r.i32();
  for (const s of shape.subShapes) s.firstDecal = r.i32();
  r.guard();
  for (const s of shape.subShapes) s.numNodes = r.count();
  for (const s of shape.subShapes) s.numObjects = r.count();
  for (const s of shape.subShapes) s.numDecals = r.count();
  r.guard();
  shape.defaultRotations = r.shorts(nodes * 4);
  shape.defaultTranslations = r.floats(nodes * 3);
  shape.translations = r.floats(translations * 3);
  shape.rotations = r.shorts(rotations * 4);
  r.guard();
  if (v > 21) {
    shape.uniformScales = r.floats(uniform);
    shape.alignedScales = r.floats(aligned * 3);
    shape.arbitraryScaleFactors = r.floats(arbitrary * 3);
    shape.arbitraryScaleRotations = r.shorts(arbitrary * 4);
    r.guard();
  }
  if (v > 23) {
    shape.groundTranslations = r.floats(ground * 3);
    shape.groundRotations = r.shorts(ground * 4);
    r.guard();
  }
  shape.objectStates = Array.from({ length: objectStates }, () =>
    objectState(r),
  );
  r.guard();
  shape.decalStates = r.ints(decalStates);
  r.guard();
  shape.triggers = Array.from({ length: triggers }, () => ({
    state: r.u32(),
    position: r.f32(),
  }));
  r.guard();
  shape.details = Array.from({ length: details }, () => readDetail(r, v));
  r.guard();
  shape.meshes = Array.from({ length: meshes }, () =>
    readDTSMesh(r, v, r.u32()),
  );
  r.guard();
  shape.names = Array.from({ length: names }, () => r.lane8.cstring());
  r.guard();
  if (v < 23) {
    const first = r.ints(details),
      count = r.ints(details);
    shape.skinDetails = Array.from({ length: details }, (_, i) => ({
      first: meshes + first[i],
      count: count[i],
    }));
    r.guard();
    for (let i = 0; i < skins; i++)
      shape.meshes.push(readDTSMesh(r, v, DTSMeshType.Skin));
    r.guard();
  }
  shape.sequences = Array.from({ length: stream.count() }, () =>
    readDTSSequence(stream, v),
  );
  shape.materials = readMaterials(stream, v);
}

function readOldShape(r: DTSStream, shape: DTSShapeData) {
  const v = shape.version;
  shape.radius = r.f32();
  shape.tubeRadius = r.f32();
  shape.center = dtsVec3(r);
  shape.bounds = dtsBounds(r);
  shape.nodes = Array.from({ length: r.count(8) }, () => {
    const n = { nameIndex: r.i32(), parentIndex: r.i32() };
    if (v < 17) r.u8();
    return n;
  });
  shape.objects = Array.from({ length: r.count(16) }, () => ({
    nameIndex: r.i32(),
    numMeshes: r.count(),
    startMeshIndex: r.i32(),
    nodeIndex: r.i32(),
  }));
  shape.decals = Array.from({ length: r.count(16) }, () => ({
    nameIndex: r.i32(),
    numMeshes: r.count(),
    startMeshIndex: r.i32(),
    objectIndex: r.i32(),
  }));
  shape.iflMaterials = Array.from({ length: r.count(8) }, () => ({
    nameIndex: r.i32(),
    materialSlot: r.i32(),
    firstFrame: 0,
    firstFrameOffTimeIndex: 0,
    numFrames: 0,
  }));
  const subShapes = r.count(4);
  const firstNodes = r.ints(subShapes);
  r.u32();
  const firstObjects = r.ints(subShapes);
  r.u32();
  const firstDecals = r.ints(subShapes);
  shape.subShapes = Array.from({ length: subShapes }, (_, i) => ({
    firstNode: firstNodes[i],
    numNodes: (firstNodes[i + 1] ?? shape.nodes.length) - firstNodes[i],
    firstObject: firstObjects[i],
    numObjects: (firstObjects[i + 1] ?? shape.objects.length) - firstObjects[i],
    firstDecal: firstDecals[i],
    numDecals: (firstDecals[i + 1] ?? shape.decals.length) - firstDecals[i],
  }));
  if (v < 16) r.ints(r.count(4));
  const oldKeyframes =
    v < 17
      ? Array.from({ length: r.count(12) }, () => ({
          node: r.i32(),
          object: r.i32(),
          decal: r.i32(),
        }))
      : [];
  const states = r.count(20),
    allRotations = new Int16Array(states * 4),
    allTranslations = new Float32Array(states * 3);
  for (let i = 0; i < states; i++) {
    allRotations.set(r.shorts(4), i * 4);
    allTranslations.set(r.floats(3), i * 3);
  }
  shape.defaultRotations = allRotations.subarray(0, shape.nodes.length * 4);
  shape.defaultTranslations = allTranslations.subarray(
    0,
    shape.nodes.length * 3,
  );
  shape.objectStates = Array.from({ length: r.count(12) }, () =>
    objectState(r),
  );
  shape.decalStates = r.ints(r.count(4));
  shape.triggers = Array.from({ length: r.count(8) }, () => ({
    state: r.u32(),
    position: r.f32(),
  }));
  shape.details = Array.from({ length: r.count(16) }, () =>
    readDetail(r, v, true),
  );
  shape.sequences = Array.from({ length: r.count() }, () =>
    readDTSSequence(r, v),
  );
  shape.meshes = Array.from({ length: r.count() }, () =>
    readOldDTSMesh(r, v, r.u32()),
  );
  shape.names = Array.from({ length: r.count(4) }, () => r.string(r.count()));
  if (r.u32()) shape.materials = readMaterials(r, v);
  const firstSkin = shape.meshes.length,
    skins = r.count();
  for (let i = 0; i < skins; i++)
    shape.meshes.push(readOldDTSMesh(r, v, DTSMeshType.Skin));
  if (skins) {
    r.u32();
    const first = r.ints(shape.details.length);
    shape.skinDetails = Array.from({ length: first.length }, (_, i) => ({
      first: firstSkin + first[i],
      count: (first[i + 1] ?? skins) - first[i],
    }));
  }
  if (v < 22) moveGroundFrames(shape, allTranslations, allRotations, 0);
  if (v >= 17) {
    shape.rotations = allRotations.subarray(shape.nodes.length * 4);
    shape.translations = allTranslations.subarray(shape.nodes.length * 3);
  } else {
    const rotations: number[] = [],
      translations: number[] = [];
    const oldObjects = shape.objectStates.slice(),
      oldDecals = shape.decalStates;
    const decals = Array.from(oldDecals);
    for (const seq of shape.sequences) {
      seq.baseRotation = rotations.length / 4;
      seq.baseTranslation = translations.length / 3;
      for (let slot = 0; slot < seq.rotationMatters.length; slot++)
        for (let k = 0; k < seq.numKeyframes; k++) {
          const key = oldKeyframes[(seq.oldStartKeyframe ?? 0) + k];
          if (!key || key.node + slot >= states)
            r.fail("invalid legacy node keyframe");
          rotations.push(
            ...allRotations.subarray(
              (key.node + slot) * 4,
              (key.node + slot + 1) * 4,
            ),
          );
          translations.push(
            ...allTranslations.subarray(
              (key.node + slot) * 3,
              (key.node + slot + 1) * 3,
            ),
          );
        }
      seq.baseObjectState = shape.objectStates.length;
      const members = new Set([
        ...seq.visibilityMatters,
        ...seq.frameMatters,
        ...seq.materialFrameMatters,
      ]);
      for (let slot = 0; slot < members.size; slot++)
        for (let k = 0; k < seq.numKeyframes; k++) {
          const key = oldKeyframes[(seq.oldStartKeyframe ?? 0) + k];
          const state = key && oldObjects[key.object + slot];
          if (!state) r.fail("invalid legacy object keyframe");
          shape.objectStates.push(state);
        }
      seq.baseDecalState = decals.length;
      for (let slot = 0; slot < seq.decalMatters.length; slot++)
        for (let k = 0; k < seq.numKeyframes; k++) {
          const key = oldKeyframes[(seq.oldStartKeyframe ?? 0) + k];
          if (!key || key.decal + slot >= oldDecals.length)
            r.fail("invalid legacy decal keyframe");
          decals.push(oldDecals[key.decal + slot]);
        }
      delete seq.oldStartKeyframe;
    }
    shape.rotations = new Int16Array(rotations);
    shape.translations = new Float32Array(translations);
    shape.decalStates = new Int32Array(decals);
  }
  for (let i = 0; i < shape.details.length; i++)
    if (shape.details[i].size >= 0) {
      shape.smallestVisibleDetail = i;
      shape.smallestVisibleSize = shape.details[i].size;
    }
}

function moveGroundFrames(
  shape: DTSShapeData,
  translations: Float32Array,
  rotations: Int16Array,
  defaults: number,
) {
  const count = shape.sequences.reduce((n, seq) => n + seq.numGroundFrames, 0);
  shape.groundTranslations = new Float32Array(count * 3);
  shape.groundRotations = new Int16Array(count * 4);
  let offset = 0;
  for (const seq of shape.sequences) {
    const start = seq.firstGroundFrame - defaults,
      end = start + seq.numGroundFrames;
    if (seq.numGroundFrames) {
      if (
        start < 0 ||
        end * 3 > translations.length ||
        end * 4 > rotations.length
      )
        throw new Error("DTS: invalid legacy ground frame range");
      shape.groundTranslations.set(
        translations.subarray(start * 3, end * 3),
        offset * 3,
      );
      shape.groundRotations.set(
        rotations.subarray(start * 4, end * 4),
        offset * 4,
      );
    }
    seq.firstGroundFrame = offset;
    offset += seq.numGroundFrames;
  }
}

export function parseDTS(buffer: ArrayBuffer): DTSShapeData {
  const r = new DTSStream(buffer),
    header = r.u32(),
    version = header & 255;
  if (version < 15 || version > 26)
    r.fail(`unsupported DTS version ${version}; expected 15–26`);
  const shape = emptyShape(version, header >>> 16);
  if (version < 19) readOldShape(r, shape);
  else readModernShape(r, shape);
  if (version >= 19 && version < 22)
    moveGroundFrames(
      shape,
      shape.translations,
      shape.rotations,
      shape.nodes.length,
    );
  // 17–21 offsets include default transforms. 15/16 were normalized above.
  if (version >= 17 && version < 22)
    for (const seq of shape.sequences) {
      seq.baseRotation -= shape.nodes.length;
      seq.baseTranslation -= shape.nodes.length;
    }
  for (let i = 0; i < shape.meshes.length; i++) {
    const mesh = shape.meshes[i];
    if (mesh.parentMesh >= 0) {
      if (mesh.parentMesh >= i)
        r.fail(`invalid parent mesh ${mesh.parentMesh} for mesh ${i}`);
      const parent = shape.meshes[mesh.parentMesh];
      mesh.vertices = parent.vertices;
      mesh.normals = parent.normals;
      mesh.encodedNormals = parent.encodedNormals;
      mesh.uv = parent.uv;
      mesh.uv2 = parent.uv2;
      mesh.colors = parent.colors;
      if (mesh.skin && parent.skin) mesh.skin = parent.skin;
    }
  }
  if (version === 22 || version === 23)
    for (const seq of shape.sequences) seq.groundFramesAvailable = false;
  validateDTS(shape);
  return shape;
}

/** Fail at load time rather than producing broken tracks or GPU buffer reads. */
export function validateDTS(shape: DTSShapeData): void {
  const fail = (message: string): never => {
    throw new Error(`DTS v${shape.version}: ${message}`);
  };
  const ref = (
    index: number,
    length: number,
    label: string,
    optional = false,
  ) => {
    if (
      !Number.isInteger(index) ||
      index < (optional ? -1 : 0) ||
      index >= length
    )
      fail(`invalid ${label} index ${index} (count ${length})`);
  };
  for (let i = 0; i < shape.nodes.length; i++) {
    const n = shape.nodes[i];
    ref(n.nameIndex, shape.names.length, "node name");
    ref(n.parentIndex, i, "node parent", true);
  }
  for (const o of shape.objects) {
    ref(o.nameIndex, shape.names.length, "object name");
    ref(o.nodeIndex, shape.nodes.length, "object node", true);
    if (
      o.startMeshIndex < 0 ||
      o.startMeshIndex + o.numMeshes > shape.meshes.length
    )
      fail("invalid object mesh range");
  }
  for (const mesh of shape.meshes) {
    if (mesh.type === DTSMeshType.Null || mesh.type === DTSMeshType.Decal)
      continue;
    const vertexCount = mesh.verticesPerFrame || mesh.vertices.length / 3;
    for (const p of mesh.primitives) {
      const end = p.start + p.count;
      if (
        p.start < 0 ||
        end > (p.material & 0x20000000 ? mesh.indices.length : vertexCount)
      )
        fail("invalid primitive range");
      if (!(p.material & 0x10000000))
        ref(
          p.material & 0x0fffffff,
          shape.materials.length,
          "primitive material",
        );
    }
    for (const index of mesh.indices) ref(index, vertexCount, "vertex");
    if (mesh.mergeIndices.length > vertexCount) fail("too many merge vertices");
    for (const index of mesh.mergeIndices)
      ref(index, vertexCount, "merge vertex");
    if (mesh.skin) {
      for (const node of mesh.skin.nodeIndices)
        ref(node, shape.nodes.length, "skin node");
      for (const bone of mesh.skin.boneIndices)
        ref(bone, mesh.skin.nodeIndices.length, "skin bone");
      for (const vertex of mesh.skin.vertexIndices)
        ref(
          vertex,
          mesh.skin.initialVertices.length / 3 || vertexCount,
          "skin vertex",
        );
    }
  }
  for (const s of shape.sequences) {
    ref(s.nameIndex, shape.names.length, "sequence name");
    // Some shipped bitsets have trailing set bits beyond the shape's tables.
    // Torque iterates the actual nodes/objects, so those bits consume no states.
    const nodeCount = (set: number[]) =>
      set.filter((i) => i < shape.nodes.length).length;
    const range = (
      base: number,
      count: number,
      length: number,
      label: string,
    ) => {
      if (count && (base < 0 || base + count > length))
        fail(`invalid ${label} keyframe range ${base} + ${count} / ${length}`);
    };
    range(
      s.baseRotation,
      nodeCount(s.rotationMatters) * s.numKeyframes,
      shape.rotations.length / 4,
      "rotation",
    );
    range(
      s.baseTranslation,
      nodeCount(s.translationMatters) * s.numKeyframes,
      shape.translations.length / 3,
      "translation",
    );
    const scales =
      s.flags & DTSSequenceFlags.UniformScale
        ? shape.uniformScales.length
        : s.flags & DTSSequenceFlags.AlignedScale
          ? shape.alignedScales.length / 3
          : shape.arbitraryScaleFactors.length / 3;
    range(
      s.baseScale,
      nodeCount(s.scaleMatters) * s.numKeyframes,
      scales,
      "scale",
    );
    if (s.groundFramesAvailable !== false) {
      range(
        s.firstGroundFrame,
        s.numGroundFrames,
        shape.groundTranslations.length / 3,
        "ground translation",
      );
      range(
        s.firstGroundFrame,
        s.numGroundFrames,
        shape.groundRotations.length / 4,
        "ground rotation",
      );
    }
    range(s.firstTrigger, s.numTriggers, shape.triggers.length, "trigger");
    range(
      s.baseDecalState,
      s.decalMatters.filter((i) => i < shape.decals.length).length *
        s.numKeyframes,
      shape.decalStates.length,
      "decal",
    );
    range(
      s.baseObjectState,
      new Set(
        [
          ...s.visibilityMatters,
          ...s.frameMatters,
          ...s.materialFrameMatters,
        ].filter((i) => i < shape.objects.length),
      ).size * s.numKeyframes,
      shape.objectStates.length,
      "object",
    );
  }
}
