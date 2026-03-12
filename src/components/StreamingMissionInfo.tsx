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
  useLiveSelector,
} from "../state/liveConnectionStore";
import { useRecording } from "./RecordingProvider";
import { LuCircleArrowOutUpLeft } from "react-icons/lu";
import { BiSolidEject } from "react-icons/bi";
import styles from "./StreamingMissionInfo.module.css";

export function StreamingMissionInfo() {
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
  const isLiveConnected = useLiveSelector(
    (s) => s.gameStatus === "connected" || s.gameStatus === "authenticating",
  );

  const handleEject = useCallback(() => {
    engineStore.getState().setRecording(null);
  }, []);

  const handleDisconnect = useCallback(() => {
    const liveState = liveConnectionStore.getState();
    liveState.disconnectServer();
    liveState.disconnectRelay();
    engineStore.getState().setRecording(null);
  }, []);

  return (
    <div className={styles.Header}>
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
      <div className={styles.Metadata}>
        {isLive ? (
          playerName ? (
            <div className={styles.Attribution}>
              Connected as{" "}
              <span className={styles.PlayerName}>{playerName}</span>
            </div>
          ) : null
        ) : playerName && dateString ? (
          <div className={styles.Attribution}>
            Recorded by <span className={styles.PlayerName}>{playerName}</span>{" "}
            on{" "}
            <span className={styles.RecordingDate}>
              {datePart.replace(/-/g, " ")}
            </span>{" "}
            at <span className={styles.RecordingDate}>{timePart}</span>
          </div>
        ) : null}
        {serverName ? (
          <div className={styles.ServerInfo}>
            Server: <span className={styles.ServerName}>{serverName}</span>
          </div>
        ) : null}
      </div>
      {dataSource === "demo" ? (
        <button
          type="button"
          className={styles.ActionButton}
          title="Unload demo"
          aria-label="Unload demo"
          onClick={handleEject}
          disabled={!recording}
        >
          <BiSolidEject className={styles.EjectIcon} />
        </button>
      ) : isLive ? (
        <button
          type="button"
          className={styles.ActionButton}
          title="Disconnect"
          aria-label="Disconnect"
          onClick={handleDisconnect}
          disabled={!isLiveConnected}
        >
          <LuCircleArrowOutUpLeft />
        </button>
      ) : null}
    </div>
  );
}
