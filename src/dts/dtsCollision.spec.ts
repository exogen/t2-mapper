import { afterEach, describe, expect, it, vi } from "vitest";
import { Group, Mesh, Vector3 } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { buildDTS } from "./dtsBuilder";
import { DTSObject, isDTSMesh } from "./dtsModel";
import { getDTSCollisionDetails, getDTSCollisionMeshes } from "./dtsCollision";
import { createDTSCollisionTestShape } from "./dtsTestFixtures";
import {
  castWorldRay,
  clearWorldColliders,
  pointObstructed,
  registerStaticShapeCollider,
  withCollisionQueryBatch,
} from "../collision/worldCollision";

afterEach(clearWorldColliders);

describe("engine DTS detail selection", () => {
  it("uses collision slots for TSStatic and per-slot LOS fallback for ShapeBase", () => {
    const data = createDTSCollisionTestShape();
    data.names[3] = "cOLLiSION-1";
    data.names.push("Collision-2", "LOS-10-extra", "Collision-9");
    data.details.push(
      { ...data.details[1], nameIndex: 5 },
      { ...data.details[1], nameIndex: 6 },
      { ...data.details[1], nameIndex: 7 },
    );
    expect(getDTSCollisionDetails(data, "TSStatic")).toEqual([
      1, 3, -1, -1, -1, -1, -1, -1,
    ]);
    expect(getDTSCollisionDetails(data, "ShapeBase")).toEqual([
      2, 3, -1, -1, -1, -1, -1, -1,
    ]);
    expect(getDTSCollisionDetails(data, "ShapeBase", "collision")).toEqual([
      1, 3, -1, -1, -1, -1, -1, -1,
    ]);
  });
  it("does not fall back when a named LOS detail exists but has no mesh", () => {
    const data = createDTSCollisionTestShape();
    data.objects[0].numMeshes = 2;
    expect(getDTSCollisionMeshes(buildDTS(data).scene, "ShapeBase")).toEqual(
      [],
    );
    expect(
      getDTSCollisionMeshes(buildDTS(data).scene, "TSStatic"),
    ).toHaveLength(1);
  });
  it("ignores material partitions, transparency, helpers, and mounted shapes", () => {
    const data = createDTSCollisionTestShape();
    data.materials.push({
      ...data.materials[0],
      name: "transparent",
      flags: 4,
    });
    data.meshes[1].primitives = [
      { start: 0, count: 18, material: 0x20000000 },
      { start: 18, count: 18, material: 0x20000001 },
    ];
    const scene = clone(buildDTS(data).scene);
    scene.add(new Mesh());
    scene.add(buildDTS(data).scene);
    const meshes = getDTSCollisionMeshes(scene, "TSStatic");
    expect(meshes).toHaveLength(1);
    expect(meshes[0].geometry.index!.count).toBe(36);
    expect(meshes[0].geometry.groups).toEqual([]);
  });
});

describe("engine DTS hull rays", () => {
  it("shares current collider poses across a query batch without retaining them afterward", () => {
    const { scene } = buildDTS(createDTSCollisionTestShape());
    const meshes = getDTSCollisionMeshes(scene, "TSStatic");
    registerStaticShapeCollider("batched", meshes);
    const refresh = meshes.map((mesh) => vi.spyOn(mesh, "updateForCollision"));
    const probe = () => [
      ray([-5, 0, 0], [5, 0, 0]),
      pointObstructed([0, 0, 0], 0.1, { includeStatics: true }),
      ray([-15, 5, 0], [15, 5, 0]),
    ];
    const expected = probe();
    refresh.forEach((spy) => spy.mockClear());
    withCollisionQueryBatch(() => {
      expect(probe()).toEqual(expected);
      withCollisionQueryBatch(() => expect(probe()).toEqual(expected));
      expect(probe()).toEqual(expected);
    });
    refresh.forEach((spy) => expect(spy).toHaveBeenCalledOnce());

    // A later batch must see parent motion, even before a render traversal.
    scene.position.z = 10;
    withCollisionQueryBatch(() => {
      expect(ray([-5, 0, 0], [5, 0, 0])).toBeNull();
      expect(ray([0, 0, 0], [20, 0, 0])?.t).toBeCloseTo(0.45);
    });
    refresh.forEach((spy) => expect(spy).toHaveBeenCalledTimes(2));

    const object = scene.getObjectByName("__dts_object_0") as DTSObject;
    object.opacity = 0;
    withCollisionQueryBatch(() => {
      expect(ray([0, 0, 0], [20, 0, 0])).toBeNull();
      expect(ray([0, 0, 0], [20, 0, 0])).toBeNull();
    });
    refresh.forEach((spy) => expect(spy).toHaveBeenCalledTimes(3));
    object.opacity = 1;
    expect(() =>
      withCollisionQueryBatch(() => {
        expect(ray([0, 0, 0], [20, 0, 0])).not.toBeNull();
        throw new Error("cancel query");
      }),
    ).toThrow("cancel query");
    scene.position.z = 30;
    expect(ray([0, 0, 0], [20, 0, 0])).toBeNull();
    refresh.forEach((spy) => expect(spy).toHaveBeenCalledTimes(5));
  });
  function register(type: "TSStatic" | "ShapeBase" = "TSStatic") {
    const model = buildDTS(createDTSCollisionTestShape());
    registerStaticShapeCollider(
      "tree",
      getDTSCollisionMeshes(model.scene, type),
    );
    return model;
  }
  const ray = (
    start: [number, number, number],
    end: [number, number, number],
  ) => castWorldRay(start, end, { includeStatics: true });
  it("hits the authored trunk hull while bypassing surrounding render planes", () => {
    register();
    expect(ray([-5, 0, 0], [5, 0, 0])?.t).toBeCloseTo(0.4);
    expect(ray([5, 0, 0], [-5, 0, 0])?.normal).toEqual([1, 0, 0]);
    expect(ray([-15, 5, 0], [15, 5, 0])).toBeNull();
    expect(castWorldRay([-5, 0, 0], [5, 0, 0])).toBeNull();
  });
  it("uses LOS geometry for ShapeBase", () => {
    register("ShapeBase");
    expect(ray([-5, 0, 0], [5, 0, 0])?.t).toBeCloseTo(0.3);
  });
  it("rejects exits and misses, but treats a camera inside a hull as obstructed", () => {
    register();
    expect(ray([0, 0, 0], [5, 0, 0])).toBeNull();
    expect(ray([-5, 0, 0], [-2, 0, 0])).toBeNull();
    expect(ray([-5, 2, 0], [5, 2, 0])).toBeNull();
    expect(pointObstructed([0, 0, 0], 0.1, { includeStatics: true })).toBe(
      true,
    );
  });
  it("follows object visibility and transforms without exposing collision details for rendering", () => {
    const { scene } = register();
    const object = scene.getObjectByName("__dts_object_0") as DTSObject;
    object.opacity = 0.01;
    expect(ray([-5, 0, 0], [5, 0, 0])).toBeNull();
    object.opacity = 0.2;
    expect(ray([-5, 0, 0], [5, 0, 0])).not.toBeNull();
    scene.position.z = 10;
    scene.scale.set(1, 2, 3);
    expect(ray([-5, 0, 0], [5, 0, 0])).toBeNull();
    expect(ray([0, 0, 0], [20, 0, 0])?.t).toBeCloseTo(0.35);
    scene.traverse((node) => {
      if (isDTSMesh(node) && node.binding!.detailIndices.includes(1))
        expect(node.parent!.visible).toBe(false);
    });
  });
  it("selects animated collision frames even while their render detail is hidden", () => {
    const data = createDTSCollisionTestShape(),
      source = data.meshes[1];
    source.numFrames = 2;
    source.vertices = new Float32Array([
      ...source.vertices,
      ...source.vertices.map((v, i) => (i % 3 === 0 ? v + 10 : v)),
    ]);
    source.normals = new Float32Array([...source.normals, ...source.normals]);
    const { scene } = buildDTS(data);
    registerStaticShapeCollider(
      "animated",
      getDTSCollisionMeshes(scene, "TSStatic"),
    );
    expect(ray([0, -5, 0], [0, 5, 0])).not.toBeNull();
    const object = scene.getObjectByName("__dts_object_0") as DTSObject;
    object.frame = 1;
    expect(ray([0, -5, 0], [0, 5, 0])).toBeNull();
    expect(ray([0, -15, 0], [0, -5, 0])?.t).toBeCloseTo(0.4);
  });
  it("keeps transformed instances independent", () => {
    const original = buildDTS(createDTSCollisionTestShape()).scene;
    const instance = clone(original);
    const wrapper = new Group();
    wrapper.position.set(8, 3, 4);
    wrapper.rotation.y = Math.PI / 3;
    wrapper.scale.set(2, 3, 4);
    wrapper.add(instance);
    const [collider] = getDTSCollisionMeshes(wrapper, "TSStatic");
    registerStaticShapeCollider("instance", [collider]);
    const toTorque = (v: Vector3): [number, number, number] => [v.z, v.x, v.y];
    const start = new Vector3(-5, 0, 0).applyMatrix4(collider.matrixWorld);
    const end = new Vector3(5, 0, 0).applyMatrix4(collider.matrixWorld);
    expect(ray(toTorque(start), toTorque(end))?.t).toBeCloseTo(0.4);
    expect(original.position.toArray()).toEqual([0, 0, 0]);
  });
});
