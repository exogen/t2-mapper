import { describe, expect, it } from "vitest";
import { buildDTS } from "../dts/dtsBuilder";
import { DTSAnimationMixer } from "../dts/dtsAnimationMixer";
import { readDtsSequences } from "../dts/dtsSequences";
import { holdDtsAction } from "../dts/dtsThread";
import { createDTSSequence, createDTSTestShape } from "../dts/dtsTestFixtures";
import { DTSSequenceFlags } from "../dts/dtsTypes";
import { DTSAnimationClip } from "../dts/dtsModel";
import {
  buildActionAnimMap,
  getPlayerAnimationActions,
} from "./playerActionMap";
import { samplePlayerPose } from "./playerAnimation";

describe("player action-table playback", () => {
  it("keeps raw filenames out of alias lookup and preserves exact network indices", () => {
    const data = createDTSTestShape();
    const { scene } = buildDTS(data);
    const mixer = new DTSAnimationMixer(scene);
    const clips = ["run", "stride", "look_a", "look_b", "unused"].map(
      (name) => new DTSAnimationClip(name, 1, []),
    );
    const actions = getPlayerAnimationActions(
      clips,
      mixer,
      new Map([
        [1, { clipName: "stride", alias: "run" }],
        [2, { clipName: "run", alias: "back" }],
        [8, { clipName: "look_a", alias: "look" }],
        [9, { clipName: "look_b", alias: "look" }],
      ]),
    );
    expect(actions.get("run")?.getClip().name).toBe("stride");
    expect(actions.get("back")?.getClip().name).toBe("run");
    expect(actions.get(1)).toBe(actions.get("run"));
    expect(actions.get(8)?.getClip().name).toBe("look_a");
    expect(actions.get(9)?.getClip().name).toBe("look_b");
    expect(mixer.existingAction(clips[4])).toBeNull();
    mixer.uncacheRoot(scene);
  });

  it("preserves embedded and multi-sequence DSQ slots in constructor order", () => {
    const clip = (
      name: string,
      source?: { name: string; sequenceName: string },
    ) => {
      const result = new DTSAnimationClip(name, 1, []);
      result.sequence = createDTSSequence({ source });
      return result;
    };
    // Loaded DSQs are alphabetized; the engine imports them in constructor order.
    const clips = [
      clip("JetFlare"),
      clip("Damage"),
      clip("celwave", { name: "celwave", sequenceName: "wave" }),
      clip("forward", { name: "forward", sequenceName: "Run" }),
      clip("idlepda_Root", { name: "idlepda", sequenceName: "Root" }),
      clip("idlepda_Idlepda", { name: "idlepda", sequenceName: "Idlepda" }),
      clip("root", { name: "root", sequenceName: "Root" }),
      clip("unused", { name: "unused", sequenceName: "Unused" }),
    ];
    const map = buildActionAnimMap(
      [
        "player_root.dsq root",
        "shapes/PLAYER_FORWARD.DSQ\trun",
        "player_idlepda.dsq pda",
        "player_celwave.dsq cel1",
        "player_celwave.dsq cel2",
        "player_missing.dsq look",
      ],
      "player_",
      clips,
    );
    expect([...map]).toEqual([
      [0, { clipName: "root", alias: "root" }],
      [1, { clipName: "forward", alias: "run" }],
      [8, { clipName: "jetflare", alias: "jetflare" }],
      [9, { clipName: "damage", alias: "damage" }],
      [10, { clipName: "idlepda_root", alias: "root" }],
      [11, { clipName: "idlepda_idlepda", alias: "pda" }],
      [12, { clipName: "celwave", alias: "cel1" }],
      [13, { clipName: "celwave", alias: "cel2" }],
    ]);
  });

  it("uses embedded table and non-table sequences without a constructor", () => {
    const map = buildActionAnimMap([], "player_", [
      new DTSAnimationClip("run", 1, []),
      new DTSAnimationClip("look", 1, []),
      new DTSAnimationClip("root", 1, []),
    ]);
    expect([...map]).toEqual([
      [0, { clipName: "root", alias: "root" }],
      [1, { clipName: "run", alias: "run" }],
      [8, { clipName: "look", alias: "look" }],
    ]);
  });

  it.each(["forward", "custom_stride"])(
    "plays and loops the datablock's run clip (%s) without a mission runtime",
    (clipName) => {
      const data = createDTSTestShape();
      const nameIndex = data.names.push(clipName) - 1;
      data.translations = new Float32Array([0, 0, 0, 2, 0, 0]);
      data.sequences = [
        createDTSSequence({
          nameIndex,
          source: { name: clipName, sequenceName: "Run" },
          numKeyframes: 2,
          translationMatters: [0],
          flags: DTSSequenceFlags.Cyclic,
          duration: 2,
        }),
      ];
      const { scene, nodes, animations } = buildDTS(data);
      const actionMap = buildActionAnimMap(
        [`player_${clipName}.dsq run`],
        "player_",
        animations,
      );
      const mixer = new DTSAnimationMixer(scene);
      const actions = getPlayerAnimationActions(animations, mixer, actionMap);
      const cyclic = readDtsSequences(scene, animations).cyclic;
      const run = actions.get("run")!;
      expect(run).toBe(actions.get(1));
      const sample = (time: number) => {
        const [pose] = samplePlayerPose(
          { animation: "run", timeScale: 1, timeSec: 10 },
          {},
          false,
          time,
          0.25,
          (index) => index,
          (name) => {
            const clip = actions.get(name)?.getClip();
            return (
              clip && { duration: clip.duration, cyclic: cyclic.has(clip.name) }
            );
          },
        );
        holdDtsAction(actions.get(pose.name)!, pose.position);
        mixer.update(0);
        scene.updateMatrixWorld(true);
        return nodes[0].matrixWorld.elements[12];
      };
      expect(sample(10)).toBeCloseTo(0);
      expect(sample(10.5)).toBeCloseTo(-1);
      expect(sample(11)).toBeCloseTo(-2);
      expect(sample(12.5)).toBeCloseTo(-1);
      // Seeking the animation clock backwards reconstructs the same pose.
      expect(sample(10.5)).toBeCloseTo(-1);
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
    },
  );
});
