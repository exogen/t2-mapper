import { describe, expect, it, vi } from "vitest";
import {
  FrontSide,
  AnimationMixer,
  Matrix4,
  MeshLambertMaterial,
  NormalBlending,
  PerspectiveCamera,
  Texture,
} from "three";
import { buildDTS } from "../dts/dtsBuilder";
import {
  DTSMesh,
  DTSSkinnedMesh,
  DTSRigidMeshBatch,
  createDTSMaterial,
} from "../dts/dtsModel";
import {
  createDTSTestShape,
  createDTSRigidTestShape,
  createDTSSequence,
} from "../dts/dtsTestFixtures";
import { batchDTSRigidMeshes } from "../dts/dtsRigidBatch";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { DTSShape } from "../dts/dtsModel";
import { DTSMaterialFlags, DTSMeshType } from "../dts/dtsTypes";
import { sampleDTSSequence } from "../dts/dtsAnimation";
import {
  processShapeScene,
  replaceWithShapeMaterial,
  disposeClonedScene,
} from "./playbackUtils";

vi.mock("../loaders", () => ({
  textureToUrl: (name: string) => `/textures/${name}`,
}));
vi.mock("../textureUtils", async (original) => {
  const utilities = await original<typeof import("../textureUtils")>();
  return {
    ...utilities,
    loadTextureInstance: (name: string) => {
      const texture = new Texture();
      texture.name = name;
      return texture;
    },
  };
});

it("reveals initially hidden parts through native visibility tracks after material replacement", () => {
  const data = createDTSTestShape();
  data.objectStates[0].visibility = 0;
  data.objectStates.push(
    { visibility: 0, frame: 0, materialFrame: 0 },
    { visibility: 1, frame: 0, materialFrame: 0 },
  );
  data.sequences = [
    createDTSSequence({
      numKeyframes: 2,
      visibilityMatters: [0],
      baseObjectState: 1,
    }),
  ];
  data.objects[0].numMeshes = 2;
  data.meshes.push({ ...data.meshes[0] });
  data.details.push({ ...data.details[0], objectDetail: 1, size: 0.1 });
  const model = buildDTS(data);
  processShapeScene(model.scene);
  const mixer = new AnimationMixer(model.scene);
  expect(model.scene.getShapeObject(0)!.visible).toBe(false);
  for (const detail of [0, 1]) {
    model.scene.detailLevel = detail;
    sampleDTSSequence(mixer, model.animations[0], 1, false);
    model.scene.update(new PerspectiveCamera());
    expect(model.scene.getShapeObject(0)!.visible).toBe(true);
    const visible: DTSMesh[] = [];
    model.scene.traverseVisible((node) => {
      if (node instanceof DTSMesh) visible.push(node);
    });
    expect(visible).toHaveLength(1);
    expect((visible[0].material as MeshLambertMaterial).opacity).toBe(1);
    expect((visible[0].material as MeshLambertMaterial).transparent).toBe(
      false,
    );
    expect((visible[0].material as MeshLambertMaterial).depthWrite).toBe(true);
  }
  mixer.stopAllAction();
  expect(model.scene.getShapeObject(0)!.visible).toBe(false);
});

it.each([false, true])(
  "preserves engine decal depth bias through material replacement (lazy: %s)",
  (lazy) => {
    const data = createDTSTestShape();
    data.decals = [
      { nameIndex: 1, objectIndex: 0, numMeshes: 1, startMeshIndex: 1 },
    ];
    data.subShapes[0].numDecals = 1;
    data.decalStates = new Int32Array([-1]);
    data.materials.push({
      ...data.materials[0],
      name: "damage",
      flags: DTSMaterialFlags.Translucent,
    });
    data.meshes.push({
      ...data.meshes[0],
      type: DTSMeshType.Decal,
      decal: {
        startPrimitive: new Int32Array([0]),
        texgenS: new Float32Array([1, 0, 0, 0]),
        texgenT: new Float32Array([0, 1, 0, 0]),
        materialIndex: 1,
      },
    });
    const { scene } = buildDTS(data);
    const camera = new PerspectiveCamera();
    if (!lazy) {
      scene.decalFrames[0] = 0;
      scene.update(camera);
    }
    processShapeScene(scene);
    scene.decalFrames[0] = 0;
    scene.update(camera);
    const meshes: DTSMesh[] = [];
    scene.traverseVisible((node) => {
      if (node instanceof DTSMesh) meshes.push(node);
    });
    const decal = meshes.find((mesh) => mesh.binding!.decalIndex === 0)!;
    const body = meshes.find((mesh) => mesh.binding!.decalIndex == null)!;
    expect(decal.material).toMatchObject({
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      depthTest: true,
      depthWrite: false,
      transparent: true,
    });
    expect(body.material).toMatchObject({ polygonOffset: false });
    expect(decal.geometry.getAttribute("position")).toBe(
      body.geometry.getAttribute("position"),
    );
    disposeClonedScene(scene);
  },
);

describe("native tree materials in the viewer", () => {
  it.each([
    ["bark", 0x43, false, true],
    ["leaves", 0x47, true, false],
  ] as const)(
    "preserves %s blending, depth writes, and culling",
    (name, flags, transparent, depthWrite) => {
      // Oldwood and Branch5/Branch4 in borg18/19 have these authored flags.
      const source = createDTSMaterial({
        ...createDTSTestShape().materials[0],
        name,
        flags,
      });
      const material = replaceWithShapeMaterial(source, 1)
        .material as MeshLambertMaterial;
      for (const m of [source, material]) {
        expect(m.transparent).toBe(transparent);
        expect(m.depthWrite).toBe(depthWrite);
        expect(m.side).toBe(FrontSide);
        expect(m.alphaTest).toBe(0);
        expect(m.blending).toBe(NormalBlending);
      }
      expect(material.map!.generateMipmaps).toBe(true);
    },
  );

  it("keeps a sorted leaf mesh's material groups without whole-mesh bark copies", () => {
    const data = createDTSTestShape();
    data.materials = [
      { ...data.materials[0], name: "Oldwood", flags: 0x43 },
      { ...data.materials[0], name: "Branch5", flags: 0x47 },
      { ...data.materials[0], name: "unused", flags: 0x47 },
    ];
    const mesh = data.meshes[0];
    mesh.type = 3;
    mesh.primitives[0].material = 0x20000001;
    mesh.sorted = {
      clusters: [
        {
          startPrimitive: 0,
          endPrimitive: 1,
          normal: [0, 0, 1],
          k: 0,
          frontCluster: -1,
          backCluster: -1,
        },
      ],
      startCluster: new Int32Array([0]),
      firstVerts: new Int32Array([0]),
      numVerts: new Int32Array([3]),
      firstTVerts: new Int32Array([0]),
      alwaysWriteDepth: false,
    };
    const { scene } = buildDTS(data);
    processShapeScene(scene, "borg18.dts");
    const meshes: DTSMesh[] = [];
    scene.traverse((node) => {
      if (node instanceof DTSMesh) meshes.push(node);
    });
    expect(meshes).toHaveLength(1);
    const materials = meshes[0].material as MeshLambertMaterial[];
    expect(materials).toHaveLength(data.materials.length + 1);
    const camera = new PerspectiveCamera();
    camera.position.z = 10;
    camera.updateMatrixWorld();
    scene.updateMatrixWorld();
    scene.update(camera);
    expect(
      meshes[0].geometry.groups.map((group) => group.materialIndex),
    ).toEqual([1]);
    expect(materials[1].map!.name).toBe("/textures/Branch5");
    expect(materials[1].transparent).toBe(true);
    expect(materials[1].depthWrite).toBe(false);
    // The format's explicit depth override still takes precedence.
    mesh.sorted.alwaysWriteDepth = true;
    scene.update(camera);
    expect(materials[1].depthWrite).toBe(true);
  });

  it("honors explicit NoMipMap instead of inferring it from transparency", () => {
    const source = createDTSMaterial({
      ...createDTSTestShape().materials[0],
      flags: 0x47 | DTSMaterialFlags.NoMipMap,
    });
    const material = replaceWithShapeMaterial(source, 1)
      .material as MeshLambertMaterial;
    expect(material.map!.generateMipmaps).toBe(false);
  });
});

it("replaces a batched body's DTS base skin with each player's selected custom skin", () => {
  const model = buildDTS(createDTSRigidTestShape());
  const left = clone(model.scene) as DTSShape,
    right = clone(model.scene) as DTSShape;
  const [a] = batchDTSRigidMeshes(left),
    [b] = batchDTSRigidMeshes(right);
  if (!(a instanceof DTSRigidMeshBatch))
    throw new Error("Expected animated body");
  processShapeScene(left, undefined, {
    skinUrl: "https://skins.example/alice.lmale.png",
  });
  processShapeScene(right, undefined, {
    skinUrl: "https://skins.example/bob.lmale.png",
  });
  expect(a.geometry).toBe(b.geometry);
  expect(a.material).not.toBe(b.material);
  expect((a.material as MeshLambertMaterial).map!.name).toBe(
    "https://skins.example/alice.lmale.png",
  );
  expect((b.material as MeshLambertMaterial).map!.name).toBe(
    "https://skins.example/bob.lmale.png",
  );
  expect(model.materials[0].resourcePath).toBe("skins/base.lmale");
  a.skeleton.computeBoneTexture();
  const boneTexture = a.skeleton.boneTexture!;
  const dispose = vi.spyOn(boneTexture, "dispose");
  disposeClonedScene(left);
  expect(dispose).toHaveBeenCalledOnce();
  expect(a.skeleton.boneTexture).toBeNull();
  // React Strict Mode may set up this same memoized scene after cleanup.
  left.updateMatrixWorld(true);
  left.update(new PerspectiveCamera());
  a.skeleton.computeBoneTexture();
  expect(a.skeleton.boneTexture).not.toBe(boneTexture);
  expect(a.visible).toBe(true);
});

it("releases a clone's sampler without disposing shared images or other material maps", () => {
  const shared = new Texture();
  const model = buildDTS(createDTSTestShape(), { texture: () => shared });
  const left = clone(model.scene) as DTSShape;
  const right = clone(model.scene) as DTSShape;
  processShapeScene(left);
  processShapeScene(right);
  const materials: MeshLambertMaterial[] = [];
  for (const scene of [left, right])
    scene.traverse((node) => {
      if (node instanceof DTSMesh)
        materials.push(node.material as MeshLambertMaterial);
    });
  const owned = materials[0].map!;
  const disposeOwned = vi.spyOn(owned, "dispose");
  const disposeOther = vi.spyOn(materials[1].map!, "dispose");
  const disposeShared = vi.spyOn(shared, "dispose");
  // Runtime IFL/cloak maps can replace the base map; ownership must not follow it.
  materials[0].map = shared;
  materials[0].bumpMap = shared;
  disposeClonedScene(left);
  expect(disposeOwned).toHaveBeenCalledOnce();
  expect(disposeOther).not.toHaveBeenCalled();
  expect(disposeShared).not.toHaveBeenCalled();
});

it("releases native weighted-skin bone textures without affecting sibling or source skeletons", () => {
  const data = createDTSTestShape();
  const mesh = data.meshes[0];
  mesh.type = 1;
  mesh.skin = {
    initialVertices: mesh.vertices,
    initialNormals: mesh.normals,
    encodedNormals: new Uint8Array(),
    inverseBindMatrices: new Float32Array(new Matrix4().elements),
    vertexIndices: new Int32Array([0, 1, 2]),
    boneIndices: new Int32Array(3),
    weights: new Float32Array(3).fill(1),
    nodeIndices: new Int32Array([0]),
  };
  const model = buildDTS(data);
  const left = clone(model.scene) as DTSShape;
  const right = clone(model.scene) as DTSShape;
  const meshes: DTSSkinnedMesh[] = [];
  for (const scene of [left, right, model.scene])
    scene.traverse((node) => {
      if (node instanceof DTSSkinnedMesh) meshes.push(node);
    });
  expect(meshes).toHaveLength(3);
  const disposals = meshes.map(({ skeleton }) => {
    skeleton.computeBoneTexture();
    return vi.spyOn(skeleton.boneTexture!, "dispose");
  });
  disposeClonedScene(left);
  expect(disposals[0]).toHaveBeenCalledOnce();
  expect(disposals[1]).not.toHaveBeenCalled();
  expect(disposals[2]).not.toHaveBeenCalled();
  expect(meshes[0].skeleton.boneTexture).toBeNull();
  // StrictMode can reuse the memoized scene after effect cleanup.
  meshes[0].skeleton.computeBoneTexture();
  expect(meshes[0].skeleton.boneTexture).not.toBeNull();
});

it("initializes a newly selected detail with the current custom skin, lighting, and fade", async () => {
  const { attachShapeLightUniforms, createShapeLightState } =
    await import("../shapeLighting");
  const { applyFadeAndCloak } = await import("../components/shapeFadeCloak");
  const data = createDTSTestShape();
  data.materials[0].name = "skins/base.lmale";
  data.objects[0].numMeshes = 2;
  data.meshes.push({ ...data.meshes[0] });
  data.details.push({ ...data.details[0], objectDetail: 1, size: 0.1 });
  const { scene } = buildDTS(data);
  processShapeScene(scene, undefined, {
    skinUrl: "https://skins.example/alice.lmale.png",
  });
  const light = createShapeLightState(scene, undefined);
  attachShapeLightUniforms(scene, light.uniforms);
  applyFadeAndCloak(scene, 0.3, 0);
  scene.detailLevel = 1;
  scene.update(new PerspectiveCamera());
  const materials: MeshLambertMaterial[] = [];
  scene.traverse((node) => {
    if (node instanceof DTSMesh)
      materials.push(node.material as MeshLambertMaterial);
  });
  expect(materials).toHaveLength(2);
  for (const material of materials) {
    expect(material.map!.name).toBe("https://skins.example/alice.lmale.png");
    expect(material.opacity).toBe(0.3);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.userData.shapeLight).toBe(light.uniforms);
  }
  applyFadeAndCloak(scene, 1, 0);
  expect(materials[1].opacity).toBe(1);
  expect(materials[1].transparent).toBe(false);
});
