import { useSyncExternalStore } from "react";

// Only check pointer: coarse. Adding "hover: none" would be more precise but
// Samsung Android devices incorrectly report hover: hover for touchscreens.
// See: https://www.ctrl.blog/entry/css-media-hover-samsung.html
const query = "(pointer: coarse)";
const getServerSnapshot = () => null;

function subscribe(onStoreChange: () => void) {
  const mql = window.matchMedia(query);
  mql.addEventListener("change", onStoreChange);
  return () => {
    mql.removeEventListener("change", onStoreChange);
  };
}

function getSnapshot() {
  return window.matchMedia(query).matches;
}

export function useTouchDevice() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
