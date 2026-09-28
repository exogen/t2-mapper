import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDTS } from "../dts/dtsBuilder";
import { DTSMesh } from "../dts/dtsModel";
import { createDTSRigidTestShape } from "../dts/dtsTestFixtures";
import { createChestPhysics } from "./chestPhysics";

afterEach(() => vi.restoreAllMocks());

function fixture() {
  const data = createDTSRigidTestShape();
  data.names[data.objects[0].nameIndex] = "Submesh_torso";
  const scene = buildDTS(data).scene;
  let mesh: DTSMesh;
  scene.traverse((node) => {
    if (node instanceof DTSMesh && node.binding?.objectIndex === 0) mesh = node;
  });
  return { scene, mesh: mesh! };
}

describe("optional chest physics safety", () => {
  it.each(["nan", "singular", "exception", "time"])(
    "restores the native model after a %s failure and stops retrying",
    (failure) => {
      const { scene, mesh } = fixture();
      const original = mesh.geometry;
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const physics = createChestPhysics(scene, "light_female.dts")!;
      physics.update(0, 0, 3, 1);
      expect(mesh.geometry.morphAttributes.position).toHaveLength(8);
      const bone = scene.getNode(scene.data.objects[0].nodeIndex)!;
      const update = vi.spyOn(bone, "updateWorldMatrix");
      if (failure === "nan") bone.position.x = NaN;
      if (failure === "singular") bone.scale.setScalar(0);
      if (failure === "exception")
        update.mockImplementation(() => {
          throw new Error("Transform failure");
        });
      expect(() =>
        physics.update(failure === "time" ? NaN : 0.1, 0, 3, 1),
      ).not.toThrow();
      expect(mesh.geometry.attributes).toEqual(original.attributes);
      expect(mesh.geometry.morphAttributes).toEqual({});
      expect(mesh.morphTargetInfluences).toBeUndefined();
      const calls = update.mock.calls.length;
      physics.update(0.2, 0, 3, 1);
      physics.dispose();
      physics.dispose();
      expect(update).toHaveBeenCalledTimes(calls);
      expect(warn).toHaveBeenCalledOnce();
    },
  );

  it("contains errors while finding the model's torso", () => {
    const { scene } = fixture();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(scene, "getNode").mockImplementation(() => {
      throw new Error("Missing transform");
    });
    expect(createChestPhysics(scene, "light_female.dts")).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  });
});
