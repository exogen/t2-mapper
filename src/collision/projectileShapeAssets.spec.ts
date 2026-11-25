import { Quaternion, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDTSCollisionTestShape } from "../dts/dtsTestFixtures";
import {
  createCollisionState,
  runInCollisionWorld,
} from "../world/nodeCollisionContext";
import { ProjectileDynamicCollision } from "./projectileDynamicCollision";
import {
  clearBrowserProjectileShapeAssets,
  getProjectileShapeAsset,
  getProjectileShapeData,
  prepareProjectileShapes,
  ProjectileShapePoses,
} from "./projectileShapeAssets";

afterEach(() => vi.useRealTimers());

describe("projectile shape assets", () => {
  it("reuses an authored LOS hull in the entity's native coordinates", () => {
    const name = "test-projectile-hull.dts";
    expect(
      prepareProjectileShapes([name], createDTSCollisionTestShape),
    ).toBeUndefined();
    const shape = getProjectileShapeAsset(`SHAPES\\${name.toUpperCase()}`)!;
    expect(shape).toBe(getProjectileShapeAsset(name));

    const id = "target";
    const matrixWorld = new ProjectileShapePoses(() => undefined).get({
      id,
      type: "Vehicle",
      position: [10, 20, 30],
    })!;
    const collision = new ProjectileDynamicCollision([
      { id, kind: "shape", matrixWorld, shape },
    ]);
    expect(collision.cast([10, 15, 31.5], [10, 25, 31.5])).toMatchObject({
      id,
      point: [10, 18, 31.5],
    });
    expect(collision.cast([10, 15, 32.5], [10, 25, 32.5])).toBeNull();
  });

  it("composes a player's relative yaw at the vehicle's authored mount pose", () => {
    const name = "test-projectile-seats.dts";
    const data = createDTSCollisionTestShape();
    data.names[data.nodes[0].nameIndex] = "Mount1";
    data.defaultTranslations.set([4, 2, 6]);
    prepareProjectileShapes([name], () => data);
    const turn = new Quaternion()
      .setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
      .toArray();

    const poses = new ProjectileShapePoses((index) =>
      index === 1
        ? {
            id: "vehicle",
            type: "Vehicle",
            shapeHint: name,
            position: [10, 20, 30],
            rotation: turn,
          }
        : undefined,
    );
    const mount = poses.get({
      id: "passenger",
      type: "Player",
      mountNode: 1,
      mountObjectGhostIndex: 1,
      rotation: turn,
    })!;
    expect(
      new Vector3()
        .setFromMatrixPosition(mount)
        .distanceTo(new Vector3(24, 36, 8)),
    ).toBeLessThan(1e-6);
    expect(
      new Vector3(0, 0, 1)
        .transformDirection(mount)
        .distanceTo(new Vector3(0, 0, -1)),
    ).toBeLessThan(1e-6);
    expect(
      poses.get({ id: "missing", type: "Player", mountObjectGhostIndex: 2 }),
    ).toBeUndefined();
  });

  it("keeps a packet muzzle pose independent of the same player's collision pose", () => {
    const poses = new ProjectileShapePoses(() => undefined);
    const predicted = {
      id: "shooter",
      type: "Player" as const,
      position: [1, 2, 3] as [number, number, number],
    };
    const packet = {
      ...predicted,
      position: [4, 5, 6] as [number, number, number],
    };

    const collisionPose = poses.get(predicted)!;
    expect(
      new Vector3().setFromMatrixPosition(poses.get(packet)!).toArray(),
    ).toEqual([5, 6, 4]);
    expect(poses.get(predicted)).toBe(collisionPose);
    expect(
      new Vector3().setFromMatrixPosition(collisionPose).toArray(),
    ).toEqual([2, 3, 1]);
  });

  it("shares loading across aliases and resolves missing data without delaying later ticks", async () => {
    const data = createDTSCollisionTestShape();
    let finish!: (value: typeof data) => void;
    const download = new Promise<typeof data>((resolve) => (finish = resolve));
    const load = vi.fn(() => download);
    const name = "test-pending-projectile-shape.dts";
    const pending = prepareProjectileShapes([name.toUpperCase(), name], load);
    expect(pending).toBeDefined();
    expect(prepareProjectileShapes([`SHAPES/${name}`], load)).toBe(pending);
    expect(getProjectileShapeData(name)).toBeUndefined();
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(name);

    finish(data);
    await pending;
    expect(getProjectileShapeData(name)).toBe(data);
    expect(prepareProjectileShapes([name], load)).toBeUndefined();

    const missing = "test-missing-projectile-shape.dts";
    const fail = vi.fn(() => Promise.reject(new Error("File missing")));
    await prepareProjectileShapes([missing], fail);
    expect(prepareProjectileShapes([missing], fail)).toBeUndefined();
    expect(getProjectileShapeData(missing)).toBeUndefined();
    expect(fail).toHaveBeenCalledTimes(1);
  });

  it("tries a failed shape again with the next playback session", async () => {
    const name = "test-retry-projectile-shape.dts";
    const load = vi.fn(async () => {
      throw new Error("Temporary loss of network");
    });
    await prepareProjectileShapes([name], load);
    expect(prepareProjectileShapes([name], load)).toBeUndefined();
    expect(load).toHaveBeenCalledOnce();

    const data = createDTSCollisionTestShape();
    const recovered = vi.fn(() => data);
    expect(prepareProjectileShapes([name], recovered)).toBeUndefined();
    expect(recovered).toHaveBeenCalledExactlyOnceWith(name);
    expect(getProjectileShapeData(name)).toBe(data);
  });

  it("reuses the aggregate wait for the same pending shapes", async () => {
    const data = createDTSCollisionTestShape();
    let finish!: (value: typeof data) => void;
    const download = new Promise<typeof data>((resolve) => (finish = resolve));
    const load = () => download;
    const names = ["test-pending-first.dts", "test-pending-second.dts"];
    const pending = prepareProjectileShapes(names, load);
    expect(pending).toBeDefined();
    expect(prepareProjectileShapes([...names].reverse(), load)).toBe(pending);
    finish(data);
    await pending;
    expect(prepareProjectileShapes(names, load)).toBeUndefined();
  });

  it("settles a shared stalled load and ignores its late result after a successful retry", async () => {
    vi.useFakeTimers();
    const name = "test-stalled-projectile-shape.dts";
    const late = createDTSCollisionTestShape();
    let finish!: (value: typeof late) => void;
    const download = new Promise<typeof late>((resolve) => (finish = resolve));
    const first = vi.fn(() => download);
    const second = vi.fn(() => download);
    const pending = prepareProjectileShapes([name], first);
    expect(prepareProjectileShapes([name], second)).toBe(pending);
    expect(second).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();
    await pending;
    expect(prepareProjectileShapes([name], first)).toBeUndefined();
    expect(prepareProjectileShapes([name], second)).toBeUndefined();
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();

    const recovered = createDTSCollisionTestShape();
    prepareProjectileShapes([name], () => recovered);
    finish(late);
    await download;
    expect(getProjectileShapeData(name)).toBe(recovered);
  });

  it("isolates world names and reuses authored collision data by shape identity", async () => {
    const name = "test-shared-projectile-shape.dts";
    const data = createDTSCollisionTestShape();
    const first = createCollisionState();
    const second = createCollisionState();
    const loaded = await runInCollisionWorld(first, () => {
      prepareProjectileShapes([name], () => data);
      return getProjectileShapeAsset(name);
    });
    await runInCollisionWorld(second, () => {
      expect(getProjectileShapeAsset(name)).toBeUndefined();
      prepareProjectileShapes([name], () => data);
      expect(getProjectileShapeAsset(name)).toBe(loaded);
    });
  });

  it("releases viewer shapes without touching a Node world or accepting stale loads", async () => {
    const ready = "test-scene-release-ready.dts";
    const pending = "test-scene-release-pending.dts";
    const previous = createDTSCollisionTestShape();
    const current = createDTSCollisionTestShape();
    const nodeWorld = createCollisionState();
    let finish!: (value: typeof previous) => void;
    const download = new Promise<typeof previous>(
      (resolve) => (finish = resolve),
    );

    await runInCollisionWorld(nodeWorld, () => {
      prepareProjectileShapes([ready], () => previous);
    });
    prepareProjectileShapes([ready], () => previous);
    const oldLoad = prepareProjectileShapes([pending], () => download);
    expect(getProjectileShapeData(ready)).toBe(previous);

    clearBrowserProjectileShapeAssets();
    expect(getProjectileShapeData(ready)).toBeUndefined();
    prepareProjectileShapes([pending], () => current);

    finish(previous);
    await oldLoad;
    expect(getProjectileShapeData(pending)).toBe(current);
    await runInCollisionWorld(nodeWorld, () => {
      expect(getProjectileShapeData(ready)).toBe(previous);
    });
    clearBrowserProjectileShapeAssets();
  });
});
