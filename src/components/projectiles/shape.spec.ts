import { afterEach, expect, it, vi } from "vitest";
import { buildDTS } from "../../dts/dtsBuilder";
import {
  createDTSSequence,
  createDTSTestShape,
} from "../../dts/dtsTestFixtures";
import { DTSSequenceFlags } from "../../dts/dtsTypes";
import type { DTSShape } from "../../dts/dtsModel";
import { engineStore } from "../../state/engineStore";
import type { ShapeEntity } from "../../state/gameEntityTypes";
import { createShapeProjectileView } from "./shape";

const originalPlayback = engineStore.getState().playback;
afterEach(() => engineStore.setState({ playback: originalPlayback }));

it("plays ambient, activate, and maintain; freezes while paused and resets recycled poses without disposing shared geometry", () => {
  const data = createDTSTestShape();
  data.objectStates.push(
    { visibility: 0.3, frame: 0, materialFrame: 0 },
    { visibility: 0.6, frame: 0, materialFrame: 0 },
    { visibility: 0.9, frame: 0, materialFrame: 0 },
  );
  data.sequences = ["ambient", "activate", "maintain"].map((name, i) =>
    createDTSSequence({
      nameIndex: data.names.push(name) - 1,
      numKeyframes: 1,
      baseObjectState: i + 1,
      visibilityMatters: [0],
      priority: i,
      flags: name === "activate" ? 0 : DTSSequenceFlags.Cyclic,
    }),
  );
  const model = buildDTS(data);
  const entity: ShapeEntity = {
    id: "disc",
    renderType: "Shape",
    className: "LinearProjectile",
    shapeName: "disc.dts",
    projectileAgeMS: 0,
    projectileActivateDelayMS: 100,
  };
  let enabled = true;
  const view = createShapeProjectileView(
    model,
    entity,
    1,
    false,
    () => enabled,
  );
  const scene = view.root.children[0].children[0] as DTSShape;
  const object = scene.getShapeObject(0)!;
  engineStore.setState({
    playback: { ...originalPlayback, status: "playing", rate: 1 },
  });
  view.reset(entity);
  view.animate!(entity, 0.1);
  expect(object.opacity).toBeCloseTo(0.3);
  entity.projectileAgeMS = 100;
  view.animate!(entity, 0.1);
  expect(object.opacity).toBeCloseTo(0.6);
  engineStore.setState({
    playback: { ...engineStore.getState().playback, status: "paused" },
  });
  view.animate!(entity, 2);
  expect(object.opacity).toBeCloseTo(0.6);
  engineStore.setState({
    playback: { ...engineStore.getState().playback, status: "playing" },
  });
  enabled = false;
  view.animate!(entity, 0.2);
  enabled = true;
  view.animate!(entity, 0.75);
  expect(object.opacity).toBeCloseTo(0.6);
  view.animate!(entity, 0.2);
  expect(object.opacity).toBeCloseTo(0.9);
  view.release();
  entity.projectileAgeMS = 0;
  view.reset(entity);
  view.animate!(entity, 0);
  expect(object.opacity).toBeCloseTo(0.3);
  const disposed = vi.fn();
  model.scene.traverse((node: any) =>
    node.geometry?.addEventListener("dispose", disposed),
  );
  view.dispose();
  expect(disposed).not.toHaveBeenCalled();
});
