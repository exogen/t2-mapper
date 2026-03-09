import { BsFillLightningChargeFill } from "react-icons/bs";
import { useLiveConnectionOptional } from "./LiveConnection";
import styles from "./JoinServerButton.module.css";

function formatPing(ms: number): string {
  return ms >= 1000 ? ms.toLocaleString() + "ms" : ms + "ms";
}

export function JoinServerButton({
  onOpenServerBrowser,
}: {
  onOpenServerBrowser: () => void;
}) {
  const live = useLiveConnectionOptional();
  if (!live) return null;

  const isLive = live.gameStatus === "connected";
  const isConnecting =
    live.gameStatus === "connecting" ||
    live.gameStatus === "challenging" ||
    live.gameStatus === "authenticating";

  return (
    <button
      type="button"
      className={styles.Root}
      aria-label={isLive ? "Disconnect" : "Join server"}
      title={isLive ? "Disconnect" : "Join server"}
      onClick={() => {
        if (isLive) {
          live.disconnectServer();
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
      {isLive && (
        <span className={styles.PingLabel}>
          {live.ping != null ? formatPing(live.ping) : "Live"}
        </span>
      )}
    </button>
  );
}
