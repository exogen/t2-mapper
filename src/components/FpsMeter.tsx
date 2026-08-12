import { Stats } from "@react-three/drei";
import { useDebug } from "./SettingsProvider";
import styles from "./DebugElements.module.css";

/**
 * FPS meter overlay, toggled independently of the other debug visuals so
 * performance can be watched without axes/bounds/label clutter.
 */
export function FpsMeter() {
  const { showFpsMeter } = useDebug();
  return showFpsMeter ? <Stats className={styles.StatsPanel} /> : null;
}
