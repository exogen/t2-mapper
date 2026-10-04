import { useEffect, useRef, type ReactNode } from "react";
import type { WatchEndReason } from "../../relay/types";
import styles from "./WatchErrorDialog.module.css";

/**
 * Spectate-mode failures (share-link server not found, session ended,
 * kicked mid-session) presented in the "Incoming transmission" dialog
 * style rather than dumping the visitor straight into the server
 * browser. When the lost server is known, a Rejoin action is offered
 * alongside browsing; a refusal the server itself calls temporary
 * (mission cycling) gets a Retry instead.
 */
export function WatchErrorDialog({
  title = "Uplink failure",
  endReason,
  message,
  onBrowse,
  onRejoin,
  onRetry,
  onDismiss,
}: {
  title?: string;
  endReason?: WatchEndReason;
  message: ReactNode;
  onBrowse: () => void;
  /** Rejoin the server the session was lost from, when known. */
  onRejoin?: () => void;
  /** Try the same server again after a retryable refusal. */
  onRetry?: () => void;
  /** Escape handler; defaults to onBrowse. */
  onDismiss?: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const watchingDisabled = endReason === "watchingDisabled";
  const heading = watchingDisabled ? "Watching disabled" : title;

  useEffect(() => {
    if (document.pointerLockElement) document.exitPointerLock();
    dialogRef.current?.focus();
  }, []);

  return (
    <div className={styles.Overlay}>
      <div
        ref={dialogRef}
        className={styles.Dialog}
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        tabIndex={-1}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") (onDismiss ?? onBrowse)();
        }}
      >
        <h1 className={styles.Title}>{heading}</h1>
        <p className={styles.Message}>
          {message === "PASSWORD"
            ? "This server requires a password."
            : message}
        </p>
        <div className={styles.Buttons}>
          {onRejoin && !watchingDisabled ? (
            <button
              type="button"
              className={styles.PrimaryButton}
              onClick={onRejoin}
            >
              Rejoin
            </button>
          ) : null}
          {onRetry && !watchingDisabled ? (
            <button
              type="button"
              className={styles.PrimaryButton}
              onClick={onRetry}
            >
              Retry
            </button>
          ) : null}
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
