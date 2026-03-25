import { cameraTourStore } from "../state/cameraTourStore";
import { HiMiniArrowLeftEndOnRectangle } from "react-icons/hi2";
import styles from "./ExitTourButton.module.css";

export function ExitTourButton() {
  return (
    <button
      type="button"
      className={styles.Button}
      onClick={() => cameraTourStore.getState().cancel()}
    >
      <HiMiniArrowLeftEndOnRectangle />
      <span className={styles.ButtonLabel}>Exit tour</span>
    </button>
  );
}
