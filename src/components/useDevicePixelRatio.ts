import { useSyncExternalStore } from "react";

const getSnapshot = () => window.devicePixelRatio;
// Also used for the client's hydration render, so hydration stays
// consistent with the prerendered HTML; the live value follows right after.
const getServerSnapshot = () => 1;

/**
 * There is no devicePixelRatio change event; the standard substitute is a
 * media query pinned to the current ratio, which fires (by un-matching) the
 * moment the ratio becomes anything else. It must then be re-created for
 * the new ratio, or a second change (2× → 1× → 1.5×) would go unnoticed.
 */
function subscribe(onChange: () => void): () => void {
  let query: MediaQueryList | null = null;
  const handle = () => {
    bind();
    onChange();
  };
  const bind = () => {
    query?.removeEventListener("change", handle);
    query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    query.addEventListener("change", handle);
  };
  bind();
  return () => query?.removeEventListener("change", handle);
}

/**
 * Tracks window.devicePixelRatio across monitor moves and browser zoom.
 * Returns 1 during SSR and the hydration render, then the live value.
 */
export function useDevicePixelRatio(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
