import { afterEach, expect, it } from "vitest";
import { PerspectiveCamera } from "three";
import { buildDTS } from "../../dts/dtsBuilder";
import {
  createDTSSequence,
  createDTSTestShape,
} from "../../dts/dtsTestFixtures";
import { DTSSequenceFlags } from "../../dts/dtsTypes";
import type { DTSShape } from "../../dts/dtsModel";
import type { FlareEntity } from "../../state/gameEntityTypes";
import { streamClock } from "../../state/streamPlaybackStore";
import { createFlareView } from "./flare";

afterEach(() => {
  streamClock.time = 0;
});
it("samples a flare's DTS from its birth time after a late acquisition or backward seek", () => {
  const data = createDTSTestShape();
  data.objectStates.push(
    ...[0, 0.8].map((visibility) => ({
      visibility,
      frame: 0,
      materialFrame: 0,
    })),
  );
  data.sequences = [
    createDTSSequence({
      nameIndex: data.names.push("ambient") - 1,
      duration: 1,
      numKeyframes: 2,
      baseObjectState: 1,
      visibilityMatters: [0],
      flags: DTSSequenceFlags.Cyclic,
    }),
  ];
  const model = buildDTS(data);
  const entity: FlareEntity = {
    id: "plasma",
    className: "LinearFlareProjectile",
    renderType: "Flare",
    spawnTime: 10,
    visual: {
      kind: "flare",
      numFlares: 0,
      sizes: [0, 0, 0],
      color: { r: 1, g: 1, b: 1 },
      baseTexture: "",
      modTexture: "",
      shapeScale: [1, 1, 1],
      faceViewer: false,
    },
  };
  const view = createFlareView(entity.visual, {}, model, 1);
  const scene = view.root.children[1].children[0].children[0] as DTSShape;
  const object = scene.getShapeObject(0)!;
  const camera = new PerspectiveCamera();
  streamClock.time = 10.25;
  view.reset(entity);
  view.update(entity, camera, 0);
  expect(object.opacity).toBeCloseTo(0.4);
  streamClock.time = 10;
  view.update(entity, camera, 0);
  expect(object.opacity).toBe(0);
  streamClock.time = 10.25;
  view.update(entity, camera, 0);
  expect(object.opacity).toBeCloseTo(0.4);
  view.dispose();
});
