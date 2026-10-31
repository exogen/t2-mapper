interface ReadableStore<S> {
  getState(): S;
  subscribe(listener: (state: S, previous: S) => void): () => void;
}

/** What a reaction's effect may return: its cleanup. */
export type Cleanup = (() => void) | void | undefined;

/**
 * Runs `effect` with the selected value now, and again whenever it
 * changes, cleaning up the previous run first: for engine code, what
 * `useEffect` with that value as its dependency does in a component.
 * The returned function stops reacting and runs the last cleanup.
 */
export function reaction<S, T>(
  store: ReadableStore<S>,
  select: (state: S) => T,
  effect: (value: T) => Cleanup,
  equals: (a: T, b: T) => boolean = Object.is,
): () => void {
  let value = select(store.getState());
  let cleanup = effect(value) || undefined;
  const unsubscribe = store.subscribe((state) => {
    const next = select(state);
    if (equals(next, value)) return;
    value = next;
    cleanup?.();
    cleanup = effect(next) || undefined;
  });
  return () => {
    unsubscribe();
    cleanup?.();
    cleanup = undefined;
  };
}

/** Runs every cleanup, last first. */
export function combineCleanups(...cleanups: Cleanup[]): () => void {
  return () => {
    for (let i = cleanups.length - 1; i >= 0; i--) cleanups[i]?.();
  };
}
