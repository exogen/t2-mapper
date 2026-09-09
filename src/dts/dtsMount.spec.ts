import { describe, expect, it } from "vitest";
import { AnimationMixer, Matrix4, Quaternion, Vector3 } from "three";
import { buildDTS } from "./dtsBuilder";
import { DTS_BASIS } from "./dtsGeometry";
import { getDTSImageMountTransform } from "./dtsMount";
import { createDTSRigidTestShape, createDTSSequence } from "./dtsTestFixtures";
import { getImageMountOffset } from "../stream/imageMount";

describe("engine image mount transform", () => {
  it("accumulates defaults from the grip toward the root before inversion", () => {
    const data = createDTSRigidTestShape();
    data.names[data.nodes[1].nameIndex] = "mountPoint";
    data.defaultTranslations = new Float32Array([10, 0, 0, 0, 2, 0]);
    // Torque's quaternion convention is the inverse of Three's.
    data.defaultRotations = new Int16Array([
      0, 0, -23170, 23170, -23170, 0, 0, 23170,
    ]);
    data.translations = new Float32Array([100, 200, 300]);
    data.sequences = [
      createDTSSequence({
        nameIndex: data.names.push("Root") - 1,
        numKeyframes: 1,
        translationMatters: [0],
      }),
    ];
    const model = buildDTS(data);
    const mixer = new AnimationMixer(model.scene);
    mixer.clipAction(model.animations[0]).play();
    mixer.update(0);
    const parent = new Matrix4()
      .makeRotationZ(Math.PI / 2)
      .setPosition(10, 0, 0);
    const grip = new Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 2, 0);
    const offset = getImageMountOffset({
      offset: "1 2 3",
      rotation: "0 1 0 60",
    })!;
    const offsetTorque = new Matrix4()
      .makeRotationY(-Math.PI / 3)
      .setPosition(1, 2, 3);
    const expected = DTS_BASIS.clone()
      .multiply(offsetTorque)
      .multiply(grip.clone().multiply(parent).invert())
      .multiply(DTS_BASIS);
    const actual = getDTSImageMountTransform(data, offset);
    actual.elements.forEach((v, i) =>
      expect(v).toBeCloseTo(expected.elements[i], 5),
    );
    expect(getDTSImageMountTransform(model.scene.clone().data, offset)).toBe(
      actual,
    );
    expect(getDTSImageMountTransform(data)).toBe(
      getDTSImageMountTransform(data),
    );
    mixer.uncacheRoot(model.scene);
  });

  it("uses the datablock offset when the image has no mountPoint", () => {
    const data = createDTSRigidTestShape();
    expect(getDTSImageMountTransform(data).elements).toEqual(
      new Matrix4().elements,
    );
    const offset = {
      position: [1, 2, 3] as [number, number, number],
      quaternion: new Quaternion()
        .setFromAxisAngle(new Vector3(0, 1, 0), 0.4)
        .toArray() as [number, number, number, number],
    };
    const expected = new Matrix4().compose(
      new Vector3(...offset.position),
      new Quaternion(...offset.quaternion),
      new Vector3(1, 1, 1),
    );
    expect(getDTSImageMountTransform(data, offset).elements).toEqual(
      expected.elements,
    );
  });
});
