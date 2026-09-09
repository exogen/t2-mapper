import { describe, expect, it } from "vitest";
import { BoxGeometry, Group, Mesh } from "three";
import { buildDTS } from "../dts/dtsBuilder";
import { createDTSCollisionTestShape } from "../dts/dtsTestFixtures";
import {
  interiorColliderMeshes,
  staticShapeColliderMeshes,
} from "./colliderPolicy";

describe("interiorColliderMeshes", () => {
  it("collects direct child meshes without nested debug helpers", () => {
    const group = new Group(),
      mesh = new Mesh(new BoxGeometry());
    const nested = new Group();
    nested.add(new Mesh(new BoxGeometry()));
    group.add(mesh, nested);
    expect(interiorColliderMeshes(group)).toEqual([mesh]);
  });
  it("updates world matrices so colliders are placed, not left at origin", () => {
    const root = new Group(),
      model = new Group();
    root.position.set(10, 20, 30);
    root.add(model);
    model.add(new Mesh(new BoxGeometry()));
    const [collider] = interiorColliderMeshes(model);
    expect(collider.matrixWorld.elements.slice(12, 15)).toEqual([10, 20, 30]);
  });
});
describe("staticShapeColliderMeshes", () => {
  it.each(["TSStatic", "StaticShape"])(
    "registers named details of %s regardless of shape name or size",
    (type) => {
      const { scene } = buildDTS(createDTSCollisionTestShape());
      scene.name = "borg_tree_large.dts";
      scene.scale.setScalar(0.1);
      const wrapper = new Group();
      wrapper.position.set(10, 20, 30);
      wrapper.add(scene);
      const meshes = staticShapeColliderMeshes({ root: wrapper, type })!;
      expect(meshes).toHaveLength(1);
      expect(meshes[0].geometry.getAttribute("position").getX(0)).toBe(
        type === "TSStatic" ? 1 : 2,
      );
      expect(meshes[0].matrixWorld.elements.slice(12, 15)).toEqual([
        10, 20, 30,
      ]);
      expect(meshes[0].matrixWorld.getMaxScaleOnAxis()).toBeCloseTo(0.1);
    },
  );
  it("does not register dynamic entities as static-world occluders", () => {
    const { scene } = buildDTS(createDTSCollisionTestShape());
    for (const type of ["Item", "Turret", "Player"])
      expect(staticShapeColliderMeshes({ root: scene, type })).toBeNull();
  });
  it("never falls back to arbitrary render geometry", () => {
    const root = new Group();
    root.add(new Mesh(new BoxGeometry(100, 100, 100)));
    expect(staticShapeColliderMeshes({ root, type: "TSStatic" })).toBeNull();
    const data = createDTSCollisionTestShape();
    data.details.length = 1;
    expect(
      staticShapeColliderMeshes({
        root: buildDTS(data).scene,
        type: "TSStatic",
      }),
    ).toBeNull();
  });
});
