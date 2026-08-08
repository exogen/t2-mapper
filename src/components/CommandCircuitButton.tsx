import { MdOutlineScreenSearchDesktop } from "react-icons/md";
import { HiMiniArrowLeftEndOnRectangle } from "react-icons/hi2";
import {
  commandCircuitStore,
  useCommandCircuit,
} from "../state/commandCircuitStore";
import { useDataSource } from "../state/gameEntityStore";
import buttonStyles from "./Button.module.css";
import styles from "./CommandCircuitButton.module.css";

/**
 * Toggles the top-down command circuit map overview.
 */
export function CommandCircuitButton() {
  const active = useCommandCircuit((s) => s.active);
  const dataSource = useDataSource();
  return (
    <button
      type="button"
      className={active ? styles.ExitButton : buttonStyles.Button}
      aria-label={active ? "Exit command circuit" : "Command circuit"}
      title={
        active ? "Exit the command circuit (C)" : "Open the command circuit (C)"
      }
      onClick={() => commandCircuitStore.getState().toggle()}
      disabled={dataSource !== "map"}
    >
      {active ? (
        <>
          <HiMiniArrowLeftEndOnRectangle />
          <span className={buttonStyles.ButtonLabel}>Exit command circuit</span>
        </>
      ) : (
        <>
          <MdOutlineScreenSearchDesktop className={styles.Icon} />
          <span className={buttonStyles.ButtonLabel}>Command circuit</span>
        </>
      )}
    </button>
  );
}
