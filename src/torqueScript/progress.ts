export type ProgressEventType = "update";
export type ProgressListener = () => void;

export interface ProgressTracker {
  /** Total items discovered so far (increases as dependencies are found) */
  readonly total: number;
  /** Items completed */
  readonly loaded: number;
  /** Currently loading item path, if any */
  readonly current: string | null;
  /** Progress as a ratio from 0 to 1 (or 0 if total is 0) */
  readonly progress: number;
  /** Subscribe to progress updates */
  on(event: ProgressEventType, listener: ProgressListener): void;
  /** Unsubscribe from progress updates */
  off(event: ProgressEventType, listener: ProgressListener): void;
}

export interface ProgressTrackerInternal extends ProgressTracker {
  /** Increment total count when a new item is discovered */
  addItem(path: string): void;
  /** Mark an item as completed */
  completeItem(): void;
  /** Set the currently loading item */
  setCurrent(path: string | null): void;
}

export function createProgressTracker(): ProgressTrackerInternal {
  const listeners = new Set<ProgressListener>();

  let total = 0;
  let loaded = 0;
  let current: string | null = null;

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  return {
    get total() {
      return total;
    },
    get loaded() {
      return loaded;
    },
    get current() {
      return current;
    },
    get progress() {
      return total === 0 ? 0 : loaded / total;
    },
    on(_event: ProgressEventType, listener: ProgressListener) {
      listeners.add(listener);
    },
    off(_event: ProgressEventType, listener: ProgressListener) {
      listeners.delete(listener);
    },
    addItem(path: string) {
      total++;
      current = path;
      notify();
    },
    completeItem() {
      loaded++;
      current = null;
      notify();
    },
    setCurrent(path: string | null) {
      current = path;
      notify();
    },
  };
}
