import { afterEach, expect, it, vi } from "vitest";
import { buildDTS } from "../../dts/dtsBuilder";
import {
  createDTSSequence,
  createDTSTestShape,
} from "../../dts/dtsTestFixtures";
import { DTSSequenceFlags } from "../../dts/dtsTypes";
import type { DTSShape } from "../../dts/dtsModel";
import type { ShapeEntity } from "../../state/gameEntityTypes";
import { streamClock } from "../../state/streamPlaybackStore";
import { createShapeProjectileView } from "./shape";

afterEach(() => {
  streamClock.time = 0;
});
it("seats pooled projectiles at their recorded activate/maintain time, including late loads and backwards seeks", () => {
  const data = createDTSTestShape();
  const activate = data.names.push("activate") - 1;
  const maintain = data.names.push("maintain") - 1;
  data.objectStates.push(
    ...[0, 0.8, 0.4, 0.8].map((visibility) => ({
      visibility,
      frame: 0,
      materialFrame: 0,
    })),
  );
  data.sequences = [
    createDTSSequence({
      nameIndex: activate,
      duration: 1,
      numKeyframes: 2,
      visibilityMatters: [0],
      baseObjectState: 1,
    }),
    createDTSSequence({
      nameIndex: maintain,
      duration: 1,
      numKeyframes: 2,
      visibilityMatters: [0],
      baseObjectState: 3,
      flags: DTSSequenceFlags.Cyclic,
    }),
  ];
  const model = buildDTS(data);
  const entity: ShapeEntity = {
    id: "disc",
    className: "LinearProjectile",
    renderType: "Shape",
    spawnTime: 10,
    projectileAgeMS: 0,
    projectileActivateDelayMS: 200,
  };
  const early = createShapeProjectileView(model, entity, 1, false, () => true);
  const late = createShapeProjectileView(model, entity, 1, false, () => true);
  const opacity = (view: typeof early) =>
    (view.root.children[0].children[0] as DTSShape).getShapeObject(0)!.opacity;
  function frame(view: typeof early, time: number) {
    streamClock.time = time;
    entity.projectileAgeMS = (time - 10) * 1000;
    view.animate!(entity, 0.02);
  }
  early.reset(entity);
  for (let i = 0; i <= 75; i++) frame(early, 10 + i * 0.02);
  late.reset(entity);
  frame(late, 11.5);
  expect(opacity(late)).toBeCloseTo(opacity(early));
  frame(late, 10.7);
  expect(opacity(late)).toBeCloseTo(0.4);
  frame(late, 11.5);
  expect(opacity(late)).toBeCloseTo(opacity(early));
  early.dispose();
  late.dispose();
});

it("holds ambient while paused and resets recycled poses without disposing shared geometry", () => {
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
      numKeyframes: 2,
      duration: 1,
      baseObjectState: 1,
      visibilityMatters: [0],
      flags: DTSSequenceFlags.Cyclic,
    }),
  ];
  const model = buildDTS(data);
  const entity: ShapeEntity = {
    id: "grenade",
    className: "GrenadeProjectile",
    renderType: "Shape",
    spawnTime: 10,
    projectileAgeMS: 0,
  };
  let enabled = true;
  const view = createShapeProjectileView(
    model,
    entity,
    1,
    false,
    () => enabled,
  );
  const object = (view.root.children[0].children[0] as DTSShape).getShapeObject(
    0,
  )!;
  view.reset(entity);
  streamClock.time = 10.25;
  view.animate!(entity, 0.25);
  expect(object.opacity).toBeCloseTo(0.4);
  // Wall-clock frames cannot advance a paused stream.
  view.animate!(entity, 2);
  expect(object.opacity).toBeCloseTo(0.4);
  enabled = false;
  view.animate!(entity, 1);
  expect(object.opacity).toBe(0);
  enabled = true;
  view.release();
  entity.spawnTime = 20;
  streamClock.time = 20;
  view.reset(entity);
  view.animate!(entity, 0);
  expect(object.opacity).toBe(0);
  const disposed = vi.fn();
  model.scene.traverse((node: any) =>
    node.geometry?.addEventListener("dispose", disposed),
  );
  view.dispose();
  expect(disposed).not.toHaveBeenCalled();
});
