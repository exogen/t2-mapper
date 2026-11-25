import type { LoadingManager } from "three";

/** The decoded resources owned by one rendered world. Detach its views and
 * effects before disposing the scope. The HTTP cache can still reuse files. */
export class SceneAssets {
  private readonly controller = new AbortController();
  private readonly caches = new Map<
    object,
    { entries: Map<unknown, unknown>; release: (errors: unknown[]) => void }
  >();

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get disposed(): boolean {
    return this.signal.aborted;
  }

  cache<K, V>(key: object, dispose?: (value: V) => void): Map<K, V> {
    this.signal.throwIfAborted();
    const cached = this.caches.get(key);
    if (cached) return cached.entries as Map<K, V>;
    const entries = new Map<K, V>();
    this.caches.set(key, {
      entries,
      release: (errors) => {
        if (dispose) {
          for (const value of entries.values()) {
            try {
              dispose(value);
            } catch (error) {
              errors.push(error);
            }
          }
        }
        entries.clear();
      },
    });
    return entries;
  }

  dispose(): void {
    if (this.disposed) return;
    this.controller.abort();
    const errors: unknown[] = [];
    for (const { release } of this.caches.values()) release(errors);
    this.caches.clear();
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1)
      throw new AggregateError(errors, "Scene asset teardown failed");
  }
}

const managerAssets = new WeakMap<LoadingManager, SceneAssets>();
export const sharedSceneAssets = new SceneAssets();

export function bindSceneAssets(
  manager: LoadingManager,
  assets: SceneAssets,
): void {
  managerAssets.set(manager, assets);
}

export function getSceneAssets(manager: LoadingManager): SceneAssets {
  return managerAssets.get(manager) ?? sharedSceneAssets;
}
