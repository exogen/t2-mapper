import { describe, expect, it, vi } from "vitest";
import { FrontSide, Mesh, VectorKeyframeTrack } from "three";
import { buildDTS } from "../dts/dtsBuilder";
import { DTSAnimationClip } from "../dts/dtsModel";
import { createDTSRigidTestShape } from "../dts/dtsTestFixtures";
import { SHAPE_MODEL_ROTATION_Y } from "../world/placement";
import { createPlayerPresentation } from "./playerPresentation";

function createModel() {
  const data = createDTSRigidTestShape();
  // Untextured fixture keeps this test independent of browser image loading.
  data.materials.forEach((material) => (material.name = ""));
  return buildDTS(data);
}

describe("createPlayerPresentation", () => {
  it("keeps the live player's rotation, material and transform setup", () => {
    const model = createModel();
    const player = createPlayerPresentation({
      model,
      anisotropy: 1,
      emap: false,
      skinUrl: undefined,
    });
    expect(player.root.children).toEqual([player.rotated]);
    expect(player.rotated.children).toEqual([player.scene]);
    expect(player.rotated.rotation.y).toBe(SHAPE_MODEL_ROTATION_Y);
    expect(player.root.matrixAutoUpdate).toBe(false);
    expect(player.rotated.matrixAutoUpdate).toBe(false);
    expect(player.scene.matrixAutoUpdate).toBe(false);
    let meshes = 0;
    player.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      meshes++;
      expect(object.frustumCulled).toBe(false);
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      expect(materials.every((material) => material.side === FrontSide)).toBe(
        true,
      );
    });
    expect(meshes).toBeGreaterThan(0);
    player.dispose();
  });

  it("animates and disposes its own instance while retaining cached geometry", () => {
    const model = createModel();
    const player = createPlayerPresentation({
      model,
      anisotropy: 1,
      emap: false,
      skinUrl: undefined,
    });
    const node = player.scene.getObjectByName(model.nodes[0].name)!;
    const sourcePosition = model.nodes[0].position.clone();
    const clip = new DTSAnimationClip("root", 1, [
      new VectorKeyframeTrack(
        `${node.name}.position`,
        [0, 1],
        [0, 0, 0, 0, 2, 0],
      ),
    ]);
    player.mixer.clipAction(clip).play();
    player.mixer.update(0.5);
    expect(node.position.y).toBeCloseTo(1);
    expect(model.nodes[0].position.equals(sourcePosition)).toBe(true);

    const geometryDisposals: ReturnType<typeof vi.fn>[] = [];
    const materialDisposals: ReturnType<typeof vi.fn>[] = [];
    player.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const geometryDisposed = vi.fn();
      object.geometry.addEventListener("dispose", geometryDisposed);
      geometryDisposals.push(geometryDisposed);
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        const materialDisposed = vi.fn();
        material.addEventListener("dispose", materialDisposed);
        materialDisposals.push(materialDisposed);
      }
    });
    player.dispose();
    expect(player.rotated.children).toHaveLength(0);
    expect(
      geometryDisposals.every((disposed) => !disposed.mock.calls.length),
    ).toBe(true);
    expect(
      materialDisposals.every((disposed) => disposed.mock.calls.length),
    ).toBe(true);
    expect(player.mixer.existingAction(clip)).toBeNull();
  });
});
