import { describe, expect, it } from "vitest";
import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  Object3D,
  SkinnedMesh,
  Vector3,
} from "three";
import {
  MIN_OCCLUDER_EXTENT,
  interiorColliderMeshes,
  staticShapeColliderMeshes,
} from "./colliderPolicy";

function bigMesh(size = 10): Mesh {
  return new Mesh(new BoxGeometry(size, size, size));
}

describe("interiorColliderMeshes", () => {
  it("collects direct child meshes", () => {
    const group = new Group();
    group.add(bigMesh(), bigMesh());
    expect(interiorColliderMeshes(group)).toHaveLength(2);
  });

  it("ignores meshes nested deeper", () => {
    // Debug helpers (labels, bounds) live in nested groups and must
    // never become collision geometry.
    const group = new Group();
    group.add(bigMesh());
    const nested = new Group();
    nested.add(bigMesh());
    group.add(nested);
    expect(interiorColliderMeshes(group)).toHaveLength(1);
  });

  it("updates world matrices so colliders are placed, not left at origin", () => {
    const root = new Group();
    root.position.set(10, 20, 30);
    const model = new Group();
    root.add(model);
    const mesh = bigMesh();
    model.add(mesh);

    const [collider] = interiorColliderMeshes(model);
    expect(collider.matrixWorld.elements.slice(12, 15)).toEqual([10, 20, 30]);
  });
});

describe("staticShapeColliderMeshes", () => {
  const accepted = (root: Object3D, type: string, shapeName?: string) =>
    staticShapeColliderMeshes({ root, type, shapeName });

  it("accepts mission statics", () => {
    for (const type of ["TSStatic", "StaticShape"]) {
      const root = new Group();
      root.add(bigMesh());
      expect(accepted(root, type)).toHaveLength(1);
    }
  });

  it("rejects classes that are not occluders", () => {
    // Items and turrets are shapes too, but they move or are small;
    // registering them would block shots the viewer can see past.
    for (const type of ["Item", "Turret", "Player"]) {
      const root = new Group();
      root.add(bigMesh());
      expect(accepted(root, type)).toBeNull();
    }
  });

  it("rejects vegetation", () => {
    // Crossed alpha planes read solid to a ray while looking sparse.
    const root = new Group();
    root.add(bigMesh());
    expect(accepted(root, "TSStatic", "borg_tree_large.dts")).toBeNull();
  });

  it("rejects shapes below the minimum extent", () => {
    const root = new Group();
    root.add(bigMesh(MIN_OCCLUDER_EXTENT - 0.5));
    expect(accepted(root, "TSStatic")).toBeNull();
  });

  it("accepts shapes at the minimum extent", () => {
    const root = new Group();
    root.add(bigMesh(MIN_OCCLUDER_EXTENT + 0.5));
    expect(accepted(root, "TSStatic")).toHaveLength(1);
  });

  it("skips skinned meshes, whose bind pose is not where the surface is", () => {
    const root = new Group();
    root.add(bigMesh());
    const skinned = new SkinnedMesh(new BoxGeometry(10, 10, 10));
    // A real skinned mesh arrives bound to a skeleton; supply the box
    // directly so the fixture doesn't need one.
    skinned.boundingBox = new Box3(
      new Vector3(-5, -5, -5),
      new Vector3(5, 5, 5),
    );
    root.add(skinned);
    expect(accepted(root, "TSStatic")).toHaveLength(1);
  });

  it("returns null when there is no geometry at all", () => {
    expect(accepted(new Group(), "TSStatic")).toBeNull();
  });

  it("collects meshes nested anywhere in the shape", () => {
    // Unlike interiors, statics keep their GLB hierarchy.
    const root = new Group();
    const nested = new Group();
    nested.add(bigMesh());
    root.add(nested);
    expect(accepted(root, "TSStatic")).toHaveLength(1);
  });
});
