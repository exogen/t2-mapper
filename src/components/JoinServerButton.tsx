import { BsFillLightningChargeFill } from "react-icons/bs";
import { useLiveSelector } from "../state/liveConnectionStore";
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
          {isConnecting ? "Connecting…" : isLive ? "Connected" : "Join a game"}
        </span>
      </>
    </button>
  );
}
