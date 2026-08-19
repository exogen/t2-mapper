import { useCallback } from "react";
import {
  useDataSource,
  useMissionDisplayName,
  useMissionType,
  useMissionTypeDisplayName,
  useRecorderName,
  useRecordingDate,
  useServerDisplayName,
} from "../state/gameEntityStore";
import { engineStore } from "../state/engineStore";
import {
  liveConnectionStore,
  selectPing,
  useLiveSelector,
} from "../state/liveConnectionStore";
import { useRecording } from "./usePlayback";
import { LuCircleArrowOutUpLeft, LuEye } from "react-icons/lu";
import { BiSolidEject } from "react-icons/bi";
import { formatPing } from "../stringUtils";
import styles from "./StreamingMissionInfo.module.css";

export function StreamingMissionInfo({
  hideActionButton = false,
}: {
  /** Suppress the trailing eject/disconnect button — used when the
   *  toolbar shows an Exit Command Circuit button in the same spot. */
  hideActionButton?: boolean;
} = {}) {
  const dataSource = useDataSource();
  const missionDisplayName = useMissionDisplayName();
  const missionType = useMissionType();
  const missionTypeDisplayName = useMissionTypeDisplayName();
  const serverName = useServerDisplayName();
  const playerName = useRecorderName();
  const dateString = useRecordingDate();
  const [datePart, timePart] = dateString
    ? dateString.split(" ")
    : [null, null];
  const isLive = dataSource === "live";
  const recording = useRecording();
  const isWatcher = useLiveSelector((s) => s.role === "watcher");
  const watcherCount = useLiveSelector((s) => s.watcherCount);
  const isLiveConnected = useLiveSelector(
    (s) =>
      s.gameStatus === "connected" ||
      s.gameStatus === "authenticating" ||
      (s.role === "watcher" &&
        s.watchStatus !== null &&
        s.watchStatus !== "ended"),
  );
  const ping = useLiveSelector(selectPing);

  const handleEject = useCallback(() => {
    engineStore.getState().setRecording(null);
  }, []);

  const handleDisconnect = useCallback(() => {
    const liveState = liveConnectionStore.getState();
    if (liveState.role === "watcher") {
      // Watchers detach from the shared session; the relay socket stays
      // open so the server list is warm for the next join.
      liveState.leaveServer();
    } else {
      liveState.disconnectServer();
    }
    engineStore.getState().setRecording(null);
  }, []);

  return (
    <div
      className={
        hideActionButton
          ? `${styles.Header} ${styles.HeaderBeforeAction}`
          : styles.Header
      }
    >
      <div className={styles.MissionInfo}>
        {missionDisplayName && missionType ? (
          <>
            <span className={styles.MissionName}>{missionDisplayName}</span>
            {missionType && (
              <>
                {" "}
                <span
                  className={styles.MissionType}
                  data-mission-type={missionType}
                >
                  {missionTypeDisplayName === "LCTF" ? "LCTF" : missionType}
                </span>
              </>
            )}
          </>
        ) : null}
      </div>
      {isLiveConnected && ping != null ? (
        <span
          className={styles.ConnectionPing}
          data-quality={ping < 150 ? "good" : ping < 300 ? "fine" : "poor"}
        >
          <span className={styles.PingDot} /> {formatPing(ping)}
        </span>
      ) : null}
      <div className={styles.Metadata}>
        {isLive ? (
          isLiveConnected ? (
            isWatcher ? (
              <div
                className={styles.Spectating}
                title={`${watcherCount} spectating`}
              >
                <span>Spectating</span>
                <LuEye aria-label="Spectators" />
                <span>{watcherCount}</span>
              </div>
            ) : playerName ? (
              <div className={styles.Attribution}>
                Connected as{" "}
                <span className={styles.PlayerName}>{playerName}</span>
              </div>
            ) : null
          ) : (
            <div className={styles.Error}>Disconnected</div>
          )
        ) : playerName && dateString ? (
          <div className={styles.Attribution}>
            Recorded by <span className={styles.PlayerName}>{playerName}</span>{" "}
            on{" "}
            <span className={styles.RecordingDate}>
              {datePart!.replace(/-/g, " ")}
            </span>{" "}
            at{" "}
            <span className={styles.RecordingDate}>
              {(timePart ?? "").replace(/(AM|PM)$/, " $1")}
            </span>
          </div>
        ) : null}
        {serverName ? (
          <div className={styles.ServerInfo}>
            Server: <span className={styles.ServerName}>{serverName}</span>
          </div>
        ) : null}
      </div>
      {hideActionButton ? null : dataSource === "demo" ? (
        <button
          type="button"
          className={styles.EjectButton}
          title="Unload demo"
          aria-label="Unload demo"
          onClick={handleEject}
          disabled={!recording}
        >
          <BiSolidEject className={styles.EjectIcon} />
        </button>
      ) : isLive || isWatcher ? (
        // Watchers get the button from the moment a session exists (before
        // dataSource flips to "live") and it's never disabled — leaving is
        // safe in every connection/loading state.
        <button
          type="button"
          className={styles.DisconnectButton}
          title="Disconnect"
          aria-label="Disconnect"
          onClick={handleDisconnect}
          disabled={isWatcher ? false : !isLiveConnected}
        >
          <LuCircleArrowOutUpLeft />
        </button>
      ) : null}
    </div>
  );
}
