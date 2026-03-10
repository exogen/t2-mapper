import { BsFillLightningChargeFill } from "react-icons/bs";
import { useLiveSelector, selectPing } from "../state/liveConnectionStore";
import styles from "./JoinServerButton.module.css";

function formatPing(ms: number): string {
  return ms >= 1000 ? ms.toLocaleString() + "ms" : ms + "ms";
}

export function JoinServerButton({
  onOpenServerBrowser,
}: {
  onOpenServerBrowser: () => void;
}) {
  const gameStatus = useLiveSelector((s) => s.gameStatus);
  const serverName = useLiveSelector((s) => s.serverName);
  const ping = useLiveSelector(selectPing);
  const disconnectServer = useLiveSelector((s) => s.disconnectServer);

  const isLive = gameStatus === "connected";
  const isConnecting =
    gameStatus === "connecting" ||
    gameStatus === "challenging" ||
    gameStatus === "authenticating";

  return (
    <button
      type="button"
      className={styles.Root}
      aria-label={isLive ? `Disconnect from ${serverName ?? "server"}` : "Join server"}
      title={isLive ? `Disconnect from ${serverName ?? "server"}` : "Join server"}
      onClick={() => {
        if (isLive) {
          disconnectServer();
        } else {
          onOpenServerBrowser();
        }
      }}
      data-active={isLive ? "true" : undefined}
    >
      <BsFillLightningChargeFill
        className={`${styles.LiveIcon} ${isLive ? styles.Pulsing : ""}`}
      />
      {!isLive && (
        <span className={styles.TextLabel}>
          {isConnecting ? "Connecting..." : "Connect"}
        </span>
      )}
      {isLive && ping != null && (
        <span className={styles.PingLabel}>
          {formatPing(ping)}
        </span>
      )}
    </button>
  );
}
