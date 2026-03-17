import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { useSettings } from "./SettingsProvider";

function useFPSLimit() {
  const { fpsLimit } = useSettings();
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    if (fpsLimit == null) return;

    const interval = 1000 / fpsLimit;
    let lastTime = 0;
    let rafId: number;

    function tick(time: number) {
      rafId = requestAnimationFrame(tick);
      if (time - lastTime >= interval) {
        // Snap lastTime forward to avoid drift accumulation
        lastTime = time - ((time - lastTime) % interval);
        invalidate();
      }
    }

    rafId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId);
  }, [fpsLimit, invalidate]);

  return fpsLimit;
}

export function LimitFPS() {
  useFPSLimit();

  return null;
}
