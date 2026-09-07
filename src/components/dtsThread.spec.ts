import { describe, expect, it } from "vitest";
import {
  AnimationClip,
  AnimationMixer,
  Mesh,
  MeshBasicMaterial,
  NumberKeyframeTrack,
  Object3D,
} from "three";
import {
  createDtsThread,
  destroyDtsThread,
  dtsThreadPosition,
  resetDtsThread,
  scrubDtsThread,
} from "./dtsThread";
import { prepareVisMaterial, type VisNode } from "./visSequences";

function fixture(cyclic: boolean) {
  const root = new Object3D();
  const mesh = new Mesh(undefined, new MeshBasicMaterial({ opacity: 1 }));
  mesh.userData.vis = 1;
  root.add(mesh);
  const clip = new AnimationClip("fire", 1, [
    new NumberKeyframeTrack(".position[x]", [0, 1], [0, 1]),
  ]);
  const action = new AnimationMixer(root).clipAction(clip);
  const node: VisNode = { mesh, keyframes: [0, 1, 0], duration: 1, cyclic };
  prepareVisMaterial(node);
  const thread = createDtsThread("fire", [action], [node], 1, cyclic);
  return { thread, action, mesh };
}

describe("dtsThread", () => {
  it("scrubs the action and vis meshes to one position", () => {
    const { thread, action, mesh } = fixture(false);
    scrubDtsThread(thread, 0.5);
    expect(action.paused).toBe(true);
    expect(action.time).toBeCloseTo(0.5);
    expect((mesh.material as MeshBasicMaterial).opacity).toBeCloseTo(1);
    scrubDtsThread(thread, 1);
    expect((mesh.material as MeshBasicMaterial).opacity).toBeCloseTo(0);
  });

  it("wraps a cyclic sequence and clamps a one-shot", () => {
    expect(dtsThreadPosition(fixture(true).thread, 1.25)).toBeCloseTo(0.25);
    expect(dtsThreadPosition(fixture(false).thread, 1.25)).toBe(1);
    expect(dtsThreadPosition(fixture(false).thread, 0.25, false)).toBeCloseTo(
      0.75,
    );
  });

  it("stops the action on reset and destroy", () => {
    const { thread, action, mesh } = fixture(false);
    scrubDtsThread(thread, 0.5);
    resetDtsThread(thread);
    expect(action.isScheduled()).toBe(false);
    expect((mesh.material as MeshBasicMaterial).opacity).toBe(0);
    scrubDtsThread(thread, 0.5);
    destroyDtsThread(thread);
    expect(action.isScheduled()).toBe(false);
    // Default vis for the mesh is 1.
    expect((mesh.material as MeshBasicMaterial).opacity).toBe(1);
  });
});
