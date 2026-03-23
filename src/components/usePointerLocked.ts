import { useSyncExternalStore } from "react";

function subscribe(callback: () => void): () => void {
  document.addEventListener("pointerlockchange", callback);
  return () => document.removeEventListener("pointerlockchange", callback);
}

function getSnapshot(): boolean {
  return document.pointerLockElement !== null;
}

/** Whether pointer lock is currently active on any element. */
export function usePointerLocked(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
