import { useCallback, useRef, useSyncExternalStore } from "react";

// Only check pointer: coarse. Adding "hover: none" would be more precise but
// Samsung Android devices incorrectly report hover: hover for touchscreens.
// See: https://www.ctrl.blog/entry/css-media-hover-samsung.html
const query = "(pointer: coarse)";
const getServerSnapshot = () => null;

export function useTouchDevice() {
  const queryRef = useRef<ReturnType<typeof window.matchMedia>>(null);

  const subscribe = useCallback((onStoreChange: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener("change", onStoreChange);
    queryRef.current = mql;
    return () => {
      mql.removeEventListener("change", onStoreChange);
    };
  }, []);

  const getSnapshot = useCallback(() => {
    return queryRef.current.matches;
  }, []);

  const isTouch = useSyncExternalStore<boolean | null>(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  return isTouch;
}
