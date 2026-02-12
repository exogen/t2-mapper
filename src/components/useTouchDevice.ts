import { useEffect, useState } from "react";

// Only check pointer: coarse. Adding "hover: none" would be more precise but
// Samsung Android devices incorrectly report hover: hover for touchscreens.
// See: https://www.ctrl.blog/entry/css-media-hover-samsung.html
const query = "(pointer: coarse)";

export function useTouchDevice() {
  const [isTouch, setIsTouch] = useState<boolean | null>(null);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setIsTouch(mql.matches);
    const handleChange = (e: MediaQueryListEvent) => {
      setIsTouch(e.matches);
    };
    mql.addEventListener("change", handleChange);
    return () => {
      mql.removeEventListener("change", handleChange);
    };
  }, []);

  return isTouch;
}
