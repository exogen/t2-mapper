import { expect, it } from "vitest";
import { Group, Vector3 } from "three";
import { buildDTS } from "../dts/dtsBuilder";
import { createDTSTestShape } from "../dts/dtsTestFixtures";
import { imageFlashTransform } from "./useImageStateAnimation";

it.each([true, false])(
  "orients image flash along native +Y with mount0 present=%s",
  (hasMount) => {
    const data = createDTSTestShape();
    // Unreferenced by geometry or animation, so the named node is lazy.
    data.nodes.push({
      ...data.nodes[0],
      nameIndex: data.names.push(hasMount ? "Mount0" : "Unused") - 1,
      parentIndex: -1,
    });
    data.defaultTranslations = new Float32Array([
      ...data.defaultTranslations,
      2,
      3,
      4,
    ]);
    data.defaultRotations = new Int16Array([
      ...data.defaultRotations,
      0,
      0,
      -23170,
      23170,
    ]);
    const { scene } = buildDTS(data);
    const parent = new Group();
    parent.add(scene);
    parent.position.set(10, 20, 30);
    const position = new Vector3(),
      direction = new Vector3();
    // A mounted child's similarly named node must not be selected.
    const child = new Group();
    child.userData.imageMount = true;
    const decoy = new Group();
    decoy.name = "mount0";
    child.add(decoy);
    scene.add(child);
    for (const yaw of [0, 0.7, -1]) {
      parent.rotation.y = yaw;
      imageFlashTransform(scene, position, direction);
      // Native +Y rotated +90 degrees about Z is -X, converted to model +X.
      const expectedDir = new Vector3(
        ...(hasMount ? [1, 0, 0] : [0, 0, 1]),
      ).applyEuler(parent.rotation);
      const expectedPos = new Vector3(...(hasMount ? [-2, 4, 3] : [0, 0, 0]))
        .applyEuler(parent.rotation)
        .add(parent.position);
      expect(direction.distanceTo(expectedDir)).toBeLessThan(1e-8);
      expect(position.distanceTo(expectedPos)).toBeLessThan(1e-8);
    }
  },
);
