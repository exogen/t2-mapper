import { afterEach, describe, expect, it } from "vitest";
import { Group, Matrix4, Vector3 } from "three";
import { parseDIF } from "./dif";
import { createDIFModel } from "./difLoader";
import { createDIFTestBuffer } from "./difTestFixtures";
import { interiorColliderMeshes } from "../world/colliderPolicy";
import {
  castWorldRay,
  clearWorldColliders,
  pointInsideInterior,
  pointObstructed,
  registerInteriorCollider,
} from "../collision/worldCollision";

const v = (x: number, y: number, z: number) => new Vector3(y, z, x);
const identity = new Matrix4();
const fixture = () =>
  createDIFModel(
    createDIFTestBuffer({ collision: true, vehicleCollision: "box" }).buffer,
  );
afterEach(() => clearWorldColliders());

describe("DIF vehicle collision", () => {
  it("reads the resource-level hull set after nonempty v44 object records", () => {
    const { buffer } = createDIFTestBuffer({
      collision: true,
      details: 2,
      preview: true,
      resourceObjects: true,
      vehicleCollision: "box",
    });
    const file = parseDIF(buffer);
    expect(file.interiors).toHaveLength(2);
    expect(file.vehicleCollision?.convexHulls).toHaveLength(1);
    expect(file.vehicleCollision?.points[2]).toEqual([1, 0, 0]);
    expect(file.vehicleCollision?.hullSurfaceIndices[0]).toBe(0xc0000000);
    expect(createDIFModel(buffer, 1).collision.vehicleHulls?.data).toEqual(
      file.vehicleCollision,
    );
  });

  it("decodes compact feature polygons despite stale authoring winding indices", () => {
    const { collision } = fixture(),
      vehicle = collision.vehicleHulls!;
    expect(vehicle.data.windings[0]).toBe(100);
    expect(vehicle.data.hullPolygons[0]).toHaveLength(6);
    expect(vehicle.winding(0)).toEqual([0, 1, 3, 2]);
    expect(vehicle.planes[0].normal.toArray()).toEqual([0, 1, 0]);
    const triangles: Vector3[][] = [];
    collision.visitHullTriangles(
      collision.bounds,
      (a, b, c) => {
        triangles.push([a, b, c]);
        return false;
      },
      "vehicle",
    );
    expect(triangles).toHaveLength(12);
    for (const points of triangles)
      for (const point of points)
        expect(vehicle.bounds.containsPoint(point)).toBe(true);
  });

  it.each([undefined, "empty"] as const)(
    "falls back to ordinary hulls when vehicle data is %s",
    (vehicleCollision) => {
      const model = createDIFModel(
        createDIFTestBuffer({ collision: true, vehicleCollision }).buffer,
      );
      expect(model.collision.vehicleHulls).toBeNull();
      registerInteriorCollider(
        "base",
        interiorColliderMeshes(new Group(), model),
      );
      expect(
        pointObstructed([2, 1, -1], 0.1, { interiorHullType: "vehicle" }),
      ).toBe(true);
      expect(
        pointObstructed([3.2, 1, -1], 0.3, { interiorHullType: "vehicle" }),
      ).toBe(true);
      expect(
        pointObstructed([3.4, 1, -1], 0.3, { interiorHullType: "vehicle" }),
      ).toBe(false);
    },
  );

  it("replaces ordinary hulls for vehicle queries while raycasts keep using the BSP", () => {
    registerInteriorCollider(
      "base",
      interiorColliderMeshes(new Group(), fixture()),
    );
    expect(pointInsideInterior([2, 1, -1])).toBe(true);
    expect(pointInsideInterior([2, 1, -1], "vehicle")).toBe(false);
    expect(pointObstructed([2, 1, -1], 0.1)).toBe(true);
    expect(
      pointObstructed([2, 1, -1], 0.1, { interiorHullType: "vehicle" }),
    ).toBe(false);
    expect(
      pointObstructed([0.5, 1, -1], 0.1, { interiorHullType: "vehicle" }),
    ).toBe(true);
    expect(
      pointObstructed([1.2, 1, -1], 0.3, { interiorHullType: "vehicle" }),
    ).toBe(true);
    expect(castWorldRay([2, 1, 2], [2, 1, -1])?.t).toBeCloseTo(2 / 3);
  });

  it("respects instance transforms and exact sphere clearance", () => {
    const model = fixture(),
      group = new Group();
    group.position.set(7, 8, 9);
    group.rotation.set(0.2, -0.3, 0.4);
    group.scale.set(2, 3, -4);
    registerInteriorCollider("base", interiorColliderMeshes(group, model));
    const outside = v(1.1, 1, -1).applyMatrix4(group.matrixWorld);
    const point: [number, number, number] = [outside.z, outside.x, outside.y];
    expect(pointObstructed(point, 0.39, { interiorHullType: "vehicle" })).toBe(
      false,
    );
    expect(pointObstructed(point, 0.41, { interiorHullType: "vehicle" })).toBe(
      true,
    );
    const inside = v(0.5, 1, -1).applyMatrix4(group.matrixWorld);
    expect(pointInsideInterior([inside.z, inside.x, inside.y], "vehicle")).toBe(
      true,
    );
    expect(
      model.collision.intersectsSphere(
        v(1.2, -0.2, -1),
        0.25,
        identity,
        identity,
        "vehicle",
      ),
    ).toBe(false);
    expect(
      model.collision.intersectsSphere(
        v(1.2, -0.2, -1),
        0.29,
        identity,
        identity,
        "vehicle",
      ),
    ).toBe(true);
  });

  it("rejects malformed versions, compact point references, surface flags and feature streams", () => {
    for (const [name, value, message] of [
      ["vehicleVersion", 1, /unsupported vehicle collision version/],
      ["vehicleHullIndices", 100, /invalid vehicle hull point/],
      ["vehicleSurfaceIndices", 0x80000000, /invalid vehicle surface flag/],
      ["vehicleEmitIndices", 0xffffffff, /truncated vehicle feature stream/],
    ] as const) {
      const { buffer, offsets } = createDIFTestBuffer({
        collision: true,
        vehicleCollision: "box",
      });
      new DataView(buffer).setUint32(offsets[name], value, true);
      expect(() => parseDIF(buffer)).toThrow(message);
    }
    const { buffer, offsets } = createDIFTestBuffer({
      collision: true,
      vehicleCollision: "box",
    });
    new DataView(buffer).setUint8(offsets.vehicleEmit + 1, 100);
    expect(() => parseDIF(buffer)).toThrow(
      /invalid vehicle feature hull point/,
    );
  });

  it("rejects truncated vehicle blocks and trailing resource fields", () => {
    const { buffer, offsets } = createDIFTestBuffer({
      collision: true,
      vehicleCollision: "box",
    });
    for (const length of [
      offsets.vehiclePresence + 2,
      offsets.vehicleVersion + 3,
      offsets.vehicleEmit + 10,
      buffer.byteLength - 1,
    ])
      expect(() => parseDIF(buffer.slice(0, length))).toThrow(/truncated data/);
  });
});
