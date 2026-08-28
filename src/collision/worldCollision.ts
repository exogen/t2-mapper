/**
 * Static-world collision registry in Torque space, bridging React-owned
 * scene geometry (interiors, force fields) and the non-React stream
 * engine — the same pattern as terrainHeight.ts.
 *
 * Mirrors Torque's Projectile::csmStaticCollisionMask sources: terrain,
 * interiors, and force fields. Dynamic objects (players, vehicles) are
 * intentionally absent — the real client never predicts those hits; the
 * server corrects them explicitly (ExplosionMask), which our ghost data
 * already carries as explodePosition.
 */
import { Box3, DoubleSide, Matrix4, Matrix3, Ray, Vector3 } from "three";
import type { BufferGeometry, Mesh } from "three";
import { MeshBVH } from "three-mesh-bvh";
import { castTerrainRay, type Vec3 } from "./terrainCollision";

export type { Vec3 };

export interface WorldRayHit {
  /** Parametric position along the segment, 0..1. */
  t: number;
  /** Hit point in Torque space. */
  point: Vec3;
  /** Unit surface normal in Torque space, oriented against the ray. */
  normal: Vec3;
  source: "terrain" | "interior" | "forcefield" | "static";
}

/** Torque (x, y, z) → Three.js (y, z, x), matching torqueToThree. */
function torqueToThreeVec(v: Vec3, out: Vector3): Vector3 {
  return out.set(v[1], v[2], v[0]);
}

/** Three.js (x, y, z) → Torque (z, x, y). */
function threeToTorqueVec(v: Vector3): Vec3 {
  return [v.z, v.x, v.y];
}

interface MeshCollider {
  bvh: MeshBVH;
  matrixWorld: Matrix4;
  inverse: Matrix4;
  normalMatrix: Matrix3;
  /** Three-world-space bounds for broadphase rejection. */
  worldBox: Box3;
}

interface InteriorEntry {
  colliders: MeshCollider[];
}

interface ForceFieldEntry {
  matrixWorld: Matrix4;
  inverse: Matrix4;
  normalMatrix: Matrix3;
  /** Local-space box. */
  box: Box3;
  worldBox: Box3;
  enabled: boolean;
}

const interiors = new Map<string, InteriorEntry>();
/** Static DTS shapes (TSStatic / StaticShape) — camera occluders only:
 *  castWorldRay skips them unless asked, so projectile physics keeps
 *  colliding with exactly what it always did. */
const staticShapes = new Map<string, InteriorEntry>();
const forceFields = new Map<string, ForceFieldEntry>();

/** BVHs are per-geometry and shared across instanced interiors. */
const bvhCache = new WeakMap<BufferGeometry, MeshBVH>();

function getBvh(geometry: BufferGeometry): MeshBVH {
  let bvh = bvhCache.get(geometry);
  if (!bvh) {
    // indirect: true leaves the (render-shared) index buffer untouched,
    // which also preserves multi-material group ranges. The option is
    // supported at runtime but missing from the published .d.ts.
    bvh = new MeshBVH(geometry, {
      indirect: true,
    } as ConstructorParameters<typeof MeshBVH>[1] & { indirect: boolean });
    bvhCache.set(geometry, bvh);
  }
  return bvh;
}

/**
 * Register an interior's meshes for collision. Interiors are static;
 * matrixWorld is snapshotted at registration (caller must ensure world
 * matrices are up to date).
 */
export function registerInteriorCollider(id: string, meshes: Mesh[]): void {
  const colliders = buildMeshColliders(meshes);
  if (colliders.length > 0) {
    interiors.set(id, { colliders });
  }
}

function buildMeshColliders(meshes: Mesh[]): MeshCollider[] {
  const colliders: MeshCollider[] = [];
  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    if (!geometry?.attributes.position) continue;
    const bvh = getBvh(geometry);
    const matrixWorld = mesh.matrixWorld.clone();
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const worldBox = geometry.boundingBox!.clone().applyMatrix4(matrixWorld);
    colliders.push({
      bvh,
      matrixWorld,
      inverse: matrixWorld.clone().invert(),
      normalMatrix: new Matrix3().getNormalMatrix(matrixWorld),
      worldBox,
    });
  }
  return colliders;
}

export function unregisterInteriorCollider(id: string): void {
  interiors.delete(id);
}

/**
 * Register a static shape's meshes (a generator, a bunker prop) as
 * CAMERA occluders. Same snapshot semantics as interiors; only rays
 * cast with `includeStatics` see them.
 */
export function registerStaticShapeCollider(id: string, meshes: Mesh[]): void {
  const colliders = buildMeshColliders(meshes);
  if (colliders.length > 0) {
    staticShapes.set(id, { colliders });
  }
}

export function unregisterStaticShapeCollider(id: string): void {
  staticShapes.delete(id);
}

/**
 * Register a force field's oriented box (its object matrix + local box).
 * Fields only collide while closed; toggle with setForceFieldEnabled.
 */
export function registerForceFieldCollider(
  id: string,
  matrixWorld: Matrix4,
  localBox: Box3,
  enabled: boolean,
): void {
  forceFields.set(id, {
    matrixWorld: matrixWorld.clone(),
    inverse: matrixWorld.clone().invert(),
    normalMatrix: new Matrix3().getNormalMatrix(matrixWorld),
    box: localBox.clone(),
    worldBox: localBox.clone().applyMatrix4(matrixWorld),
    enabled,
  });
}

export function setForceFieldEnabled(id: string, enabled: boolean): void {
  const entry = forceFields.get(id);
  if (entry) entry.enabled = enabled;
}

export function unregisterForceFieldCollider(id: string): void {
  forceFields.delete(id);
}

/**
 * Registered collider counts, for diagnostics — a world with zero
 * interiors silently turns every occlusion test into a terrain-only one.
 */
export function getWorldColliderCounts(): {
  interiors: number;
  meshes: number;
  forceFields: number;
  staticShapes: number;
} {
  let meshes = 0;
  for (const entry of interiors.values()) meshes += entry.colliders.length;
  return {
    interiors: interiors.size,
    meshes,
    forceFields: forceFields.size,
    staticShapes: staticShapes.size,
  };
}

/** Diagnostic: world-space box centers of registered static shapes. */
export function getStaticColliderBoxes(): {
  center: [number, number, number];
  size: [number, number, number];
}[] {
  const out: {
    center: [number, number, number];
    size: [number, number, number];
  }[] = [];
  const c = new Vector3();
  const sz = new Vector3();
  for (const entry of staticShapes.values()) {
    for (const collider of entry.colliders) {
      collider.worldBox.getCenter(c);
      collider.worldBox.getSize(sz);
      out.push({ center: [c.z, c.x, c.y], size: [sz.z, sz.x, sz.y] });
    }
  }
  return out;
}

/** Test-only: clear all registered colliders. */
export function clearWorldColliders(): void {
  interiors.clear();
  staticShapes.clear();
  forceFields.clear();
}

const _start = new Vector3();
const _end = new Vector3();
const _dir = new Vector3();
const _ray = new Ray();
const _localRay = new Ray();
const _point = new Vector3();
const _normal = new Vector3();
const _segBox = new Box3();

/**
 * Cast a segment (Torque space) against all registered static world
 * geometry plus the terrain. Returns the nearest hit or null.
 */
export function castWorldRay(
  start: Vec3,
  end: Vec3,
  options?: { includeStatics?: boolean },
): WorldRayHit | null {
  const terrainHit = castTerrainRay(start, end);
  let best: WorldRayHit | null = terrainHit
    ? { ...terrainHit, source: "terrain" }
    : null;

  torqueToThreeVec(start, _start);
  torqueToThreeVec(end, _end);
  _dir.subVectors(_end, _start);
  const segLength = _dir.length();
  if (segLength < 1e-9) return best;
  _dir.divideScalar(segLength);
  _ray.origin.copy(_start);
  _ray.direction.copy(_dir);
  _segBox.makeEmpty();
  _segBox.expandByPoint(_start);
  _segBox.expandByPoint(_end);

  const meshGroups: [Map<string, InteriorEntry>, WorldRayHit["source"]][] =
    options?.includeStatics
      ? [
          [interiors, "interior"],
          [staticShapes, "static"],
        ]
      : [[interiors, "interior"]];
  for (const [group, source] of meshGroups) {
    for (const entry of group.values()) {
      for (const collider of entry.colliders) {
        if (!collider.worldBox.intersectsBox(_segBox)) continue;
        _localRay.copy(_ray).applyMatrix4(collider.inverse);
        // The local ray direction is unnormalized under scale;
        // raycastFirst distances are in local units, so renormalize and
        // track the scale.
        const localScale = _localRay.direction.length();
        _localRay.direction.divideScalar(localScale);
        const isect = collider.bvh.raycastFirst(_localRay, DoubleSide);
        if (!isect) continue;
        const worldDist = isect.distance / localScale;
        const t = worldDist / segLength;
        if (t > 1 || (best && t >= best.t)) continue;
        _point.copy(isect.point).applyMatrix4(collider.matrixWorld);
        _normal.copy(isect.face!.normal).applyMatrix3(collider.normalMatrix);
        if (_normal.dot(_dir) > 0) _normal.negate();
        _normal.normalize();
        best = {
          t,
          point: threeToTorqueVec(_point),
          normal: threeToTorqueVec(_normal),
          source,
        };
      }
    }
  }

  for (const entry of forceFields.values()) {
    if (!entry.enabled) continue;
    if (!entry.worldBox.intersectsBox(_segBox)) continue;
    _localRay.copy(_ray).applyMatrix4(entry.inverse);
    const localScale = _localRay.direction.length();
    _localRay.direction.divideScalar(localScale);
    const hitPoint = _localRay.intersectBox(entry.box, _point);
    if (!hitPoint) continue;
    const worldDist = _point.distanceTo(_localRay.origin) / localScale;
    const t = worldDist / segLength;
    if (t > 1 || (best && t >= best.t)) continue;
    // Derive the box face normal from the local hit point.
    boxFaceNormal(entry.box, _point, _normal);
    _point.applyMatrix4(entry.matrixWorld);
    _normal.applyMatrix3(entry.normalMatrix);
    if (_normal.dot(_dir) > 0) _normal.negate();
    _normal.normalize();
    best = {
      t,
      point: threeToTorqueVec(_point),
      normal: threeToTorqueVec(_normal),
      source: "forcefield",
    };
  }

  return best;
}

/** Face normal of an axis-aligned box at a surface point (local space). */
function boxFaceNormal(box: Box3, p: Vector3, out: Vector3): void {
  let bestDist = Math.abs(p.x - box.min.x);
  out.set(-1, 0, 0);
  let dist = Math.abs(p.x - box.max.x);
  if (dist < bestDist) {
    bestDist = dist;
    out.set(1, 0, 0);
  }
  dist = Math.abs(p.y - box.min.y);
  if (dist < bestDist) {
    bestDist = dist;
    out.set(0, -1, 0);
  }
  dist = Math.abs(p.y - box.max.y);
  if (dist < bestDist) {
    bestDist = dist;
    out.set(0, 1, 0);
  }
  dist = Math.abs(p.z - box.min.z);
  if (dist < bestDist) {
    bestDist = dist;
    out.set(0, 0, -1);
  }
  dist = Math.abs(p.z - box.max.z);
  if (dist < bestDist) {
    out.set(0, 0, 1);
  }
}
