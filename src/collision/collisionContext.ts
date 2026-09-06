/**
 * Which collision world the registry functions talk to.
 *
 * The registry used to be module-level `Map`s, which meant exactly one
 * world could exist per process. That is fine for the app (one page,
 * one map) but wrong for a booth service that may cast more than one
 * match at a time, and it made `dispose()` a process-wide operation:
 * tearing down one world silently emptied another's.
 *
 * The state now lives in a `CollisionState` bag, and the registry
 * functions read whichever bag the current context resolves to. By
 * default that is a single shared instance, so the browser and every
 * existing call site behave exactly as before with no signature
 * changes — `castWorldRay` is called from deep inside the trackers and
 * the camera rig, and threading a world argument through all of that
 * would be a large and risky diff for no benefit in the app.
 *
 * Node opts into real isolation by installing a resolver backed by
 * `AsyncLocalStorage` (see `world/nodeCollisionContext.ts`), which
 * propagates across `await` boundaries so two concurrent pipelines each
 * see their own world. That module is Node-only and is never imported
 * by the browser bundle, so `node:async_hooks` never reaches Vite.
 */
import type { Box3, BufferGeometry, Matrix3, Matrix4 } from "three";
import type { Mesh } from "three";
import type { MeshBVH } from "three-mesh-bvh";
import type { TerrainCollisionData } from "./terrainCollision";
import type { WaterInfo } from "./waterLevel";

export interface MeshCollider {
  /** The registered mesh: its geometry attributes and materials (interior
   *  lightmaps) are what a lighting probe reads at a hit. */
  mesh: Mesh;
  bvh: MeshBVH;
  matrixWorld: Matrix4;
  inverse: Matrix4;
  normalMatrix: Matrix3;
  /** Three-world-space bounds for broadphase rejection. */
  worldBox: Box3;
  /** World distance -> LOCAL distance, for sphere queries against the
   *  BVH (which lives in the mesh's own space). Uses the SMALLEST world
   *  scale, so the local sphere is never too small — an under-sized
   *  probe would report room where there is none. */
  worldToLocalRadius: number;
}

export interface InteriorEntry {
  colliders: MeshCollider[];
}

export interface ForceFieldEntry {
  matrixWorld: Matrix4;
  inverse: Matrix4;
  normalMatrix: Matrix3;
  /** Local-space box. */
  box: Box3;
  worldBox: Box3;
  enabled: boolean;
}

export interface CollisionState {
  interiors: Map<string, InteriorEntry>;
  /** Static DTS shapes (TSStatic / StaticShape) — camera occluders
   *  only: castWorldRay skips them unless asked, so projectile physics
   *  keeps colliding with exactly what it always did. */
  staticShapes: Map<string, InteriorEntry>;
  forceFields: Map<string, ForceFieldEntry>;
  /** BVHs are per-geometry and shared across instanced interiors.
   *  Deliberately per-state: a BVH belongs to the geometry, and two
   *  worlds loading the same interior share the loaded geometry, so
   *  they would rebuild it. Keeping it here means disposing a world
   *  releases its BVHs too. */
  bvhCache: WeakMap<BufferGeometry, MeshBVH>;
  terrain: TerrainCollisionData | null;
  /** The map's water bodies, by id. Maps really do have several —
   *  Damnation has two pools, BeachBlitz an ocean plus two lava
   *  planes — and the renderer draws them all, so collision has to
   *  know about them all too. */
  water: Map<string, WaterInfo>;
  /** Wave phase, driven by the water surface animation in the browser
   *  so the submersion test matches the rendered surface. */
  waterTime: number;
}

export function createCollisionState(): CollisionState {
  return {
    interiors: new Map(),
    staticShapes: new Map(),
    forceFields: new Map(),
    bvhCache: new WeakMap(),
    terrain: null,
    water: new Map(),
    waterTime: 0,
  };
}

/** The world used when nothing has scoped a different one — i.e. the
 *  browser, the test suite, and any Node code that has not opted in. */
const defaultState = createCollisionState();

export function defaultCollisionState(): CollisionState {
  return defaultState;
}

let resolve: () => CollisionState = () => defaultState;

/**
 * Install a resolver deciding which state the registry reads. Pass null
 * to go back to the single shared world. Node uses this to hang the
 * state off an AsyncLocalStorage; nothing else should need it.
 */
export function setCollisionStateResolver(
  fn: (() => CollisionState) | null,
): void {
  resolve = fn ?? (() => defaultState);
}

/** The collision world in effect for this call. */
export function collisionState(): CollisionState {
  return resolve();
}
