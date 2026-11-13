import { readFile } from "node:fs/promises";
import {
  AnimationClip,
  LoopOnce,
  LoopRepeat,
  NumberKeyframeTrack,
  Object3D,
  type AnimationAction,
} from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DTSAnimationMixer } from "../dts/dtsAnimationMixer";
import { DTSAnimationClip } from "../dts/dtsModel";
import { parseDTS } from "../dts/dts";
import { buildDTSAnimations } from "../dts/dtsAnimation";
import { mergeDSQ, parseDSQ } from "../dts/dsq";
import { holdDtsAction } from "../dts/dtsThread";
import { ANIM_TRANSITION_TIME } from "../stream/playbackUtils";
import {
  buildActionAnimMap,
  getPlayerAnimationActions,
} from "../stream/playerActionMap";
import {
  createProfileGestureAnimations,
  PROFILE_GESTURE_ACTIONS,
} from "./profileGestureAnimations";

afterEach(() => vi.restoreAllMocks());

describe("stock profile gesture sets", () => {
  it.each([
    "light_male",
    "light_female",
    "medium_male",
    "medium_female",
    "heavy_male",
    "bioderm_light",
    "bioderm_medium",
    "bioderm_heavy",
  ])("matches the shipped %s constructor and playable DSQs", async (shape) => {
    const script = await readFile(
      new URL(
        `../../docs/base/@vl2/scripts.vl2/scripts/${shape}.cs`,
        import.meta.url,
      ),
      "utf8",
    );
    const gestures = [...script.matchAll(/"([^"\s]+\.dsq) (cel[1-8])"/g)].sort(
      (a, b) => Number(a[2].slice(3)) - Number(b[2].slice(3)),
    );
    expect(gestures).toHaveLength(8);
    const shapeBytes = await readFile(
      new URL(
        `../../docs/base/@vl2/shapes.vl2/shapes/${shape}.dts`,
        import.meta.url,
      ),
    );
    const shapeData = parseDTS(
      shapeBytes.buffer.slice(
        shapeBytes.byteOffset,
        shapeBytes.byteOffset + shapeBytes.byteLength,
      ),
    );
    const imports = [];
    for (const [, file] of gestures) {
      const bytes = await readFile(
        new URL(
          `../../docs/base/@vl2/shapes.vl2/shapes/${file}`,
          import.meta.url,
        ),
      );
      const dsq = parseDSQ(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
      );
      expect(dsq.sequences).toHaveLength(1);
      expect(dsq.sequences[0].duration).toBeGreaterThan(0);
      imports.push({ data: dsq, name: file.slice(shape.length + 1, -4) });
    }
    const clips = buildDTSAnimations(mergeDSQ(shapeData, imports));
    const mixer = new DTSAnimationMixer(new Object3D());
    const actions = getPlayerAnimationActions(
      clips,
      mixer,
      buildActionAnimMap(
        gestures.map(([, file, alias]) => `${file} ${alias}`),
        `${shape}_`,
        clips,
      ),
    );
    expect(
      PROFILE_GESTURE_ACTIONS.map(
        (alias) => actions.get(alias)?.getClip().name,
      ),
    ).toEqual(gestures.map(([, file]) => file.slice(shape.length + 1, -4)));
    mixer.uncacheRoot(mixer.getRoot());
  });
});

function track(name: string, start: number, end: number) {
  return new NumberKeyframeTrack(name, [0, 1], [start, end]);
}

function fixture({
  missingGestures = false,
  armAlias = "looksn",
  gestureNames = ["celsalute", "celwave"],
  extraGestureAliases = false,
}: {
  missingGestures?: boolean;
  armAlias?: string;
  gestureNames?: [string, string];
  extraGestureAliases?: boolean;
} = {}) {
  const scene = new Object3D();
  const body = new Object3D();
  body.name = "body";
  const arm = new Object3D();
  arm.name = "arm";
  const head = new Object3D();
  head.name = "head";
  scene.add(body, arm, head);
  const mixer = new DTSAnimationMixer(scene);
  const actions = new Map<string | number, AnimationAction>();
  function action(alias: string, name: string, tracks: NumberKeyframeTrack[]) {
    const clip = new DTSAnimationClip(name, 1, tracks);
    if (alias.startsWith("cel")) {
      const opacity = track("body.scale[y]", 1, 0.5);
      clip.tracks.push(opacity);
      clip.objectAnimation = new AnimationClip("objects", 1, [opacity]);
    }
    const result = mixer.clipAction(clip);
    actions.set(alias, result);
    return result;
  }
  const idle = action("root", "root", [track("body.position[x]", 0, 0.2)]);
  const aim = action(armAlias, armAlias === "look" ? "lookde" : armAlias, [
    track("arm.rotation[z]", 1, 3),
  ]);
  const headPitch = action("head", "head", [track("head.rotation[y]", -1, 1)]);
  const headYaw = action("headside", "headside", [
    track("head.rotation[z]", -1, 1),
  ]);
  const gestures = missingGestures
    ? []
    : [
        action("cel1", gestureNames[0], [
          track("body.position[x]", 0, 8),
          track("arm.rotation[z]", 0, 4),
          track("head.rotation[y]", 0, 2),
        ]),
        action("cel2", gestureNames[1], [
          track("body.position[x]", 0, 4),
          track("arm.rotation[z]", 0, -4),
          track("head.rotation[y]", 0, -2),
        ]),
      ];
  // Network indices alias the same actions; they must not bias selection.
  gestures.forEach((gesture, index) => actions.set(index + 8, gesture));
  const damage = mixer.clipAction(
    new DTSAnimationClip("damage", 1, [track("body.scale[z]", 0.7, 0.7)]),
  );
  if (extraGestureAliases) {
    actions.set("cel8", gestures[0]);
    actions.set("cel9", damage);
  }
  holdDtsAction(damage, 0.5);
  const controller = createProfileGestureAnimations({
    actions,
    mixer,
    armAction: "looksn",
  });
  mixer.update(0);
  function update(delta: number) {
    mixer.update(delta);
    controller.update();
  }
  return {
    body,
    arm,
    head,
    mixer,
    actions,
    idle,
    aim,
    headPitch,
    headYaw,
    gestures,
    damage,
    controller,
    update,
  };
}

describe("profile gesture playback", () => {
  it("initializes breathing idle and the neutral weapon/head pose", () => {
    const f = fixture();
    expect(f.idle.loop).toBe(LoopRepeat);
    expect(f.idle.isRunning()).toBe(true);
    expect(f.arm.rotation.z).toBeCloseTo(2);
    expect(f.head.rotation.y).toBeCloseTo(0);
    expect(f.head.rotation.z).toBeCloseTo(0);
    expect(f.body.scale.z).toBeCloseTo(0.7);
    f.update(0.5);
    expect(f.body.position.x).toBeCloseTo(0.1);
    f.controller.dispose();
  });

  it("blends into a gesture and back to idle while keeping damage", () => {
    const f = fixture();
    vi.spyOn(Math, "random").mockReturnValue(0);
    f.controller.playRandom();
    expect(f.arm.rotation.z).toBeCloseTo(2);
    f.update(ANIM_TRANSITION_TIME / 2);
    expect(f.body.position.x).toBeCloseTo(0.5);
    expect(f.arm.rotation.z).toBeCloseTo(1.25);
    f.update(0.5 - ANIM_TRANSITION_TIME / 2);
    expect(f.gestures[0].loop).toBe(LoopOnce);
    expect(f.body.position.x).toBeCloseTo(4);
    expect(f.arm.rotation.z).toBeCloseTo(2);
    expect(f.head.rotation.y).toBeCloseTo(1);
    for (const action of [f.idle, f.aim, f.headPitch, f.headYaw])
      expect(action.isScheduled()).toBe(false);
    expect(f.damage.isScheduled()).toBe(true);
    f.update(0.6);
    expect(f.gestures[0].isScheduled()).toBe(false);
    // The final pose is held at the start of the return transition.
    expect(f.body.position.x).toBeCloseTo(8);
    expect(f.arm.rotation.z).toBeCloseTo(4);
    f.update(ANIM_TRANSITION_TIME / 2);
    expect(f.body.position.x).toBeCloseTo(4.0125);
    expect(f.arm.rotation.z).toBeCloseTo(3);
    expect(f.head.rotation.y).toBeCloseTo(1);
    f.update(ANIM_TRANSITION_TIME / 2);
    expect(f.body.position.x).toBeCloseTo(0.05);
    expect(f.arm.rotation.z).toBeCloseTo(2);
    expect(f.head.rotation.y).toBeCloseTo(0);
    expect(f.body.scale.y).toBeCloseTo(1);
    expect(f.body.scale.z).toBeCloseTo(0.7);
    f.update(2);
    expect(f.idle.isRunning()).toBe(true);
    expect(f.body.position.x).toBeCloseTo(0.05);
    f.controller.dispose();
  });

  it("blends from the displayed pose when restarting or interrupting a gesture", () => {
    const f = fixture();
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const total = f.mixer.stats.actions.total;
    f.controller.playRandom();
    f.update(0.75);
    expect(f.body.position.x).toBeCloseTo(6);
    f.controller.playRandom();
    expect(f.body.position.x).toBeCloseTo(6);
    expect(f.arm.rotation.z).toBeCloseTo(3);
    f.update(ANIM_TRANSITION_TIME / 2);
    expect(f.gestures[0].time).toBeCloseTo(0.125);
    expect(f.body.position.x).toBeCloseTo(3.5);
    expect(f.arm.rotation.z).toBeCloseTo(1.75);
    random.mockReturnValue(0.99);
    f.controller.playRandom();
    expect(f.body.position.x).toBeCloseTo(3.5);
    expect(f.arm.rotation.z).toBeCloseTo(1.75);
    f.update(ANIM_TRANSITION_TIME / 2);
    expect(f.body.position.x).toBeCloseTo(2);
    expect(f.arm.rotation.z).toBeCloseTo(0.625);
    // Repeated clicks within a single unfinished fade preserve its composite
    // pose, including when they select the same target clip again.
    for (let i = 0; i < 30; i++) {
      const before = [f.body.position.x, f.arm.rotation.z, f.head.rotation.y];
      random.mockReturnValue(i % 2 ? 0.99 : 0);
      f.controller.playRandom();
      expect(f.body.position.x).toBeCloseTo(before[0]);
      expect(f.arm.rotation.z).toBeCloseTo(before[1]);
      expect(f.head.rotation.y).toBeCloseTo(before[2]);
      f.update(0.03);
    }
    f.controller.playRandom();
    f.update(0.5);
    expect(f.gestures[0].isScheduled()).toBe(false);
    expect(f.gestures[1].isRunning()).toBe(true);
    expect(f.body.position.x).toBeCloseTo(2);
    expect(f.arm.rotation.z).toBeCloseTo(-2);
    expect(f.mixer.stats.actions.inUse).toBe(2);
    expect(f.mixer.stats.actions.total).toBe(total);
    f.update(0.6);
    expect(f.mixer.stats.actions.inUse).toBe(6);
    f.update(ANIM_TRANSITION_TIME);
    expect(f.mixer.stats.actions.inUse).toBe(5);
    f.controller.dispose();
  });

  it("can interrupt the return to idle without snapping to either endpoint", () => {
    const f = fixture();
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    f.controller.playRandom();
    f.update(1.1);
    f.update(0.1);
    const body = f.body.position.x;
    const arm = f.arm.rotation.z;
    expect(body).toBeGreaterThan(0);
    expect(body).toBeLessThan(8);
    random.mockReturnValue(0.99);
    f.controller.playRandom();
    expect(f.body.position.x).toBeCloseTo(body);
    expect(f.arm.rotation.z).toBeCloseTo(arm);
    f.update(ANIM_TRANSITION_TIME);
    expect(f.body.position.x).toBeCloseTo(1);
    expect(f.arm.rotation.z).toBeCloseTo(-1);
    expect(f.body.scale.z).toBeCloseTo(0.7);
    f.controller.dispose();
  });

  it("does not let another thread's finished event interrupt a gesture", () => {
    const f = fixture();
    vi.spyOn(Math, "random").mockReturnValue(0);
    f.controller.playRandom();
    f.mixer.dispatchEvent({ type: "finished", action: f.damage, direction: 1 });
    f.update(0.25);
    expect(f.gestures[0].isRunning()).toBe(true);
    expect(f.idle.isScheduled()).toBe(false);
    f.controller.dispose();
  });

  it.each([false, true])(
    "stops owned actions on dispose (gesture active: %s)",
    (playing) => {
      const f = fixture();
      vi.spyOn(Math, "random").mockReturnValue(0);
      if (playing) f.controller.playRandom();
      f.update(0.4);
      f.controller.dispose();
      expect(f.gestures.every((action) => !action.isScheduled())).toBe(true);
      for (const action of [f.idle, f.aim, f.headPitch, f.headYaw])
        expect(action.isScheduled()).toBe(false);
      expect(f.damage.isScheduled()).toBe(true);
      f.controller.playRandom();
      f.update(1.2);
      expect(f.idle.isScheduled()).toBe(false);
      expect(f.gestures.every((action) => !action.isScheduled())).toBe(true);
    },
  );

  it("keeps idle when no fixed gesture slots are available", () => {
    const f = fixture({ missingGestures: true });
    f.controller.playRandom();
    f.update(0.5);
    expect(f.idle.isRunning()).toBe(true);
    expect(f.body.position.x).toBeCloseTo(0.1);
    expect(f.arm.rotation.z).toBeCloseTo(2);
    f.controller.dispose();
  });

  it("uses only unique actions from the model's fixed gesture slots", () => {
    const f = fixture({
      gestureNames: ["custom_salute", "custom_wave"],
      extraGestureAliases: true,
    });
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    f.controller.playRandom();
    expect(f.gestures[1].getClip().name).toBe("custom_wave");
    expect(f.gestures[1].isScheduled()).toBe(true);
    expect(f.damage.isScheduled()).toBe(true);
    f.controller.dispose();
  });

  it("falls back to the ordinary arm pose for heavy armor without a sniper thread", () => {
    const f = fixture({ armAlias: "look" });
    expect(f.arm.rotation.z).toBeCloseTo(2);
    expect(f.aim.isScheduled()).toBe(true);
    vi.spyOn(Math, "random").mockReturnValue(0);
    f.controller.playRandom();
    f.update(1.1);
    f.update(ANIM_TRANSITION_TIME);
    expect(f.aim.isScheduled()).toBe(true);
    expect(f.arm.rotation.z).toBeCloseTo(2);
    f.controller.dispose();
  });
});
