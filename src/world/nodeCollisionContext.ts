/**
 * Real per-pipeline isolation of the collision world, for Node.
 *
 * `collisionContext` defaults to one shared world, which is right for
 * the browser (one page, one map) and keeps every existing call site
 * unchanged. A booth process may cast more than one match at once, and
 * those pipelines must not see each other's geometry — nor should
 * disposing one empty the other.
 *
 * `AsyncLocalStorage` is what makes that work without threading a world
 * argument through the trackers, the camera rig and the staging pass:
 * the store propagates across `await`, so everything a pipeline calls —
 * however deep, however async — resolves to the world it was started
 * in. Two concurrent `runInCollisionWorld` calls stay separate.
 *
 * This module is Node-only (`node:async_hooks`) and is deliberately not
 * imported by anything the browser bundles.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import {
  createCollisionState,
  defaultCollisionState,
  setCollisionStateResolver,
  type CollisionState,
} from "../collision/collisionContext";

const storage = new AsyncLocalStorage<CollisionState>();
let installed = false;

/**
 * Route the collision registry through AsyncLocalStorage. Idempotent,
 * and called automatically by `runInCollisionWorld`; code outside a
 * scoped world still falls back to the shared default.
 */
export function installCollisionContext(): void {
  if (installed) return;
  installed = true;
  setCollisionStateResolver(
    () => storage.getStore() ?? defaultCollisionState(),
  );
}

/**
 * Run `fn` against its own collision world. Everything it awaits sees
 * that world; nothing outside does.
 */
export function runInCollisionWorld<T>(
  state: CollisionState,
  fn: () => T | Promise<T>,
): Promise<T> {
  installCollisionContext();
  return storage.run(state, async () => fn());
}

export { createCollisionState, type CollisionState };
