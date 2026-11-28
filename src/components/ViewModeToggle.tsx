import {
  commandCircuitStore,
  useCommandCircuit,
} from "../state/commandCircuitStore";
import { settingsStore } from "../state/settingsStore";
import { useTouchDevice } from "./useTouchDevice";
import styles from "./ViewModeToggle.module.css";

/**
 * Segmented switch between the 3D view and the command circuit view.
 */
export function ViewModeToggle({ className }: { className?: string }) {
  const active = useCommandCircuit((s) => s.active);
  const isTouch = useTouchDevice();

  const setCommandCircuit = (command: boolean) => {
    const store = commandCircuitStore.getState();
    if (command) {
      store.activate();
    } else {
      store.deactivate();
    }
    // Close the sidebar to reveal the view, like mission select and tours do.
    if (isTouch) {
      settingsStore.setState({ sidebarOpen: false });
    }
  };

  return (
    <div
      className={className ? `${styles.Toggle} ${className}` : styles.Toggle}
      role="group"
      aria-label="View mode"
    >
      <button
        type="button"
        className={styles.Segment}
        aria-pressed={!active}
        data-active={!active}
        aria-label="3D view"
        title="3D view (C to toggle)"
        onClick={() => setCommandCircuit(false)}
      >
        <span className={styles.Badge} aria-hidden>
          3D
        </span>
      </button>
      <button
        type="button"
        className={styles.Segment}
        aria-pressed={active}
        data-active={active}
        aria-label="Command circuit"
        title="Command circuit (C to toggle)"
        onClick={() => setCommandCircuit(true)}
      >
        <span className={styles.Badge} aria-hidden>
          CC
        </span>
      </button>
    </div>
  );
}
