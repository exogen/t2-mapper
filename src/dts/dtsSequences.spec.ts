import { describe, expect, it } from "vitest";
import { AnimationClip, Object3D } from "three";
import { readDtsSequences } from "./dtsSequences";
import { buildDTS } from "./dtsBuilder";
import { createDTSSequence, createDTSTestShape } from "./dtsTestFixtures";

describe("readDtsSequences", () => {
  it("reads native sequence order and flags without serialized extras", () => {
    const data = createDTSTestShape();
    data.names.push("JetFlare", "root", "ActivateBack");
    data.sequences = [
      createDTSSequence({ nameIndex: 3 }),
      createDTSSequence({ nameIndex: 4, flags: 16 }),
      createDTSSequence({ nameIndex: 5, flags: 8 }),
    ];
    const { scene } = buildDTS(data);
    const table = readDtsSequences(scene, []);
    expect(table.names).toEqual(["jetflare", "root", "activateback"]);
    expect([...table.cyclic]).toEqual(["root"]);
    expect([...table.blend]).toEqual(["activateback"]);
    expect(scene.userData).toEqual({});
    expect(readDtsSequences(scene, [])).toBe(table);
  });
  it("accepts ordinary Three scenes", () => {
    const table = readDtsSequences(new Object3D(), [
      new AnimationClip("Ambient", 1, []),
    ]);
    expect(table.names).toEqual(["ambient"]);
    expect(table.cyclic.has("ambient")).toBe(true);
  });
});
