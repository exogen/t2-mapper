import { useEffect, useRef, type ReactNode } from "react";
import { GiSkullCrossedBones } from "react-icons/gi";
import styles from "./WatchErrorDialog.module.css";

/**
 * Spectate-mode join failures (share-link server not found, session
 * ended) presented in the "Incoming transmission" dialog style rather
 * than dumping the visitor straight into the server browser.
 */
export function WatchErrorDialog({
  message,
  onBrowse,
}: {
  message: ReactNode;
  onBrowse: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  return (
    <div className={styles.Overlay}>
      <div
        ref={dialogRef}
        className={styles.Dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Uplink failure"
        tabIndex={-1}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") onBrowse();
        }}
      >
        <h1 className={styles.Title}>Uplink failure</h1>
        <p className={styles.Message}>{message}</p>
        <GiSkullCrossedBones className={styles.Icon} aria-hidden />
        <div className={styles.Buttons}>
          <button
            type="button"
            className={styles.PrimaryButton}
            onClick={onBrowse}
          >
            Browse servers
          </button>
        </div>
      </div>
    </div>
  );
}
