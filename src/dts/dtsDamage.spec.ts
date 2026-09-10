import { describe, expect, it, vi } from "vitest";
import { AnimationAction, PerspectiveCamera, Vector3 } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { buildDTS } from "./dtsBuilder";
import { DTSAnimationMixer } from "./dtsAnimationMixer";
import { createDtsDamageThreads } from "./dtsDamage";
import { isDTSMesh, type DTSShape, type DTSRenderable } from "./dtsModel";
import { createDTSSequence, createDTSRigidTestShape } from "./dtsTestFixtures";
import { DTSMeshType } from "./dtsTypes";

function fixture() {
  const data = createDTSRigidTestShape();
  data.decals = Array.from({ length: 3 }, () => ({
    nameIndex: 4,
    objectIndex: 1,
    numMeshes: 1,
    startMeshIndex: 2,
  }));
  data.subShapes[0].numDecals = 3;
  data.decalStates = new Int32Array([
    -1,
    -1,
    -1, // Defaults.
    -1,
    0,
    0, // Damage: first decal at half damage.
    -1,
    -1,
    0, // Damage: second decal at full damage.
    -1,
    0, // Visibility: separate wreck decal.
  ]);
  data.meshes.push({
    ...data.meshes[1],
    type: DTSMeshType.Decal,
    decal: {
      startPrimitive: new Int32Array([0]),
      texgenS: new Float32Array([1, 0, 0, 0]),
      texgenT: new Float32Array([0, 1, 0, 0]),
      materialIndex: 0,
    },
  });
  data.sequences = [
    createDTSSequence({
      nameIndex: data.names.push("Damage") - 1,
      numKeyframes: 3,
      baseDecalState: 3,
      decalMatters: [0, 1],
    }),
    createDTSSequence({
      nameIndex: data.names.push("Visibility") - 1,
      numKeyframes: 2,
      baseDecalState: 9,
      decalMatters: [2],
    }),
  ];
  const model = buildDTS(data);
  const mixer = new DTSAnimationMixer(model.scene);
  const threads = createDtsDamageThreads(mixer, model.animations)!;
  const sample = (health: number, state = 0) => {
    threads.update(health, state);
    mixer.update(0);
    return [...model.scene.decalFrames];
  };
  return { ...model, mixer, threads, sample };
}

describe("ShapeBase damage appearance", () => {
  it("selects graded damage, repairs, and hulk decals independently", () => {
    const { sample } = fixture();
    expect(sample(1)).toEqual([-1, -1, -1]);
    expect(sample(0.5)).toEqual([0, -1, -1]);
    expect(sample(0, 1)).toEqual([0, 0, -1]); // Disabled retains damage.
    expect(sample(0, 2)).toEqual([-1, -1, 0]); // Destroyed switches to hulk.
    expect(sample(0.5, 2)).toEqual([0, -1, 0]); // Engine clears only full damage.
    expect(sample(1)).toEqual([-1, -1, -1]);
  });

  it("matches forward playback when seeking or starting at a damaged state", () => {
    const played = fixture(),
      sought = fixture();
    for (const [health, state] of [
      [1, 0],
      [0.5, 0],
      [0, 2],
      [0.5, 1],
      [1, 0],
    ]) {
      const expected = played.sample(health, state);
      sought.sample(0, 2);
      sought.sample(1);
      expect(sought.sample(health, state)).toEqual(expected);
      const cold = fixture();
      expect(cold.sample(health, state)).toEqual(expected);
    }
  });

  it("uses Player's override, retaining damage even in Destroyed state", () => {
    const { scene, mixer, animations } = fixture();
    const player = createDtsDamageThreads(mixer, animations, "Player")!;
    player.update(0, 2);
    mixer.update(0);
    expect(scene.decalFrames).toEqual([0, 0, 0]);
    player.update(1);
    mixer.update(0);
    expect(scene.decalFrames).toEqual([-1, -1, -1]);
  });

  it("does no repeated action work for unchanged damage and cleans up", () => {
    const { mixer, threads, sample, scene } = fixture();
    sample(0.5);
    const play = vi.spyOn(AnimationAction.prototype, "play");
    try {
      for (let i = 0; i < 120; i++) sample(0.5);
      expect(play).not.toHaveBeenCalled();
      threads.dispose();
      mixer.update(0);
      expect(scene.decalFrames).toEqual([-1, -1, -1]);
    } finally {
      play.mockRestore();
    }
  });

  it("keeps lazy decals instance-local and attached to moving body nodes", () => {
    const { scene, animations, sample } = fixture();
    const other = clone(scene) as DTSShape;
    const otherMixer = new DTSAnimationMixer(other);
    const otherDamage = createDtsDamageThreads(otherMixer, animations)!;
    otherDamage.update(1);
    otherMixer.update(0);
    sample(0.5);
    const camera = new PerspectiveCamera();
    scene.update(camera);
    other.update(camera);
    const meshes: DTSRenderable[] = [];
    scene.traverse((node) => {
      if (isDTSMesh(node)) meshes.push(node);
    });
    const decal = meshes.find((mesh) => mesh.binding!.decalIndex === 0)!;
    expect(decal).toBeDefined();
    expect(other.decalFrames).toEqual([-1, -1, -1]);
    const before = decal.getWorldPosition(new Vector3());
    const node = scene.getNode(1)!;
    node.position.x += 3;
    node.updateMatrix();
    scene.updateMatrixWorld(true);
    expect(decal.getWorldPosition(new Vector3()).x - before.x).toBeCloseTo(3);
    sample(1);
    scene.update(camera);
    expect(decal.parent!.visible).toBe(false);
  });

  it("does not invent damage for shapes without authored sequences", () => {
    const { scene } = buildDTS(createDTSRigidTestShape());
    expect(
      createDtsDamageThreads(new DTSAnimationMixer(scene), []),
    ).toBeUndefined();
  });
});
