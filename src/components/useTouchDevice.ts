import { useEffect, useState } from "react";

const query = "(pointer: coarse) and (hover: none)";

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
