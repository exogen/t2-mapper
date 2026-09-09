import { describe, expect, it } from "vitest";
import {
  AnimationMixer,
  Euler,
  Group,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { buildDTS } from "./dtsBuilder";
import { DTSAnimationMixer } from "./dtsAnimationMixer";
import { createDTSRigidTestShape, createDTSSequence } from "./dtsTestFixtures";
import type { DTSShape } from "./dtsModel";
import { dtsVector } from "./dtsGeometry";
import {
  MOUNTED_OBJECT_ROTATION,
  SHAPE_MODEL_ROTATION_Y,
} from "../world/placement";

describe("animation on mounted DTS shapes", () => {
  for (const Mixer of [AnimationMixer, DTSAnimationMixer]) {
    it(`${Mixer.name} confines pose and object tracks to their own shape`, () => {
      const data = createDTSRigidTestShape();
      data.objectStates.push({ visibility: 0.4, frame: 2, materialFrame: 3 });
      data.translations = new Float32Array([7, 8, 9]);
      data.sequences = [
        createDTSSequence({
          nameIndex: data.names.push("mounted-test") - 1,
          numKeyframes: 1,
          translationMatters: [1],
          visibilityMatters: [1],
          frameMatters: [1],
          materialFrameMatters: [1],
          baseObjectState: 2,
        }),
      ];
      const model = buildDTS(data);
      const parent = clone(model.scene) as DTSShape;
      const child = clone(model.scene) as DTSShape;
      // The mount comes before the parent's second node in depth-first order.
      const mount = parent.getNode(0)!;
      mount.add(child);
      mount.children.unshift(mount.children.pop()!);
      const childPose = child.getNode(1)!.parent!.position.clone();
      const mixer = new Mixer(parent);
      mixer.clipAction(model.animations[0]).play();
      mixer.update(0);
      expect(parent.getShapeObject(1)!.opacity).toBeCloseTo(0.4);
      expect(parent.getShapeObject(1)!.frame).toBe(2);
      expect(parent.getShapeObject(1)!.materialFrame).toBe(3);
      expect(parent.getNode(1)!.parent!.position.toArray()).toEqual([-7, 9, 8]);
      expect(child.getShapeObject(1)!.opacity).toBe(1);
      expect(child.getShapeObject(1)!.frame).toBe(0);
      expect(child.getShapeObject(1)!.materialFrame).toBe(0);
      expect(child.getNode(1)!.parent!.position).toEqual(childPose);
      parent.updateMatrixWorld(true);
      expect(
        new Vector3()
          .setFromMatrixPosition(parent.getNode(1)!.matrixWorld)
          .toArray(),
      ).toEqual([-8, 12, 10]);
      const childMixer = new Mixer(child);
      childMixer.clipAction(model.animations[0]).play();
      childMixer.update(0);
      expect(child.getShapeObject(1)!.opacity).toBeCloseTo(0.4);
      // Stopping the parent must not restore the mounted child's properties.
      mixer.uncacheRoot(parent);
      expect(child.getShapeObject(1)!.opacity).toBeCloseTo(0.4);
      expect(model.scene.getShapeObject(1)!.opacity).toBe(1);
      childMixer.uncacheRoot(child);
    });
  }

  it.each([0, 0.8, 1.5])(
    "preserves the engine's animated object-mount frame (rotation %s)",
    (angle) => {
      const data = createDTSRigidTestShape();
      data.defaultTranslations.fill(0);
      const mountRotation = new Quaternion().setFromEuler(
        new Euler(angle, 0.3, -0.7),
      );
      // Torque QuatF uses the inverse of Three's quaternion convention.
      data.rotations = Int16Array.from(mountRotation.toArray(), (v, i) =>
        Math.round(v * (i === 3 ? 32767 : -32767)),
      );
      data.translations = new Float32Array([2, 3, 4]);
      data.sequences = [
        createDTSSequence({
          numKeyframes: 1,
          rotationMatters: [1],
          translationMatters: [1],
        }),
      ];
      const { scene, animations } = buildDTS(data);
      const mixer = new AnimationMixer(scene);
      mixer.clipAction(animations[0]).play();
      mixer.update(0);
      const worldBasis = new Matrix4().set(
        0,
        1,
        0,
        0,
        0,
        0,
        1,
        0,
        1,
        0,
        0,
        0,
        0,
        0,
        0,
        1,
      );
      const parentTransform = new Matrix4()
        .makeRotationZ(0.4)
        .setPosition(11, 12, 13);
      const parent = new Group();
      parent.applyMatrix4(
        worldBasis
          .clone()
          .multiply(parentTransform)
          .multiply(worldBasis.clone().invert()),
      );
      scene.rotation.y = SHAPE_MODEL_ROTATION_Y;
      parent.add(scene);
      const correction = new Group(),
        child = new Group();
      correction.rotation.set(...MOUNTED_OBJECT_ROTATION);
      child.rotation.y = SHAPE_MODEL_ROTATION_Y;
      scene.getNode(1)!.add(correction);
      correction.add(child);
      parent.updateMatrixWorld(true);
      const mountTransform = new Matrix4()
        .makeRotationFromQuaternion(mountRotation)
        .setPosition(2, 3, 4);
      for (const point of [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ]) {
        const actual = dtsVector(point).applyMatrix4(child.matrixWorld);
        const torque = new Vector3(...point)
          .applyMatrix4(mountTransform)
          .applyMatrix4(parentTransform);
        const expected = new Vector3(torque.y, torque.z, torque.x);
        expect(actual.distanceTo(expected)).toBeLessThan(0.0001);
      }
      mixer.uncacheRoot(scene);
    },
  );
});
