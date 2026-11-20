import { afterEach, expect, it, vi } from "vitest";
import { Vector3 } from "three";
import {
  testCatchupPayload,
  watchRelaySource,
} from "../../relay/serverPacketFixtures";
import { setTerrainCollisionData } from "../collision/terrainCollision";
import { prepareProjectileShapes } from "../collision/projectileShapeAssets";
import { setWaterInfo } from "../collision/waterLevel";
import { createDTSTestShape } from "../dts/dtsTestFixtures";
import { interpolateStreamPosition } from "./interpolateEntity";
import { orientationAlongDirection } from "./streamHelpers";
import { TestLiveStream } from "./streamTestFixtures";
import type { MutableEntity } from "./StreamEngine";
import type { ProjectileLifecycleEvent } from "./types";
import type { ParsedData } from "t2-demo-parser";

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

const waterPlane = {
  surfaceZ: 20,
  waveMagnitude: 0,
  liquidType: 0,
  minX: 0,
  minY: 0,
  sizeX: 2048,
  sizeY: 2048,
};

function linearWaterStream(projectile: ParsedData, liquidType = 0) {
  setWaterInfo({ ...waterPlane, liquidType });
  const stream = new TestLiveStream("play", "LinearProjectile");
  const dataBlocks = new Map<number, ParsedData>([
    [
      1,
      {
        dryVelocity: 100,
        wetVelocity: 50,
        lifetimeMS: 640,
        explosion: 2,
        underwaterExplosion: 3,
        depthTolerance: 5,
        ...projectile,
      },
    ],
    [2, { lifetimeMS: 1000 }],
    [3, { lifetimeMS: 1000 }],
  ]);
  vi.spyOn(stream, "getDataBlockData").mockImplementation((id) =>
    dataBlocks.get(id),
  );
  return stream;
}

class ProjectileTestStream extends TestLiveStream {
  readonly muzzle =
    vi.fn<
      (sourceId: string, slot: number) => [number, number, number] | undefined
    >();

  protected override resolveProjectileMuzzle(
    source: MutableEntity,
    slot: number,
  ) {
    return this.muzzle(source.id, slot);
  }
}

function scopedLinearStream(
  doDynamicClientHits: boolean,
  projectileClass = "LinearProjectile",
) {
  const stream = new ProjectileTestStream("play", (id) =>
    id === 1 ? projectileClass : id === 3 ? "HoverVehicle" : "Player",
  );
  const blocks = new Map<number, ParsedData>([
    [
      1,
      { dryVelocity: 100, lifetimeMS: 640, explosion: 2, doDynamicClientHits },
    ],
    [2, { lifetimeMS: 1000 }],
    [3, { boxSize: { x: 1, y: 1, z: 2 } }],
    [4, { shapeName: "test-projectile-firing-vehicle.dts" }],
  ]);
  vi.spyOn(stream, "getDataBlockData").mockImplementation((id) =>
    blocks.get(id),
  );
  return stream;
}

const scopedShot = {
  dataBlockId: 1,
  position: { x: 0, y: 0, z: 100 },
  direction: { x: 1, y: 0, z: 0 },
  sourceObject: 3,
  sourceSlot: 2,
};

const playerAt = (x: number, y: number) => ({
  dataBlockId: 3,
  position: { x, y, z: 99 },
});

afterEach(() => {
  setTerrainCollisionData(null);
  setWaterInfo(null);
});

it.each([
  ["ELFProjectile", "targetObject"],
  ["RepairProjectile", "repairingObject"],
] as const)(
  "keeps %s attached only to the endpoints specified in its packet",
  (className, targetField) => {
    const stream = new TestLiveStream("play", (id) =>
      id === 1 ? className : "Player",
    );
    const endpoint = (index: number) => ({
      index,
      type: "create" as const,
      classId: 2,
      parsedData: {},
    });
    stream.feedDecoded({
      ghosts: [
        {
          index: 7,
          type: "create",
          classId: 1,
          parsedData: { sourceObject: 0, sourceSlot: 0, [targetField]: 4 },
        },
        endpoint(0),
        endpoint(4),
      ],
    });
    expect(stream.entityAt(7)).toMatchObject({
      linkSourceId: stream.entityAt(0)?.id,
      linkTargetId: stream.entityAt(4)?.id,
    });
    stream.feedDecoded({ ghosts: [{ index: 4, type: "delete" }, endpoint(4)] });
    expect(stream.entityAt(7)?.linkTargetId).toBeUndefined();
    stream.roundTripCheckpoint();
    expect(stream.entityAt(7)?.linkSourceId).toBe(stream.entityAt(0)?.id);
    expect(stream.entityAt(7)?.linkTargetId).toBeUndefined();
    stream.updateGhost(7, { sourceObject: 0, sourceSlot: 0, [targetField]: 4 });
    expect(stream.entityAt(7)?.linkTargetId).toBe(stream.entityAt(4)?.id);
    stream.updateGhost(7, {
      sourceObject: -1,
      sourceSlot: -1,
      [targetField]: -1,
    });
    expect(stream.entityAt(7)).toMatchObject({
      linkSourceId: undefined,
      linkTargetId: undefined,
      sourceSlot: undefined,
    });
  },
);

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
  expect(projectile.position).toEqual([4.2, 2, 3]);
  expect(received).not.toHaveBeenCalled();

  stream.stepToTime(0.064);
  expect(projectile.position).toBeUndefined();
  expect(received).toHaveBeenCalledExactlyOnceWith({
    type: "end",
    id: projectile.id,
    position: [4.2, 2, 3],
    timeSec: 0.064,
  });
});

it("joins the aged linear path in five ticks from one same-packet muzzle sample", () => {
  const stream = scopedLinearStream(false);
  stream.muzzle.mockReturnValue([1, 5, 100]);
  stream.feedDecoded({
    ghosts: [
      {
        index: 4,
        type: "create",
        classId: 1,
        parsedData: { ...scopedShot, currTick: 3 },
      },
      { index: 3, type: "create", classId: 2, parsedData: playerAt(0, 4) },
    ],
  });
  const first = stream
    .stepToTime(0.032)
    .entities.find((e) => e.ghostIndex === 4)!;
  expect(stream.muzzle).toHaveBeenCalledExactlyOnceWith(
    stream.entityAt(3)?.id,
    2,
  );
  expect(first.position?.[0]).toBeCloseTo(5.92);
  expect(first.position?.[1]).toBe(4);
  const renderPosition = new Vector3();
  interpolateStreamPosition(renderPosition, first, undefined, 0);
  expect(renderPosition.toArray()).toEqual([5, 100, 1]);
  interpolateStreamPosition(renderPosition, first, undefined, 0.5);
  expect(renderPosition.x).toBeCloseTo(4.5);
  expect(renderPosition.z).toBeCloseTo(3.46);
  stream.roundTripCheckpoint();
  stream.stepToTime(0.16);
  expect(stream.entityAt(4)?.position).toEqual([25.6, 0, 100]);
  const flight = stream
    .stepToTime(0.192)
    .entities.find((e) => e.ghostIndex === 4)!;
  expect(stream.entityAt(4)?.position?.[0]).toBeCloseTo(28.8);
  // The current endpoint can also be the fallback when frames skip ticks.
  interpolateStreamPosition(renderPosition, flight, flight, 0.5);
  expect(renderPosition.z).toBeCloseTo(27.2);
  expect(stream.muzzle).toHaveBeenCalledTimes(1);
});

it("keeps the sampled interval across a repeated launch packet", () => {
  const stream = scopedLinearStream(true);
  stream.muzzle.mockReturnValue([0, 5, 100]);
  stream.createGhost(3, 2, playerAt(0, 5));
  stream.createGhost(5, 2, playerAt(4.8, 1.5));
  stream.createGhost(4, 1, { ...scopedShot, currTick: 0 });
  stream.stepToTime(0.032);
  stream.updateGhost(4, { ...scopedShot, currTick: 1 });
  expect(stream.entityAt(4)?.position).toEqual([3.2, 4, 100]);
  const next = stream.stepToTime(0.064);
  expect(next.entities.find((e) => e.ghostIndex === 4)).toMatchObject({
    position: [6.4, 3, 100],
    linearTickStart: [3.2, 4, 100],
  });
  expect(next.entities.some(({ type }) => type === "Explosion")).toBe(false);
});

it("preserves the tracer ribbon aim while inheriting perpendicular velocity", () => {
  const stream = scopedLinearStream(false, "TracerProjectile");
  stream.createGhost(4, 1, {
    ...scopedShot,
    excessVel: 20,
    excessDir: { x: 0, y: 1, z: 0 },
  });
  stream.stepToTime(0.032);
  expect(stream.entityAt(4)).toMatchObject({
    direction: [1, 0, 0],
    velocity: [100, 20, 0],
  });
});

it.each([true, false])(
  "casts along the warped tick and consumes a later server hit only once (client hits: %s)",
  (clientHits) => {
    const stream = scopedLinearStream(clientHits);
    stream.muzzle.mockReturnValue([0, 5, 100]);
    stream.createGhost(3, 2, playerAt(0, 5));
    stream.createGhost(5, 2, playerAt(2.8, 4.4));
    stream.createGhost(4, 1, { ...scopedShot, currTick: 2 });
    const endFlight = vi.fn();
    stream.subscribeProjectileLifecycle(endFlight);
    const first = stream.stepToTime(0.032);
    const fx = first.entities.filter(({ type }) => type === "Explosion");
    if (clientHits) {
      expect(first.entities.find((e) => e.ghostIndex === 4)).toMatchObject({
        hasExploded: true,
        position: undefined,
      });
      expect(fx).toHaveLength(1);
      expect(fx[0].position?.[0]).toBeCloseTo(2.3);
      expect(fx[0].position?.[1]).toBeCloseTo(5 - 2.3 / 4.48);
    } else expect(fx).toHaveLength(0);

    stream.roundTripCheckpoint();
    stream.updateGhost(4, { explodePosition: { x: 3, y: 4.4, z: 100 } });
    expect(stream.entityAt(4)).toMatchObject({
      hasExploded: true,
      position: undefined,
    });
    const snapshot = stream.stepToTime(0.064);
    expect(snapshot.entities.find((e) => e.ghostIndex === 4)).toMatchObject({
      hasExploded: true,
      position: undefined,
    });
    const next = snapshot.entities.filter(({ type }) => type === "Explosion");
    expect(next).toHaveLength(1);
    expect(next[0].position).toEqual(
      clientHits ? fx[0].position : [3, 4.4, 100],
    );
    expect(endFlight).toHaveBeenCalledTimes(1);
  },
);

it("ignores the scoped shooter for six local sweeps regardless of packet age", () => {
  const stream = scopedLinearStream(true);
  // The packet path reaches the shooter's box during sweep six. Sweep seven
  // starts within it and it becomes eligible after the retained grace period.
  stream.createGhost(3, 2, playerAt(25.5, 0));
  stream.createGhost(4, 1, { ...scopedShot, currTick: 2 });
  stream.stepToTime(0.16);
  stream.roundTripCheckpoint();
  stream.stepToTime(0.192);
  expect(stream.entityAt(4)?.hasExploded).toBeFalsy();
  stream.stepToTime(0.224);
  expect(stream.entityAt(4)?.hasExploded).toBe(true);
});

it("does not exempt a replacement player reusing the shooter's ghost slot", () => {
  const stream = scopedLinearStream(true);
  stream.createGhost(3, 2, playerAt(0, 0));
  stream.createGhost(4, 1, scopedShot);
  stream.createGhost(3, 2, playerAt(2, 0));
  stream.stepToTime(0.032);
  expect(stream.entityAt(4)?.hasExploded).toBe(true);
});

it.each([false, true])(
  "only attaches a passenger to a replacement vehicle after a mount update (%s)",
  (remounted) => {
    const stream = scopedLinearStream(true);
    prepareProjectileShapes(["test-projectile-firing-vehicle.dts"], () => {
      const shape = createDTSTestShape();
      shape.names[shape.nodes[0].nameIndex] = "Mount0";
      shape.defaultTranslations.fill(0);
      return shape;
    });
    const vehicle = { dataBlockId: 4, position: { x: 4.8, y: 0, z: 99 } };
    const rider = { ...playerAt(9, 0), mountObject: 6, mountNode: 0 };
    stream.createGhost(6, 3, vehicle);
    stream.createGhost(5, 2, rider);
    stream.createGhost(6, 3, vehicle);
    if (remounted) stream.updateGhost(5, { mountObject: 6, mountNode: 0 });
    stream.roundTripCheckpoint();
    expect(stream.entityAt(5)?.mountObjectId).toBe(
      remounted ? stream.entityAt(6)?.id : undefined,
    );
    stream.createGhost(3, 2, playerAt(0, 5));
    stream.createGhost(4, 1, scopedShot);
    stream.stepToTime(0.064);
    expect(Boolean(stream.entityAt(4)?.hasExploded)).toBe(remounted);
  },
);

it.each(["terrain", "water"] as const)(
  "initializes a shot using %s registered after its packet but before simulation",
  (geometry) => {
    const stream = linearWaterStream({ explodeOnWaterImpact: true });
    setWaterInfo(null);
    stream.createGhost(4, 1, {
      dataBlockId: 1,
      initialPosition: { x: 4, y: 6, z: 25 },
      direction: { x: 0, y: 0, z: -1 },
    });
    stream.roundTripCheckpoint();

    if (geometry === "terrain") {
      setTerrainCollisionData({
        heightMap: new Uint16Array(256 * 256),
        squareSize: 8,
      });
    } else setWaterInfo(waterPlane);

    const snapshot = stream.stepToTime(0.32);
    expect(stream.entityAt(4)?.hasExploded).toBe(true);
    expect(
      snapshot.entities.filter(({ type }) => type === "Explosion"),
    ).toEqual([
      expect.objectContaining({
        position: [4, 6, geometry === "water" ? 20 : 0],
      }),
    ]);
  },
);

it("advances a slowed round through water and explodes at the lake bed", () => {
  const stream = linearWaterStream({ explodeOnWaterImpact: false });
  setTerrainCollisionData({
    heightMap: new Uint16Array(256 * 256),
    squareSize: 8,
  });
  stream.createGhost(4, 1, {
    dataBlockId: 1,
    initialPosition: { x: 4, y: 6, z: 25 },
    direction: { x: 0, y: 0, z: -1 },
  });
  const received = vi.fn();
  stream.subscribeProjectileLifecycle(received);

  stream.stepToTime(0.032);
  expect(stream.entityAt(4)?.velocity).toEqual([0, 0, -100]);
  stream.stepToTime(0.064);
  const underwater = stream.entityAt(4);
  expect(underwater?.position?.[2]).toBeCloseTo(19.3);
  expect(underwater?.velocity).toEqual([0, 0, -50]);
  expect(underwater?.direction).toEqual([0, 0, -50]);
  expect(received).not.toHaveBeenCalled();

  stream.stepToTime(0.48);
  expect(stream.entityAt(4)?.position).toEqual([4, 6, 0]);
  expect(received).not.toHaveBeenCalled();

  const impact = stream.stepToTime(0.512);
  expect(stream.entityAt(4)?.position).toBeUndefined();
  expect(received).toHaveBeenCalledExactlyOnceWith({
    type: "end",
    id: underwater?.id,
    position: [4, 6, 0],
    timeSec: 0.512,
  });
  expect(
    impact.entities.filter((entity) => entity.type === "Explosion"),
  ).toEqual([
    expect.objectContaining({ explosionDataBlockId: 3, position: [4, 6, 0] }),
  ]);
  stream.stepToTime(0.544);
  expect(received).toHaveBeenCalledTimes(1);
});

it.each([false, true])(
  "preserves the terminal outcome (explode on death: %s) when the server deletes the ghost first",
  (explodeOnDeath) => {
    const stream = linearWaterStream({ lifetimeMS: 32, explodeOnDeath });
    stream.createGhost(4, 1, {
      dataBlockId: 1,
      initialPosition: { x: 4, y: 6, z: 25 },
      direction: { x: 1, y: 0, z: 0 },
      currTick: 1,
    });
    const projectile = stream.entityAt(4);
    const received = vi.fn();
    stream.subscribeProjectileLifecycle(received);

    stream.ghost({ index: 4, type: "delete" });

    expect(received).toHaveBeenCalledExactlyOnceWith({
      type: "end",
      id: projectile?.id,
      position: [7.2, 6, 25],
      timeSec: 0,
    });
    const snapshot = stream.stepToTime(0.032);
    expect(snapshot.entities).toEqual(
      explodeOnDeath
        ? [
            expect.objectContaining({
              type: "Explosion",
              position: [7.2, 6, 25],
            }),
          ]
        : [],
    );
  },
);

it.each(["delete", "replace"] as const)(
  "ends tracking without exploding when a live round's ghost is removed (%s)",
  (removal) => {
    const stream = linearWaterStream({ explodeOnDeath: true });
    const initial = {
      dataBlockId: 1,
      position: { x: 4, y: 6, z: 25 },
      direction: { x: 1, y: 0, z: 0 },
    };
    stream.createGhost(4, 1, initial);
    stream.stepToTime(0.032);
    const original = stream.entityAt(4)!;
    expect(original.position).toBeDefined();
    const received = vi.fn();
    stream.subscribeProjectileLifecycle(received);

    if (removal === "delete") stream.ghost({ index: 4, type: "delete" });
    else stream.createGhost(4, 1, initial);

    const snapshot = stream.stepToTime(0.064);
    expect(
      snapshot.entities.some((entity) => entity.type === "Explosion"),
    ).toBe(false);
    expect(received).toHaveBeenNthCalledWith(1, {
      type: "end",
      id: original.id,
      position: original.position,
      timeSec: 0.032,
    });
  },
);

it("uses a server impact that arrives while rendering the predicted endpoint", () => {
  const stream = linearWaterStream({ lifetimeMS: 32, explodeOnDeath: true });
  stream.createGhost(4, 1, {
    dataBlockId: 1,
    initialPosition: { x: 4, y: 6, z: 25 },
    direction: { x: 1, y: 0, z: 0 },
  });
  const received = vi.fn();
  stream.subscribeProjectileLifecycle(received);
  stream.stepToTime(0.032);
  expect(stream.entityAt(4)?.position).toEqual([7.2, 6, 25]);
  expect(received).not.toHaveBeenCalled();

  stream.updateGhost(4, { explodePosition: { x: 7, y: 6, z: 24 } });
  stream.ghost({ index: 4, type: "delete" });
  const snapshot = stream.stepToTime(0.064);

  expect(received).toHaveBeenCalledTimes(1);
  expect(received).toHaveBeenCalledWith(
    expect.objectContaining({ type: "end", position: [7, 6, 24] }),
  );
  expect(snapshot.entities.filter(({ type }) => type === "Explosion")).toEqual([
    expect.objectContaining({ explosionDataBlockId: 2, position: [7, 6, 24] }),
  ]);
});

it("turns a skipped round along its reflected path, including late ghosts", () => {
  const stream = linearWaterStream({
    explodeOnWaterImpact: true,
    reflectOnWaterImpactAngle: 15,
  });
  const initial = {
    dataBlockId: 1,
    initialPosition: { x: 10, y: 10, z: 20.75 },
    direction: { x: 1, y: 0, z: -0.1 },
  };
  stream.createGhost(4, 1, initial);
  const received = vi.fn();
  stream.subscribeProjectileLifecycle(received);

  stream.stepToTime(0.096);
  expect(received).not.toHaveBeenCalled();
  const reflected = stream.entityAt(4);
  expect(reflected?.position?.[2]).toBeCloseTo(20.21);
  expect(reflected?.velocity).toEqual([100, 0, 10]);
  expect(reflected?.rotation).toEqual(orientationAlongDirection([100, 0, 10]));

  stream.createGhost(5, 1, { ...initial, currTick: 3 });
  stream.stepToTime(0.128);
  expect(stream.entityAt(5)).toMatchObject({
    linearTickStart: reflected?.position,
    position: stream.entityAt(4)?.position,
    rotation: reflected?.rotation,
    velocity: reflected?.velocity,
    direction: reflected?.direction,
  });
});

it.each([
  { liquidType: 0, z: 15, explosionDataBlockId: 3 },
  { liquidType: 0, z: 16, explosionDataBlockId: 2 },
  { liquidType: 6, z: 14, explosionDataBlockId: 2 },
])(
  "chooses the impact effect at depth $z in liquid type $liquidType",
  ({ liquidType, z, explosionDataBlockId }) => {
    const stream = linearWaterStream({}, liquidType);
    stream.createGhost(4, 1, {
      dataBlockId: 1,
      initialPosition: { x: 4, y: 6, z: 25 },
      direction: { x: 0, y: 0, z: -1 },
    });
    stream.updateGhost(4, { explodePosition: { x: 4, y: 6, z } });
    expect(
      stream
        .getSnapshot()
        .entities.find((entity) => entity.type === "Explosion"),
    ).toMatchObject({ explosionDataBlockId, position: [4, 6, z] });
  },
);

it("uses the regular effect for an initial ghost that is already exploded underwater", () => {
  const stream = linearWaterStream({});
  stream.createGhost(4, 1, {
    dataBlockId: 1,
    hidden: true,
    explodePosition: { x: 4, y: 6, z: 14 },
  });

  expect(stream.entityAt(4)?.position).toBeUndefined();
  expect(
    stream.getSnapshot().entities.find((entity) => entity.type === "Explosion"),
  ).toMatchObject({ explosionDataBlockId: 2, position: [4, 6, 14] });
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
