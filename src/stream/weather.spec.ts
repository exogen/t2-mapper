import { beforeEach, describe, expect, it } from "vitest";
import type { ParsedData } from "t2-demo-parser";
import { TestLiveStream } from "./streamTestFixtures";
import { precipitationPercentage } from "../weather/data";
import {
  streamEntityToGameEntity,
  updateGameEntityFromStream,
} from "./entityBridge";
import {
  clearShapeBounds,
  getShapeCenter,
  registerShapeBounds,
} from "./shapeBounds";

class WeatherStream extends TestLiveStream {
  blocks: Record<number, ParsedData> = {
    10: { numDrops: 1, materialList: "snowflakes.dml", sizeX: 0.2, sizeY: 0.2 },
    20: {
      strikeTextures: ["special/skyLightning"],
      strikeSounds: [30],
      thunderSound: 31,
    },
    30: { filename: "thunder.wav", description: 40 },
    31: { filename: "impact.wav", description: 40 },
    40: { is3D: true, maxDistance: 6400 },
  };
  constructor() {
    super(
      "watch",
      (id) => ({ 1: "Precipitation", 2: "Lightning", 3: "StaticShape" })[id],
    );
  }
  override getDataBlockData(id: number) {
    return this.blocks[id];
  }
  time(time: number) {
    this.tickCount = time / 0.032;
  }
  clearWorld() {
    this.clearAllEntities();
  }
}

describe("weather network state", () => {
  beforeEach(() => clearShapeBounds());

  it("preserves weather config through sparse masks and publishes real renderer types", () => {
    const stream = new WeatherStream();
    stream.createGhost(1, 1, {
      dataBlockId: 10,
      percentage: 0.8,
      maxDrops: 1800,
      maxRadius: 125,
    });
    const initial = stream.entityAt(1)!;
    const view = streamEntityToGameEntity(initial);
    expect(view).toMatchObject({
      renderType: "Precipitation",
      precipitation: { type: 1, maxDrops: 1800, percentage: 0.8 },
    });
    stream.time(10);
    stream.updateGhost(1, {
      stormUpdate: { endPercentage: 0, durationSeconds: 2 },
    });
    const faded = stream.entityAt(1)!;
    expect(faded.precipitation?.maxDrops).toBe(1800);
    expect(precipitationPercentage(faded.precipitation!, 11.024)).toBeCloseTo(
      0.4,
    );
    expect(updateGameEntityFromStream(view, faded)).toBe(false);
    expect(view).toMatchObject({ precipitation: faded.precipitation });
    stream.roundTripCheckpoint();
    expect(stream.entityAt(1)?.precipitation).toEqual(faded.precipitation);
    stream.time(11.024);
    stream.updateGhost(1, { stormPrecipitationOn: false });
    expect(stream.entityAt(1)?.precipitation?.enabled).toBe(false);
    stream.createGhost(1, 1, { dataBlockId: 10 });
    expect(stream.entityAt(1)?.precipitation).toMatchObject({
      enabled: true,
      percentage: 1,
      maxDrops: 2000,
    });
    expect(stream.entityAt(1)?.precipitation?.storm).toBeUndefined();
  });

  it("records only received strikes and binds them to stable storm and target lifetimes", () => {
    const stream = new WeatherStream();
    stream.createGhost(4, 2, {
      dataBlockId: 20,
      position: { x: 1, y: 2, z: 300 },
      scale: { x: 624, y: 688, z: 500 },
      strikesPerMinute: 5,
    });
    stream.createGhost(5, 3, { position: { x: 10, y: 20, z: 30 } });
    const storm = stream.entityAt(4)!;
    const target = stream.entityAt(5)!;
    expect(streamEntityToGameEntity(storm)).toMatchObject({
      renderType: "Lightning",
      lightning: {
        position: [1, 2, 300],
        scale: [624, 688, 500],
        strikesPerMinute: 5,
      },
    });
    expect(stream.lightningHistory.events).toHaveLength(0);
    stream.time(8);
    stream.event({
      type: "LightningStrikeEvent",
      sourceGhost: 4,
      startX: 0.25,
      startY: 0.75,
      targetGhost: 5,
    });
    const strike = stream.lightningHistory.events[0];
    expect(strike).toMatchObject({
      time: 8,
      stormId: storm.id,
      start: [0.25, 0.75],
      targetId: target.id,
      targetPosition: [10, 20, 30],
      config: {
        thunderSounds: [{ filename: "thunder.wav" }],
        strikeSound: { filename: "impact.wav" },
      },
    });
    stream.createGhost(5, 3, { position: { x: 99, y: 99, z: 99 } });
    expect(strike.targetId).not.toBe(stream.entityAt(5)?.id);
    expect(strike.targetPosition).toEqual([10, 20, 30]);
    stream.event({ type: "LightningStrikeEvent" });
    stream.event({
      type: "LightningStrikeEvent",
      sourceGhost: 77,
      startX: 0,
      startY: 0,
    });
    stream.event({
      type: "LightningStrikeEvent",
      sourceGhost: 4,
      startX: NaN,
      startY: 0,
    });
    expect(stream.lightningHistory.events).toHaveLength(1);
  });

  it("retains and remaps strike history through serialized checkpoints, then clears with the world", () => {
    const stream = new WeatherStream();
    stream.createGhost(4, 2, { dataBlockId: 20 });
    stream.createGhost(5, 3, { position: { x: 10, y: 20, z: 30 } });
    stream.event({
      type: "LightningStrikeEvent",
      sourceGhost: 4,
      startX: 0.25,
      startY: 0.75,
      targetGhost: 5,
    });
    const strike = stream.lightningHistory.events[0];
    const generation = stream.lightningHistory.generation;
    stream.roundTripCheckpoint();
    expect(stream.lightningHistory.generation).toBeGreaterThan(generation);
    const restored = stream.lightningHistory.events[0];
    expect(restored.stormId).toBe(stream.entityAt(4)?.id);
    expect(restored.targetId).toBe(stream.entityAt(5)?.id);
    expect(restored.stormId).not.toBe(strike.stormId);
    expect(restored.config).toEqual(strike.config);
    stream.clearWorld();
    expect(stream.lightningHistory.events).toHaveLength(0);
  });

  it("freezes the native target centre from the event's scale, rotation and position", () => {
    const stream = new WeatherStream();
    stream.createGhost(4, 2, { dataBlockId: 20 });
    registerShapeBounds("target.dts", { min: [0, 0, 0], max: [2, 4, 6] });
    const target = stream.addEntity({
      id: "target-life",
      ghostIndex: 5,
      type: "Shape",
      className: "StaticShape",
      shapeHint: "target.dts",
      position: [10, 20, 30],
      rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
      scale: [2, 3, 4],
    });
    stream.event({
      type: "LightningStrikeEvent",
      sourceGhost: 4,
      startX: 0.5,
      startY: 0.5,
      targetGhost: 5,
    });
    const strike = stream.lightningHistory.events[0];
    expect(strike.targetPosition?.[0]).toBeCloseTo(6);
    expect(strike.targetPosition?.[1]).toBeCloseTo(24);
    expect(strike.targetPosition?.[2]).toBeCloseTo(39);
    target.position![0] = 1000;
    target.rotation.fill(0);
    target.scale!.fill(10);
    expect(strike.targetTransform?.position).toEqual([10, 20, 30]);
    expect(strike.targetTransform?.scale).toEqual([2, 3, 4]);
    expect(strike.targetTransform?.rotation?.[1]).toBe(Math.SQRT1_2);
  });

  it("retains an unloaded target's event pose across seek and slot reuse for later bounds resolution", () => {
    const stream = new WeatherStream();
    stream.createGhost(4, 2, { dataBlockId: 20 });
    stream.addEntity({
      id: "target-life",
      ghostIndex: 5,
      type: "Shape",
      className: "StaticShape",
      shapeHint: "late-target.dts",
      position: [10, 20, 30],
      scale: [2, 3, 4],
    });
    stream.event({
      type: "LightningStrikeEvent",
      sourceGhost: 4,
      startX: 0.5,
      startY: 0.5,
      targetGhost: 5,
    });
    expect(stream.lightningHistory.events[0].targetPosition).toBeUndefined();
    stream.createGhost(5, 3, { position: { x: 1000, y: 1000, z: 1000 } });
    stream.roundTripCheckpoint();
    const transform = stream.lightningHistory.events[0].targetTransform!;
    expect(transform.position).toEqual([10, 20, 30]);
    registerShapeBounds("late-target.dts", {
      min: [0, 0, 0],
      max: [2, 4, 6],
    });
    expect(getShapeCenter(transform.shapeName, transform)).toEqual([
      14, 24, 39,
    ]);
  });
  it("retains missing-datablock masks and strikes with their original clocks through hydration and seeking", () => {
    const stream = new WeatherStream();
    const snow = stream.blocks[10];
    const lightning = stream.blocks[20];
    delete stream.blocks[10];
    delete stream.blocks[20];
    stream.createGhost(1, 1, {
      dataBlockId: 10,
      percentage: 0.8,
      maxDrops: 1000,
    });
    stream.createGhost(4, 2, {
      dataBlockId: 20,
      scale: { x: 100, y: 200, z: 300 },
    });
    stream.createGhost(5, 3, { position: { x: 10, y: 20, z: 30 } });
    expect(stream.entityAt(1)?.precipitation).toBeUndefined();
    stream.time(10);
    stream.updateGhost(1, {
      stormUpdate: { endPercentage: 0, durationSeconds: 2 },
    });
    stream.time(11);
    stream.event({
      type: "LightningStrikeEvent",
      sourceGhost: 4,
      startX: 0.25,
      startY: 0.75,
      targetGhost: 5,
    });
    stream.updateGhost(4, { scale: { x: 400, y: 500, z: 600 } });
    stream.roundTripCheckpoint();
    stream.blocks[10] = snow;
    stream.blocks[20] = lightning;
    const rain = stream.entityAt(1)!.precipitation!;
    const storm = stream.entityAt(4)!;
    expect(rain).toMatchObject({ type: 1, maxDrops: 1000 });
    expect(precipitationPercentage(rain, 11.024)).toBeCloseTo(0.4);
    expect(storm.lightning?.scale).toEqual([400, 500, 600]);
    expect(stream.lightningHistory.events).toHaveLength(1);
    expect(stream.lightningHistory.events[0]).toMatchObject({
      time: 11,
      stormId: storm.id,
      targetId: stream.entityAt(5)!.id,
      targetPosition: [10, 20, 30],
      config: { scale: [100, 200, 300] },
    });
  });

  it("keeps stable weather identities and refreshes changed referenced datablocks", () => {
    const stream = new WeatherStream();
    stream.createGhost(4, 2, { dataBlockId: 20 });
    const original = stream.entityAt(4)!.lightning!;
    expect(stream.entityAt(4)!.lightning).toBe(original);
    stream.blocks[30] = {
      ...stream.blocks[30],
      filename: "updated-thunder.wav",
    };
    const refreshed = stream.entityAt(4)!.lightning!;
    expect(refreshed).not.toBe(original);
    expect(refreshed.thunderSounds[0].filename).toBe("updated-thunder.wav");
    stream.blocks[40] = { ...stream.blocks[40], volume: 0.25 };
    expect(stream.entityAt(4)!.lightning!.strikeSound!.volume).toBe(0.25);
    stream.blocks[20] = {
      ...stream.blocks[20],
      strikeTextures: ["replacement"],
    };
    expect(stream.entityAt(4)!.lightning!.strikeTextures).toEqual([
      "replacement",
    ]);
  });
});
