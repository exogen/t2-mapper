import {
  Box3,
  BufferGeometry,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  Plane,
  Texture,
  Triangle,
  Vector3,
} from "three";
import type {
  DIFConvexHull,
  DIFInterior,
  DIFVehicleCollisionData,
} from "./dif";

export type DIFHullType = "standard" | "vehicle";

/** Interior::castRay_r / collisionFanFromSurface, build 25034:
 * FUN_0051b560 / FUN_0051b4c0. All runtime vectors use Three's (y,z,x) order. */
export class DIFCollision {
  readonly interior: DIFInterior;
  readonly planes: Plane[];
  readonly points: Vector3[];
  readonly bounds: Box3;
  private readonly windings = new Map<number, number[]>();
  private readonly hullBoxes: Box3[];
  private readonly visited: Uint32Array;
  private query = 0;
  private geometryCache?: BufferGeometry;
  private readonly stack: number[] = [];
  private readonly vehicleData: DIFVehicleCollisionData | null;
  private vehicleCache?: DIFVehicleCollision;

  constructor(
    interior: DIFInterior,
    vehicleData: DIFVehicleCollisionData | null = null,
  ) {
    this.interior = interior;
    this.vehicleData = vehicleData;
    this.planes = interior.planes.map(({ normalIndex, distance }) => {
      const [x, y, z] = interior.normals[normalIndex];
      return new Plane(new Vector3(y, z, x), distance);
    });
    this.points = interior.points.map(([x, y, z]) => new Vector3(y, z, x));
    const box = (min: number[], max: number[]) =>
      new Box3(
        new Vector3(min[1], min[2], min[0]),
        new Vector3(max[1], max[2], max[0]),
      );
    this.bounds = box(interior.boundingBox.min, interior.boundingBox.max);
    this.hullBoxes = interior.convexHulls.map((hull) =>
      box(hull.min, hull.max),
    );
    this.visited = new Uint32Array(this.hullBoxes.length);
  }

  /** InteriorInstance::buildConvex (FUN_00523b30): an empty vehicle set falls back. */
  get vehicleHulls(): DIFVehicleCollision | null {
    if (!this.vehicleData?.convexHulls.length) return null;
    return (this.vehicleCache ??= new DIFVehicleCollision(this.vehicleData));
  }

  surface(index: number) {
    return index & 0x80000000
      ? this.interior.nullSurfaces[index & 0x7fffffff]
      : this.interior.surfaces[index];
  }

  surfacePlane(index: number, out: Plane): Plane {
    const ref = this.surface(index).planeIndex;
    out.copy(this.planes[ref & 0x7fff]);
    return ref & 0x8000 ? out.negate() : out;
  }

  /** Null polygons are already fans; rendered strips need unfanning and fanMask. */
  winding(index: number): number[] {
    let indices = this.windings.get(index);
    if (indices) return indices;
    const surface = this.surface(index);
    indices = [];
    const count = surface.windingCount;
    const order = [0];
    if (index & 0x80000000) {
      for (let i = 1; i < count; i++) order.push(i);
    } else {
      for (let i = 1; i < count; i += 2) order.push(i);
      for (let i = (count - 1) & ~1; i > 0; i -= 2) order.push(i);
    }
    for (let i = 0; i < count; i++) {
      if (
        index & 0x80000000 ||
        this.interior.surfaces[index].fanMask & (1 << i)
      )
        indices.push(this.interior.windings[surface.windingStart + order[i]]);
    }
    this.windings.set(index, indices);
    return indices;
  }

  containsPoint(point: Vector3, hullType: DIFHullType = "standard"): boolean {
    if (hullType === "vehicle" && this.vehicleHulls)
      return this.vehicleHulls.containsPoint(point);
    if (!this.interior.bspNodes.length) return false;
    let node = 0;
    while (!(node & 0x8000)) {
      const branch = this.interior.bspNodes[node];
      node =
        this.planes[branch.planeIndex & 0x7fff].distanceToPoint(point) >= 0
          ? branch.frontIndex
          : branch.backIndex;
    }
    return (node & 0x4000) !== 0;
  }

  /** Writes a reusable result. A solid start hits at t=0, including zero-length rays. */
  castRay(start: Vector3, end: Vector3, out: DIFRayHit): boolean {
    if (!this.interior.bspNodes.length) return false;
    const stack = this.stack;
    stack.length = 0;
    // node, entering plane, start/end fractions; LIFO visits the near segment first.
    stack.push(0, -1, 0, 1);
    while (stack.length) {
      const t1 = stack.pop()!,
        t0 = stack.pop()!,
        entering = stack.pop()!,
        node = stack.pop()!;
      if (!(node & 0x8000)) {
        const branch = this.interior.bspNodes[node];
        const plane = this.planes[branch.planeIndex & 0x7fff];
        const d0 = plane.distanceToPoint(start),
          d1 = plane.distanceToPoint(end);
        const ds = d0 + (d1 - d0) * t0,
          de = d0 + (d1 - d0) * t1;
        const s = side(ds),
          e = side(de);
        if (!s && !e) {
          // The executable skips leaf children when a segment lies on a plane.
          if (!(branch.frontIndex & 0x8000))
            stack.push(branch.frontIndex, entering, t0, t1);
          if (!(branch.backIndex & 0x8000))
            stack.push(branch.backIndex, entering, t0, t1);
        } else if (s * e >= 0) {
          stack.push(
            (s || e) > 0 ? branch.frontIndex : branch.backIndex,
            entering,
            t0,
            t1,
          );
        } else {
          const t = t0 + (t1 - t0) * (-ds / (de - ds));
          stack.push(
            s > 0 ? branch.backIndex : branch.frontIndex,
            branch.planeIndex,
            t,
            t1,
          );
          stack.push(
            s > 0 ? branch.frontIndex : branch.backIndex,
            entering,
            t0,
            t,
          );
        }
        continue;
      }
      if (!(node & 0x4000)) continue;
      out.t = t0;
      out.point.lerpVectors(start, end, t0);
      out.startedSolid = entering === -1;
      out.surfaceIndex = -1;
      if (entering === -1) {
        out.normal.subVectors(start, end).normalize();
        if (!out.normal.lengthSq()) out.normal.set(0, 1, 0);
      } else {
        const plane = this.planes[entering & 0x7fff];
        out.normal.copy(plane.normal);
        const distance =
          plane.distanceToPoint(start) +
          (plane.distanceToPoint(end) - plane.distanceToPoint(start)) * t1;
        if (entering & 0x8000) {
          out.normal.negate();
          if (side(distance) < 0) out.normal.negate();
        } else if (side(distance) > 0) out.normal.negate();
        const leaf = this.interior.solidLeaves[node & 0x3fff];
        for (let i = 0; i < leaf.surfaceCount; i++) {
          const index = this.interior.solidLeafSurfaces[leaf.surfaceStart + i];
          if (
            index & 0x80000000 ||
            (this.interior.surfaces[index].planeIndex & 0x7fff) !==
              (entering & 0x7fff)
          )
            continue;
          this.surfacePlane(index, _plane);
          const winding = this.winding(index);
          let inside = true;
          for (let j = 0; j < winding.length; j++) {
            const a = this.points[winding[j]],
              b = this.points[winding[(j + 1) % winding.length]];
            _edge.subVectors(b, a);
            _cross.subVectors(out.point, a).cross(_edge);
            if (_plane.normal.dot(_cross) < 0) {
              inside = false;
              break;
            }
          }
          if (inside) {
            out.surfaceIndex = index;
            break;
          }
        }
      }
      return true;
    }
    return false;
  }

  /** Candidate hulls from the authored 16×16 XY bins, then exact AABB overlap. */
  private visitHulls(box: Box3, visit: (index: number) => boolean): boolean {
    this.query = (this.query + 1) >>> 0;
    if (!this.query) {
      this.visited.fill(0);
      this.query = 1;
    }
    const { boundingBox, coordBins, coordBinIndices } = this.interior;
    const dx = (boundingBox.max[0] - boundingBox.min[0]) / 16;
    const dy = (boundingBox.max[1] - boundingBox.min[1]) / 16;
    const candidate = (i: number) => {
      if (this.visited[i] === this.query) return false;
      this.visited[i] = this.query;
      return this.hullBoxes[i].intersectsBox(box) && visit(i);
    };
    if (!coordBinIndices.length || dx <= 0 || dy <= 0) {
      for (let i = 0; i < this.hullBoxes.length; i++)
        if (candidate(i)) return true;
      return false;
    }
    const bin = (value: number, min: number, size: number) =>
      Math.max(0, Math.min(15, Math.floor((value - min) / size)));
    // Include both bins on an exact boundary (zero-radius probes included).
    const x0 = bin(box.min.z - 1e-6, boundingBox.min[0], dx),
      x1 = bin(box.max.z + 1e-6, boundingBox.min[0], dx);
    const y0 = bin(box.min.x - 1e-6, boundingBox.min[1], dy),
      y1 = bin(box.max.x + 1e-6, boundingBox.min[1], dy);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const { start, count } = coordBins[x * 16 + y];
        for (let i = start; i < start + count; i++)
          if (candidate(coordBinIndices[i])) return true;
      }
    return false;
  }

  /** Authored hull polygons, including invisible null faces. Winding is CCW in Three. */
  visitHullTriangles(
    box: Box3,
    visit: (a: Vector3, b: Vector3, c: Vector3) => boolean,
    hullType: DIFHullType = "standard",
  ): boolean {
    if (hullType === "vehicle" && this.vehicleHulls)
      return this.vehicleHulls.visitHullTriangles(box, visit);
    const seen = new Set<number>();
    return this.visitHulls(box, (index) => {
      const hull = this.interior.convexHulls[index];
      for (let j = 0; j < hull.surfaceCount; j++) {
        const surface = this.interior.hullSurfaceIndices[hull.surfaceStart + j];
        if (seen.has(surface)) continue;
        seen.add(surface);
        const winding = this.winding(surface);
        for (let k = 2; k < winding.length; k++)
          if (
            visit(
              this.points[winding[0]],
              this.points[winding[k]],
              this.points[winding[k - 1]],
            )
          )
            return true;
      }
      return false;
    });
  }

  /** Exact world-space sphere/polygon distance, including nonuniform instance scale. */
  intersectsSphere(
    center: Vector3,
    radius: number,
    matrix: Matrix4,
    inverse: Matrix4,
    hullType: DIFHullType = "standard",
  ): boolean {
    if (hullType === "vehicle" && this.vehicleHulls)
      return this.vehicleHulls.intersectsSphere(
        center,
        radius,
        matrix,
        inverse,
      );
    _localCenter.copy(center).applyMatrix4(inverse);
    if (this.containsPoint(_localCenter)) return true;
    _box
      .setFromCenterAndSize(center, _size.setScalar(radius * 2))
      .applyMatrix4(inverse);
    return this.visitHulls(_box, (index) => {
      const hull = this.interior.convexHulls[index];
      return hullIntersectsSphere(
        this,
        hull,
        this.interior.hullSurfaceIndices,
        center,
        radius,
        matrix,
      );
    });
  }

  /** Built only for consumers that require triangles (diagnostics/BVH shadow receivers). */
  get geometry(): BufferGeometry {
    if (!this.geometryCache) {
      const positions: number[] = [];
      this.visitHullTriangles(this.bounds, (a, b, c) => {
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        return false;
      });
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        "position",
        new Float32BufferAttribute(positions, 3),
      );
      geometry.boundingBox = this.bounds.clone();
      this.geometryCache = geometry;
    }
    return this.geometryCache;
  }

  dispose(): void {
    this.geometryCache?.dispose();
  }
}

/** Vehicle hulls have their own planes, points and null polygons, and no BSP or
 * spatial bins. The executable linearly scans their hull AABBs (FUN_0051e4d0). */
export class DIFVehicleCollision {
  readonly data: DIFVehicleCollisionData;
  readonly points: Vector3[];
  readonly planes: Plane[];
  readonly bounds: Box3;
  private readonly boxes: Box3[];
  private readonly polygons: number[][];
  private readonly hulls: DIFConvexHull[];
  private readonly surfaceIndices: number[];

  constructor(data: DIFVehicleCollisionData) {
    this.data = data;
    this.points = data.points.map(([x, y, z]) => new Vector3(y, z, x));
    this.polygons = data.hullPolygons.flat();
    this.surfaceIndices = this.polygons.map((_, i) => i);
    let surfaceStart = 0;
    this.hulls = data.convexHulls.map((hull, i) => {
      const surfaceCount = data.hullPolygons[i].length;
      const result = { ...hull, surfaceStart, surfaceCount };
      surfaceStart += surfaceCount;
      return result;
    });
    // Vehicle getFeatures computes normals from the emitted polygon vertices.
    this.planes = this.polygons.map((polygon) =>
      new Plane().setFromCoplanarPoints(
        this.points[polygon[0]],
        this.points[polygon[2]],
        this.points[polygon[1]],
      ),
    );
    this.boxes = data.convexHulls.map(
      ({ min, max }) =>
        new Box3(
          new Vector3(min[1], min[2], min[0]),
          new Vector3(max[1], max[2], max[0]),
        ),
    );
    this.bounds = new Box3();
    for (const box of this.boxes) this.bounds.union(box);
  }

  surfacePlane(index: number, out: Plane): Plane {
    return out.copy(this.planes[index]);
  }

  winding(index: number): number[] {
    return this.polygons[index];
  }

  private visitHulls(box: Box3, visit: (index: number) => boolean): boolean {
    for (let i = 0; i < this.boxes.length; i++)
      if (this.boxes[i].intersectsBox(box) && visit(i)) return true;
    return false;
  }

  containsPoint(point: Vector3): boolean {
    _box.set(point, point);
    return this.visitHulls(_box, (index) => {
      const hull = this.hulls[index];
      if (!hull.surfaceCount) return false;
      for (let i = 0; i < hull.surfaceCount; i++)
        if (
          this.surfacePlane(
            this.surfaceIndices[hull.surfaceStart + i],
            _plane,
          ).distanceToPoint(point) > 0
        )
          return false;
      return true;
    });
  }

  intersectsSphere(
    center: Vector3,
    radius: number,
    matrix: Matrix4,
    inverse: Matrix4,
  ): boolean {
    _localCenter.copy(center).applyMatrix4(inverse);
    _box
      .setFromCenterAndSize(center, _size.setScalar(radius * 2))
      .applyMatrix4(inverse);
    return this.visitHulls(_box, (index) =>
      hullIntersectsSphere(
        this,
        this.hulls[index],
        this.surfaceIndices,
        center,
        radius,
        matrix,
      ),
    );
  }

  visitHullTriangles(
    box: Box3,
    visit: (a: Vector3, b: Vector3, c: Vector3) => boolean,
  ): boolean {
    return this.visitHulls(box, (index) => {
      const hull = this.hulls[index];
      for (let i = 0; i < hull.surfaceCount; i++) {
        const surface = this.surfaceIndices[hull.surfaceStart + i];
        const winding = this.winding(surface);
        for (let j = 2; j < winding.length; j++)
          if (
            visit(
              this.points[winding[0]],
              this.points[winding[j]],
              this.points[winding[j - 1]],
            )
          )
            return true;
      }
      return false;
    });
  }
}

function hullIntersectsSphere(
  geometry: Pick<DIFCollision, "surfacePlane" | "winding" | "points">,
  hull: DIFConvexHull,
  surfaceIndices: number[],
  center: Vector3,
  radius: number,
  matrix: Matrix4,
): boolean {
  let inside = hull.surfaceCount > 0;
  for (let i = 0; i < hull.surfaceCount; i++) {
    const surface = surfaceIndices[hull.surfaceStart + i];
    if (
      geometry.surfacePlane(surface, _plane).distanceToPoint(_localCenter) > 0
    )
      inside = false;
    const winding = geometry.winding(surface);
    for (let j = 2; j < winding.length; j++) {
      _triangle.a.copy(geometry.points[winding[0]]).applyMatrix4(matrix);
      _triangle.b.copy(geometry.points[winding[j]]).applyMatrix4(matrix);
      _triangle.c.copy(geometry.points[winding[j - 1]]).applyMatrix4(matrix);
      _triangle.closestPointToPoint(center, _closest);
      if (_closest.distanceToSquared(center) <= radius * radius) return true;
    }
  }
  return inside;
}

export interface DIFRayHit {
  t: number;
  point: Vector3;
  normal: Vector3;
  surfaceIndex: number;
  startedSolid: boolean;
}

/** Collision-only instance; never attached to the render graph. */
export class DIFCollisionMesh extends Mesh {
  readonly collision: DIFCollision;
  readonly lightMaps: Texture[];
  constructor(collision: DIFCollision, lightMaps: Texture[]) {
    super(collision.geometry);
    this.collision = collision;
    this.lightMaps = lightMaps;
    this.name = "DIF collision";
  }
}

function side(distance: number): number {
  return distance >= 0.005 ? 1 : distance <= -0.005 ? -1 : 0;
}
const _plane = new Plane(),
  _edge = new Vector3(),
  _cross = new Vector3();
const _localCenter = new Vector3(),
  _size = new Vector3(),
  _closest = new Vector3();
const _box = new Box3(),
  _triangle = new Triangle();
