import { describe, expect, it, vi } from "vitest";
import {
  AnimationMixer,
  Group,
  Matrix4,
  PerspectiveCamera,
  SkinnedMesh,
  Vector3,
} from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { buildDTS } from "./dtsBuilder";
import {
  DTSNode,
  DTSObject,
  DTSRigidMeshBatch,
  isDTSMesh,
  type DTSShape,
} from "./dtsModel";
import { getDTSCollisionMeshes } from "./dtsCollision";
import { batchDTSRigidMeshes } from "./dtsRigidBatch";
import { collectOwnNodes, findOwnNode } from "../sceneNodes";
import {
  createDTSRigidTestShape,
  createDTSSequence,
  createDTSTestShape,
} from "./dtsTestFixtures";

function fixture(influences = 1) {
  const data = createDTSTestShape(),
    mesh = data.meshes[0];
  const addName = (name: string) => data.names.push(name) - 1;
  for (const [name, parentIndex] of [
    ["Unused", 0],
    ["Mount0", 0],
    ["Collider", 4],
    ["Animated", 0],
    ["SkinBone", 4],
    ["ControlParent", 0],
  ] as const) {
    data.nodes.push({
      ...data.nodes[0],
      nameIndex: addName(name),
      parentIndex,
    });
  }
  data.defaultTranslations = new Float32Array(data.nodes.length * 3);
  data.defaultTranslations[5 * 3 + 1] = 2;
  data.defaultRotations = new Int16Array(data.nodes.length * 4);
  for (let i = 0; i < data.nodes.length; i++)
    data.defaultRotations[i * 4 + 3] = 32767;
  const empty = { ...mesh, type: 4, primitives: [] };
  data.meshes = [
    mesh,
    empty,
    empty,
    mesh,
    empty,
    {
      ...mesh,
      type: 1,
      skin: {
        initialVertices: mesh.vertices,
        initialNormals: mesh.normals,
        encodedNormals: new Uint8Array(),
        inverseBindMatrices: new Float32Array(new Matrix4().elements),
        vertexIndices: Int32Array.from({ length: 3 * influences }, (_, i) =>
          Math.floor(i / influences),
        ),
        boneIndices: new Int32Array(3 * influences),
        weights: new Float32Array(3 * influences).fill(1 / influences),
        nodeIndices: new Int32Array([5]),
      },
    },
    empty,
  ];
  data.objects.push(
    {
      ...data.objects[0],
      nameIndex: addName("Hull"),
      nodeIndex: 3,
      startMeshIndex: 1,
      numMeshes: 3,
    },
    {
      ...data.objects[0],
      nameIndex: addName("LateSkin"),
      startMeshIndex: 4,
      numMeshes: 3,
    },
    {
      ...data.objects[0],
      nameIndex: addName("AnimatedControl"),
      nodeIndex: 6,
      startMeshIndex: 7,
      numMeshes: 0,
    },
  );
  data.objectStates = Array.from({ length: 4 }, () => ({
    visibility: 1,
    frame: 0,
    materialFrame: 0,
  }));
  data.objectStates.push({ visibility: 0.4, frame: 0, materialFrame: 0 });
  data.subShapes[0].numNodes = data.nodes.length;
  data.subShapes[0].numObjects = data.objects.length;
  data.details.push(
    {
      ...data.details[0],
      nameIndex: addName("Detail2"),
      objectDetail: 1,
      size: 0.1,
    },
    {
      ...data.details[0],
      nameIndex: addName("Collision-1"),
      objectDetail: 2,
      size: -1,
    },
  );
  data.translations = new Float32Array([8, 0, 0]);
  data.sequences = [
    createDTSSequence({
      nameIndex: addName("move"),
      numKeyframes: 1,
      translationMatters: [4],
    }),
    createDTSSequence({
      nameIndex: addName("fade"),
      numKeyframes: 1,
      visibilityMatters: [3],
      baseObjectState: 4,
    }),
  ];
  return data;
}
function indices(scene: DTSShape) {
  const nodes: number[] = [],
    objects: number[] = [];
  scene.traverse((node) => {
    if (node instanceof DTSNode) nodes.push(node.nodeIndex);
    if (node instanceof DTSObject) objects.push(node.objectIndex);
  });
  return {
    nodes: nodes.sort((a, b) => a - b),
    objects: objects.sort((a, b) => a - b),
  };
}
function meshes(scene: DTSShape) {
  const result: import("./dtsModel").DTSRenderable[] = [];
  scene.traverse((node) => {
    if (isDTSMesh(node)) result.push(node);
  });
  return result;
}
function expectMatrix(a: Matrix4, b: Matrix4) {
  a.elements.forEach((v, i) => expect(v).toBeCloseTo(b.elements[i], 6));
}

describe("lazy DTS hierarchy", () => {
  it("keeps native animation targets ready and realizes indexed inspection one node at a time", () => {
    const model = buildDTS(fixture());
    expect(indices(model.scene)).toEqual({ nodes: [0, 4, 6], objects: [0, 3] });
    const warn = vi.spyOn(console, "warn");
    const mixer = new AnimationMixer(model.scene);
    model.animations.forEach((clip) => mixer.clipAction(clip).play());
    mixer.update(0.3);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    expect(model.scene.getShapeObject(3)!.opacity).toBeCloseTo(0.4);
    expect(model.nodes).toHaveLength(7);
    expect(indices(model.scene).nodes).not.toContain(1);
    expect(model.nodes[1].name).toBe("Unused");
    expect(indices(model.scene).nodes).toEqual([0, 1, 4, 6]);
    expect(model.nodes[1]).toBe(model.scene.getNode(1));
    expect(model.scene.getObjectByName("__dts_transform_2")).toBeDefined();
    expect(indices(model.scene).nodes).toEqual([0, 1, 2, 4, 6]);
  });

  it("creates only the requested clone's mount path with its current parent pose", () => {
    const model = buildDTS(fixture()),
      a = clone(model.scene) as DTSShape,
      b = clone(model.scene) as DTSShape;
    const parent = new Group();
    parent.position.set(7, 8, 9);
    parent.add(a);
    a.position.set(1, 2, 3);
    const mount = findOwnNode(a, "mOuNt0")!;
    expect(mount.getWorldPosition(new Vector3()).toArray()).toEqual([
      8, 10, 12,
    ]);
    const attachment = new Group();
    attachment.position.y = 4;
    mount.add(attachment);
    expect(attachment.getWorldPosition(new Vector3()).y).toBe(14);
    expect(indices(a).nodes).toEqual([0, 2, 4, 6]);
    expect(indices(b).nodes).toEqual([0, 4, 6]);
    expect(indices(model.scene).nodes).toEqual([0, 4, 6]);
    expect(collectOwnNodes(b, (name) => name === "eye").size).toBe(0);
    expect(indices(b).nodes).toEqual([0, 4, 6]);
  });

  it("keeps duplicate-name precedence when nodes arrive out of order", () => {
    const data = fixture();
    data.names[data.nodes[1].nameIndex] = "Mount0";
    data.names[data.nodes[2].nameIndex] = "mount0";
    const { scene } = buildDTS(data);
    const later = scene.getNode(2)!;
    expect(scene.getNodeByName("MOUNT0")!.nodeIndex).toBe(1);
    expect(findOwnNode(scene, "mount0")).not.toBe(later);
    expect(scene.getObjectByName("mount0")).toBe(later);
    expect(
      collectOwnNodes(scene, (name) => name === "mount0").get("mount0"),
    ).toBe(scene.getNode(1));

    const nextData = structuredClone(data);
    nextData.names[nextData.nodes[1].nameIndex] = "mount0";
    const exact = buildDTS(nextData).scene;
    exact.getNode(2);
    expect(indices(exact).nodes).not.toContain(1);
    expect(exact.getObjectByName("mount0")).toBe(exact.getNode(1));
  });

  it("creates valid collision paths without realizing null slots or visual hulls", () => {
    const data = fixture(),
      a = buildDTS(data),
      b = buildDTS(data, { lazy: false });
    for (const model of [a, b]) {
      const mixer = new AnimationMixer(model.scene);
      mixer.clipAction(model.animations[0]).play();
      mixer.update(0);
      model.scene.position.set(3, 4, 5);
    }
    const [actual] = getDTSCollisionMeshes(a.scene, "TSStatic"),
      [expected] = getDTSCollisionMeshes(b.scene, "TSStatic");
    expectMatrix(actual.matrixWorld, expected.matrixWorld);
    expect(indices(a.scene)).toEqual({
      nodes: [0, 3, 4, 6],
      objects: [0, 1, 3],
    });
    expect(meshes(a.scene)).toHaveLength(1);
    a.scene.position.y = b.scene.position.y = 20;
    actual.updateForCollision();
    expected.updateForCollision();
    expectMatrix(actual.matrixWorld, expected.matrixWorld);
  });

  for (const influences of [1, 5]) {
    it(`binds a late ${influences === 1 ? "GPU" : "CPU"} skin to newly realized, currently animated bones`, () => {
      const data = fixture(influences),
        source = buildDTS(data),
        a = clone(source.scene) as DTSShape,
        b = buildDTS(data, { lazy: false }).scene;
      const camera = new PerspectiveCamera();
      for (const scene of [a, b]) {
        const mixer = new AnimationMixer(scene);
        mixer.clipAction(source.animations[0]).play();
        mixer.update(0);
        scene.position.set(3, 4, 5);
        scene.updateMatrixWorld(true);
        scene.detailLevel = 1;
        scene.update(camera);
      }
      expect(indices(a).nodes).toContain(5);
      expect(indices(source.scene).nodes).not.toContain(5);
      const actual = meshes(a).find((m) => m.binding!.objectIndex === 2)!;
      const expected = meshes(b).find((m) => m.binding!.objectIndex === 2)!;
      expectMatrix(actual.matrixWorld, expected.matrixWorld);
      for (let i = 0; i < 3; i++) {
        expect(
          actual
            .getVertexPosition(i, new Vector3())
            .distanceTo(expected.getVertexPosition(i, new Vector3())),
        ).toBeLessThan(1e-5);
      }
      if (actual instanceof SkinnedMesh) {
        expect(actual.skeleton.bones[0]).toBe(a.getNode(5));
        const copy = clone(a) as DTSShape;
        const copied = meshes(copy).find(
          (m) => m.binding!.objectIndex === 2,
        ) as SkinnedMesh;
        expect(copied.skeleton.bones[0]).toBe(copy.getNode(5));
      }
    });
  }

  it("packs rigid batch palettes without expanding missing node indices", () => {
    const data = createDTSRigidTestShape(),
      child = data.nodes[1];
    data.names.push("Unused");
    data.nodes.splice(1, 0, { ...child, nameIndex: data.names.length - 1 });
    data.objects[1].nodeIndex = 2;
    data.subShapes[0].numNodes++;
    data.defaultTranslations = new Float32Array([1, 2, 3, 0, 0, 0, 2, 0, 0]);
    data.defaultRotations = new Int16Array([
      0, 0, 0, 32767, 0, 0, 0, 32767, 0, 0, 0, 32767,
    ]);
    const { scene } = buildDTS(data);
    const [batch] = batchDTSRigidMeshes(scene) as DTSRigidMeshBatch[];
    expect(batch).toBeInstanceOf(DTSRigidMeshBatch);
    expect(
      new Set(batch.skeleton.bones.map((b) => (b as DTSNode).nodeIndex)),
    ).toEqual(new Set([0, 2]));
    expect(new Set(batch.geometry.getAttribute("skinIndex").array)).toEqual(
      new Set([0, 1]),
    );
    expect(indices(scene).nodes).toEqual([0, 2]);
    const copy = clone(scene) as DTSShape;
    const copied = copy.children.find(
      (n) => n instanceof DTSRigidMeshBatch,
    ) as DTSRigidMeshBatch;
    expect(copied.skeleton.bones).toEqual(
      batch.skeleton.bones.map((bone) =>
        copy.getNode((bone as DTSNode).nodeIndex),
      ),
    );
    expect(indices(copy).nodes).toEqual([0, 2]);
    scene.position.set(3, 4, 5);
    scene.getNode(2)!.rotation.y = 0.7;
    scene.updateMatrixWorld(true);
    scene.update(new PerspectiveCamera());
    batch.skeleton.update();
    let offset = 0;
    for (const binding of batch.bindings) {
      const part = meshes(scene).find((mesh) => mesh.binding === binding)!;
      part.parent!.updateWorldMatrix(true, true, true);
      for (let i = 0; i < part.geometry.getAttribute("position").count; i++) {
        const expected = part
          .getVertexPosition(i, new Vector3())
          .applyMatrix4(part.matrixWorld);
        const actual = batch
          .getVertexPosition(offset++, new Vector3())
          .applyMatrix4(batch.matrixWorld);
        expect(actual.distanceTo(expected)).toBeLessThan(1e-5);
      }
    }
  });
});
