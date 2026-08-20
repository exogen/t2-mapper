import { useCallback } from "react";
import { PiCassetteTape } from "react-icons/pi";
import { cameraTourStore } from "../state/cameraTourStore";
import { unloadDemo } from "../stream/demoFileLoader";
import { useRecording } from "./usePlayback";
import styles from "./Button.module.css";

export function LoadDemoButton({
  isActive = false,
  choosingMap = false,
  onCancelChoosingMap,
  onEnterDemoMode,
}: {
  isActive?: boolean;
  choosingMap?: boolean;
  onCancelChoosingMap?: () => void;
  /** Switch to demo mode — the drop screen handles file selection. */
  onEnterDemoMode?: () => void;
}) {
  const recording = useRecording();
  const isDemoLoaded = recording?.source === "demo";

  const handleClick = useCallback(() => {
    cameraTourStore.getState().cancel();
    if (choosingMap && isDemoLoaded) {
      onCancelChoosingMap?.();
      return;
    }
    if (isDemoLoaded) {
      unloadDemo();
      return;
    }
    onEnterDemoMode?.();
  }, [isDemoLoaded, choosingMap, onCancelChoosingMap, onEnterDemoMode]);

  return (
    <button
      type="button"
      className={styles.Button}
      aria-label={isDemoLoaded ? "Eject demo" : "Load demo (.rec)"}
      title={isDemoLoaded ? "Eject demo" : "Load demo (.rec)"}
      onClick={handleClick}
      data-active={isActive}
    >
      <PiCassetteTape className={styles.DemoIcon} />
      <span className={styles.ButtonLabel}>Demo</span>
      <span className={styles.ButtonHint}>
        {choosingMap && isDemoLoaded
          ? "Return to demo"
          : isDemoLoaded
            ? "Click to eject"
            : "Load a .rec file"}
      </span>
    </button>
  );
}
