import { useEffect, useRef, type ReactNode } from "react";
import type { WatchEndReason } from "../../relay/types";
import styles from "./WatchErrorDialog.module.css";

// Native rejection codes from Tribes2.exe and the shipped scripts/client.cs.
const rejectionMessages: Record<string, string> = {
  PASSWORD: "This server requires a password.",
  CR_YOUAREBANNED: "You are not allowed to play on this server.",
  CR_SERVERFULL: "This server is full.",
  CR_AUTHENTICATION_FAILED: "Authentication with the game server failed.",
  CR_INVALID_CONNECT_PACKET:
    "The server rejected the connection request as invalid.",
  CR_INVALID_PROTOCOL_VERSION: "The server rejected the game protocol version.",
  CHR_PROTOCOL_SERVER: "The server uses an older, incompatible game protocol.",
  CHR_PROTOCOL: "The server requires a newer game protocol.",
  CHR_NOT_AUTHENTICATED: "This server requires an authenticated game account.",
  CHR_INVALID_SERVER_PACKET: "The server sent an invalid connection response.",
  CHR_INVALID_CHALLENGE_PACKET:
    "The server rejected the connection challenge as invalid.",
  WS_PeerAuthServer_ExpiredClientCertificate:
    "The game account's authentication has expired.",
};

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
  const heading = watchingDisabled ? "Transmission ended" : title;

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
          {typeof message === "string" &&
          Object.hasOwn(rejectionMessages, message)
            ? rejectionMessages[message]
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
