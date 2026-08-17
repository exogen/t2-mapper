import { MdOutlineScreenSearchDesktop } from "react-icons/md";
import { HiMiniArrowLeftEndOnRectangle } from "react-icons/hi2";
import {
  commandCircuitStore,
  useCommandCircuit,
} from "../state/commandCircuitStore";
import { useDataSource } from "../state/gameEntityStore";
import { useSettings } from "./SettingsProvider";
import { useTouchDevice } from "./useTouchDevice";
import buttonStyles from "./Button.module.css";
import styles from "./CommandCircuitButton.module.css";

/**
 * Toggles the top-down command circuit map overview.
 */
export function CommandCircuitButton() {
  const active = useCommandCircuit((s) => s.active);
  const dataSource = useDataSource();
  const { setSidebarOpen } = useSettings();
  const isTouch = useTouchDevice();

  const handleClick = () => {
    commandCircuitStore.getState().toggle();
    // Close the sidebar to reveal the view, like mission select and tours do.
    if (isTouch) {
      setSidebarOpen(false);
    }
  };

  return (
    <button
      type="button"
      className={active ? styles.ExitButton : buttonStyles.Button}
      aria-label={active ? "Exit command circuit" : "Command circuit"}
      title={
        active ? "Exit the command circuit (C)" : "Open the command circuit (C)"
      }
      onClick={handleClick}
      disabled={dataSource == null}
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
