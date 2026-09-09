import { describe, expect, it } from "vitest";
import {
  AdditiveAnimationBlendMode,
  AnimationMixer,
  PerspectiveCamera,
  Vector3,
} from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { buildDTS } from "./dtsBuilder";
import { createDTSSequence, createDTSTestShape } from "./dtsTestFixtures";
import { dtsTriangles } from "./dtsGeometry";
import { DTSMesh, DTSShape, DTSObject } from "./dtsModel";

const camera = new PerspectiveCamera();
camera.position.z = 10;
camera.updateMatrixWorld();
describe("native DTS Three objects", () => {
  it("preserves source normals, winding, and texture coordinates", () => {
    const { scene, bounds } = buildDTS(createDTSTestShape());
    const meshes: DTSMesh[] = [];
    scene.traverse((n) => {
      if (n instanceof DTSMesh) meshes.push(n);
    });
    expect(meshes).toHaveLength(1);
    const geometry = meshes[0].geometry;
    expect(Array.from(geometry.index!.array)).toEqual([2, 1, 0]);
    expect(
      Array.from(geometry.getAttribute("normal").array, (n) => n || 0),
    ).toEqual([0, -1, 0, 0, -1, 0, 0, -1, 0]);
    expect(Array.from(geometry.getAttribute("uv").array)).toEqual([
      0, 0, 1, 0, 0.5, 1,
    ]);
    expect(bounds.min.toArray()).toEqual([-1, 0, -1]);
    expect(scene.userData).toEqual({});
    expect((meshes[0].material as any).userData).toEqual({});
  });
  it("supports indexed strips, fans, and nonindexed triangles", () => {
    const mesh = createDTSTestShape().meshes[0];
    mesh.indices = new Uint16Array([0, 1, 2, 3]);
    expect(
      Array.from(
        dtsTriangles(mesh, { start: 0, count: 4, material: 0x60000000 }),
      ),
    ).toEqual([2, 1, 0, 3, 1, 2]);
    expect(
      Array.from(
        dtsTriangles(mesh, { start: 0, count: 4, material: 0xa0000000 }),
      ),
    ).toEqual([2, 1, 0, 3, 2, 0]);
    expect(
      Array.from(dtsTriangles(mesh, { start: 2, count: 3, material: 0 })),
    ).toEqual([4, 3, 2]);
  });
  it("closes cyclic clips at duration and clamps noncyclic clips at their last key", () => {
    const data = createDTSTestShape();
    data.translations = new Float32Array([0, 0, 0, 2, 0, 0]);
    data.sequences = [
      createDTSSequence({
        numKeyframes: 2,
        translationMatters: [0],
        flags: 16,
        duration: 2,
      }),
    ];
    const model = buildDTS(data);
    expect(Array.from(model.animations[0].tracks[0].times)).toEqual([0, 1, 2]);
    expect(
      Array.from(model.animations[0].tracks[0].values, (n) => n || 0),
    ).toEqual([0, 0, 0, -2, 0, 0, 0, 0, 0]);
    data.sequences[0].flags = 0;
    expect(Array.from(buildDTS(data).animations[0].tracks[0].times)).toEqual([
      0, 2,
    ]);
  });
  it("postmultiplies blend translation by the current pose", () => {
    const data = createDTSTestShape();
    // Torque +90° Z quaternion is clockwise in the source basis.
    data.defaultRotations = new Int16Array([0, 0, 23170, 23170]);
    data.translations = new Float32Array([1, 0, 0]);
    data.sequences = [
      createDTSSequence({ numKeyframes: 1, translationMatters: [0], flags: 8 }),
    ];
    const model = buildDTS(data),
      mixer = new AnimationMixer(model.scene);
    expect(model.animations[0].blendMode).toBe(AdditiveAnimationBlendMode);
    mixer.clipAction(model.animations[0]).play();
    mixer.update(0);
    model.scene.updateMatrixWorld(true);
    const position = model.nodes[0].getWorldPosition(new Vector3());
    expect(position.x).toBeCloseTo(0);
    expect(position.y).toBeCloseTo(0);
    expect(position.z).toBeCloseTo(-1);
  });
  it("clones geometry buffers but isolates instance animation state", () => {
    const data = createDTSTestShape();
    data.objectStates.push(
      { visibility: 0.2, frame: 0, materialFrame: 0 },
      { visibility: 0.8, frame: 0, materialFrame: 0 },
    );
    data.sequences = [
      createDTSSequence({
        numKeyframes: 2,
        visibilityMatters: [0],
        baseObjectState: 1,
      }),
    ];
    const model = buildDTS(data),
      instance = clone(model.scene) as DTSShape;
    const mixer = new AnimationMixer(instance);
    mixer.clipAction(model.animations[0]).play();
    mixer.setTime(0.5);
    instance.updateMatrixWorld();
    instance.update(camera);
    let original!: DTSMesh, copied!: DTSMesh;
    model.scene.traverse((n) => {
      if (n instanceof DTSMesh) original = n;
    });
    instance.traverse((n) => {
      if (n instanceof DTSMesh) copied = n;
    });
    expect(copied.geometry).toBe(original.geometry);
    expect((copied.material as any).opacity).toBeCloseTo(0.5);
    expect((original.material as any).opacity).toBe(1);
  });
});

it("switches binary visibility and applies blend object states relative to defaults", () => {
  const data = createDTSTestShape();
  data.objectStates.push(
    { visibility: 0, frame: 0, materialFrame: 0 },
    { visibility: 1, frame: 0, materialFrame: 0 },
  );
  data.sequences = [
    createDTSSequence({
      flags: 8,
      numKeyframes: 2,
      duration: 1,
      visibilityMatters: [0],
      baseObjectState: 1,
    }),
  ];
  const model = buildDTS(data),
    mixer = new AnimationMixer(model.scene);
  const object = model.scene.getObjectByName("__dts_object_0") as DTSObject;
  mixer.clipAction(model.animations[0]).play();
  mixer.setTime(0.49);
  expect(object.opacity).toBe(0);
  mixer.setTime(0.5);
  expect(object.opacity).toBe(1);
});

it("selects details using projected radius and the supplied camera", () => {
  const data = createDTSTestShape();
  data.radius = 1;
  data.details[0].size = 60;
  data.details.push({ ...data.details[0], size: 10 });
  data.smallestVisibleSize = 5;
  const { scene } = buildDTS(data);
  scene.viewportHeight = 1000;
  const view = new PerspectiveCamera(90, 1, 0.1, 1000);
  view.position.z = 10;
  view.updateMatrixWorld();
  expect(scene.selectDetail(view)).toBe(1);
  view.position.z = 1;
  view.updateMatrixWorld();
  expect(scene.selectDetail(view)).toBe(0);
  view.position.z = 1000;
  view.updateMatrixWorld();
  expect(scene.selectDetail(view)).toBe(-1);
});

it("merges LOD vertices and UVs without mutating shared frames", () => {
  const data = createDTSTestShape();
  data.meshes[0].mergeIndices = new Uint16Array([0]);
  const model = buildDTS(data),
    instance = clone(model.scene) as DTSShape;
  let mesh!: DTSMesh;
  instance.traverse((node) => {
    if (node instanceof DTSMesh) mesh = node;
  });
  instance.intraDetailLevel = 0;
  instance.update(camera);
  const position = mesh.geometry.getAttribute("position");
  expect(new Vector3().fromBufferAttribute(position, 2)).toEqual(
    new Vector3().fromBufferAttribute(position, 0),
  );
  expect(mesh.geometry.getAttribute("uv").getX(2)).toBe(0);
  expect(mesh.binding!.frames.uv[0].getX(2)).toBe(0.5);
  instance.intraDetailLevel = 1;
  instance.update(camera);
  expect(mesh.geometry.getAttribute("uv").getX(2)).toBe(0.5);
  expect(mesh.geometry.getAttribute("position")).toBe(
    mesh.binding!.frames.positions[0],
  );
});

it("renders NoMaterial primitives untextured instead of hiding their triangles", () => {
  const data = createDTSTestShape();
  data.meshes[0].primitives[0].material = 0x30000000;
  const { scene } = buildDTS(data);
  let mesh!: DTSMesh;
  scene.traverse((node) => {
    if (node instanceof DTSMesh) mesh = node;
  });
  expect((mesh.material as any).visible).toBe(true);
  expect((mesh.material as any).map).toBeNull();
  expect(mesh.geometry.index!.count).toBe(3);
});

it("selects version 26 secondary UV and color frames", () => {
  const data = createDTSTestShape(26),
    mesh = data.meshes[0];
  mesh.numFrames = mesh.numMaterialFrames = 2;
  mesh.vertices = new Float32Array([...mesh.vertices, ...mesh.vertices]);
  mesh.normals = new Float32Array([...mesh.normals, ...mesh.normals]);
  mesh.uv = new Float32Array([...mesh.uv, ...mesh.uv]);
  mesh.uv2 = new Float32Array([...mesh.uv.subarray(0, 6), 1, 1, 1, 1, 1, 1]);
  mesh.colors = new Uint32Array([
    0xff0000ff, 0xff0000ff, 0xff0000ff, 0xff00ff00, 0xff00ff00, 0xff00ff00,
  ]);
  const model = buildDTS(data);
  const object = model.scene.getObjectByName("__dts_object_0") as DTSObject;
  object.frame = object.materialFrame = 1;
  model.scene.update(camera);
  let rendered!: DTSMesh;
  model.scene.traverse((node) => {
    if (node instanceof DTSMesh) rendered = node;
  });
  expect(rendered.geometry.getAttribute("uv1").getX(0)).toBe(1);
  expect(rendered.geometry.getAttribute("color").getY(0)).toBe(1);
  expect(rendered.geometry.getAttribute("color").getX(0)).toBe(0);
});

it("selects discrete frame buffers at keyframe midpoints, without wide morph shaders", () => {
  const data = createDTSTestShape(),
    mesh = data.meshes[0];
  mesh.numFrames = 2;
  mesh.vertices = new Float32Array([
    ...mesh.vertices,
    ...mesh.vertices.map((v, i) => (i % 3 === 2 ? v + 1 : v)),
  ]);
  mesh.normals = new Float32Array([...mesh.normals, ...mesh.normals]);
  data.objectStates.push(
    { visibility: 1, frame: 0, materialFrame: 0 },
    { visibility: 1, frame: 1, materialFrame: 0 },
  );
  data.sequences = [
    createDTSSequence({
      numKeyframes: 2,
      frameMatters: [0],
      baseObjectState: 1,
    }),
  ];
  const model = buildDTS(data),
    instance = clone(model.scene) as DTSShape,
    mixer = new AnimationMixer(instance);
  let rendered!: DTSMesh;
  instance.traverse((n) => {
    if (n instanceof DTSMesh) rendered = n;
  });
  mixer.clipAction(model.animations[0]).play();
  mixer.setTime(0.49);
  instance.update(camera);
  expect(rendered.geometry.getAttribute("position").getY(0)).toBe(0);
  mixer.setTime(0.5);
  instance.update(camera);
  expect(rendered.geometry.getAttribute("position").getY(0)).toBe(1);
  expect(rendered.geometry.morphAttributes).toEqual({});
  expect(instance.isLOD).toBe(true);
  expect((instance as unknown as { isGroup: boolean }).isGroup).not.toBe(true);
});

it("represents arbitrary-axis scale without decomposing away shear", () => {
  const data = createDTSTestShape();
  data.arbitraryScaleFactors = new Float32Array([2, 1, 1]);
  data.arbitraryScaleRotations = new Int16Array([0, 0, 23170, 23170]);
  data.sequences = [
    createDTSSequence({ numKeyframes: 1, flags: 4, scaleMatters: [0] }),
  ];
  const model = buildDTS(data),
    mixer = new AnimationMixer(model.scene);
  mixer.clipAction(model.animations[0]).play();
  mixer.update(0);
  model.scene.updateMatrixWorld(true);
  expect(
    new Vector3(0, 0, 1).applyMatrix4(model.nodes[0].matrixWorld).length(),
  ).toBeCloseTo(2);
  expect(
    new Vector3(1, 0, 0).applyMatrix4(model.nodes[0].matrixWorld).length(),
  ).toBeCloseTo(1);
});

it("starts ground motion at the implicit identity key", () => {
  const data = createDTSTestShape();
  data.groundTranslations = new Float32Array([2, 0, 0]);
  data.groundRotations = new Int16Array([0, 0, 0, 32767]);
  data.sequences = [createDTSSequence({ numGroundFrames: 1, duration: 2 })];
  const clip = buildDTS(data).animations[0].groundMotion!;
  expect(Array.from(clip.tracks[0].times)).toEqual([0, 2]);
  expect(Array.from(clip.tracks[0].values, (n) => n || 0)).toEqual([
    0, 0, 0, -2, 0, 0,
  ]);
});

it.each([1, 5])(
  "preserves inverse bind transforms with %i influences per vertex",
  async (influences) => {
    const { SkinnedMesh } = await import("three");
    const data = createDTSTestShape(),
      source = data.meshes[0];
    data.objects[0].nodeIndex = -1;
    data.defaultTranslations = new Float32Array([5, 2, 1]);
    source.type = 1;
    source.skin = {
      initialVertices: source.vertices,
      initialNormals: source.normals,
      encodedNormals: new Uint8Array(),
      inverseBindMatrices: new Float32Array([
        1, 0, 0, -5, 0, 1, 0, -2, 0, 0, 1, -1, 0, 0, 0, 1,
      ]),
      vertexIndices: Int32Array.from({ length: 3 * influences }, (_, i) =>
        Math.floor(i / influences),
      ),
      boneIndices: new Int32Array(3 * influences),
      weights: new Float32Array(3 * influences).fill(1 / influences),
      nodeIndices: new Int32Array([0]),
    };
    data.translations = new Float32Array([6, 2, 1]);
    data.sequences = [
      createDTSSequence({ numKeyframes: 1, translationMatters: [0] }),
    ];
    const model = buildDTS(data),
      mixer = new AnimationMixer(model.scene);
    mixer.clipAction(model.animations[0]).play();
    mixer.update(0);
    model.scene.updateMatrixWorld(true);
    model.scene.update(camera);
    let mesh!: any;
    model.scene.traverse((n) => {
      if ((n as any).isMesh) mesh = n;
    });
    const point = new Vector3().fromBufferAttribute(
      mesh.geometry.getAttribute("position"),
      0,
    );
    if (mesh instanceof SkinnedMesh) mesh.applyBoneTransform(0, point);
    expect(point.x).toBeCloseTo(0);
    expect(point.y).toBeCloseTo(0);
    expect(point.z).toBeCloseTo(-1);
    expect(mesh instanceof SkinnedMesh).toBe(influences <= 4);
  },
);
