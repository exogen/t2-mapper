import { describe, expect, it, vi } from "vitest";
import {
  AnimationClip,
  AnimationMixer,
  NumberKeyframeTrack,
  Object3D,
} from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { buildDTS } from "./dtsBuilder";
import { DTSAnimationMixer } from "./dtsAnimationMixer";
import { createDTSSequence, createDTSTestShape } from "./dtsTestFixtures";
import { DTSSequenceFlags } from "./dtsTypes";
import type { DTSShape } from "./dtsModel";

function fixture() {
  const data = createDTSTestShape();
  data.objectStates[0] = { visibility: 0.3, frame: 2, materialFrame: 1 };
  data.objectStates.push(
    { visibility: 0.2, frame: 4, materialFrame: 3 },
    { visibility: 0.8, frame: 6, materialFrame: 5 },
    { visibility: 0.9, frame: 8, materialFrame: 7 },
  );
  data.sequences = [
    createDTSSequence({
      nameIndex: data.names.push("activate") - 1,
      numKeyframes: 2,
      baseObjectState: 1,
      visibilityMatters: [0],
      frameMatters: [0],
      materialFrameMatters: [0],
      flags: DTSSequenceFlags.Blend,
      priority: 100,
    }),
    createDTSSequence({
      nameIndex: data.names.push("maintain") - 1,
      numKeyframes: 1,
      baseObjectState: 3,
      visibilityMatters: [0],
      priority: 0,
    }),
  ];
  const model = buildDTS(data),
    mixer = new DTSAnimationMixer(model.scene);
  return { model, mixer, object: model.scene.getShapeObject(0)! };
}

describe("DTS object-state priorities", () => {
  it("reuses held object state and still evaluates scrubs and action ownership changes", () => {
    const { model, mixer, object } = fixture();
    const a = mixer.clipAction(model.animations[0]).play();
    a.paused = true;
    a.time = 0.5;
    const updates = vi.spyOn(AnimationMixer.prototype, "update");
    const objectUpdates = () =>
      updates.mock.contexts.filter((context) => context !== mixer).length;
    try {
      mixer.update(0);
      const opacity = object.opacity;
      expect(objectUpdates()).toBe(1);
      for (let i = 0; i < 120; i++) mixer.update(1 / 60);
      expect(objectUpdates()).toBe(1);
      expect(object.opacity).toBe(opacity);
      a.time = 0.75;
      mixer.update(0);
      expect(objectUpdates()).toBe(2);
      expect(object.opacity).not.toBe(opacity);
      const b = mixer.clipAction(model.animations[1]).play();
      mixer.update(0);
      expect(object.opacity).toBeCloseTo(0.9);
      b.stop();
      mixer.update(0);
      expect(object.opacity).not.toBeCloseTo(0.9);
      a.stop();
      mixer.update(0);
      expect(object.opacity).toBeCloseTo(0.3);
      expect(object.frame).toBe(2);
    } finally {
      updates.mockRestore();
    }
  });

  it("selects per property, placing non-blend threads before blend threads", () => {
    const { model, mixer, object } = fixture();
    const activate = mixer.clipAction(model.animations[0]).play();
    activate.paused = true;
    activate.time = 1;
    mixer.update(0);
    expect(object.opacity).toBeCloseTo(0.8);
    expect(object.frame).toBe(6);
    const maintain = mixer.clipAction(model.animations[1]).play();
    mixer.update(0);
    expect(object.opacity).toBeCloseTo(0.9); // not additive or averaged
    expect(object.frame).toBe(6); // maintain does not own mesh frame
    expect(object.materialFrame).toBe(5);
    maintain.stop();
    mixer.update(0);
    expect(object.opacity).toBeCloseTo(0.8);
    activate.stop();
    mixer.update(0);
    expect(object.opacity).toBeCloseTo(0.3);
    expect(object.frame).toBe(2);
    expect(object.materialFrame).toBe(1);
  });

  it("uses descending priority within a blend class and ignores disabled or zero-weight actions", () => {
    const { model, mixer, object } = fixture();
    model.animations[0].sequence!.flags = 0;
    const a = mixer.clipAction(model.animations[0]).play();
    a.paused = true;
    a.time = 1;
    const b = mixer.clipAction(model.animations[1]).play();
    mixer.update(0);
    expect(object.opacity).toBeCloseTo(0.8);
    a.weight = 0;
    mixer.update(0);
    expect(object.opacity).toBeCloseTo(0.9);
    a.weight = 1;
    a.enabled = false;
    mixer.update(0);
    expect(object.opacity).toBeCloseTo(0.9);
    a.enabled = true;
    mixer.update(0);
    expect(object.opacity).toBeCloseTo(0.8);
    b.stop();
    a.stop();
    mixer.update(0);
    expect(object.opacity).toBeCloseTo(0.3);
  });

  it("shares track buffers, reuses steady bindings, and does not interfere with another root", () => {
    const { model, mixer, object } = fixture();
    const second = clone(model.scene) as DTSShape;
    const a = mixer.clipAction(model.animations[0]).play();
    a.paused = true;
    a.time = 1;
    const b = mixer.clipAction(model.animations[1], second).play();
    mixer.update(0);
    expect(object.opacity).toBeCloseTo(0.8);
    expect(second.getShapeObject(0)!.opacity).toBeCloseTo(0.9);
    const clips = model.animations.map((clip) => clip.tracks);
    for (let i = 0; i < 10; i++) mixer.update(0);
    expect(model.animations.map((clip) => clip.tracks)).toEqual(clips);
    expect(mixer.clipAction(model.animations[0])).toBe(a);
    expect(mixer.existingAction(model.animations[1], second)).toBe(b);
    mixer.uncacheRoot(second);
    mixer.update(0);
    expect(object.opacity).toBeCloseTo(0.8);
    expect(second.getShapeObject(0)!.opacity).toBeCloseTo(0.3);
  });

  it("uncaches and recreates actions through original clips and names", () => {
    const { model, mixer, object } = fixture();
    const clip = model.animations[0];
    const first = mixer.clipAction(clip).play();
    first.paused = true;
    first.time = 1;
    mixer.update(0);
    expect(mixer.existingAction("activate")).toBe(first);
    mixer.uncacheAction("activate");
    mixer.update(0);
    expect(object.opacity).toBeCloseTo(0.3);
    const second = mixer.clipAction(clip).play();
    second.paused = true;
    second.time = 1;
    mixer.update(0);
    expect(object.opacity).toBeCloseTo(0.8);
    mixer.uncacheClip(clip);
    mixer.update(0);
    expect(mixer.existingAction(clip)).toBeNull();
    expect(object.opacity).toBeCloseTo(0.3);
    mixer.clipAction(clip).play();
    mixer.update(0);
    mixer.stopAllAction();
    mixer.update(0);
    expect(object.opacity).toBeCloseTo(0.3);
    mixer.uncacheRoot(model.scene);
    mixer.clipAction(clip).play();
    mixer.update(0);
    expect(object.opacity).toBeCloseTo(0.2);
  });

  it("leaves ordinary Three clips and pose blending on native mixer semantics", () => {
    const root = new Object3D(),
      mixer = new DTSAnimationMixer(root);
    const clip = new AnimationClip("move", 1, [
      new NumberKeyframeTrack(".position[x]", [0, 1], [0, 8]),
    ]);
    mixer.clipAction(clip).play();
    mixer.setTime(0.5);
    expect(root.position.x).toBe(4);
    expect(mixer).toBeInstanceOf(AnimationMixer);
    mixer.stopAllAction();
    expect(root.position.x).toBe(0);
  });

  it("arbitrates IFLs and decals as absolute state and restores authored defaults", () => {
    const data = createDTSTestShape();
    data.iflMaterials = [
      {
        nameIndex: 0,
        materialSlot: 0,
        firstFrame: 0,
        firstFrameOffTimeIndex: 0,
        numFrames: 0,
      },
    ];
    data.decals = [
      { nameIndex: 0, objectIndex: 0, numMeshes: 0, startMeshIndex: 0 },
    ];
    data.decalStates = new Int32Array([-1, 3, 7, 9]);
    data.sequences = [
      createDTSSequence({
        nameIndex: data.names.push("activation") - 1,
        numKeyframes: 2,
        flags: DTSSequenceFlags.Blend,
        priority: 10,
        toolBegin: 2,
        iflMatters: [0],
        decalMatters: [0],
        baseDecalState: 1,
      }),
      createDTSSequence({
        nameIndex: data.names.push("running") - 1,
        numKeyframes: 1,
        flags: DTSSequenceFlags.Cyclic,
        priority: 0,
        toolBegin: 8,
        iflMatters: [0],
        decalMatters: [0],
        baseDecalState: 3,
      }),
    ];
    const { scene, animations } = buildDTS(data);
    const mixer = new DTSAnimationMixer(scene);
    const a = mixer.clipAction(animations[0]).play();
    a.paused = true;
    a.time = 0.75;
    mixer.update(0);
    expect(scene.iflTimes[0]).toBeCloseTo(2.75);
    expect(scene.iflLoops[0]).toBe(false);
    expect(scene.decalFrames[0]).toBe(7);
    const b = mixer.clipAction(animations[1]).play();
    b.paused = true;
    b.time = 0.25;
    mixer.update(0);
    expect(scene.iflTimes[0]).toBeCloseTo(8.25);
    expect(scene.iflLoops[0]).toBe(true);
    expect(scene.decalFrames[0]).toBe(9);
    b.stop();
    mixer.update(0);
    expect(scene.iflTimes[0]).toBeCloseTo(2.75);
    expect(scene.iflLoops[0]).toBe(false);
    expect(scene.decalFrames[0]).toBe(7);
    mixer.stopAllAction();
    expect(scene.iflTimes[0]).toBe(-1);
    expect(scene.iflLoops[0]).toBe(true);
    expect(scene.decalFrames[0]).toBe(-1);
  });
});
