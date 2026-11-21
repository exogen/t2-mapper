import { Box3, Matrix4, Plane, Triangle, Vector3 } from "three";
import { loadTorqueMatrix } from "../scene/coordinates";
import type { MatrixF, Vec3 } from "../scene/types";
import { setPlayerBox } from "./playerCollision";

export interface PhysicalZone {
  transform: MatrixF;
  scale: Vec3;
  points: readonly Vec3[];
  velocityMod: number;
  active: boolean;
}

// Retail ExtrudedPolyList (0x74f05c–0x74f078).
const FACE_EPSILON = 0.01;
const TIME_EPSILON = 0.0001;
const MAX_COLLISIONS = 64;
const X_MIN = 1;
const X_MAX = 2;
const Y_MIN = 3;
const Y_MAX = 4;
const Z_MIN = 5;
const Z_MAX = 6;
// Polyhedron::buildBox face and edge order. Negative entries use the
// inverted half of ExtrudedPolyList's paired edge-plane mask.
const PLAYER_FACES = [
  [0, -1, [Z_MIN, -Z_MAX, -Y_MIN, Y_MAX]],
  [1, 1, [Z_MIN, -Z_MAX, -X_MIN, X_MAX]],
  [0, 1, [Z_MIN, -Z_MAX, -Y_MAX, Y_MIN]],
  [1, -1, [X_MIN, Z_MIN, -Z_MAX, -X_MAX]],
  [2, -1, [-X_MIN, -Y_MAX, -X_MAX, -Y_MIN]],
  [2, 1, [X_MIN, Y_MAX, X_MAX, Y_MIN]],
] as const;
const BOX_FACES = [
  [0, 1, 5, 4],
  [0, 4, 6, 2],
  [3, 2, 6, 7],
  [3, 7, 5, 1],
  [0, 2, 3, 1],
  [4, 5, 7, 6],
];

interface ZoneBox {
  bounds: Box3;
  faces: { vertices: Vector3[]; normal: Vector3 }[];
}

function buildZoneBox({ transform, scale, points }: PhysicalZone): ZoneBox {
  // PhysicalZone::buildConvex uses the local box around the polyhedron.
  const local = new Box3();
  if (points.length) {
    for (const point of points) local.expandByPoint(point);
  } else {
    local.min.setScalar(-0.5);
    local.max.setScalar(0.5);
  }
  const matrix = loadTorqueMatrix(transform, new Matrix4());
  const corners = Array.from({ length: 8 }, (_, corner) =>
    new Vector3(
      (corner & 1 ? local.max : local.min).x * scale.x,
      (corner & 2 ? local.max : local.min).y * scale.y,
      (corner & 4 ? local.max : local.min).z * scale.z,
    ).applyMatrix4(matrix),
  );
  return {
    bounds: new Box3().setFromPoints(corners),
    faces: BOX_FACES.map((indices) => {
      const vertices = indices.map((index) => corners[index]);
      const [a, b, c] = vertices;
      return { vertices, normal: Triangle.getNormal(a, b, c, new Vector3()) };
    }),
  };
}

interface ClipVertex {
  point: Vector3;
  mask: number;
}

/** A leading face of the player's upright box, extruded along this move. */
class SweptFace {
  distance = 0;
  readonly axis: number;
  readonly direction: number;
  private readonly edges: readonly number[];
  private readonly planes = Array.from({ length: 5 }, () => new Plane());
  private readonly buffers: [ClipVertex[], ClipVertex[]] = [[], []];
  private readonly vertices: ClipVertex[] = [];
  private count = 0;

  constructor(axis: number, direction: number, edges: readonly number[]) {
    this.axis = axis;
    this.direction = direction;
    this.edges = edges;
  }

  prepare(box: Box3, travel: Vector3): void {
    const along = travel.getComponent(this.axis);
    this.distance = along * this.direction;
    if (this.distance <= TIME_EPSILON) return;
    const leading = (along > 0 ? box.max : box.min).getComponent(this.axis);
    const front = this.planes[0];
    front.normal.set(0, 0, 0).setComponent(this.axis, -this.direction);
    front.constant = leading * this.direction;
    for (let i = 0; i < this.edges.length; i++) {
      const side = Math.abs(this.edges[i]) - 1;
      const axis = Math.floor(side / 2);
      const sign = side % 2 === 0 ? -1 : 1;
      const limit = (sign > 0 ? box.max : box.min).getComponent(axis);
      const slope = travel.getComponent(axis) / along;
      const plane = this.planes[i + 1];
      plane.normal
        .set(0, 0, 0)
        .setComponent(axis, sign)
        .setComponent(this.axis, -sign * slope);
      plane.constant = sign * (slope * leading - limit);
      plane.normalize();
    }
  }

  private addVertex(point: Vector3, startPlane: number): ClipVertex {
    const index = this.count++;
    const vertex = (this.vertices[index] ??= { point: new Vector3(), mask: 0 });
    vertex.point.copy(point);
    vertex.mask = 0;
    for (let i = startPlane; i < this.planes.length; i++) {
      const distance = this.planes[i].distanceToPoint(point);
      const outside = startPlane
        ? distance > 0
        : this.edges[i - 1] < 0
          ? distance > -FACE_EPSILON
          : distance >= FACE_EPSILON;
      if (outside) {
        vertex.mask |= 1 << i;
        if (startPlane) break;
      }
    }
    return vertex;
  }

  timeTo(quad: readonly Vector3[]): number {
    const [first, second] = this.buffers;
    this.count = first.length = 0;
    let front = 0;
    let back = 0;
    for (const point of quad) {
      const vertex = this.addVertex(point, 0);
      front |= vertex.mask;
      back |= ~vertex.mask;
      first.push(vertex);
    }
    if (front & ~back) return Infinity;

    let input = first;
    let output = second;
    for (let i = 0; i < this.planes.length; i++) {
      const bit = 1 << i;
      if (!(front & bit)) continue;
      const plane = this.planes[i];
      output.length = 0;
      let previous = input[input.length - 1];
      for (const vertex of input) {
        if ((previous.mask ^ vertex.mask) & bit) {
          const from = plane.distanceToPoint(previous.point);
          const to = plane.distanceToPoint(vertex.point);
          this.intersection
            .copy(previous.point)
            .lerp(vertex.point, from / (from - to));
          output.push(this.addVertex(this.intersection, i + 1));
        }
        if (!(vertex.mask & bit)) output.push(vertex);
        previous = vertex;
      }
      if (output.length < 3) return Infinity;
      [input, output] = [output, input];
    }

    let distance = Infinity;
    for (const { point } of input)
      distance = Math.min(distance, -this.planes[0].distanceToPoint(point));
    // Retail lets a quad up to 1 cm past the end count, and clamps a
    // shallow initial penetration to time zero.
    return distance < this.distance + FACE_EPSILON
      ? Math.max(0, distance) / this.distance
      : Infinity;
  }

  private readonly intersection = new Vector3();
}

/** The PhysicalZone collision list used by Player::updatePos (0x5d7220). */
export class PhysicalZoneSweep {
  private readonly geometry = new WeakMap<PhysicalZone, ZoneBox>();
  private readonly start = new Box3();
  private readonly end = new Box3();
  private readonly swept = new Box3();
  private readonly leadingFaces = PLAYER_FACES.map(
    ([axis, direction, edges]) => new SweptFace(axis, direction, edges),
  );
  private readonly triangle = new Triangle();

  getVelocityScale(
    zones: Iterable<PhysicalZone>,
    position: Vector3,
    size: Vector3,
    travel: Vector3,
    touchesSolidAtDestination: () => boolean,
  ): number {
    setPlayerBox(this.start, position, size);
    this.end.copy(this.start).translate(travel);
    this.swept.copy(this.start).union(this.end).expandByScalar(0.1);

    // On a short move, retail skips the full sweep if the destination
    // touches neither solid geometry nor the surface of a zone.
    let needsDestination =
      Math.abs(travel.x) < size.x &&
      Math.abs(travel.y) < size.y &&
      Math.abs(travel.z) < size.z;
    let prepared = false;
    let earliest = 2;
    let scale = 1;
    let count = 0;
    for (const zone of zones) {
      let box = this.geometry.get(zone);
      if (!box) {
        box = buildZoneBox(zone);
        this.geometry.set(zone, box);
      }
      if (!this.swept.intersectsBox(box.bounds)) continue;
      if (!prepared) {
        for (const face of this.leadingFaces) face.prepare(this.start, travel);
        prepared = true;
      }

      const checkDestination =
        needsDestination && this.end.intersectsBox(box.bounds);
      for (const { vertices, normal } of box.faces) {
        if (checkDestination && needsDestination) {
          const [a, b, c, d] = vertices;
          if (
            this.end.intersectsTriangle(this.triangle.set(a, b, c)) ||
            this.end.intersectsTriangle(this.triangle.set(a, c, d))
          )
            needsDestination = false;
        }
        if (count === MAX_COLLISIONS || normal.dot(travel) > 0) continue;
        let opposing = -Infinity;
        let time = Infinity;
        for (const face of this.leadingFaces) {
          if (face.distance <= TIME_EPSILON) continue;
          const dot = -normal.getComponent(face.axis) * face.direction;
          if (dot <= opposing) continue;
          const hit = face.timeTo(vertices);
          if (hit === Infinity) continue;
          opposing = dot;
          time = hit;
        }
        if (time > earliest + TIME_EPSILON) continue;
        if (time < earliest - TIME_EPSILON) {
          earliest = time;
          count = 0;
          scale = 1;
        }
        count++;
        if (zone.active) scale *= zone.velocityMod;
      }
    }
    if (scale !== 1 && needsDestination && !touchesSolidAtDestination())
      return 1;
    return scale;
  }
}
