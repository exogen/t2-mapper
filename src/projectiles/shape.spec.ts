import { afterEach, expect, it, vi } from "vitest";
import { buildDTS } from "../dts/dtsBuilder";
import { createDTSSequence, createDTSTestShape } from "../dts/dtsTestFixtures";
import { DTSSequenceFlags } from "../dts/dtsTypes";
import type { DTSShape } from "../dts/dtsModel";
import { effectLights } from "../engine/effectLights";
import type { ShapeEntity } from "../state/gameEntityTypes";
import { streamClock } from "../state/streamPlaybackStore";
import {
  streamEntityToGameEntity,
  updateGameEntityFromStream,
} from "../stream/entityBridge";
import type { StreamEntity } from "../stream/types";
import { createShapeProjectileView } from "./shape";

vi.mock("../assets/bitmapTextures", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../assets/bitmapTextures")>();
  const { Texture } = await import("three");
  return {
    ...actual,
    loadBitmapTexture: () => new Texture(),
    loadBitmapTextureInstance: () => new Texture(),
  };
});

afterEach(() => {
  streamClock.time = 0;
  streamClock.matchEndedAtSec = null;
});

it("switches an existing missile view from its casing to its exposed projectile", () => {
  const projectile = buildDTS(createDTSTestShape());
  const casing = buildDTS(createDTSTestShape());
  const entity: ShapeEntity = {
    id: "missile",
    className: "SeekerProjectile",
    renderType: "Shape",
    seekerCasing: true,
  };
  const view = createShapeProjectileView(
    projectile,
    entity,
    1,
    false,
    () => true,
    {
      model: casing,
      shapeName: "weapon_missile_casement.dts",
    },
  );
  const [exposed, enclosed] = view.root.children[0].children;
  view.reset(entity);
  expect([exposed.visible, enclosed.visible]).toEqual([false, true]);
  entity.seekerCasing = false;
  entity.seekerCasingSplitAtSec = 0.25;
  streamClock.time = 0.24;
  view.animate!(entity, 0.032);
  expect([exposed.visible, enclosed.visible]).toEqual([false, true]);
  streamClock.time = 0.25;
  view.animate!(entity, 0.032);
  expect([exposed.visible, enclosed.visible]).toEqual([true, false]);
  view.release();
  entity.seekerCasing = true;
  view.reset(entity);
  expect([exposed.visible, enclosed.visible]).toEqual([false, true]);
  view.dispose();
});

it("waits for the render clock to reach missile ignition before lighting the projectile", () => {
  const model = buildDTS(createDTSTestShape());
  const entity: ShapeEntity = {
    id: "missile",
    className: "SeekerProjectile",
    renderType: "Shape",
    lightType: 1,
    lightDelayMS: 544,
    projectileAgeMS: 544,
    keyframes: [{ time: 1.544, position: [0, 0, 0], rotation: [0, 0, 0, 1] }],
  };
  const view = createShapeProjectileView(model, entity, 1, false, () => true);
  const anchor = view.root.children[0].children[0];
  try {
    view.reset(entity);
    const light = Array.from(effectLights()).find(
      (light) => light.anchor === anchor,
    );
    streamClock.time = 1.528;
    view.animate!(entity, 0.016);
    expect(light?.intensity).toBe(0);
    streamClock.time = 1.544;
    view.animate!(entity, 0.016);
    expect(light?.intensity).toBe(1);
  } finally {
    view.dispose();
  }
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
  // Debrief transport keeps advancing, but the DTS pose stays on its final frame.
  streamClock.matchEndedAtSec = 10.25;
  streamClock.time = 30.75;
  view.animate!(entity, 20.5);
  expect(object.opacity).toBeCloseTo(0.4);
  streamClock.matchEndedAtSec = null;
  streamClock.time = 10.25;
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

it("switches the mortar's light at the surface without replacing its view", () => {
  const mortar: StreamEntity = {
    id: "mortar",
    type: "Projectile",
    className: "GrenadeProjectile",
    dataBlock: "mortar_projectile.dts",
    lightType: 1,
    lightColor: [0.05, 0.2, 0.05, 1],
    underwaterLightColor: [0.05, 0.075, 0.2, 1],
    projectileInWater: true,
  };
  const entity = streamEntityToGameEntity(mortar, 0) as ShapeEntity;
  const model = buildDTS(createDTSTestShape());
  const view = createShapeProjectileView(model, entity, 1, false, () => true);
  const anchor = view.root.children[0].children[0];
  const registeredLight = () =>
    Array.from(effectLights()).find((light) => light.anchor === anchor);

  try {
    view.reset(entity);
    view.animate!(entity, 0);
    const light = registeredLight();
    expect(light?.color.toArray()).toEqual([0.05, 0.075, 0.2]);

    expect(
      updateGameEntityFromStream(entity, {
        ...mortar,
        projectileInWater: false,
      }),
    ).toBe(false);
    view.animate!(entity, 0);
    expect(registeredLight()).toBe(light);
    expect(light?.color.toArray()).toEqual([0.05, 0.2, 0.05]);
  } finally {
    view.dispose();
  }
});
