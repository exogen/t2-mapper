/**
 * The most recently built free-space grid, for anything that wants to
 * look at it — the debug overlay, chiefly. The director owns its grid
 * inside the switcher state; this is a window onto it, not a home.
 */
import type { FreeSpaceGrid } from "./freeSpace";

type Listener = (grid: FreeSpaceGrid) => void;

let latest: FreeSpaceGrid | null = null;
const listeners = new Set<Listener>();

export function publishFreeSpace(grid: FreeSpaceGrid): void {
  latest = grid;
  for (const listener of listeners) listener(grid);
}

export function latestFreeSpace(): FreeSpaceGrid | null {
  return latest;
}

export function subscribeFreeSpace(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
