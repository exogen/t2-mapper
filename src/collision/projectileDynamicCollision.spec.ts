import { Box3, Matrix3, Matrix4, Plane, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  getMountedVehicleIds,
  isProjectileCollisionTarget,
  ProjectileDynamicCollision,
  type ProjectileCollisionTarget,
} from "./projectileDynamicCollision";
import type { ProjectileShapeAsset } from "./projectileShapeAssets";

const stationMask = 1 << 29;
const boxSize = { x: 4, y: 2, z: 3 };

const player = (
  id: string,
  x: number,
  mountedVehicleIds?: readonly string[],
): ProjectileCollisionTarget => ({
  id,
  kind: "player",
  boxSize,
  mountedVehicleIds,
  // Rotating 90° puts the wide Torque X side across the shot.
  matrixWorld: new Matrix4().makeRotationY(Math.PI / 2).setPosition(x, 0, 0),
});

describe("linear projectile dynamic collision", () => {
  it("uses the native dynamic mask and excludes players no longer enabled", () => {
    for (const className of [
      "Player",
      "FlyingVehicle",
      "HoverVehicle",
      "WheeledVehicle",
      "Turret",
    ]) {
      expect(isProjectileCollisionTarget(className)).toBe(true);
    }
    expect(isProjectileCollisionTarget("Player", 0, 1)).toBe(false);
    expect(isProjectileCollisionTarget("Player", 0, 2)).toBe(false);
    expect(isProjectileCollisionTarget("StaticShape", stationMask)).toBe(true);
    expect(isProjectileCollisionTarget("StaticShape", 1)).toBe(false);
    expect(isProjectileCollisionTarget("Item")).toBe(false);
    expect(isProjectileCollisionTarget("Item", 1 << 27)).toBe(true);
    expect(isProjectileCollisionTarget("WaterBlock", 1 << 4)).toBe(false);
  });

  it("uses the closest player's posed box and returns the reverse ray normal", () => {
    const collision = new ProjectileDynamicCollision([
      player("far", 8),
      player("near", 5),
    ]);
    const start = [0, 0, 1] as const;
    const end = [0, 10, 2] as const;
    const hit = collision.cast([...start], [...end]);
    expect(hit).toMatchObject({ id: "near", t: 0.3, point: [0, 3, 1.3] });
    expect(hit?.normal[1]).toBeCloseTo(-10 / Math.sqrt(101));
    expect(hit?.normal[2]).toBeCloseTo(-1 / Math.sqrt(101));
    expect(collision.cast([...start], [...end], "near")?.id).toBe("far");
    expect(collision.cast([...start], [...end], "near", "far")).toBeNull();
    expect(collision.cast([0, 5, 1], [...end])?.t).toBe(0);
    expect(collision.cast([0, 0, 1], [0, 2, 1])).toBeNull();
  });

  it("excludes current mounted occupants recursively during the firing vehicle's grace period", () => {
    interface MountedObject {
      id: string;
      type: string;
      parent?: MountedObject;
    }
    const firingVehicle: MountedObject = {
      id: "firing-vehicle",
      type: "Vehicle",
    };
    const nestedVehicle: MountedObject = {
      id: "mounted-vehicle",
      type: "Vehicle",
      parent: firingVehicle,
    };
    const rider: MountedObject = {
      id: "passenger",
      type: "Player",
      parent: nestedVehicle,
    };
    const parentOf = (object: MountedObject) => object.parent;
    const getCollision = () =>
      new ProjectileDynamicCollision([
        player("other", 10),
        player(rider.id, 5, getMountedVehicleIds(rider, parentOf)),
      ]);
    const start: [number, number, number] = [0, 0, 1];
    const end: [number, number, number] = [0, 15, 1];
    const collision = getCollision();
    expect(collision.cast(start, end, "shooter", firingVehicle.id)?.id).toBe(
      "other",
    );
    expect(collision.cast(start, end, firingVehicle.id)?.id).toBe("other");
    expect(collision.cast(start, end)?.id).toBe(rider.id);

    nestedVehicle.parent = { id: "replacement", type: "Vehicle" };
    expect(
      getCollision().cast(start, end, "shooter", firingVehicle.id)?.id,
    ).toBe(rider.id);
    rider.parent = { id: "carrier", type: "Deployable", parent: firingVehicle };
    expect(
      getCollision().cast(start, end, "shooter", firingVehicle.id)?.id,
    ).toBe(rider.id);
  });

  it("requires a dynamic shape's actual LOS hull inside its bounds", () => {
    const asset: ProjectileShapeAsset = {
      bounds: new Box3(new Vector3(-4, -4, -4), new Vector3(4, 4, 4)),
      hulls: [
        {
          inverse: new Matrix4().makeTranslation(-2, 0, 0),
          normalMatrix: new Matrix3(),
          planes: [
            new Plane(new Vector3(1, 0, 0), -1),
            new Plane(new Vector3(-1, 0, 0), -1),
            new Plane(new Vector3(0, 1, 0), -1),
            new Plane(new Vector3(0, -1, 0), -1),
            new Plane(new Vector3(0, 0, 1), -1),
            new Plane(new Vector3(0, 0, -1), -1),
          ],
        },
      ],
      mounts: new Map(),
    };
    const collision = new ProjectileDynamicCollision([
      {
        id: "station",
        kind: "shape",
        matrixWorld: new Matrix4().makeTranslation(8, 0, 0),
        shape: asset,
      },
    ]);
    expect(collision.cast([0, 0, 0], [0, 20, 0])).toEqual({
      id: "station",
      t: 0.45,
      point: [0, 9, 0],
      normal: [0, -1, 0],
    });
    expect(collision.cast([0, 0, 2], [0, 20, 2])).toBeNull();
    expect(collision.cast([0, 10, 0], [0, 20, 0])).toBeNull();
  });
});
