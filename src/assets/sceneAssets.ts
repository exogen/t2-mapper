import type { LoadingManager } from "three";
import { runOwnedCleanups } from "../engine/runOwnedCleanups";

/** The decoded resources owned by one rendered world. Detach its views and
 * effects before disposing the scope. The HTTP cache can still reuse files. */
export class SceneAssets {
  private readonly controller = new AbortController();
  private readonly caches = new Map<
    object,
    { entries: Map<unknown, unknown>; release: (errors: unknown[]) => void }
  >();
  private textureAssets?: SceneAssets;
  private reusableFrom?: SceneAssets;
  private readonly textureListeners = new Set<() => void>();

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get disposed(): boolean {
    return this.signal.aborted;
  }

  /** External images have a shorter lifetime than world geometry and simulation. */
  get textures(): SceneAssets {
    this.signal.throwIfAborted();
    return (this.textureAssets ??= new SceneAssets());
  }

  onTexturesChanged(reload: () => void): () => void {
    this.signal.throwIfAborted();
    this.textureListeners.add(reload);
    return () => this.textureListeners.delete(reload);
  }

  /** Release each binding before its old image scope is disposed. */
  bindTextures(
    start: (textures: SceneAssets) => (() => void) | void,
    reuse?: (textures: SceneAssets) => boolean,
  ): () => void {
    let cleanup = start(this.textures);
    const unsubscribe = this.onTexturesChanged(() => {
      if (reuse?.(this.textures)) return;
      cleanup?.();
      cleanup = start(this.textures);
    });
    return () => {
      unsubscribe();
      cleanup?.();
      cleanup = undefined;
    };
  }

  refreshTextures(): void {
    if (this.disposed) return;
    const previous = this.textureAssets;
    const current = (this.textureAssets = new SceneAssets());
    current.reusableFrom = previous;
    runOwnedCleanups([
      ...Array.from(this.textureListeners, (reload) => () => {
        if (this.textureListeners.has(reload)) reload();
      }),
      () => {
        current.reusableFrom = undefined;
        previous?.dispose();
      },
    ]);
  }

  /** Transfer a settled entry to this scope after its consumer resolves the
   * same source again. The old scope still cancels any unfinished loads. */
  adoptCached<K, V>(
    cacheKey: object,
    key: K,
    canReuse: (value: V) => boolean,
  ): V | undefined {
    this.signal.throwIfAborted();
    const entries = this.caches.get(cacheKey)?.entries;
    if (!entries) return;
    const cached = entries.get(key) as V | undefined;
    if (cached !== undefined) return canReuse(cached) ? cached : undefined;
    for (let prior = this.reusableFrom; prior; prior = prior.reusableFrom) {
      const oldEntries = prior.caches.get(cacheKey)?.entries;
      if (!oldEntries) continue;
      const value = oldEntries.get(key) as V | undefined;
      if (value === undefined || !canReuse(value)) continue;
      oldEntries.delete(key);
      entries.set(key, value);
      return value;
    }
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
    this.textureListeners.clear();
    const textures = this.textureAssets;
    this.textureAssets = undefined;
    const errors: unknown[] = [];
    for (const { release } of this.caches.values()) release(errors);
    this.caches.clear();
    try {
      textures?.dispose();
    } catch (error) {
      errors.push(error);
    }
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
