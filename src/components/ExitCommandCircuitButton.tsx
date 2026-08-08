import { commandCircuitStore } from "../state/commandCircuitStore";
import { HiMiniArrowLeftEndOnRectangle } from "react-icons/hi2";
import styles from "./ExitTourButton.module.css";

/**
 * Floating exit control for touch devices, which have no C/Escape keys.
 */
export function ExitCommandCircuitButton() {
  return (
    <button
      type="button"
      className={styles.Button}
      onClick={() => commandCircuitStore.getState().deactivate()}
    >
      <HiMiniArrowLeftEndOnRectangle />
      <span className={styles.ButtonLabel}>Exit command circuit</span>
    </button>
  );
}
