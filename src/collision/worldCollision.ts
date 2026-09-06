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
import {
  Box3,
  DoubleSide,
  Matrix4,
  Matrix3,
  Ray,
  Sphere,
  Vector3,
} from "three";
import type { BufferGeometry, Mesh } from "three";
import { MeshBVH } from "three-mesh-bvh";
import { castTerrainRay, terrainHeightAt, type Vec3 } from "./terrainCollision";
import {
  collisionState,
  type ForceFieldEntry,
  type InteriorEntry,
  type MeshCollider,
} from "./collisionContext";

export type { Vec3 };
export type { MeshCollider, InteriorEntry, ForceFieldEntry };

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

// The registry's state lives in collisionContext so more than one world
// can exist in a process (see that module for why). These accessors
// keep the call sites below reading naturally.
const interiors = () => collisionState().interiors;
const staticShapes = () => collisionState().staticShapes;
const forceFields = () => collisionState().forceFields;

function getBvh(geometry: BufferGeometry): MeshBVH {
  const bvhCache = collisionState().bvhCache;
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
    interiors().set(id, { colliders });
    interiorVersion++;
  }
}

let interiorVersion = 0;

/**
 * Bumped whenever an interior registers or unregisters, so a cached
 * query against the interiors (a shape's lighting probe) knows to re-run
 * even when one interior replaced another between two frames.
 */
export function interiorColliderVersion(): number {
  return interiorVersion;
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
    _scale.setFromMatrixScale(matrixWorld);
    const minScale = Math.min(_scale.x, _scale.y, _scale.z) || 1;
    colliders.push({
      mesh,
      worldToLocalRadius: 1 / minScale,
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
  if (interiors().delete(id)) interiorVersion++;
}

/** How many interiors are currently registered for collision — lets
 *  plan-time geometry work wait for the world to finish loading. */
export function interiorColliderCount(): number {
  return interiors().size;
}

/**
 * Register a static shape's meshes (a generator, a bunker prop) as
 * CAMERA occluders. Same snapshot semantics as interiors; only rays
 * cast with `includeStatics` see them.
 */
export function registerStaticShapeCollider(id: string, meshes: Mesh[]): void {
  const colliders = buildMeshColliders(meshes);
  if (colliders.length > 0) {
    staticShapes().set(id, { colliders });
  }
}

export function unregisterStaticShapeCollider(id: string): void {
  staticShapes().delete(id);
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
  forceFields().set(id, {
    matrixWorld: matrixWorld.clone(),
    inverse: matrixWorld.clone().invert(),
    normalMatrix: new Matrix3().getNormalMatrix(matrixWorld),
    box: localBox.clone(),
    worldBox: localBox.clone().applyMatrix4(matrixWorld),
    enabled,
  });
}

export function setForceFieldEnabled(id: string, enabled: boolean): void {
  const entry = forceFields().get(id);
  if (entry) entry.enabled = enabled;
}

export function unregisterForceFieldCollider(id: string): void {
  forceFields().delete(id);
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
  for (const entry of interiors().values()) meshes += entry.colliders.length;
  return {
    interiors: interiors().size,
    meshes,
    forceFields: forceFields().size,
    staticShapes: staticShapes().size,
  };
}

export interface ColliderDumpEntry {
  kind: "interior" | "static" | "forceField";
  id: string;
  /** Index of the mesh within its entry, so entries stay comparable
   *  when an interior contributes many meshes. */
  mesh: number;
  /** Three-space world matrix, column-major (three's native order). */
  matrixWorld: number[];
  worldBoxMin: [number, number, number];
  worldBoxMax: [number, number, number];
  enabled?: boolean;
}

/**
 * The centre of the asset standing at `torquePoint`, if one is.
 *
 * A base asset's position is its ORIGIN, which sits at its foot — so a
 * camera aimed there frames the ground the thing stands on and pushes
 * the asset itself out of the top of the picture. What a shot of an
 * object wants is the middle of the object.
 *
 * Returns the centre of the SMALLEST static collider box containing the
 * point, so a sensor standing beside a wall resolves to the sensor
 * rather than to the building.
 */
export function assetBoxCenter(torquePoint: Vec3, expand = 2): Vec3 | null {
  // three-space: (x, y, z) = (torqueY, torqueZ, torqueX).
  const px = torquePoint[1];
  const py = torquePoint[2];
  const pz = torquePoint[0];
  let best: Box3 | null = null;
  let bestVolume = Infinity;
  for (const entry of staticShapes().values()) {
    entry.colliders.forEach((collider) => {
      const b = collider.worldBox;
      if (
        px < b.min.x - expand ||
        px > b.max.x + expand ||
        py < b.min.y - expand ||
        py > b.max.y + expand ||
        pz < b.min.z - expand ||
        pz > b.max.z + expand
      ) {
        return;
      }
      const volume =
        (b.max.x - b.min.x) * (b.max.y - b.min.y) * (b.max.z - b.min.z);
      if (volume < bestVolume) {
        bestVolume = volume;
        best = b;
      }
    });
  }
  if (!best) return null;
  const box = best as Box3;
  return [
    (box.min.z + box.max.z) / 2,
    (box.min.x + box.max.x) / 2,
    (box.min.y + box.max.y) / 2,
  ];
}

/**
 * Every registered collider's placement, for comparing one build of
 * the world against another — browser vs. headless, or before/after a
 * change. Sorted by (kind, id, mesh) so two dumps diff line by line.
 *
 * This is the cheap, exact alternative to rendering both worlds and
 * eyeballing screenshots: a transposed or swizzled transform shows up
 * here as visibly different numbers, where a picture of it can look
 * entirely plausible.
 */
export function getColliderDump(): ColliderDumpEntry[] {
  const out: ColliderDumpEntry[] = [];
  const push = (
    kind: "interior" | "static",
    map: Map<string, InteriorEntry>,
  ) => {
    for (const [id, entry] of map) {
      entry.colliders.forEach((collider, mesh) => {
        out.push({
          kind,
          id,
          mesh,
          matrixWorld: [...collider.matrixWorld.elements],
          worldBoxMin: collider.worldBox.min.toArray() as [
            number,
            number,
            number,
          ],
          worldBoxMax: collider.worldBox.max.toArray() as [
            number,
            number,
            number,
          ],
        });
      });
    }
  };
  push("interior", interiors());
  push("static", staticShapes());
  for (const [id, entry] of forceFields()) {
    out.push({
      kind: "forceField",
      id,
      mesh: 0,
      matrixWorld: [...entry.matrixWorld.elements],
      worldBoxMin: entry.worldBox.min.toArray() as [number, number, number],
      worldBoxMax: entry.worldBox.max.toArray() as [number, number, number],
      enabled: entry.enabled,
    });
  }
  return out.sort(
    (a, b) =>
      a.kind.localeCompare(b.kind) ||
      a.id.localeCompare(b.id) ||
      a.mesh - b.mesh,
  );
}

/** Centre plus the four axis extremes of the probe sphere. */
const TERRAIN_PROBE_OFFSETS: [number, number][] = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Is this point in a ROOM under the terrain — a basement — rather than
 * in the ground?
 *
 * A room has a ceiling above and a floor below, each seen from its
 * front. "Interior geometry somewhere overhead" was the old test, and
 * it accepted the rock under a base's slab: 673 Raindance grid cells
 * sat up to 57 units under the terrain, inside the base's solid
 * footing, with the building duly overhead.
 */
export function inRoomUnderTerrain(p: Vec3): boolean {
  const roof = firstInteriorFace(p, [0, 0, 1], ROOF_PROBE_SEARCH, {
    includeStatics: true,
  });
  if (!roof?.front) return false;
  const floor = firstInteriorFace(p, [0, 0, -1], FLOOR_PROBE_SEARCH, {
    includeStatics: true,
  });
  return floor?.front === true;
}

/** How far up to look for a ceiling, and down for a floor. */
const ROOF_PROBE_SEARCH = 40;
const FLOOR_PROBE_SEARCH = 40;

const _localRay = new Ray();

/**
 * The nearest hit of a world-space ray on one collider, or null.
 *
 * The BVH lives in the mesh's own space, and a mesh's transform can
 * carry scale — interiors too, non-uniform on some maps — so a distance
 * read off the local ray is in local units. Measuring "the scale" off
 * the transformed direction was a no-op: Ray.applyMatrix4 renormalizes
 * it. The hit point is taken back to world space and the distance
 * measured there, which is exact for any transform. The normal is in
 * world space and unit length; the caller decides its facing.
 */
interface ColliderHit {
  /** World distance from the ray origin. */
  dist: number;
  faceIndex: number;
  /** Hit point in the collider mesh's local space (BVH scratch: copy it
   *  before the next cast). */
  localPoint: Vector3;
}

const _colliderHit: ColliderHit = {
  dist: 0,
  faceIndex: 0,
  localPoint: new Vector3(),
};

function raycastCollider(
  collider: MeshCollider,
  worldRay: Ray,
  worldPoint: Vector3,
  worldNormal: Vector3,
): ColliderHit | null {
  _localRay.copy(worldRay).applyMatrix4(collider.inverse);
  const isect = collider.bvh.raycastFirst(_localRay, DoubleSide);
  if (!isect) return null;
  worldPoint.copy(isect.point).applyMatrix4(collider.matrixWorld);
  worldNormal
    .copy(isect.face!.normal)
    .applyMatrix3(collider.normalMatrix)
    .normalize();
  _colliderHit.dist = worldPoint.distanceTo(worldRay.origin);
  _colliderHit.faceIndex = isect.faceIndex ?? 0;
  _colliderHit.localPoint = isect.point;
  return _colliderHit;
}

/**
 * Loads a Torque-space segment into the shared ray scratch (`_ray`,
 * `_segBox`, `_start`); the segment's length, or null when degenerate.
 */
function setupSegment(start: Vec3, end: Vec3): number | null {
  torqueToThreeVec(start, _start);
  torqueToThreeVec(end, _end);
  _dir.subVectors(_end, _start);
  const segLength = _dir.length();
  if (segLength < 1e-9) return null;
  _dir.divideScalar(segLength);
  _ray.origin.copy(_start);
  _ray.direction.copy(_dir);
  _segBox.makeEmpty();
  _segBox.expandByPoint(_start);
  _segBox.expandByPoint(_end);
  return segLength;
}

export interface InteriorRayHit {
  /** World distance from the ray origin. */
  dist: number;
  collider: MeshCollider;
  /** Triangle index in the collider mesh's geometry. */
  faceIndex: number;
  /** Hit point in the collider mesh's local space. */
  localPoint: Vector3;
}

/**
 * The nearest interior mesh along a Torque-space segment, with the face
 * that was hit — the engine's InteriorObjectType-only casts (a lighting
 * probe needs the floor's lightmap texel, so it needs the triangle).
 */
export function castInteriorRay(start: Vec3, end: Vec3): InteriorRayHit | null {
  const segLength = setupSegment(start, end);
  if (segLength == null) return null;
  let best: InteriorRayHit | null = null;
  for (const entry of interiors().values()) {
    for (const collider of entry.colliders) {
      if (!collider.worldBox.intersectsBox(_segBox)) continue;
      const hit = raycastCollider(collider, _ray, _point, _normal);
      if (!hit || hit.dist > segLength || (best && hit.dist >= best.dist)) {
        continue;
      }
      best = {
        dist: hit.dist,
        collider,
        faceIndex: hit.faceIndex,
        localPoint: hit.localPoint.clone(),
      };
    }
  }
  return best;
}

const _faceOrigin = new Vector3();
const _faceDir = new Vector3();
const _faceRay = new Ray();
const _faceNormal = new Vector3();

/**
 * The nearest interior face along a ray, WITH its facing.
 *
 * `castWorldRay` turns every normal to face the ray, which is what a
 * bounce or a decal wants and exactly what an inside test cannot use.
 * Here `front` is whether the face's own front was towards the ray —
 * meeting a face from behind means the ray started inside the solid
 * that face bounds.
 */
export function firstInteriorFace(
  torqueOrigin: Vec3,
  torqueDir: Vec3,
  maxDist: number,
  options?: { includeStatics?: boolean },
): { dist: number; front: boolean } | null {
  torqueToThreeVec(torqueOrigin, _faceOrigin);
  torqueToThreeVec(torqueDir, _faceDir).normalize();
  _faceRay.origin.copy(_faceOrigin);
  _faceRay.direction.copy(_faceDir);
  _segBox.makeEmpty();
  _segBox.expandByPoint(_faceOrigin);
  _segBox.expandByPoint(
    _point.copy(_faceOrigin).addScaledVector(_faceDir, maxDist),
  );
  const groups = options?.includeStatics
    ? [interiors(), staticShapes()]
    : [interiors()];
  let best: { dist: number; front: boolean } | null = null;
  for (const group of groups) {
    for (const entry of group.values()) {
      for (const collider of entry.colliders) {
        if (!collider.worldBox.intersectsBox(_segBox)) continue;
        const hit = raycastCollider(collider, _faceRay, _point, _faceNormal);
        if (!hit) continue;
        const dist = hit.dist;
        if (dist > maxDist || (best && dist >= best.dist)) continue;
        best = { dist, front: _faceNormal.dot(_faceDir) < 0 };
      }
    }
  }
  return best;
}

/**
 * Is this point INSIDE solid interior geometry?
 *
 * Proximity cannot say: deeper than the clearance inside a thick wall
 * there is no triangle within reach, so a sphere test reads open air.
 * Interiors are closed solids, so a ray leaving the point meets the
 * back of a face first if and only if it started inside one.
 */
export function pointInsideInterior(torquePoint: Vec3): boolean {
  const hit = firstInteriorFace(torquePoint, [0, 0, 1], INSIDE_PROBE_REACH);
  return hit != null && !hit.front;
}

/** How far the inside test looks for the face it is behind. */
const INSIDE_PROBE_REACH = 400;

const _scale = new Vector3();
const _probeSphere = new Sphere();
const _probeCenter = new Vector3();

/**
 * Is there solid geometry within `radius` of a point?
 *
 * A DIRECT spatial query, not a bundle of rays. `MeshBVH.intersectsSphere`
 * descends the tree and stops at the first triangle that overlaps, so it
 * answers "is there room here" in one traversal — where six axis
 * raycasts both cost six traversals and miss anything that sits between
 * the axes.
 *
 * Takes a TORQUE-space point, like every other cast in this module.
 */
export function pointObstructed(
  torquePoint: Vec3,
  radius: number,
  options?: { includeStatics?: boolean },
): boolean {
  // TERRAIN FIRST. The BVH only holds interiors and static shapes, so a
  // sphere query alone reports open air on a hillside — cross-checking
  // against 26-direction raycasts found 318 of 3000 points near a base
  // where the rays hit ground the sphere never looked for.
  //
  // Sampled rather than swept: the height field is smooth at this scale,
  // so the centre plus four points at the probe radius bound the slope
  // closely enough, and each sample is arithmetic rather than a descent.
  const gz = torquePoint[2];
  let nearGround = false;
  for (const [ox, oy] of TERRAIN_PROBE_OFFSETS) {
    const h = terrainHeightAt(
      torquePoint[0] + ox * radius,
      torquePoint[1] + oy * radius,
    );
    if (h != null && gz - h < radius) {
      nearGround = true;
      break;
    }
  }
  if (nearGround) {
    // Below the terrain SURFACE is not the same as inside solid rock.
    // Bases have basements: the generators on Damnation sit 6-7 units
    // UNDER intact terrain, reached by a ramp through an empty square
    // elsewhere, and treating the heightfield as a solid volume buried
    // every one of them — they were the only landmarks the camera
    // search could never place.
    //
    // A roof of INTERIOR geometry overhead is what tells the two apart:
    // in a basement there is a building above you, in rock there is
    // nothing but more rock (and terrain is not in the BVH, so a rock
    // point would otherwise read as open air).
    if (!inRoomUnderTerrain(torquePoint)) return true;
  }

  // INSIDE a solid is obstructed however far the nearest face is. The
  // sphere test below is proximity, and deeper than `radius` inside a
  // thick wall — or the footing under a base — it finds no triangle at
  // all and reads open air; 251 Raindance grid cells were free that way.
  if (pointInsideInterior(torquePoint)) return true;

  torqueToThreeVec(torquePoint, _probeCenter);
  const groups = options?.includeStatics
    ? [interiors(), staticShapes()]
    : [interiors()];
  for (const map of groups) {
    for (const entry of map.values()) {
      for (const collider of entry.colliders) {
        // Broadphase in world space before paying for a descent.
        if (
          _probeCenter.x + radius < collider.worldBox.min.x ||
          _probeCenter.x - radius > collider.worldBox.max.x ||
          _probeCenter.y + radius < collider.worldBox.min.y ||
          _probeCenter.y - radius > collider.worldBox.max.y ||
          _probeCenter.z + radius < collider.worldBox.min.z ||
          _probeCenter.z - radius > collider.worldBox.max.z
        ) {
          continue;
        }
        // The BVH lives in the mesh's own space.
        _probeSphere.center.copy(_probeCenter).applyMatrix4(collider.inverse);
        _probeSphere.radius = radius * collider.worldToLocalRadius;
        if (collider.bvh.intersectsSphere(_probeSphere)) return true;
      }
    }
  }
  return false;
}

/** Test-only: clear all registered colliders. */
export function clearWorldColliders(): void {
  interiors().clear();
  interiorVersion++;
  staticShapes().clear();
  forceFields().clear();
}

const _start = new Vector3();
const _end = new Vector3();
const _dir = new Vector3();
const _ray = new Ray();
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

  const segLength = setupSegment(start, end);
  if (segLength == null) return best;

  const meshGroups: [Map<string, InteriorEntry>, WorldRayHit["source"]][] =
    options?.includeStatics
      ? [
          [interiors(), "interior"],
          [staticShapes(), "static"],
        ]
      : [[interiors(), "interior"]];
  for (const [group, source] of meshGroups) {
    for (const entry of group.values()) {
      for (const collider of entry.colliders) {
        if (!collider.worldBox.intersectsBox(_segBox)) continue;
        const hit = raycastCollider(collider, _ray, _point, _normal);
        if (!hit) continue;
        const t = hit.dist / segLength;
        if (t > 1 || (best && t >= best.t)) continue;
        if (_normal.dot(_dir) > 0) _normal.negate();
        best = {
          t,
          point: threeToTorqueVec(_point),
          normal: threeToTorqueVec(_normal),
          source,
        };
      }
    }
  }

  for (const entry of forceFields().values()) {
    if (!entry.enabled) continue;
    if (!entry.worldBox.intersectsBox(_segBox)) continue;
    _localRay.copy(_ray).applyMatrix4(entry.inverse);
    const hitPoint = _localRay.intersectBox(entry.box, _point);
    if (!hitPoint) continue;
    // Derive the box face normal from the local hit point, then measure
    // the distance in WORLD space (see raycastCollider for why).
    boxFaceNormal(entry.box, _point, _normal);
    _point.applyMatrix4(entry.matrixWorld);
    const worldDist = _point.distanceTo(_start);
    const t = worldDist / segLength;
    if (t > 1 || (best && t >= best.t)) continue;
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
