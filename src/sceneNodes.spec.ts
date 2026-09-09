import { describe, expect, it, vi } from "vitest";
import { AnimationMixer, Group, Object3D, Vector3 } from "three";
import { collectOwnNodes, findOwnNode, getOwnNodePosition } from "./sceneNodes";
import { buildDTS } from "./dts/dtsBuilder";
import { createDTSRigidTestShape } from "./dts/dtsTestFixtures";

function shape(): { root: Group; pilotNozzle: Object3D } {
  const root = new Group();
  const mount = new Object3D();
  mount.name = "mount0";
  const nozzle = new Object3D();
  nozzle.name = "Jetnozzle0";
  root.add(mount, nozzle);
  // A pilot portaled into the seat, with his own jet nozzle.
  const portal = new Group();
  portal.userData.objectMount = true;
  const pilotNozzle = new Object3D();
  pilotNozzle.name = "Jetnozzle0";
  portal.add(pilotNozzle);
  mount.add(portal);
  return { root, pilotNozzle };
}

describe("sceneNodes", () => {
  it("reads each interpolated pose locally without world-matrix queries", () => {
    const data = createDTSRigidTestShape();
    data.sequences[0].numKeyframes = 2;
    data.translations = new Float32Array([1, 2, 3, 9, 10, 11]);
    const { scene, nodes, animations } = buildDTS(data);
    const parent = new Group();
    parent.add(scene);
    parent.position.set(1500, -2000, 5000);
    parent.rotation.set(0.2, 0.7, 0.4);
    parent.scale.set(2, 3, 4);
    scene.rotation.y = 0.5;
    const eye = nodes[1];
    const mixer = new AnimationMixer(scene);
    mixer.clipAction(animations[0]).play();
    const query = vi.spyOn(scene, "updateWorldMatrix");
    const positions = new Set<string>();
    for (let frame = 0; frame < 8; frame++) {
      mixer.setTime(frame * 0.004);
      parent.position.x += 0.2;
      eye.rotation.y = frame * 0.01;
      query.mockClear();
      const local = getOwnNodePosition(scene, eye, new Vector3())!;
      expect(query).not.toHaveBeenCalled();
      const expected = scene.worldToLocal(eye.getWorldPosition(new Vector3()));
      expect(local.distanceTo(expected)).toBeLessThan(1e-9);
      positions.add(local.toArray().join(","));
    }
    expect(positions.size).toBe(8);
  });

  it("honors local matrices and excludes mounted or unrelated nodes", () => {
    const { root, pilotNozzle } = shape();
    const child = new Object3D();
    child.matrixAutoUpdate = false;
    child.matrix.makeTranslation(1, 2, 3);
    root.add(child);
    expect(getOwnNodePosition(root, child, new Vector3())?.toArray()).toEqual([
      1, 2, 3,
    ]);
    expect(getOwnNodePosition(root, root, new Vector3())?.toArray()).toEqual([
      0, 0, 0,
    ]);
    expect(getOwnNodePosition(root, pilotNozzle, new Vector3())).toBeNull();
    expect(getOwnNodePosition(root, new Object3D(), new Vector3())).toBeNull();
  });

  it("matches node names case insensitively", () => {
    const { root } = shape();
    expect(findOwnNode(root, "Mount0")?.name).toBe("mount0");
    expect(collectOwnNodes(root).get("mount0")?.name).toBe("mount0");
  });

  it("never returns nodes inside mounted content", () => {
    const { root, pilotNozzle } = shape();
    const own = findOwnNode(root, "jetnozzle0");
    expect(own).not.toBe(pilotNozzle);
    expect(own?.parent).toBe(root);
    expect(collectOwnNodes(root).get("jetnozzle0")).toBe(own);
  });
});
