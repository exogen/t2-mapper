import { afterEach, expect, it } from "vitest";
import { LiveStreamAdapter } from "./liveStreaming";
import type { RelayClient } from "./relayClient";
import type { MutableEntity } from "./StreamEngine";
import { clearShapeBounds, registerShapeBounds } from "./shapeBounds";
import { encodeCheckpoint, decodeCheckpoint } from "./checkpointCodec";
import { Group, PerspectiveCamera } from "three";
import { applyStreamEntityPose } from "./interpolateEntity";
import { streamEntityToGameEntity } from "./entityBridge";

class DebrisStream extends LiveStreamAdapter {
  blocks: Record<number, Record<string, unknown>> = {
    1: {
      shapeName: "vehicle_air_scout.dts",
      debrisShapeName: "vehicle_air_scout_debris.dts",
      debris: 2,
      explosion: 3,
      renderWhenDestroyed: false,
    },
    2: { lifetime: 25 },
    3: { debris: 4, lifetimeMS: 31 },
    4: { lifetime: 10 },
  };
  constructor() {
    super({} as RelayClient);
  }
  override getDataBlockData(id: number) {
    return this.blocks[id];
  }
  add(damageState = 0, type = "Vehicle") {
    const entity: MutableEntity = {
      id: "source",
      ghostIndex: 1,
      className: type === "Vehicle" ? "FlyingVehicle" : type,
      type,
      spawnTick: 0,
      position: [10, 20, 30],
      rotation: [0, 0, 0, 1],
    };
    this.entities.set(entity.id, entity);
    this.entityIdByGhostIndex.set(1, entity.id);
    this.applyGhostData(entity, { dataBlockId: 1, damageState });
    return entity;
  }
  damage(damageState: number, extra: Record<string, unknown> = {}) {
    this.applyGhostData(this.entities.get(this.entityIdByGhostIndex.get(1)!)!, {
      damageState,
      ...extra,
    });
  }
  projectileImpact() {
    const entity: MutableEntity = {
      id: "projectile",
      ghostIndex: 2,
      className: "GrenadeProjectile",
      type: "Projectile",
      spawnTick: 0,
      explosionDataBlockId: 3,
      rotation: [0, 0, 0, 1],
    };
    this.applyGhostData(entity, {
      explodePosition: { x: 1, y: 2, z: 3 },
      explodeNormal: { x: 0, y: 1, z: 0 },
    });
  }
  remove() {
    this.entities.delete(this.entityIdByGhostIndex.get(1)!);
  }
  roundTrip() {
    const saved = this.captureSimulationState();
    this.restoreSimulationState(
      decodeCheckpoint(encodeCheckpoint(saved)) as typeof saved,
    );
  }
}
afterEach(clearShapeBounds);
it("spawns authored pieces and explosion debris once on destruction, retaining them after ghost removal and checkpoint restore", () => {
  const stream = new DebrisStream();
  registerShapeBounds("vehicle_air_scout.dts", {
    min: [-1, -2, -3],
    max: [3, 6, 9],
  });
  const source = stream.add();
  expect(stream.debrisHistory.events).toHaveLength(0);
  stream.damage(2, { damageDir: { x: 1, y: 0, z: 0 } });
  expect(source.destroyedHidden).toBe(true);
  expect(stream.debrisHistory.events.map((e) => e.kind)).toEqual([
    "shape",
    "explosion",
  ]);
  expect(stream.debrisHistory.events[0]).toMatchObject({
    position: [11, 22, 33],
    normal: [1, 0, 0],
    gravity: -9.81,
  });
  stream.damage(2);
  expect(stream.debrisHistory.events).toHaveLength(2);
  stream.remove();
  const events = structuredClone(stream.debrisHistory.events);
  stream.roundTrip();
  expect(stream.debrisHistory.events).toEqual(events);
  expect(stream.debrisHistory.generation).toBe(1);
});
it("does not explode initially destroyed ghosts; repairing and destroying again starts a fresh effect", () => {
  const stream = new DebrisStream();
  stream.add(2);
  expect(stream.debrisHistory.events).toHaveLength(0);
  stream.damage(0);
  stream.damage(2);
  stream.damage(0);
  stream.damage(2);
  expect(stream.debrisHistory.events.map((e) => e.id)).toEqual([0, 1, 2, 3]);
});
it("base assets can keep their destroyed mesh and spawn debris without an explosion datablock", () => {
  const stream = new DebrisStream();
  stream.blocks[1] = {
    debrisShapeName: "debris_generic.dts",
    debris: 2,
    renderWhenDestroyed: true,
  };
  const source = stream.add(0, "StaticShape");
  stream.damage(2);
  expect(source.destroyedHidden).toBe(false);
  expect(stream.debrisHistory.events).toHaveLength(1);
});
it("hides destroyed models immediately and restores them on repair without removing scene membership", () => {
  const stream = new DebrisStream();
  stream.add();
  stream.damage(2);
  const entity = stream.stepToTime(0).entities.find((e) => e.ghostIndex === 1)!;
  const root = new Group();
  const camera = new PerspectiveCamera();
  const game = streamEntityToGameEntity(entity);
  applyStreamEntityPose(root, game, entity, undefined, 1, camera);
  expect(root.visible).toBe(false);
  stream.damage(0);
  const repaired = stream
    .stepToTime(0.032)
    .entities.find((e) => e.ghostIndex === 1)!;
  applyStreamEntityPose(root, game, repaired, undefined, 1, camera);
  expect(root.visible).toBe(true);
});

it("orients explosion debris along the replicated projectile impact normal", () => {
  const stream = new DebrisStream();
  stream.projectileImpact();
  expect(stream.debrisHistory.events[0]).toMatchObject({
    position: [1, 2, 3],
    normal: [0, 1, 0],
  });
});

it("retains each explosion's debris only for its own descendants' lifetimes", () => {
  const stream = new DebrisStream();
  stream.blocks[3] = {
    ...stream.blocks[3],
    dtsFileName: "unloaded-explosion.dts",
    lifetimeMS: 3125,
    subExplosions: [5],
  };
  stream.blocks[5] = { debris: 6, lifetimeMS: 31 };
  stream.blocks[6] = { lifetime: 1 };
  stream.projectileImpact();
  // The parent explosion shape has its own lifetime; sub-explosions record
  // their own debris events. Neither prolongs these fireballs' history.
  expect(stream.debrisHistory.events).toMatchObject([
    { dataBlockId: 3, time: 0, expires: 11 },
    { dataBlockId: 5, time: 0, expires: 2 },
  ]);
  stream.debrisHistory.prune(3);
  expect(stream.debrisHistory.events).toHaveLength(1);
});
