import {
  AdditiveAnimationBlendMode,
  AnimationClip,
  AnimationMixer,
  NormalAnimationBlendMode,
  NumberKeyframeTrack,
  Object3D,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
} from "three";
import { describe, expect, it } from "vitest";
import { buildDTS } from "../dts/dtsBuilder";
import { DTSAnimationMixer } from "../dts/dtsAnimationMixer";
import { DTSAnimationClip } from "../dts/dtsModel";
import { createDTSSequence, createDTSTestShape } from "../dts/dtsTestFixtures";
import { DTSSequenceFlags } from "../dts/dtsTypes";
import { createAnimationPoseSnapshot } from "./animationPoseSnapshot";

const rotation = (angle: number) =>
  new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), angle);

describe("animation pose snapshots", () => {
  it("holds the displayed numeric/quaternion pose while the same action restarts", () => {
    const root = new Object3D();
    const mixer = new AnimationMixer(root);
    const source = new AnimationClip("gesture", 1, [
      new NumberKeyframeTrack(".position[x]", [0, 1], [0, 8]),
      new QuaternionKeyframeTrack(
        ".quaternion",
        [0, 1],
        [...rotation(0).toArray(), ...rotation(1).toArray()],
      ),
    ]);
    const gesture = mixer.clipAction(source).play();
    const snapshot = createAnimationPoseSnapshot(mixer, [gesture, gesture]);
    mixer.update(0.75);
    const position = root.position.clone();
    const quaternion = root.quaternion.clone();
    const frozen = snapshot.capture();
    expect(frozen.getClip().tracks).toHaveLength(2);
    expect(frozen.getClip().tracks[1]).toBeInstanceOf(QuaternionKeyframeTrack);
    expect(frozen.getClip().blendMode).toBe(NormalAnimationBlendMode);
    expect(frozen.paused).toBe(true);
    gesture.stop();
    frozen.fadeOut(0.25);
    gesture.reset().setEffectiveWeight(1).fadeIn(0.25).play();
    mixer.update(0);
    expect(root.position.x).toBeCloseTo(position.x);
    expect(
      root.quaternion.clone().normalize().angleTo(quaternion.normalize()),
    ).toBeLessThan(0.0001);
    mixer.update(0.125);
    expect(root.position.x).toBeCloseTo((6 + 1) / 2);
    expect(
      root.quaternion
        .clone()
        .normalize()
        .angleTo(rotation((0.75 + 0.125) / 2)),
    ).toBeLessThan(0.0001);
    mixer.update(0.125);
    snapshot.stop();
    mixer.update(0);
    expect(root.position.x).toBeCloseTo(2);
    expect(
      root.quaternion.clone().normalize().angleTo(rotation(0.25)),
    ).toBeLessThan(0.0001);
    expect(source.tracks[0].times).toEqual(new Float32Array([0, 1]));
    expect(source.tracks[0].values).toEqual(new Float32Array([0, 8]));
    snapshot.dispose();
  });

  it("recaptures an interrupted blend without allocating actions and releases its cache", () => {
    const root = new Object3D();
    const mixer = new AnimationMixer(root);
    const gesture = mixer
      .clipAction(
        new AnimationClip("gesture", 1, [
          new NumberKeyframeTrack(".position[x]", [0, 1], [0, 8]),
        ]),
      )
      .play();
    const snapshot = createAnimationPoseSnapshot(mixer, [gesture]);
    mixer.update(0.75);
    const frozen = snapshot.capture();
    const frozenClip = frozen.getClip();
    const total = mixer.stats.actions.total;
    for (let i = 0; i < 30; i++) {
      const displayed = root.position.x;
      expect(snapshot.capture()).toBe(frozen);
      gesture.stop();
      frozen.fadeOut(0.25);
      gesture.reset().setEffectiveWeight(1).fadeIn(0.25).play();
      mixer.update(0);
      expect(root.position.x).toBeCloseTo(displayed);
      mixer.update(0.05);
      expect(mixer.stats.actions.total).toBe(total);
    }
    snapshot.stop();
    expect(frozen.isScheduled()).toBe(false);
    snapshot.dispose();
    expect(mixer.existingAction(frozenClip)).toBeNull();
    expect(mixer.stats.actions.total).toBe(total - 1);
    expect(gesture.isScheduled()).toBe(true);
  });

  it("captures native DTS base/additive helpers without owning object or damage threads", () => {
    const data = createDTSTestShape();
    data.rotations = data.defaultRotations.slice();
    data.translations = data.defaultTranslations.slice();
    data.sequences = [
      createDTSSequence({
        numKeyframes: 1,
        rotationMatters: [0],
        translationMatters: [0],
        visibilityMatters: [0],
        flags: DTSSequenceFlags.Blend,
      }),
    ];
    const { scene } = buildDTS(data);
    const mixer = new DTSAnimationMixer(scene);
    const objectTrack = new NumberKeyframeTrack(
      ".animationTargets[__dts_object_0].opacity",
      [0, 1],
      [0.8, 0.8],
    );
    const base = mixer
      .clipAction(
        new DTSAnimationClip("base", 1, [
          new NumberKeyframeTrack(
            ".animationTargets[__dts_transform_0].position[x]",
            [0, 1],
            [2, 6],
          ),
        ]),
      )
      .play();
    const aimClip = new DTSAnimationClip(
      "aim",
      1,
      [
        new QuaternionKeyframeTrack(
          ".animationTargets[__dts_blend_0].quaternion",
          [0, 1],
          [...rotation(0.6).toArray(), ...rotation(0.6).toArray()],
        ),
        objectTrack,
      ],
      AdditiveAnimationBlendMode,
    );
    aimClip.objectAnimation = new AnimationClip("objects", 1, [objectTrack]);
    aimClip.sequence = data.sequences[0];
    const aim = mixer.clipAction(aimClip).play();
    const damage = mixer
      .clipAction(
        new DTSAnimationClip("damage", 1, [
          new NumberKeyframeTrack(".scale[z]", [0, 1], [0.7, 0.7]),
        ]),
      )
      .play();
    const snapshot = createAnimationPoseSnapshot(mixer, [base, aim]);
    mixer.update(0.5);
    const frozen = snapshot.capture();
    expect(frozen.getClip().tracks.map((track) => track.name)).toEqual([
      ".animationTargets[__dts_transform_0].position[x]",
      ".animationTargets[__dts_blend_0].quaternion",
    ]);
    base.stop();
    aim.stop();
    mixer.update(0);
    expect(scene.animationTargets.__dts_transform_0.position.x).toBeCloseTo(4);
    expect(
      scene.animationTargets.__dts_blend_0.quaternion.angleTo(rotation(0.6)),
    ).toBeLessThan(0.0001);
    expect(scene.scale.z).toBeCloseTo(0.7);
    expect(damage.isScheduled()).toBe(true);
    // Object state follows the native DTS owner's lifetime, not the snapshot.
    expect(scene.getShapeObject(0)!.opacity).toBeCloseTo(1);
    snapshot.dispose();
    mixer.update(0);
    expect(damage.isScheduled()).toBe(true);
    expect(scene.scale.z).toBeCloseTo(0.7);
  });
});
