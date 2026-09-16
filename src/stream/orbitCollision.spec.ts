import { afterEach, describe, expect, it } from "vitest";
import {
  Box3,
  BoxGeometry,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from "three";
import {
  castWorldRay,
  clearWorldColliders,
  pointObstructed,
  registerForceFieldCollider,
  registerInteriorCollider,
  registerStaticShapeCollider,
  setForceFieldEnabled,
} from "../collision/worldCollision";
import { setTerrainCollisionData } from "../collision/terrainCollision";
import { constrainOrbitCamera, orbitCameraClearance } from "./orbitCollision";

const geometries: BoxGeometry[] = [];
afterEach(() => {
  clearWorldColliders();
  setTerrainCollisionData(null);
  for (const geometry of geometries) geometry.dispose();
  geometries.length = 0;
});

function box(
  size: [number, number, number],
  at: [number, number, number],
): Mesh {
  const geometry = new BoxGeometry(...size);
  geometries.push(geometry);
  const mesh = new Mesh(geometry);
  mesh.position.set(...at);
  mesh.updateMatrixWorld(true);
  return mesh;
}

function terrain(height: number, emptySquareRuns?: number[]): void {
  setTerrainCollisionData({
    heightMap: new Uint16Array(256 * 256).fill(
      Math.round((height / 2048) * 65535),
    ),
    squareSize: 8,
    emptySquareRuns,
  });
}

function expectClear(target: Vector3, position: Vector3, radius = 0.3): void {
  const from: [number, number, number] = [target.z, target.x, target.y];
  const to: [number, number, number] = [position.z, position.x, position.y];
  expect(castWorldRay(from, to, { includeStatics: true })).toBeNull();
  expect(
    pointObstructed(to, radius, {
      includeStatics: true,
      includeForceFields: true,
      terrainSurfaceOnly: true,
    }),
  ).toBe(false);
}

describe("follow camera obstruction", () => {
  it("preserves the requested position and pivot in open air", () => {
    const target = new Vector3(3, 7, 2);
    const position = new Vector3(9, 6, 12);
    constrainOrbitCamera(target, position);
    expect(position.toArray()).toEqual([9, 6, 12]);
    expect(target.toArray()).toEqual([3, 7, 2]);
  });

  it.each([0.8, 5])(
    "retracts before a wall %sm from the player, without a minimum zoom",
    (x) => {
      registerInteriorCollider("wall", [box([0.2, 20, 20], [x + 0.1, 0, 0])]);
      const target = new Vector3();
      const position = new Vector3(8, 0, 0);
      constrainOrbitCamera(target, position);
      expect(position.x).toBeCloseTo(x - 0.32);
      expectClear(target, position);
    },
  );

  it("keeps the camera sphere clear of a side wall missed by the sightline", () => {
    registerInteriorCollider("wall", [box([4, 20, 1], [8, 0, 0.7])]);
    const target = new Vector3();
    const position = new Vector3(8, 0, 0);
    expect(castWorldRay([0, 0, 0], [0, 8, 0])).toBeNull();
    constrainOrbitCamera(target, position);
    expect(position.x).toBeGreaterThan(5.7);
    expect(position.x).toBeLessThan(6);
    expectClear(target, position);
  });

  it("keeps clearance at grazing angles", () => {
    registerInteriorCollider("wall", [box([0.2, 20, 100], [2.1, 0, 0])]);
    const target = new Vector3();
    const position = new Vector3(3, 0, 20);
    constrainOrbitCamera(target, position);
    expect(position.x).toBeLessThan(1.7);
    expect(position.x / position.z).toBeCloseTo(3 / 20);
    expectClear(target, position);
  });

  it("checks a shortened destination for side walls even when the full arm is clear", () => {
    registerInteriorCollider("wall", [box([2, 20, 1], [5, 0, 0.7])]);
    const target = new Vector3();
    const position = new Vector3(8, 0, 0);
    constrainOrbitCamera(target, position);
    expect(position.x).toBe(8);
    const distance = constrainOrbitCamera(target, position, 0.3, () => 5);
    expect(distance).toBeLessThan(4);
    expect(distance).toBeGreaterThan(3.7);
    expect(position.x).toBe(distance);
    expectClear(target, position);
  });

  it("keeps the chosen destination within the clear arm", () => {
    registerInteriorCollider("wall", [box([1, 10, 10], [4, 0, 0])]);
    const target = new Vector3();
    const position = new Vector3(8, 0, 0);
    constrainOrbitCamera(target, position, 0.3, () => 8);
    expect(position.x).toBeLessThan(3.5);
    expectClear(target, position);
  });

  it("does not retract for a side wall beyond the chosen destination", () => {
    registerInteriorCollider("wall", [box([1, 20, 1], [8, 0, 0.7])]);
    const target = new Vector3();
    const position = new Vector3(8, 0, 0);
    const distance = constrainOrbitCamera(
      target,
      position,
      0.3,
      (rayDistance) => rayDistance - 1,
    );
    expect(distance).toBe(7);
    expect(position.x).toBe(distance);
    expectClear(target, position);
  });

  it("stays above ground while looking up and trailing downhill", () => {
    terrain(0);
    const target = new Vector3(2, 1, 2);
    const position = new Vector3(10, -3, 2);
    constrainOrbitCamera(target, position);
    expect(position.y).toBeGreaterThan(0.3);
    expect(position.x).toBeLessThan(4);
    expectClear(target, position);
  });

  it("detects terrain clipping even when the centre ray stays above ground", () => {
    terrain(0);
    const target = new Vector3(2, 1, 2);
    const position = new Vector3(10, 0.1, 2);
    constrainOrbitCamera(target, position);
    expect(position.y).toBeGreaterThanOrEqual(0.3);
    expectClear(target, position);
  });

  it("allows a terrain hole instead of clamping to its invisible heightmap", () => {
    terrain(0, [128 | (128 << 8) | (1 << 16)]);
    const target = new Vector3(2, 2, 2);
    const position = new Vector3(6, -2, 2);
    constrainOrbitCamera(target, position);
    expect(position.toArray()).toEqual([6, -2, 2]);
    expectClear(target, position);
  });

  it("stays in a basement and stops at its ceiling instead of lifting through it", () => {
    terrain(10);
    registerInteriorCollider("room", [
      box([40, 1, 40], [0, -0.5, 0]),
      box([40, 1, 40], [0, 4.5, 0]),
    ]);
    const target = new Vector3(0, 1, 0);
    const level = new Vector3(8, 1, 0);
    constrainOrbitCamera(target, level);
    expect(level.toArray()).toEqual([8, 1, 0]);
    const upward = new Vector3(8, 8, 0);
    constrainOrbitCamera(target, upward);
    expect(upward.y).toBeLessThan(3.7);
    expectClear(target, upward);
  });

  it("uses static shape hulls as well as interiors", () => {
    registerStaticShapeCollider("generator", [box([2, 3, 3], [5, 0, 0])]);
    const target = new Vector3();
    const position = new Vector3(8, 0, 0);
    constrainOrbitCamera(target, position);
    expect(position.x).toBeCloseTo(3.68);
    expectClear(target, position);
  });

  it("respects enabled forcefields, including clearance beside their edges", () => {
    registerForceFieldCollider(
      "field",
      new Matrix4(),
      new Box3(new Vector3(6, -5, 0.2), new Vector3(10, 5, 0.3)),
      true,
    );
    const target = new Vector3();
    const position = new Vector3(8, 0, 0);
    constrainOrbitCamera(target, position);
    expect(position.x).toBeLessThan(6);
    expectClear(target, position);
    setForceFieldEnabled("field", false);
    position.set(8, 0, 0);
    constrainOrbitCamera(target, position);
    expect(position.x).toBe(8);
  });

  it("rechecks after obstacles change and recovers the requested zoom", () => {
    registerInteriorCollider("wall", [box([1, 10, 10], [4, 0, 0])]);
    const target = new Vector3();
    const desired = new Vector3(8, 0, 0);
    const position = desired.clone();
    constrainOrbitCamera(target, position);
    expect(position.x).toBeLessThan(4);
    clearWorldColliders();
    position.copy(desired);
    constrainOrbitCamera(target, position);
    expect(position).toEqual(desired);
  });

  it("measures clearance in world space for scaled, rotated forcefields", () => {
    const rotation = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      Math.PI / 4,
    );
    const matrix = new Matrix4().compose(
      new Vector3(4, 5, 6),
      rotation,
      new Vector3(20, 10, 0.1),
    );
    registerForceFieldCollider(
      "scaled",
      matrix,
      new Box3(new Vector3(-0.5, -0.5, -0.5), new Vector3(0.5, 0.5, 0.5)),
      true,
    );
    for (const [x, z, blocked] of [
      [10.2, 0, true],
      [10.5, 0, false],
      [0, 0.2, true],
      [0, 0.5, false],
    ] as const) {
      const point = new Vector3(x, 0, z)
        .applyQuaternion(rotation)
        .add(new Vector3(4, 5, 6));
      expect(
        pointObstructed([point.z, point.x, point.y], 0.3, {
          includeForceFields: true,
          terrainSurfaceOnly: true,
        }),
      ).toBe(blocked);
    }
  });

  it("can collapse completely without moving through a wall", () => {
    registerInteriorCollider("wall", [box([1, 10, 10], [0.6, 0, 0])]);
    const position = new Vector3(8, 0, 0);
    constrainOrbitCamera(new Vector3(), position);
    expect(position.toArray()).toEqual([0, 0, 0]);
    constrainOrbitCamera(new Vector3(), position);
    expect(position.toArray()).toEqual([0, 0, 0]);
  });

  it("encloses the near plane at wide FOVs and large aspect ratios", () => {
    const camera = new PerspectiveCamera(110, 2.4, 0.1);
    const radius = orbitCameraClearance(camera);
    const corner = new Vector3(1, 1, -1).unproject(camera);
    expect(radius).toBeGreaterThan(corner.length());
    expect(radius).toBeGreaterThan(0.3);
  });
});
