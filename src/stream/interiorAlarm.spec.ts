import { expect, it } from "vitest";
import { LiveStreamAdapter } from "./liveStreaming";
import type { RelayClient } from "./relayClient";
import {
  interiorAlarmTime,
  interiorLightingTime,
} from "../scene/interiorAlarm";
import {
  streamEntityToGameEntity,
  updateGameEntityFromStream,
} from "./entityBridge";
import type { SceneInteriorInstance } from "../scene/types";

class InteriorStream extends LiveStreamAdapter {
  constructor(startTick = 0) {
    super({} as RelayClient);
    this.tickCount = startTick;
    this.registry = {
      getGhostParser: () => ({ name: "InteriorInstance" }),
      getEventParser: () => undefined,
    };
    this.processGhostUpdate({
      index: 0,
      classId: 1,
      type: "create",
      parsedData: {
        interiorFile: "sbunk2.dif",
        alarmState: false,
        scale: { x: 2, y: 3, z: 4 },
      },
    });
  }
  alarm(alarmState: boolean, tick: number) {
    this.tickCount = tick;
    this.processGhostUpdate({
      index: 0,
      type: "update",
      parsedData: { alarmState },
    });
  }
  entity() {
    return this.buildEntityList()[0];
  }
  scene() {
    return this.entity().sceneData as SceneInteriorInstance;
  }
  checkpoint() {
    return this.captureSimulationState();
  }
  restore(saved: ReturnType<InteriorStream["checkpoint"]>) {
    this.restoreSimulationState(saved);
  }
}

it("propagates sparse power transitions without losing placement or changing entity identity", () => {
  const engine = new InteriorStream();
  const initial = engine.entity();
  const render = streamEntityToGameEntity(initial);
  engine.alarm(true, 100);
  expect(engine.entity().id).toBe(initial.id);
  expect(engine.scene()).toMatchObject({
    alarmState: true,
    interiorFile: "sbunk2.dif",
    scale: { x: 2, y: 3, z: 4 },
  });
  expect(updateGameEntityFromStream(render, engine.entity())).toBe(true);
  expect(render).toMatchObject({ interiorData: { alarmState: true } });
  const scene = engine.scene();
  engine.alarm(true, 110);
  expect(engine.scene()).toBe(scene);
  expect(updateGameEntityFromStream(render, engine.entity())).toBe(false);
  engine.alarm(false, 120);
  expect(updateGameEntityFromStream(render, engine.entity())).toBe(true);
  expect(render).toMatchObject({ interiorData: { alarmState: false } });
});

it("preserves immutable checkpoints and accumulated alarm time through restoration and rewinds", () => {
  const engine = new InteriorStream();
  const normal = engine.checkpoint();
  engine.alarm(true, 100);
  const alarm = engine.checkpoint();
  const oldScene = engine.scene();
  engine.alarm(false, 120);
  expect(interiorAlarmTime(engine.scene(), 10)).toBeCloseTo(0.64);
  engine.alarm(true, 200);
  expect(interiorAlarmTime(engine.scene(), 6.72)).toBeCloseTo(0.96);
  expect(oldScene.alarmState).toBe(true);
  engine.restore(normal);
  expect(engine.scene().alarmState).toBe(false);
  engine.restore(alarm);
  expect(engine.scene().alarmState).toBe(true);
  expect(interiorAlarmTime(engine.scene(), 3.52)).toBeCloseTo(0.32);
});

it("ignores current and past alarm requests for lights in interiors without alarm support", () => {
  const engine = new InteriorStream(100); // Created at 3.2 seconds.
  const normal = engine.checkpoint();
  expect(interiorLightingTime(engine.scene(), 4, true)).toBeCloseTo(0.8);
  engine.alarm(true, 125); // Power off at 4 seconds.
  expect(interiorLightingTime(engine.scene(), 5, true)).toBeCloseTo(1);
  expect(interiorLightingTime(engine.scene(), 5, false)).toBeCloseTo(1.8);
  engine.alarm(false, 200); // Power back on at 6.4 seconds.
  expect(interiorLightingTime(engine.scene(), 7, true)).toBeCloseTo(1.4);
  expect(interiorLightingTime(engine.scene(), 7, false)).toBeCloseTo(3.8);
  engine.restore(normal);
  expect(interiorLightingTime(engine.scene(), 4, true)).toBeCloseTo(0.8);
  expect(interiorLightingTime(engine.scene(), 4, false)).toBeCloseTo(0.8);
});
