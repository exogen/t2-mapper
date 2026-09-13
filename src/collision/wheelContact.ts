import { Box3, Matrix4, Quaternion, Triangle, Vector3 } from "three";
import {
  terrainTrianglesInBox,
  castTerrainRay,
  type Vec3,
} from "./terrainCollision";
import { castInteriorRay, playerTrianglesInBox } from "./worldCollision";
import type { WheelGroundData } from "../particles/groundEffectAssets";

const basis = new Matrix4().set(0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1);
/** Torque local coordinates -> Three world coordinates. */
export function groundActorMatrix(
  position: Vec3,
  rotation: [number, number, number, number],
  out = new Matrix4(),
): Matrix4 {
  return out
    .compose(
      new Vector3(position[1], position[2], position[0]),
      new Quaternion(...rotation),
      new Vector3(1, 1, 1),
    )
    .multiply(basis);
}
export function torqueWorldPoint(local: Vec3, matrix: Matrix4): Vec3 {
  const p = new Vector3(...local).applyMatrix4(matrix);
  return [p.z, p.x, p.y];
}

/** Continuous local box/triangle SAT for the wheel's extruded contact volume. */
export function sweepWheelTriangle(
  triangle: Triangle,
  center: Vector3,
  extent: Vector3,
  travel: Vector3,
): number | null {
  const a = triangle.a.clone().sub(center),
    b = triangle.b.clone().sub(center),
    c = triangle.c.clone().sub(center);
  let enter = -Infinity,
    leave = Infinity;
  const axis = (x: number, y: number, z: number) => {
    const p = a.x * x + a.y * y + a.z * z,
      q = b.x * x + b.y * y + b.z * z,
      r = c.x * x + c.y * y + c.z * z;
    const radius =
      Math.abs(x) * extent.x + Math.abs(y) * extent.y + Math.abs(z) * extent.z;
    const lo = Math.min(p, q, r) - radius,
      hi = Math.max(p, q, r) + radius;
    const speed = travel.x * x + travel.y * y + travel.z * z;
    if (Math.abs(speed) < 1e-12) return lo <= 1e-9 && hi >= -1e-9;
    enter = Math.max(enter, Math.min(lo / speed, hi / speed));
    leave = Math.min(leave, Math.max(lo / speed, hi / speed));
    return enter <= leave + 1e-9;
  };
  const normal = triangle.getNormal(new Vector3());
  // ExtrudedPolyList rejects polygons facing away from the sweep velocity.
  if (normal.dot(travel) > 0) return null;
  if (
    !axis(1, 0, 0) ||
    !axis(0, 1, 0) ||
    !axis(0, 0, 1) ||
    !axis(normal.x, normal.y, normal.z)
  )
    return null;
  const edge = new Vector3();
  for (const [u, v] of [
    [a, b],
    [b, c],
    [c, a],
  ]) {
    edge.subVectors(v, u);
    const { x, y, z } = edge;
    if (!axis(0, z, -y) || !axis(-z, 0, x) || !axis(y, -x, 0)) return null;
  }
  return leave >= 0 && enter <= 1 ? Math.max(0, enter) : null;
}

/** WheeledVehicle::updateWheels: sweep a tire box along its spring, then
 * use safePos->pos as the penetration fallback. An interior contact blocks dust. */
export class WheelContactQuery {
  private triangles: number[] = [];
  private box = new Box3();
  private triangle = new Triangle();
  private inverse = new Matrix4();
  contact(
    wheel: WheelGroundData,
    radius: number,
    matrix: Matrix4,
    otherTriangles?: (box: Box3, out: number[]) => void,
    rayBlocked?: (start: Vec3, end: Vec3, t: number) => boolean,
  ): Vec3 | null {
    if (!(radius > 0)) return null;
    const spring = new Vector3(...wheel.spring),
      pos = new Vector3(...wheel.position);
    const hp = pos.clone().sub(spring),
      travel = spring.clone().multiplyScalar(2);
    const center = hp.clone().add(new Vector3(0, 0, radius)),
      extent = new Vector3(radius / 2, radius, radius);
    this.box.makeEmpty();
    for (let i = 0; i < 8; i++) {
      const corner = center
        .clone()
        .add(
          new Vector3(
            i & 1 ? extent.x : -extent.x,
            i & 2 ? extent.y : -extent.y,
            i & 4 ? extent.z : -extent.z,
          ),
        );
      this.box.expandByPoint(corner.clone().applyMatrix4(matrix));
      this.box.expandByPoint(corner.add(travel).applyMatrix4(matrix));
    }
    this.triangles.length = 0;
    terrainTrianglesInBox(
      this.box.min.z,
      this.box.min.x,
      this.box.max.z,
      this.box.max.x,
      this.triangles,
    );
    const terrainEnd = this.triangles.length;
    playerTrianglesInBox(this.box, this.triangles, undefined, "vehicle");
    otherTriangles?.(this.box, this.triangles);
    this.inverse.copy(matrix).invert();
    let best = Infinity,
      terrain = false;
    for (let i = 0; i < this.triangles.length; i += 9) {
      const { a, b, c } = this.triangle;
      a.fromArray(this.triangles, i).applyMatrix4(this.inverse);
      // The terrain gatherer emits clockwise triangles; its collision normal is up.
      b.fromArray(this.triangles, i + (i < terrainEnd ? 6 : 3)).applyMatrix4(
        this.inverse,
      );
      c.fromArray(this.triangles, i + (i < terrainEnd ? 3 : 6)).applyMatrix4(
        this.inverse,
      );
      const hit = sweepWheelTriangle(this.triangle, center, extent, travel);
      if (hit !== null && hit < best) {
        best = hit;
        terrain = i < terrainEnd;
      }
    }
    if (best !== Infinity) {
      if (!terrain) return null;
      const extension = Math.max(0, (best - 0.5) * 2);
      return torqueWorldPoint(
        pos.addScaledVector(spring, extension).toArray() as Vec3,
        matrix,
      );
    }
    const start = torqueWorldPoint(
      [wheel.position[0], wheel.position[1], wheel.position[2] + radius],
      matrix,
    );
    const end = torqueWorldPoint(wheel.position, matrix),
      hit = castTerrainRay(start, end);
    if (!hit || rayBlocked?.(start, end, hit.t)) return null;
    const interior = castInteriorRay(start, end);
    return interior &&
      interior.dist < Math.hypot(...start.map((v, i) => v - end[i])) * hit.t
      ? null
      : hit.point;
  }
}
