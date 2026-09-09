import { describe, expect, it, vi } from "vitest";
import {
  AnimationMixer,
  FileLoader,
  LoadingManager,
  PerspectiveCamera,
  Texture,
} from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { buildDTS } from "./dtsBuilder";
import { DTSAnimationMixer } from "./dtsAnimationMixer";
import { sampleDTSSequence } from "./dtsAnimation";
import { DTSMesh, type DTSMaterial, type DTSShape } from "./dtsModel";
import { createDTSSequence, createDTSTestShape } from "./dtsTestFixtures";
import { DTSMaterialFlags, DTSSequenceFlags } from "./dtsTypes";
import {
  createDTSImageAnimation,
  createDTSImageFrames,
  getDTSImageFrame,
  loadDTSImageLists,
} from "./dtsTextures";

function fixture(cyclic = false) {
  const data = createDTSTestShape();
  data.materials[0].flags =
    DTSMaterialFlags.IflMaterial | DTSMaterialFlags.SelfIlluminating;
  data.iflMaterials = [
    {
      nameIndex: data.names.push("flash.ifl") - 1,
      materialSlot: 0,
      firstFrame: 0,
      firstFrameOffTimeIndex: 0,
      numFrames: 2,
    },
  ];
  data.objectStates.push(
    { visibility: 0.2, frame: 0, materialFrame: 0 },
    { visibility: 0.8, frame: 0, materialFrame: 0 },
  );
  data.sequences = [
    createDTSSequence({
      numKeyframes: 2,
      duration: 2,
      visibilityMatters: [0],
      baseObjectState: 1,
      iflMatters: [0],
      flags: cyclic ? DTSSequenceFlags.Cyclic : 0,
      toolBegin: 0.25,
    }),
  ];
  data.objects[0].numMeshes = 2;
  data.meshes.push({ ...data.meshes[0] });
  data.details.push({ ...data.details[0], objectDetail: 1, size: 0.1 });
  const model = buildDTS(data);
  const a = new Texture(),
    b = new Texture();
  const frames = createDTSImageFrames(
    [
      { name: "a", frameCount: 30 },
      { name: "b", frameCount: 30 },
    ],
    (name) => (name === "a" ? a : b),
  );
  model.scene.imageAnimations = [createDTSImageAnimation(data, 0, frames)];
  return { model, a, b };
}
const camera = new PerspectiveCamera();
function materials(scene: DTSShape): DTSMaterial[] {
  const result: DTSMaterial[] = [];
  scene.traverse((node) => {
    if (node instanceof DTSMesh) result.push(node.material as DTSMaterial);
  });
  return result;
}

describe("native IFL playback", () => {
  it("uses inclusive frame ends, wraps cycles, and holds noncyclic ends", () => {
    const { model, a, b } = fixture();
    const animation = model.scene.imageAnimations[0];
    expect(getDTSImageFrame(animation, 1, true)).toBe(a);
    expect(getDTSImageFrame(animation, 1.001, true)).toBe(b);
    expect(getDTSImageFrame(animation, 2, true)).toBe(b);
    expect(getDTSImageFrame(animation, 2.001, true)).toBe(a);
    expect(getDTSImageFrame(animation, 3, false)).toBe(b);
  });

  it("deduplicates ordinary frame textures too and ignores zero-duration entries", async () => {
    const { model } = fixture();
    const source = vi
      .spyOn(FileLoader.prototype, "loadAsync")
      .mockResolvedValue("a 1\nb 0\na 2\nc 3\n");
    const texture = vi.fn(() => new Texture());
    try {
      await loadDTSImageLists(
        model,
        () => ({ url: "flash.ifl", texture }),
        new LoadingManager(),
      );
      const animation = model.scene.imageAnimations[0];
      expect(texture).toHaveBeenCalledTimes(2);
      expect(animation.frames).toHaveLength(3);
      expect(animation.frames[0].texture).toBe(animation.frames[1].texture);
      expect(animation.duration).toBeCloseTo(6 / 30);
    } finally {
      source.mockRestore();
    }
  });

  it.each([AnimationMixer, DTSAnimationMixer])(
    "keeps paused, ended, rewound and resumed effects on one native clock (%s)",
    (Mixer) => {
      const { model, a, b } = fixture();
      const mixer = new Mixer(model.scene),
        clip = model.animations[0];
      const show = (time: number) => {
        sampleDTSSequence(mixer, clip, time, false);
        model.scene.update(camera);
        return materials(model.scene)[0].map;
      };
      expect(show(0)).toBe(a);
      expect(show(1)).toBe(b);
      expect(model.scene.getShapeObject(0)!.opacity).toBeCloseTo(0.5);
      expect(model.scene.iflTimes[0]).toBeCloseTo(1.25); // toolBegin
      expect(show(1)).toBe(b); // pause
      expect(show(3)).toBe(b);
      expect(show(4)).toBe(b); // stay at the end, do not restart
      expect(model.scene.getShapeObject(0)!.opacity).toBeCloseTo(0.8);
      expect(show(0.25)).toBe(a); // seek backward after completion
      expect(show(1.5)).toBe(b);
      mixer.uncacheRoot(model.scene); // React effect cleanup/restart
      expect(show(1)).toBe(b);
      expect(model.scene.getShapeObject(0)!.opacity).toBeCloseTo(0.5);
    },
  );

  it("shares frames while clones and late LODs retain independent animation state", () => {
    const { model, a, b } = fixture();
    const left = clone(model.scene) as DTSShape,
      right = clone(model.scene) as DTSShape;
    const mixer = new AnimationMixer(left);
    sampleDTSSequence(mixer, model.animations[0], 1.5, false);
    left.update(camera);
    right.time = 10;
    right.update(camera); // no thread: controlled IFL stays at frame zero
    expect(materials(left)[0].map).toBe(b);
    expect(materials(right)[0].map).toBe(a);
    expect(left.imageAnimations).toBe(right.imageAnimations);
    left.detailLevel = 1;
    left.update(camera);
    expect(materials(left)[1].map).toBe(b);
    expect(materials(left)[1].emissiveMap).toBe(b);
    left.imageAnimationEnabled = false;
    left.update(camera);
    expect(materials(left)[1].map).toBe(a);
    left.imageAnimationEnabled = true;
    left.update(camera);
    expect(materials(left)[1].map).toBe(b);
    mixer.stopAllAction();
    left.update(camera);
    expect(materials(left)[1].map).toBe(a);
  });

  it("wraps cyclic effect sampling and lets unbound viewer IFLs use a pausable clock", () => {
    const { model, a, b } = fixture(true);
    const mixer = new AnimationMixer(model.scene);
    sampleDTSSequence(mixer, model.animations[0], 2.1, true);
    expect(model.scene.iflTimes[0]).toBeCloseTo(0.35);
    mixer.stopAllAction();
    model.scene.imageAnimations[0].sequenceControlled = false;
    model.scene.time = 1.5;
    model.scene.update(camera);
    expect(materials(model.scene)[0].map).toBe(b);
    model.scene.update(camera);
    expect(materials(model.scene)[0].map).toBe(b);
    model.scene.time = 2.1;
    model.scene.update(camera);
    expect(materials(model.scene)[0].map).toBe(a);
  });
});
