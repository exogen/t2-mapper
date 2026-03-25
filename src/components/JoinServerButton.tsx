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

  const isLive = gameStatus === "connected";
  const isConnecting =
    gameStatus === "connecting" ||
    gameStatus === "challenging" ||
    gameStatus === "authenticating";

  return (
    <button
      type="button"
      className={styles.JoinServerButton}
      aria-label={isLive ? "Connected – click to disconnect" : "Join server"}
      title={isLive ? "Connected – click to disconnect" : "Join server"}
      data-connected={isLive}
      onClick={() => {
        cameraTourStore.getState().cancel();
        if (isLive) {
          disconnectServer();
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
