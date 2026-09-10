import { afterEach, describe, expect, it } from "vitest";
import { BoxGeometry, Mesh, Object3D, PerspectiveCamera } from "three";
import type { PlayerDataBlock, PlayerGhostData } from "t2-demo-parser";
import {
  clearWorldColliders,
  registerInteriorCollider,
} from "../collision/worldCollision";
import { setTerrainCollisionData } from "../collision/terrainCollision";
import {
  PlayerPrediction,
  PLAYER_TICK_SEC,
  MAX_PREDICTION_TICKS,
  unclampMove,
} from "./playerPrediction";
import { applyStreamEntityPose } from "./interpolateEntity";
import type { StreamEntity } from "./types";

const armor: PlayerDataBlock = {
  boxSize: { x: 1, y: 1, z: 2 },
  mass: 90,
  maxEnergy: 100,
  renderFirstPerson: true,
  runForce: 4968,
  maxForwardSpeed: 15,
  maxBackwardSpeed: 10,
  maxSideSpeed: 10,
  runSurfaceAngle: 70,
  jumpSurfaceAngle: 80,
  jumpForce: 720,
  jumpDelay: 15,
  minJumpSpeed: 20,
  maxJumpSpeed: 30,
  maxStepHeight: 1,
  jetForce: 2700,
  minJetEnergy: 1,
  jetEnergyDrain: 1,
  maxJetForwardSpeed: 22,
  maxJetHorizontalPercentage: 0.8,
  horizResistSpeed: 80,
  horizMaxSpeed: 100,
  horizResistFactor: 0.35,
  upResistSpeed: 80,
  upMaxSpeed: 100,
  upResistFactor: 0.35,
};
const neutral = {
  px: 16,
  py: 16,
  pz: 16,
  pyaw: 0,
  ppitch: 0,
  proll: 0,
  freeLook: false,
  trigger: [],
};
function player(update: PlayerGhostData = {}) {
  const p = new PlayerPrediction(armor);
  p.unpackUpdate({
    position: { x: 0, y: 0, z: 10 },
    velocity: { x: 16, y: 0, z: 0 },
    move: neutral,
    ...update,
  });
  return p;
}
function box(
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
) {
  const mesh = new Mesh(new BoxGeometry(sy, sz, sx));
  mesh.position.set(y, z, x);
  mesh.updateMatrixWorld();
  registerInteriorCollider(`${x}:${y}:${z}`, [mesh]);
}
afterEach(() => {
  clearWorldColliders();
  setTerrainCollisionData(null);
});

describe("retail player prediction", () => {
  it("unclamps signed angles and centered 6-bit movement axes", () => {
    expect(unclampMove({ ...neutral, px: 0, py: 32, pyaw: 65535 }).x).toBe(-1);
    expect(unclampMove({ ...neutral, px: 0, py: 32, pyaw: 65535 }).y).toBe(1);
    expect(unclampMove({ ...neutral, pyaw: 65535 }).yaw).toBeCloseTo(
      (-2 * Math.PI) / 65536,
      12,
    );
  });
  it("fills ticks without a network update and stops after the prediction limit", () => {
    const p = player();
    for (let i = 0; i < MAX_PREDICTION_TICKS; i++) p.processTick(0);
    expect(p.position.x).toBe(16 * PLAYER_TICK_SEC * MAX_PREDICTION_TICKS);
    const last = p.position.clone();
    p.processTick(0);
    expect(p.position).toEqual(last);
    expect(p.posVec.length()).toBe(0);
  });
  it("uses retail TickSec and raw world gravity for player physics", () => {
    const p = player();
    p.processTick(-20);
    expect(p.velocity.z).toBe(-20 * PLAYER_TICK_SEC);
    expect(p.position.z).toBe(10 - 20 * PLAYER_TICK_SEC ** 2);
  });
  it("runs the received move while packets are missing", () => {
    box(0, 0, -1, 100, 100, 2);
    const p = player({
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      move: { ...neutral, py: 32 },
    });
    p.processTick(-20);
    expect(p.velocity.y).toBeCloseTo((4968 / 90) * PLAYER_TICK_SEC);
    expect(p.position.y).toBeGreaterThan(0);
    expect(p.position.z).toBeGreaterThanOrEqual(0);
    expect(p.position.z).toBeLessThan(0.001);
  });
  it("coasts while skiing instead of applying ground braking", () => {
    box(0, 0, -1, 100, 100, 2);
    const p = player({
      position: { x: 0, y: 0, z: 0 },
      move: { ...neutral, trigger: [false, false, true] },
    });
    p.jumpDelay = 20;
    p.processTick(-20);
    expect(p.velocity.x).toBe(16);
  });
  it("jets vertically near a jump surface, then apportions horizontal thrust", () => {
    const p = player({
      velocity: { x: 0, y: 0, z: 0 },
      move: { ...neutral, py: 32, trigger: [false, false, false, true] },
    });
    p.processTick(-20);
    expect(p.velocity.y).toBe(0);
    expect(p.velocity.z).toBeCloseTo((2700 / 90 - 20) * PLAYER_TICK_SEC);
    p.jumpSurfaceLastContact = 8;
    p.processTick(-20);
    expect(p.velocity.y).toBeGreaterThan(0);
    expect(p.energy).toBe(98);
  });
  it("sweeps the player's box against walls, even at high speed", () => {
    box(3, 0, 10, 0.1, 100, 100);
    const p = player({ velocity: { x: 100, y: 10, z: 0 } });
    p.processTick(0);
    expect(p.position.x).toBeLessThanOrEqual(2.46);
    expect(p.position.y).toBeGreaterThan(0);
    expect(p.velocity.x).toBeCloseTo(-0.01, 6);
  });
  it("lands and stays grounded rather than falling through the floor", () => {
    box(0, 0, -1, 100, 100, 2);
    const p = player({
      position: { x: 0, y: 0, z: 0.2 },
      velocity: { x: 0, y: 0, z: -20 },
    });
    for (let i = 0; i < 20; i++) p.processTick(-20);
    expect(p.position.z).toBeGreaterThanOrEqual(0);
    expect(p.position.z).toBeLessThan(0.03);
    expect(p.velocity.length()).toBeCloseTo(0, 7);
  });
  it("moves over a step lower than maxStepHeight", () => {
    box(0, 0, -1, 100, 100, 2);
    box(2, 0, 0.25, 1, 10, 0.5);
    const p = player({
      position: { x: 0.9, y: 0, z: 0 },
      velocity: { x: 15, y: 0, z: 0 },
      move: { ...neutral, px: 32 },
    });
    for (let i = 0; i < 3; i++) p.processTick(-20);
    expect(p.position.x).toBeGreaterThan(1.5);
    expect(p.position.z).toBeGreaterThanOrEqual(0.5);
  });
  it("warps a correction for at most three ticks and wraps yaw by the shortest arc", () => {
    const p = player({ rotationZ: Math.PI * 2 - 0.1 });
    p.unpackUpdate({
      position: { x: 6, y: 0, z: 10 },
      velocity: { x: 16, y: 0, z: 0 },
      rotationZ: 0.1,
      allowWarp: true,
    });
    expect(p.warpTicks).toBe(3);
    p.processTick(0);
    expect(p.position.x).toBe(2);
    expect(Math.abs(p.rotVec)).toBeLessThan(0.1);
    p.processTick(0);
    p.processTick(0);
    expect(p.position.x).toBe(6);
    p.processTick(0);
    expect(p.position.x).toBe(6.5);
  });
  it("snaps teleports and preserves snapshot deltas across subsequent ticks", () => {
    const p = player();
    p.processTick(0);
    const delta = p.renderDelta();
    p.unpackUpdate({
      position: { x: 100, y: 0, z: 10 },
      velocity: { x: 0, y: 0, z: 0 },
      allowWarp: false,
    });
    expect(p.position.x).toBe(100);
    expect(p.posVec.length()).toBe(0);
    expect(delta.posVec[0]).toBe(-0.5);
  });
  it("interpolates continuously at every timeScale over sparse packets", () => {
    for (const timeScale of [1, 0.5, 0.25, 0.1]) {
      const p = player(),
        object = new Object3D(),
        camera = new PerspectiveCamera();
      let tick = 0,
        previousX = -Infinity;
      for (let wall = 0; wall < 0.5 / timeScale; wall += 1 / 120) {
        const time = wall * timeScale,
          target = Math.floor(time / 0.032) + 1;
        while (tick < target) {
          if (tick % 2 === 0)
            p.unpackUpdate({
              position: { x: tick * 0.5, y: 0, z: 10 },
              velocity: { x: 16, y: 0, z: 0 },
              allowWarp: true,
            });
          p.processTick(0);
          tick++;
        }
        const entity = {
          position: p.position.toArray(),
          playerDelta: p.renderDelta(),
        } as StreamEntity;
        applyStreamEntityPose(
          object,
          undefined,
          entity,
          undefined,
          (time - (tick - 1) * 0.032) / 0.032,
          camera,
        );
        expect(object.position.z).toBeCloseTo((time / 0.032) * 0.5, 7);
        expect(object.position.z).toBeGreaterThanOrEqual(previousX);
        previousX = object.position.z;
      }
    }
  });
});

it("restores prediction, correction warps and interpolation deltas at a tick boundary", () => {
  const original = player();
  original.processTick(-20);
  original.unpackUpdate({
    position: { x: 3, y: 1, z: 10 },
    velocity: { x: 16, y: 0, z: 0 },
    rotationZ: 0.8,
    allowWarp: true,
    move: neutral,
  });
  original.processTick(-20);
  expect(original.warpTicks).toBeGreaterThan(0);
  const saved = original.saveState();
  const preserved = structuredClone(saved);
  const expected = Array.from({ length: 20 }, () => {
    original.processTick(-20);
    return original.saveState();
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const restored = new PlayerPrediction(armor);
    restored.restoreState(saved);
    expect(
      Array.from({ length: 20 }, () => {
        restored.processTick(-20);
        return restored.saveState();
      }),
    ).toEqual(expected);
    expect(saved).toEqual(preserved);
  }
});
