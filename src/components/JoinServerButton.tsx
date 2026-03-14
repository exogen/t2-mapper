import { BsFillLightningChargeFill } from "react-icons/bs";
import { useLiveSelector, selectPing } from "../state/liveConnectionStore";
import styles from "./JoinServerButton.module.css";

function formatPing(ms: number): string {
  return `${ms.toLocaleString()} ms`;
}

export function JoinServerButton({
  isActive,
  onOpenServerBrowser,
}: {
  isActive: boolean;
  onOpenServerBrowser: () => void;
}) {
  const gameStatus = useLiveSelector((s) => s.gameStatus);
  // const serverName = useLiveSelector((s) => s.serverName);
  const ping = useLiveSelector(selectPing);
  const disconnectServer = useLiveSelector((s) => s.disconnectServer);
  const disconnectRelay = useLiveSelector((s) => s.disconnectRelay);

  const isLive = gameStatus === "connected";
  const isConnecting =
    gameStatus === "connecting" ||
    gameStatus === "challenging" ||
    gameStatus === "authenticating";

  return (
    <button
      type="button"
      className={styles.Root}
      aria-label={isLive ? "Connected – click to disconnect" : "Join server"}
      title={isLive ? "Connected – click to disconnect" : "Join server"}
      onClick={() => {
        if (isLive) {
          disconnectServer();
          disconnectRelay();
        } else {
          onOpenServerBrowser();
        }
      }}
      data-active={isActive}
    >
      <BsFillLightningChargeFill
        className={`${styles.LiveIcon} ${isLive ? styles.Pulsing : ""}`}
      />
      <>
        <span className={styles.TextLabel}>Live</span>
        <span className={styles.ButtonHint}>
          {isConnecting
            ? "Connecting…"
            : ping != null
              ? formatPing(ping)
              : "Join a game"}
        </span>
      </>
      {/* {isLive && ping != null && (
        <span className={styles.PingLabel}>{formatPing(ping)}</span>
      )} */}
    </button>
  );
}
