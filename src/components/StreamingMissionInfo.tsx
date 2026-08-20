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
import { unloadDemo } from "../stream/demoFileLoader";
import { LuCircleArrowOutUpLeft, LuEye, LuUser, LuUsers } from "react-icons/lu";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
import { IoIosWifi } from "react-icons/io";
import { IoCalendarNumberOutline } from "react-icons/io5";
import { BiSolidEject } from "react-icons/bi";
import { formatPing } from "../stringUtils";
import styles from "./StreamingMissionInfo.module.css";

export function StreamingMissionInfo({
  onOpenScoreScreen,
}: {
  onOpenScoreScreen?: () => void;
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

  const pingQuality =
    isLiveConnected && ping != null
      ? ping < 150
        ? "good"
        : ping < 300
          ? "fine"
          : "poor"
      : undefined;

  // Demo recording attribution pieces, shown on the server line.
  const hasRecordingInfo = !isLive && !!playerName && !!dateString;

  const playerCount = useStreamSnapshot((s) => s?.playerRoster?.length);

  // The right-side metadata column, omitted entirely when empty (e.g.
  // spectating and demo playback — the server line carries everything).
  const metadata = isLive ? (
    isLiveConnected ? (
      playerName && !isWatcher ? (
        <div className={styles.Attribution}>
          Connected as <span className={styles.PlayerName}>{playerName}</span>
        </div>
      ) : null
    ) : (
      <div className={styles.Error}>Disconnected</div>
    )
  ) : null;

  const handleEject = useCallback(() => {
    unloadDemo();
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
    <div className={styles.Header}>
      <div className={styles.MissionInfo}>
        <div className={styles.MissionLine}>
          {/* Some servers (mods) never report a game type — still show the
              mission name and just omit the type chip. */}
          {missionDisplayName ? (
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
        {serverName || hasRecordingInfo ? (
          <div className={styles.ServerInfo}>
            {hasRecordingInfo ? (
              <>
                <LuUser
                  className={styles.RecorderIcon}
                  title="Recorded by"
                  aria-hidden
                />
                <span className={styles.PlayerName}>{playerName}</span>
              </>
            ) : null}
            {serverName ? (
              <>
                <IoIosWifi
                  className={
                    hasRecordingInfo
                      ? `${styles.ServerIcon} ${styles.MetaGap}`
                      : styles.ServerIcon
                  }
                  data-quality={pingQuality}
                  title={
                    isLiveConnected && ping != null
                      ? `Connected – ${formatPing(ping)}`
                      : "Server"
                  }
                  aria-hidden
                />
                <span className={styles.ServerName}>{serverName}</span>
              </>
            ) : null}
            {isLive &&
            isLiveConnected &&
            playerCount != null &&
            onOpenScoreScreen ? (
              <button
                type="button"
                className={styles.PlayersButton}
                title="Show scores"
                onClick={onOpenScoreScreen}
              >
                <LuUsers className={styles.PlayersIcon} aria-label="Players" />
                <span className={styles.PlayerCount}>{playerCount}</span>
              </button>
            ) : null}
            {isLive && isLiveConnected && isWatcher ? (
              <>
                <LuEye
                  className={`${styles.SpectatorIcon} ${styles.MetaGap}`}
                  aria-label="Spectators"
                  title={`${watcherCount} spectating`}
                />
                <span className={styles.SpectatorCount}>{watcherCount}</span>
              </>
            ) : null}
            {hasRecordingInfo ? (
              <>
                <IoCalendarNumberOutline
                  className={`${styles.CalendarIcon} ${styles.MetaGap}`}
                  title="Recorded on"
                  aria-hidden
                />
                <span className={styles.RecordingDate}>
                  {datePart!.replace(/-/g, " ")}{" "}
                  {(timePart ?? "").replace(/(AM|PM)$/, " $1")}
                </span>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
      {isLiveConnected && ping != null ? (
        <span className={styles.ConnectionPing} data-quality={pingQuality}>
          <span className={styles.PingDot} /> {formatPing(ping)}
        </span>
      ) : null}
      {metadata ? <div className={styles.Metadata}>{metadata}</div> : null}
      {dataSource === "demo" ? (
        <button
          type="button"
          className={styles.EjectButton}
          title="Eject demo"
          aria-label="Eject demo"
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
