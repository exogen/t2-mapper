import { describe, expect, it } from "vitest";
import { AnimationClip, Object3D } from "three";
import { readDtsSequences } from "./dtsSequences";

describe("readDtsSequences", () => {
  it("reads the exporter's table, lower-cased, with cyclic and blend flags", () => {
    const scene = new Object3D();
    scene.userData.dts_sequence_names = JSON.stringify([
      "JetFlare",
      "root",
      "ActivateBack",
    ]);
    scene.userData.dts_sequence_cyclic = JSON.stringify([false, true, false]);
    scene.userData.dts_sequence_blend = JSON.stringify([false, false, true]);
    const table = readDtsSequences(scene, []);
    expect(table.names).toEqual(["jetflare", "root", "activateback"]);
    expect([...table.cyclic]).toEqual(["root"]);
    expect([...table.blend]).toEqual(["activateback"]);
    expect(table.fromExtras).toBe(true);
    expect(readDtsSequences(scene, [])).toBe(table);
  });

  it("falls back to the clips, all cyclic, without the extras", () => {
    const scene = new Object3D();
    const table = readDtsSequences(scene, [
      new AnimationClip("Ambient", 1, []),
    ]);
    expect(table.names).toEqual(["ambient"]);
    expect(table.cyclic.has("ambient")).toBe(true);
    expect(table.fromExtras).toBe(false);
  });
});
