import { expect, it, vi } from "vitest";
import {
  testCatchupPayload,
  watchRelaySource,
} from "../../relay/serverPacketFixtures";
import { TestLiveStream } from "./streamTestFixtures";
import type { ProjectileLifecycleEvent } from "./types";

const classes = (classId: number) =>
  classId === 1
    ? "Turret"
    : classId === 3
      ? "BombProjectile"
      : "GrenadeProjectile";

const turret = { index: 3, classId: 1, type: "create" } as const;
const shot = (index: number, currTick?: number) => ({
  index,
  classId: 2,
  type: "create" as const,
  parsedData: {
    position: { x: 10, y: 20, z: 30 },
    velocity: { x: 1, y: 2, z: 3 },
    sourceObject: turret.index,
    currTick,
  },
});

it("captures the shooter once, even when its ghost follows the projectile in a packet", () => {
  const stream = new TestLiveStream("play", classes);
  const received = vi.fn<(event: ProjectileLifecycleEvent) => void>();
  const unsubscribe = stream.subscribeProjectileLifecycle(received);

  stream.stepToTime(0.32);
  stream.feedDecoded({ ghosts: [shot(4, 2), turret] });
  const shooterId = stream.entityAt(turret.index)?.id;
  expect(shooterId).toBeDefined();
  expect(received).toHaveBeenCalledExactlyOnceWith({
    type: "spawn",
    id: stream.entityAt(4)?.id,
    timeSec: 0.32,
    launchTimeSec: 0.256,
    direction: [1, 2, 3],
    sourceEntityId: shooterId,
    sourceName: "Turret",
  });
  stream.feedDecoded({ ghosts: [shot(5), turret] });
  expect(stream.entityAt(turret.index)?.id).not.toBe(shooterId);
  expect(stream.entityAt(4)?.projectileSourceName).toBe("Turret");
  expect(stream.entityAt(5)?.projectileSourceName).toBe("Turret");
  expect(received).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: "spawn", sourceEntityId: shooterId }),
  );

  unsubscribe();
  stream.ghost(shot(8));
  expect(received).toHaveBeenCalledTimes(2);
  expect(stream.entityAt(8)?.projectileSourceName).toBe("Turret");
});

it("retains ordered terminal positions for impacts, slot replacements, and deletes", () => {
  const stream = new TestLiveStream("play", classes);
  const events: ProjectileLifecycleEvent[] = [];
  stream.subscribeProjectileLifecycle((event) => events.push(event));
  stream.ghost(shot(4));
  stream.ghost(shot(5));
  const originalId = stream.entityAt(4)?.id;
  const impactId = stream.entityAt(5)?.id;
  events.length = 0;

  stream.feedDecoded({
    ghosts: [
      {
        index: 5,
        classId: 2,
        type: "update",
        parsedData: { explodePosition: { x: 4, y: 5, z: 6 } },
      },
      shot(4),
      { index: 4, type: "delete" },
      { index: 5, type: "delete" },
    ],
  });
  expect(events).toMatchObject([
    { type: "end", id: impactId, position: [4, 5, 6] },
    { type: "end", id: originalId, position: [10, 20, 30] },
    { type: "spawn", id: expect.any(String) },
    { type: "end", id: events[2]?.id, position: [10, 20, 30] },
  ]);
  expect(events[2]?.id).not.toBe(originalId);
  expect(events[2]).toMatchObject({ launchTimeSec: undefined });
});

it("ends flight at the terminal point when the simulated projectile fizzles", () => {
  const stream = new TestLiveStream("play", classes);
  const projectile = stream.addEntity({
    id: "linear",
    type: "Projectile",
    className: "LinearProjectile",
    ghostIndex: 4,
    position: [1, 2, 3],
    simulatedVelocity: [100, 0, 0],
    linearSegment: {
      start: [1, 2, 3],
      vel: [100, 0, 0],
      msEnd: 32,
      endPoint: [4.2, 2, 3],
      endNormal: [0, 0, 1],
      explodeAtEnd: false,
    },
  });
  const received = vi.fn();
  stream.subscribeProjectileLifecycle(received);

  stream.stepToTime(0.032);
  expect(projectile.position).toBeUndefined();
  expect(received).toHaveBeenCalledExactlyOnceWith({
    type: "end",
    id: projectile.id,
    position: [4.2, 2, 3],
    timeSec: 0.032,
  });
});

it("ends a bomb at the packet's impact point even when it also updates the flight position", () => {
  const stream = new TestLiveStream("play", classes);
  stream.ghost({ ...shot(4), classId: 3 });
  stream.ghost(shot(5));
  const bombId = stream.entityAt(4)?.id;
  const received = vi.fn<(event: ProjectileLifecycleEvent) => void>();
  stream.subscribeProjectileLifecycle(received);
  const update = {
    position: { x: 4, y: 5, z: 6 },
    endPoint: { x: 7, y: 8, z: 9 },
    endNormal: { x: 0, y: 0, z: 1 },
  };

  stream.feedDecoded({
    ghosts: [
      { index: 4, classId: 3, type: "update", parsedData: update },
      { index: 5, classId: 2, type: "update", parsedData: update },
    ],
  });
  expect(received).toHaveBeenCalledExactlyOnceWith({
    type: "end",
    id: bombId,
    position: [7, 8, 9],
    timeSec: 0,
  });
  expect(stream.entityAt(4)).toMatchObject({ hasExploded: true });
  expect(stream.entityAt(4)?.position).toBeUndefined();
  expect(stream.entityAt(5)?.position).toEqual([4, 5, 6]);
});

it("retains the original shooter name on checkpoint restore without replaying spawns", () => {
  const stream = new TestLiveStream("play", classes);
  stream.addEntity({
    id: "roof-turret",
    ghostIndex: turret.index,
    className: "Turret",
    type: "Deployable",
    label: "Roof turret",
  });
  stream.ghost(shot(4));
  stream.ghost(turret);
  const received = vi.fn();
  stream.subscribeProjectileLifecycle(received);

  stream.roundTripCheckpoint();
  expect(stream.entityAt(4)?.projectileSourceName).toBe("Roof turret");
  expect(received).not.toHaveBeenCalled();
});

it("does not treat projectiles already in a live catch-up baseline as new shots", () => {
  const stream = new TestLiveStream("watch");
  const received = vi.fn();
  stream.subscribeProjectileLifecycle(received);
  const { registry } = watchRelaySource();

  stream.hydrate({
    ...testCatchupPayload(),
    initialGhosts: [
      {
        ...turret,
        classId: registry.getGhostClassId("Turret")!,
        updateBitsStart: 0,
        updateBitsEnd: 0,
      },
      {
        ...shot(4),
        classId: registry.getGhostClassId("GrenadeProjectile")!,
        updateBitsStart: 0,
        updateBitsEnd: 0,
      },
    ],
  });
  expect(stream.entityAt(4)).toMatchObject({
    type: "Projectile",
    position: [10, 20, 30],
  });
  expect(stream.entityAt(4)?.projectileSourceName).toBeUndefined();
  expect(received).not.toHaveBeenCalled();
});
