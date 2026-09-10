import { Box3, Triangle, Vector3 } from "three";
import { terrainTrianglesInBox } from "./terrainCollision";
import { playerTrianglesInBox } from "./worldCollision";

/** Player::findContact / updatePos use an upright box, not the rendered DTS. */
export class PlayerCollision {
  private readonly triangles: number[] = [];
  private terrainEnd = 0;
  private readonly triangle = new Triangle();
  private readonly queryBox = new Box3();
  private readonly box = new Box3();
  private readonly center = new Vector3();
  private readonly extent = new Vector3();
  private readonly normal = new Vector3();
  private readonly edge = new Vector3();
  private readonly vertices: Vector3[] = [];
  private readonly clipped: Vector3[] = [];
  readonly hitNormal = new Vector3();
  hitTime = 1;
  hitHeight = -Infinity;

  private readonly collideWithField?: (id: string) => boolean;

  constructor(collideWithField?: (id: string) => boolean) {
    this.collideWithField = collideWithField;
  }

  /** One working polygon set per tick, reused for contact, sweeps, and stepping. */
  prepare(
    position: Vector3,
    size: Vector3,
    travel: Vector3,
    maxStep: number,
  ): void {
    this.setBox(position, size);
    this.queryBox.copy(this.box);
    // Player::updateWorkingCollisionSet includes acceleration headroom:
    // (|velocity| * TickSec + 10 * TickSec) * 1.1 + 0.1 on every axis.
    this.queryBox.expandByScalar((travel.length() + 10 / 32) * 1.1 + 0.1);
    this.queryBox.max.z += maxStep;
    const min = this.queryBox.min,
      max = this.queryBox.max;
    this.triangles.length = 0;
    terrainTrianglesInBox(min.x, min.y, max.x, max.y, this.triangles);
    this.terrainEnd = this.triangles.length;
    // The registry and triangle emitters use Three axes; all prediction math
    // uses Torque axes. Convert the working set once, outside the retry loop.
    this.box.min.set(min.y, min.z, min.x);
    this.box.max.set(max.y, max.z, max.x);
    playerTrianglesInBox(this.box, this.triangles, this.collideWithField);
    for (let i = 0; i < this.triangles.length; i += 3) {
      const x = this.triangles[i],
        y = this.triangles[i + 1];
      this.triangles[i] = this.triangles[i + 2];
      this.triangles[i + 1] = x;
      this.triangles[i + 2] = y;
    }
  }

  private setBox(position: Vector3, size: Vector3): void {
    this.box.min.set(
      position.x - size.x / 2,
      position.y - size.y / 2,
      position.z,
    );
    this.box.max.set(
      position.x + size.x / 2,
      position.y + size.y / 2,
      position.z + size.z,
    );
  }

  private readTriangle(i: number): void {
    const { a, b, c } = this.triangle;
    a.fromArray(this.triangles, i);
    b.fromArray(this.triangles, i + 3);
    c.fromArray(this.triangles, i + 6);
    this.triangle.getNormal(this.normal);
    // The shared terrain collector serves double-sided shadow receivers.
    // Its winding is downward; a heightfield's collision face points up.
    if (i < this.terrainEnd && this.normal.z < 0) this.normal.negate();
  }

  findContact(position: Vector3, size: Vector3, out: Vector3): boolean {
    this.setBox(position, size);
    this.box.min.z = position.z - 0.03;
    this.box.max.z = position.z + 0.03;
    let best = 0;
    for (let i = 0; i < this.triangles.length; i += 9) {
      this.readTriangle(i);
      if (this.normal.z > best && this.box.intersectsTriangle(this.triangle)) {
        best = this.normal.z;
        out.copy(this.normal);
      }
    }
    return best > 0;
  }

  /** Continuous box/triangle SAT: no tunneling and no point-ray approximation. */
  sweep(position: Vector3, size: Vector3, travel: Vector3): boolean {
    this.setBox(position, size);
    this.box.getCenter(this.center);
    this.extent.copy(size).multiplyScalar(0.5);
    this.hitTime = 1;
    this.hitHeight = -Infinity;
    let bestDot = -Infinity;
    const { a, b, c } = this.triangle;
    for (let i = 0; i < this.triangles.length; i += 9) {
      this.readTriangle(i);
      // buildPolyList emits faces toward free space; only entering faces hit.
      const faceDot = -this.normal.dot(travel);
      if (faceDot <= 1e-10) continue;
      a.sub(this.center);
      b.sub(this.center);
      c.sub(this.center);
      let enter = -Infinity,
        leave = Infinity;
      const axis = (x: number, y: number, z: number): boolean => {
        const p = a.x * x + a.y * y + a.z * z,
          q = b.x * x + b.y * y + b.z * z,
          r = c.x * x + c.y * y + c.z * z;
        const radius =
          Math.abs(x) * this.extent.x +
          Math.abs(y) * this.extent.y +
          Math.abs(z) * this.extent.z;
        const lo = Math.min(p, q, r) - radius,
          hi = Math.max(p, q, r) + radius;
        const speed = x * travel.x + y * travel.y + z * travel.z;
        if (Math.abs(speed) < 1e-12) return lo <= 1e-9 && hi >= -1e-9;
        const t0 = lo / speed,
          t1 = hi / speed;
        enter = Math.max(enter, Math.min(t0, t1));
        leave = Math.min(leave, Math.max(t0, t1));
        return enter <= leave + 1e-9;
      };
      if (
        !axis(1, 0, 0) ||
        !axis(0, 1, 0) ||
        !axis(0, 0, 1) ||
        !axis(this.normal.x, this.normal.y, this.normal.z)
      )
        continue;
      let separated = false;
      for (let j = 0; j < 3; j++) {
        this.edge.subVectors(
          j === 0 ? b : j === 1 ? c : a,
          j === 0 ? a : j === 1 ? b : c,
        );
        const { x, y, z } = this.edge;
        if (!axis(0, z, -y) || !axis(-z, 0, x) || !axis(y, -x, 0)) {
          separated = true;
          break;
        }
      }
      // A box already penetrating a surface must be able to escape it.
      if (
        separated ||
        enter < -1e-7 ||
        enter > this.hitTime + 1e-8 ||
        leave < 0
      )
        continue;
      const t = Math.max(0, enter);
      if (t < this.hitTime - 1e-8) {
        bestDot = -Infinity;
        this.hitHeight = -Infinity;
      }
      this.hitTime = t;
      this.hitHeight = Math.max(
        this.hitHeight,
        a.z + this.center.z,
        b.z + this.center.z,
        c.z + this.center.z,
      );
      if (faceDot > bestDot) {
        bestDot = faceDot;
        this.hitNormal.copy(this.normal);
      }
    }
    return this.hitTime < 1;
  }

  /** Player::step clips polygons against the box at the attempted destination. */
  stepHeight(
    position: Vector3,
    size: Vector3,
    travel: Vector3,
    maxStep: number,
  ): number {
    this.center.copy(position).add(travel);
    this.setBox(this.center, size);
    this.box.max.z += maxStep + 0.01;
    let height = position.z - 0.01;
    for (let i = 0; i < this.triangles.length; i += 9) {
      this.readTriangle(i);
      if (!this.box.intersectsTriangle(this.triangle)) continue;
      this.vertices.length = 0;
      this.vertices.push(
        this.triangle.a.clone(),
        this.triangle.b.clone(),
        this.triangle.c.clone(),
      );
      for (let axis = 0; axis < 3 && this.vertices.length; axis++) {
        for (const sign of [-1, 1]) {
          this.clipped.length = 0;
          const limit =
            sign < 0
              ? this.box.min.getComponent(axis)
              : this.box.max.getComponent(axis);
          let previous = this.vertices[this.vertices.length - 1];
          let pd = sign * (previous.getComponent(axis) - limit);
          for (const vertex of this.vertices) {
            const d = sign * (vertex.getComponent(axis) - limit);
            if (d <= 0 !== pd <= 0)
              this.clipped.push(previous.clone().lerp(vertex, pd / (pd - d)));
            if (d <= 0) this.clipped.push(vertex);
            previous = vertex;
            pd = d;
          }
          this.vertices.length = 0;
          this.vertices.push(...this.clipped);
          if (!this.vertices.length) break;
        }
      }
      for (const v of this.vertices) height = Math.max(height, v.z + 0.01);
    }
    const rise = height - position.z;
    return rise > 0 && rise < maxStep ? rise : 0;
  }
}
