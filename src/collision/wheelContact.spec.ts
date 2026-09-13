import { afterEach, expect, it } from "vitest";
import { BoxGeometry, Mesh, Triangle, Vector3 } from "three";
import {
  groundActorMatrix,
  sweepWheelTriangle,
  torqueWorldPoint,
  WheelContactQuery,
} from "./wheelContact";
import { setTerrainCollisionData } from "./terrainCollision";
import {
  clearWorldColliders,
  registerInteriorCollider,
} from "./worldCollision";
const wheel = {
  position: [0, 0, 0] as [number, number, number],
  spring: [0, 0, -1] as [number, number, number],
};
afterEach(() => {
  setTerrainCollisionData(null);
  clearWorldColliders();
});
it("uses the same Torque-to-world rotation as shapes", () => {
  const matrix = groundActorMatrix(
    [10, 20, 30],
    [0, -Math.SQRT1_2, 0, Math.SQRT1_2],
  );
  const p = torqueWorldPoint([0, 1, 0], matrix);
  expect(p[0]).toBeCloseTo(11);
  expect(p[1]).toBeCloseTo(20);
  expect(p[2]).toBe(30);
});
it("sweeps the entire tire volume and rejects an off-to-the-side face", () => {
  const floor = new Triangle(
    new Vector3(-5, -5, 0),
    new Vector3(5, -5, 0),
    new Vector3(0, 5, 0),
  );
  expect(
    sweepWheelTriangle(
      floor,
      new Vector3(0, 0, 2),
      new Vector3(0.5, 1, 1),
      new Vector3(0, 0, -2),
    ),
  ).toBeCloseTo(0.5);
  expect(
    sweepWheelTriangle(
      floor,
      new Vector3(20, 0, 2),
      new Vector3(0.5, 1, 1),
      new Vector3(0, 0, -2),
    ),
  ).toBeNull();
});
it("emits only for an actual terrain contact, including extended springs", () => {
  setTerrainCollisionData({
    heightMap: new Uint16Array(256 * 256),
    squareSize: 8,
  });
  const query = new WheelContactQuery();
  const at = (z: number) =>
    query.contact(wheel, 1, groundActorMatrix([0, 0, z], [0, 0, 0, 1]));
  expect(at(0.5)?.[2]).toBeCloseTo(0);
  expect(at(1.5)).toBeNull();
  const floor = new Mesh(new BoxGeometry(10, 0.2, 10));
  floor.position.y = 0.3;
  floor.updateMatrixWorld();
  registerInteriorCollider("floor", [floor]);
  expect(at(0.5)).toBeNull();
});
