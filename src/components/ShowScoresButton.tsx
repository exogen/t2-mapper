import { LuUsers } from "react-icons/lu";
import styles from "./Button.module.css";

export function ShowScoresButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className={styles.Button}
      aria-label="Show scores"
      onClick={onClick}
    >
      <LuUsers />
      <span className={styles.ButtonLabel}>Show scores</span>
    </button>
  );
}
