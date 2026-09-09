import { describe, expect, it, vi } from "vitest";
import {
  AnimationMixer,
  BufferAttribute,
  Group,
  Matrix4,
  PerspectiveCamera,
  Texture,
  Vector3,
  type MeshLambertMaterial,
} from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { buildDTS } from "./dtsBuilder";
import {
  DTSAnimationTransform,
  DTSMesh,
  DTSObject,
  type DTSShape,
} from "./dtsModel";
import { DTSStream } from "./dtsReader";
import { DTSPrimitiveFlags } from "./dtsTypes";
import { createDTSRigidTestShape, createDTSTestShape } from "./dtsTestFixtures";

const camera = new PerspectiveCamera();
function meshes(scene: DTSShape): DTSMesh[] {
  const result: DTSMesh[] = [];
  scene.traverse((node) => {
    if (node instanceof DTSMesh) result.push(node);
  });
  return result;
}

describe("DTS runtime work", () => {
  it("composes pose helpers only when native animation changes their values", () => {
    const data = createDTSRigidTestShape();
    data.translations = new Float32Array([8, 0, 0]);
    const { scene, nodes, animations } = buildDTS(data);
    const helper = nodes[0].parent as DTSAnimationTransform;
    const compose = vi.spyOn(helper.matrix, "compose");
    scene.updateMatrixWorld(true);
    expect(compose).not.toHaveBeenCalled();
    const mixer = new AnimationMixer(scene);
    const action = mixer.clipAction(animations[0]).play();
    mixer.update(0);
    scene.updateMatrixWorld(true);
    expect(compose).toHaveBeenCalledTimes(1);
    expect(helper.position.x).toBe(-8);
    action.paused = true;
    mixer.update(1);
    scene.position.y = 12;
    scene.updateMatrixWorld(true);
    expect(compose).toHaveBeenCalledTimes(1);
    expect(nodes[0].matrixWorld.elements[13]).toBe(12);
    mixer.stopAllAction();
    scene.updateMatrixWorld(true);
    expect(compose).toHaveBeenCalledTimes(2);
    expect(helper.position.x).toBe(-1);
  });

  it("keeps queries, named-bone edits and mounted children current before rendering", () => {
    const model = buildDTS(createDTSRigidTestShape());
    const parent = new Group();
    parent.add(model.scene);
    parent.updateMatrixWorld(true);
    parent.position.set(5, 6, 7);
    model.scene.position.set(1, 2, 3);
    // Query the leaf first, so both helper ancestors must refresh their worlds.
    expect(model.nodes[1].getWorldPosition(new Vector3()).toArray()).toEqual([
      3, 11, 12,
    ]);
    const mounted = buildDTS(createDTSTestShape()).scene;
    model.nodes[1].add(mounted);
    model.nodes[1].position.x = 2;
    mounted.position.y = 3;
    expect(mounted.getWorldPosition(new Vector3()).toArray()).toEqual([
      5, 14, 12,
    ]);
    const copied = clone(model.scene) as DTSShape;
    copied.position.set(0, 0, 0);
    copied.updateMatrixWorld(true);
    expect(
      copied
        .getObjectByName(model.nodes[1].name)!
        .getWorldPosition(new Vector3())
        .toArray(),
    ).toEqual([-1, 3, 2]);
    expect(model.nodes[1].matrixAutoUpdate).toBe(true);
  });

  it("skips hidden LOD matrices and refreshes a selected LOD in the same frame", () => {
    const data = createDTSTestShape();
    data.objects[0].numMeshes = 2;
    data.meshes.push({ ...data.meshes[0] });
    data.details.push({ ...data.details[0], objectDetail: 1, size: 0.1 });
    const { scene } = buildDTS(data);
    expect(meshes(scene)).toHaveLength(1);
    scene.ensureDetail(1);
    const [first, second] = meshes(scene);
    scene.update(camera);
    const update = vi.spyOn(second, "updateMatrixWorld");
    scene.position.set(7, 8, 9);
    scene.updateMatrixWorld(true);
    expect(update).not.toHaveBeenCalled();
    expect(second.parent!.visible).toBe(false);
    scene.detailLevel = 1;
    scene.update(camera);
    expect(first.parent!.visible).toBe(false);
    expect(second.parent!.visible).toBe(true);
    expect(new Vector3().setFromMatrixPosition(second.matrixWorld)).toEqual(
      scene.position,
    );
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("keeps hidden objects frozen until an animation makes them visible again", () => {
    const { scene } = buildDTS(createDTSTestShape());
    const [mesh] = meshes(scene);
    const object = scene.getObjectByName("__dts_object_0") as DTSObject;
    scene.update(camera);
    object.opacity = 0;
    const update = vi.spyOn(mesh, "updateMatrixWorld");
    scene.position.x = 12;
    scene.updateMatrixWorld(true);
    scene.update(camera);
    expect(update).not.toHaveBeenCalled();
    object.opacity = 1;
    scene.updateMatrixWorld(true);
    scene.update(camera);
    expect(new Vector3().setFromMatrixPosition(mesh.matrixWorld).x).toBe(12);
  });

  it("allocates dynamic instance buffers on demand and preserves the cache", () => {
    const data = createDTSTestShape();
    data.meshes[0].mergeIndices = new Uint16Array([0]);
    const { scene } = buildDTS(data);
    const a = clone(scene) as DTSShape,
      b = clone(scene) as DTSShape;
    const [original] = meshes(scene),
      [left] = meshes(a),
      [right] = meshes(b);
    expect(left.geometry).toBe(original.geometry);
    expect(right.geometry).toBe(original.geometry);
    a.intraDetailLevel = 0;
    a.update(camera);
    expect(left.geometry).not.toBe(original.geometry);
    expect(right.geometry).toBe(original.geometry);
    expect(left.geometry.getAttribute("position").getX(2)).toBe(1);
    expect(original.geometry.getAttribute("position").getX(2)).toBeCloseTo(0);
    const geometry = left.geometry,
      position = geometry.getAttribute("position");
    let released = false;
    geometry.addEventListener("dispose", () => {
      released = true;
      // WebGLGeometries deletes buffers still attached when dispose fires.
      expect(geometry.getAttribute("position")).toBe(position);
      expect(geometry.hasAttribute("normal")).toBe(false);
      expect(geometry.index).toBeNull();
    });
    left.disposeGeometry();
    expect(released).toBe(true);
    expect(right.geometry.getAttribute("normal")).toBe(
      original.geometry.getAttribute("normal"),
    );
    expect(right.geometry.index).not.toBeNull();
    // React may set up the same scene again after effect cleanup.
    a.update(camera);
    expect(left.geometry.getAttribute("normal")).toBe(
      original.geometry.getAttribute("normal"),
    );
    expect(left.geometry.index).toBe(original.geometry.index);
    expect(left.geometry.getAttribute("position")).toBe(position);
  });

  it("batches consecutive sorted materials without reordering or repeated uploads", () => {
    const data = createDTSTestShape(),
      source = data.meshes[0];
    data.materials.push({ ...data.materials[0] });
    source.type = 3;
    source.primitives = [0, 0, 1, 0].map((material) => ({
      start: 0,
      count: 3,
      material: 0x20000000 | material,
    }));
    source.sorted = {
      clusters: [
        {
          startPrimitive: 0,
          endPrimitive: 2,
          normal: [1, 0, 0],
          k: 0,
          frontCluster: 1,
          backCluster: 2,
        },
        {
          startPrimitive: 2,
          endPrimitive: 4,
          normal: [0, 0, 0],
          k: 0,
          frontCluster: -1,
          backCluster: -1,
        },
        {
          startPrimitive: 3,
          endPrimitive: 4,
          normal: [0, 0, 0],
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
    const { scene } = buildDTS(data),
      view = new PerspectiveCamera();
    const [mesh] = meshes(scene);
    view.position.x = -1;
    view.updateMatrixWorld();
    scene.update(view);
    expect(mesh.geometry.groups.map((g) => [g.count, g.materialIndex])).toEqual(
      [
        [6, 0],
        [3, 1],
        [3, 0],
      ],
    );
    const firstIndex = mesh.geometry.index!;
    const version = firstIndex.version;
    const cameraUpdates = vi.spyOn(view, "updateWorldMatrix");
    const inversions = vi.spyOn(Matrix4.prototype, "invert");
    for (let i = 0; i < 10; i++) scene.update(view);
    expect(cameraUpdates).not.toHaveBeenCalled();
    expect(inversions).not.toHaveBeenCalled();
    expect(mesh.geometry.index!.version).toBe(version);
    view.position.x = 1;
    view.updateMatrixWorld();
    inversions.mockClear();
    scene.update(view);
    expect(inversions).not.toHaveBeenCalled();
    expect(mesh.geometry.groups.map((g) => [g.count, g.materialIndex])).toEqual(
      [[9, 0]],
    );
    expect(mesh.geometry.drawRange.count).toBe(9);
    expect(mesh.geometry.index).not.toBe(firstIndex);
    // Moving the shape past the same camera invalidates its cached inverse.
    scene.position.x = 2;
    scene.updateMatrixWorld(true);
    scene.update(view);
    expect(inversions).toHaveBeenCalledTimes(1);
    expect(mesh.geometry.index).toBe(firstIndex);
    scene.position.x = 0;
    scene.updateMatrixWorld(true);
    scene.update(view);
    inversions.mockRestore();
    cameraUpdates.mockRestore();
    const other = clone(scene) as DTSShape;
    other.update(view);
    expect(meshes(other)[0].geometry.index).toBe(mesh.geometry.index);
    const sharedIndex = mesh.geometry.index;
    meshes(other)[0].geometry.addEventListener("dispose", () => {
      expect(meshes(other)[0].geometry.index).toBeNull();
    });
    meshes(other)[0].disposeGeometry();
    expect(mesh.geometry.index).toBe(sharedIndex);
    view.position.x = -1;
    view.updateMatrixWorld();
    scene.update(view);
    expect(mesh.geometry.index).toBe(firstIndex);
    expect(firstIndex.version).toBe(version);
  });

  it.each([false, true])(
    "handles packed decal materials and changing frame ranges (untextured: %s)",
    (untextured) => {
      const data = createDTSTestShape(),
        source = data.meshes[0];
      data.decals = [
        {
          nameIndex: 1,
          objectIndex: 0,
          numMeshes: 1,
          startMeshIndex: 1,
        },
      ];
      data.subShapes[0].numDecals = 1;
      data.decalStates = new Int32Array([-1]);
      data.meshes.push({
        ...source,
        type: 2,
        decal: {
          startPrimitive: new Int32Array([0, 2]),
          texgenS: new Float32Array([1, 0, 0, 0, 1, 0, 0, 1]),
          texgenT: new Float32Array([0, 1, 0, 0, 0, 1, 0, 0]),
          materialIndex:
            DTSPrimitiveFlags.Indexed |
            (untextured ? DTSPrimitiveFlags.NoMaterial : 0),
        },
        primitives: [
          ...source.primitives,
          ...source.primitives,
          ...source.primitives,
        ],
      });
      const texture = new Texture();
      const { scene } = buildDTS(data, { texture: () => texture });
      scene.update(camera);
      expect(meshes(scene).some((mesh) => mesh.binding!.decalIndex === 0)).toBe(
        false,
      );
      const waiting = clone(scene) as DTSShape;
      scene.position.x = 5;
      scene.updateMatrixWorld(true);
      scene.decalFrames[0] = 0;
      scene.update(camera);
      const decal = meshes(scene).find(
        (mesh) => mesh.binding!.decalIndex === 0,
      )!;
      expect(decal.binding!.materialIndex).toBe(untextured ? -1 : 0);
      expect((decal.material as MeshLambertMaterial).map).toBe(
        untextured ? null : texture,
      );
      expect(decal.geometry.drawRange.count).toBe(6);
      expect(decal.parent!.visible).toBe(true);
      expect(new Vector3().setFromMatrixPosition(decal.matrixWorld).x).toBe(5);
      const uv = decal.geometry.getAttribute("uv") as BufferAttribute,
        version = decal.geometry.index!.version;
      const uvVersion = uv.version;
      const u = uv.getX(0);
      for (let i = 0; i < 10; i++) scene.update(camera);
      expect(uv.version).toBe(uvVersion);
      expect(decal.geometry.index!.version).toBe(version);
      scene.decalFrames[0] = 1;
      scene.update(camera);
      expect(decal.geometry.drawRange.count).toBe(3);
      expect(uv.getX(0)).toBe(u + 1);
      expect(uv.version).toBeGreaterThan(uvVersion);
      scene.decalFrames[0] = -1;
      scene.update(camera);
      expect(decal.parent!.visible).toBe(false);
      // Another instance still has its own pending decal after this one retired it.
      waiting.decalFrames[0] = 1;
      waiting.update(camera);
      const otherDecal = meshes(waiting).find(
        (m) => m.binding!.decalIndex === 0,
      )!;
      expect(otherDecal.parent!.visible).toBe(true);
      expect(otherDecal.geometry.getAttribute("uv").getX(0)).toBe(u + 1);
      const expanded = clone(waiting) as DTSShape;
      expanded.update(camera);
      expect(meshes(expanded)).toHaveLength(2);
    },
  );

  it("reads aligned arrays without copying and handles unaligned older files", () => {
    for (const offset of [0, 1]) {
      const buffer = new ArrayBuffer(32),
        view = new DataView(buffer);
      view.setFloat32(offset, 1.25, true);
      view.setInt32(offset + 4, -123, true);
      view.setInt16(offset + 8, -456, true);
      const reader = new DTSStream(buffer, offset);
      const floats = reader.floats(1);
      expect([...floats]).toEqual([1.25]);
      expect([...reader.ints(1)]).toEqual([-123]);
      expect([...reader.shorts(1)]).toEqual([-456]);
      if (!offset) expect(floats.buffer).toBe(buffer);
      else expect(floats.buffer).not.toBe(buffer);
      expect(() => reader.floats(99)).toThrow(/truncated/);
    }
  });
});
