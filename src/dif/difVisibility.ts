import type { Matrix4 } from "three";
import type { DIFInterior } from "./dif";

/** [left, bottom, right, top], with Y increasing upwards. */
export type DIFVisibilityRect = [number, number, number, number];
type Point = [number, number, number];
type Plane = [number, number, number, number];

// PlaneF::whichSide, verified from retail constants 0077f388/0077f38c.
const PLANE_EPSILON = Math.fround(0.005);

function side(distance: number): number {
  return distance >= PLANE_EPSILON ? 1 : distance <= -PLANE_EPSILON ? -1 : 0;
}

function distance(plane: Plane, point: readonly number[]): number {
  return (
    plane[0] * point[0] + plane[1] * point[1] + plane[2] * point[2] + plane[3]
  );
}

function intersection(a: Point, b: Point, plane: Plane): Point {
  const da = distance(plane, a);
  const t = da / (da - distance(plane, b));
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/** Retail itrClipToPlane, 00510140. On-plane points survive only if
 * another vertex is strictly in front. Intersections lie on the plane,
 * rather than on the edge of the +/-0.005 classification tolerance. */
function clipToPlane(points: Point[], plane: Plane): Point[] {
  const base = points.findIndex((point) => side(distance(plane, point)) === 1);
  if (base < 0) return [];
  const result: Point[] = [];
  let start = base;
  let end = (start + 1) % points.length;
  while (end !== base) {
    const from = side(distance(plane, points[start]));
    const to = side(distance(plane, points[end]));
    if (from >= 0 && to >= 0) {
      result.push(points[start]);
      start = end;
      end = (end + 1) % points.length;
    } else if (from >= 0 && to < 0) {
      result.push(points[start]);
      if (from > 0)
        result.push(intersection(points[start], points[end], plane));
      do {
        end = (end + 1) % points.length;
      } while (side(distance(plane, points[end])) < 0);
      start = (end + points.length - 1) % points.length;
      points[start] = intersection(points[start], points[end], plane);
    } else {
      // The preceding seek always resumes at an on/front intersection.
      return [];
    }
  }
  result.push(points[start]);
  return result;
}

/** Five object-space planes: far, left, right, bottom, top. Retail
 * 00511090/00572c40 deliberately do not clip portal fans to the near plane. */
function clipPlanes(matrix: Matrix4, camera: readonly number[]): Plane[] {
  const e = matrix.elements;
  const result = [
    [2, -1],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
  ].map(([row, sign]) => {
    const plane: Plane = [
      e[3] + sign * e[row],
      e[7] + sign * e[row + 4],
      e[11] + sign * e[row + 8],
      e[15] + sign * e[row + 12],
    ];
    const length = Math.hypot(plane[0], plane[1], plane[2]);
    return plane.map((value) => value / length) as Plane;
  });
  // 00572c40 constructs the far plane from localCam-localFarCenter,
  // rather than transforming its normal. This distinction is visible
  // under a nonuniform instance scale. The app's full camera frustum is
  // symmetric, so clip-space (0,0,1) is that far-center point.
  const inverse = matrix.clone().invert().elements;
  const w = inverse[11] + inverse[15];
  const far: Point = [
    (inverse[8] + inverse[12]) / w,
    (inverse[9] + inverse[13]) / w,
    (inverse[10] + inverse[14]) / w,
  ];
  const normal: Point = [
    camera[0] - far[0],
    camera[1] - far[1],
    camera[2] - far[2],
  ];
  const length = Math.hypot(...normal);
  if (Number.isFinite(length) && length > 0) {
    for (let i = 0; i < 3; i++) normal[i] /= length;
    result[0] = [
      ...normal,
      -(normal[0] * far[0] + normal[1] * far[1] + normal[2] * far[2]),
    ];
  }
  return result;
}

function fanRect(
  interior: DIFInterior,
  fanIndex: number,
  matrix: Matrix4,
  planes: Plane[],
): DIFVisibilityRect | null {
  const fan = interior.windingIndices[fanIndex];
  if (!fan || fan.windingCount < 3) return null;
  let points: Point[] = [];
  for (let i = 0; i < fan.windingCount; i++) {
    const point = interior.points[interior.windings[fan.windingStart + i]];
    if (!point) return null;
    points.push([...point]);
  }
  for (const plane of planes) {
    points = clipToPlane(points, plane);
    if (!points.length) return null;
  }
  const e = matrix.elements;
  const rect: DIFVisibilityRect = [1, 1, -1, -1];
  for (const [x, y, z] of points) {
    const w = e[3] * x + e[7] * y + e[11] * z + e[15];
    if (!(w > 0)) continue;
    const px = (e[0] * x + e[4] * y + e[8] * z + e[12]) / w;
    const py = (e[1] * x + e[5] * y + e[9] * z + e[13]) / w;
    rect[0] = Math.min(rect[0], px);
    rect[1] = Math.min(rect[1], py);
    rect[2] = Math.max(rect[2], px);
    rect[3] = Math.max(rect[3], py);
  }
  for (let i = 0; i < 4; i++) rect[i] = Math.max(-1, Math.min(1, rect[i]));
  return rect[0] < rect[2] && rect[1] < rect[3] ? rect : null;
}

function intersect(
  a: DIFVisibilityRect,
  b: DIFVisibilityRect,
): DIFVisibilityRect | null {
  const rect: DIFVisibilityRect = [
    Math.max(a[0], b[0]),
    Math.max(a[1], b[1]),
    Math.min(a[2], b[2]),
    Math.min(a[3], b[3]),
  ];
  return rect[0] < rect[2] && rect[1] < rect[3] ? rect : null;
}

/** Remove already traversed coverage without filling gaps between portals. */
function subtract(
  rect: DIFVisibilityRect,
  covered: DIFVisibilityRect,
): DIFVisibilityRect[] {
  const overlap = intersect(rect, covered);
  if (!overlap) return [rect];
  const [l, b, r, t] = rect;
  const [il, ib, ir, it] = overlap;
  const result: DIFVisibilityRect[] = [];
  if (l < il) result.push([l, b, il, t]);
  if (ir < r) result.push([ir, b, r, t]);
  if (b < ib) result.push([il, b, ir, ib]);
  if (it < t) result.push([il, it, ir, t]);
  return result;
}

/**
 * Visible exterior/root-zone bounds for one DIF instance. Coordinates in
 * localCameraTorque and in the DIF are Torque axes. localTorqueToClip must
 * include Torque->Three swizzle, instance world transform, camera view and
 * projection, in that order. The returned rectangle is full-camera NDC.
 *
 * Retail 00510bc0/00511090 propagate each portal fan's projected rectangle
 * intersected with the incoming path, then union the results per zone.
 * Solid (-1) and exterior (0) cameras receive the whole viewport.
 *
 * Instead of recursively enumerating simple paths, keep exact disjoint
 * coverage per zone. Every rectangle edge comes from a projected portal;
 * only previously unseen coverage propagates. This is bounded by that
 * finite rectangle grid and cannot grow exponentially on authored cycles.
 * Unioning a zone's bounds before propagation would incorrectly expose
 * gaps between separate windows, so only the final exterior result unions.
 */
export function outsideZoneRect(
  interior: DIFInterior,
  localCameraTorque: readonly number[],
  localTorqueToClip: Matrix4,
  startZone: number,
): DIFVisibilityRect | null {
  const full: DIFVisibilityRect = [-1, -1, 1, 1];
  if (startZone <= 0 || !interior.zones[startZone]) return full;
  const planes = clipPlanes(localTorqueToClip, localCameraTorque);
  const projected = new Map<number, DIFVisibilityRect[]>();
  const covered: DIFVisibilityRect[][] = Array.from(
    { length: interior.zones.length },
    () => [],
  );
  const work: { zone: number; rect: DIFVisibilityRect }[] = [];
  let outside: DIFVisibilityRect | null = null;
  const enqueue = (zone: number, rect: DIFVisibilityRect) => {
    let fresh = [rect];
    for (const previous of covered[zone]) {
      fresh = fresh.flatMap((piece) => subtract(piece, previous));
      if (!fresh.length) return;
    }
    covered[zone].push(...fresh);
    for (const piece of fresh) work.push({ zone, rect: piece });
  };
  enqueue(startZone, full);
  for (let at = 0; at < work.length; at++) {
    const { zone, rect } = work[at];
    if (zone === 0) {
      if (!outside) outside = [...rect];
      else {
        outside[0] = Math.min(outside[0], rect[0]);
        outside[1] = Math.min(outside[1], rect[1]);
        outside[2] = Math.max(outside[2], rect[2]);
        outside[3] = Math.max(outside[3], rect[3]);
      }
      // Further traversal through outside can only return subsets of it.
      continue;
    }
    const current = interior.zones[zone];
    for (let i = 0; i < current.portalCount; i++) {
      const portalIndex = interior.zonePortals[current.portalStart + i];
      const portal = interior.portals[portalIndex];
      if (!portal || (portal.zoneFront !== zone && portal.zoneBack !== zone))
        continue;
      const other =
        portal.zoneFront === zone ? portal.zoneBack : portal.zoneFront;
      if (other === zone || !interior.zones[other]) continue;
      const plane = interior.planes[portal.planeIndex & 0x7fff];
      const normal = plane && interior.normals[plane.normalIndex];
      if (!normal) continue;
      const camSide = side(
        (normal[0] * localCameraTorque[0] +
          normal[1] * localCameraTorque[1] +
          normal[2] * localCameraTorque[2] +
          plane.distance) *
          (portal.planeIndex & 0x8000 ? -1 : 1),
      );
      if (camSide === 0) {
        // 00510bc0: prevent w=0 projection singularities while crossing.
        enqueue(other, rect);
      } else if (camSide === (portal.zoneFront === zone ? 1 : -1)) {
        let portals = projected.get(portalIndex);
        if (!portals) {
          portals = [];
          for (let fan = 0; fan < portal.triFanCount; fan++) {
            const possible = fanRect(
              interior,
              portal.triFanStart + fan,
              localTorqueToClip,
              planes,
            );
            if (possible) portals.push(possible);
          }
          projected.set(portalIndex, portals);
        }
        for (const possible of portals) {
          const next = intersect(rect, possible);
          if (next) enqueue(other, next);
        }
      }
    }
  }
  return outside;
}

/** Native fixupViewport (0050e230): floor/ceil to physical pixels, expand
 * a <=1-pixel span, then clamp to this viewport. Output remains bottom-up,
 * relative to its origin; callers add the renderer's viewport x/y offsets. */
export function roundZoneViewport(
  rect: DIFVisibilityRect,
  width: number,
  height: number,
): DIFVisibilityRect {
  const span = (a: number, b: number, size: number): [number, number] => {
    let low = Math.max(0, Math.floor((a + 1) * 0.5 * size));
    let high = Math.min(size, Math.ceil((b + 1) * 0.5 * size));
    if (high - low <= 1) {
      if (low === 0) high += 2;
      else if (high === size) low -= 2;
      else {
        low--;
        high++;
      }
    }
    return [Math.max(0, low), Math.min(size, high)];
  };
  const [left, right] = span(rect[0], rect[2], Math.max(0, width));
  const [bottom, top] = span(rect[1], rect[3], Math.max(0, height));
  return [left, bottom, right, top];
}
