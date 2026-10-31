import { useEffect } from "react";
import Stats from "three/examples/jsm/libs/stats.module.js";
import { useDebug } from "./SettingsProvider";
import { useEngine } from "./useEngine";
import styles from "./FpsMeter.module.css";

/**
 * FPS meter overlay, toggled independently of the other debug visuals so
 * performance can be watched without axes/bounds/label clutter. It times
 * each of the engine's frames, from its first stage to its render.
 */
export function FpsMeter() {
  const engine = useEngine();
  const { showFpsMeter } = useDebug();
  useEffect(() => {
    if (!showFpsMeter) return;
    const stats = new Stats();
    stats.showPanel(0);
    stats.dom.classList.add(styles.StatsPanel);
    document.body.appendChild(stats.dom);
    const stopStart = engine.onFrameStart(() => stats.begin());
    const stopEnd = engine.onFrameEnd(() => stats.end());
    return () => {
      stopStart();
      stopEnd();
      stats.dom.remove();
    };
  }, [engine, showFpsMeter]);
  return null;
}
