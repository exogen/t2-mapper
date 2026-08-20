import { BsFillLightningChargeFill } from "react-icons/bs";
import { cameraTourStore } from "../state/cameraTourStore";
import { useLiveSelector } from "../state/liveConnectionStore";
import buttonStyles from "./Button.module.css";
import styles from "./JoinServerButton.module.css";

export function JoinServerButton({
  isActive,
  onOpenServerBrowser,
}: {
  isActive: boolean;
  onOpenServerBrowser: () => void;
}) {
  const gameStatus = useLiveSelector((s) => s.gameStatus);
  const disconnectServer = useLiveSelector((s) => s.disconnectServer);
  const leaveServer = useLiveSelector((s) => s.leaveServer);
  const isWatcher = useLiveSelector((s) => s.role === "watcher");
  const watchStatus = useLiveSelector((s) => s.watchStatus);

  const watchActive = watchStatus !== null && watchStatus !== "ended";
  const isLive = gameStatus === "connected" || (isWatcher && watchActive);
  const isConnecting =
    gameStatus === "connecting" ||
    gameStatus === "challenging" ||
    gameStatus === "authenticating" ||
    (watchActive && watchStatus !== "live");

  return (
    <button
      type="button"
      className={styles.JoinServerButton}
      aria-label={isLive ? "Connected – click to disconnect" : "Join a game"}
      title={isLive ? "Connected – click to disconnect" : "Join a game"}
      data-connected={isLive}
      onClick={() => {
        cameraTourStore.getState().cancel();
        if (isLive) {
          // Watchers detach from the shared session; player connections
          // (not yet exposed in the UI) disconnect outright.
          if (isWatcher) {
            leaveServer();
          } else {
            disconnectServer();
          }
        } else {
          onOpenServerBrowser();
        }
      }}
      data-active={isActive}
    >
      <BsFillLightningChargeFill className={styles.Icon} />
      <>
        <span className={buttonStyles.ButtonLabel}>Live</span>
        <span className={buttonStyles.ButtonHint}>
          {isConnecting ? "Connecting…" : isLive ? "Connected" : "Join a game"}
        </span>
      </>
    </button>
  );
}
