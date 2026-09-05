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
import {
  LuCircleArrowOutUpLeft,
  LuClock,
  LuEye,
  LuUser,
  LuUsers,
} from "react-icons/lu";
import { PiCassetteTapeFill } from "react-icons/pi";
import { useDemoLoad } from "../state/demoLoadStore";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
import { WifiSignalIcon } from "./WifiSignalIcon";
import { IoCalendarNumberOutline } from "react-icons/io5";
import { isRelayRecording, parseDemoHeaderDate } from "../stream/demoDate";
import { formatRecordedTime, recordedDayLabel } from "./demoFormat";
import { useDemoIndex } from "./useDemoIndex";
import { useDemoQueryState } from "./useQueryParams";
import { BiSolidEject } from "react-icons/bi";
import { FaArrowDown } from "react-icons/fa";
import { formatDelay, formatPing } from "../stringUtils";
import { lookupMissionType } from "../mission";
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
  // The display name (server-sent or demo $DemoValues) is known before
  // the gameClassName-derived short code and distinguishes mod types
  // (LCTF vs CTF). Prefer its known short code, then the derived code,
  // then the raw display name for mods neither source recognizes.
  const missionTypeLabel =
    (missionTypeDisplayName
      ? lookupMissionType(missionTypeDisplayName)
      : null) ??
    missionType ??
    missionTypeDisplayName;
  const serverName = useServerDisplayName();
  const playerName = useRecorderName();
  const dateString = useRecordingDate();
  const isLive = dataSource === "live";
  const demoSourceUrl = useDemoLoad((s) => s.sourceUrl);
  // When the demo was recorded, on a clock: the index entry's instant
  // for an indexed demo, or the header read as UTC for a relay recording
  // (a local upload of one). A retail client's header is the recorder's
  // own local time with no zone, so that one is shown as written.
  const [demoParam] = useDemoQueryState();
  const { data: demos } = useDemoIndex();
  const indexedAt =
    demoSourceUrl && demoParam
      ? demos?.find((d) => d.filename === demoParam)?.recordedAt
      : undefined;
  const recordedIso =
    indexedAt ??
    (dateString && isRelayRecording(playerName)
      ? parseDemoHeaderDate(dateString)
      : null);
  const [datePart, timePart] = dateString
    ? dateString.split(" ")
    : [null, null];
  const recording = useRecording();
  const isWatcher = useLiveSelector((s) => s.role === "watcher");
  const watcherCount = useLiveSelector((s) => s.watcherCount);
  const relayRecording = useLiveSelector((s) => s.recording);
  const streamDelayMs = useLiveSelector((s) => s.streamDelayMs);
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
              {missionTypeLabel && (
                <>
                  {" "}
                  <span
                    className={styles.MissionType}
                    data-mission-type={missionTypeLabel}
                  >
                    {missionTypeLabel}
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
                <WifiSignalIcon
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
            {/* Live and demo both count the roster at the CURRENT stream
                time (the demo's roster tracks joins/drops through playback
                and seeks — not the sidecar's all-players-ever list). */}
            {(isLive ? isLiveConnected : dataSource === "demo") &&
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
            {isLive && isLiveConnected && relayRecording ? (
              <span
                className={`${styles.RecBadge} ${styles.MetaGap}`}
                title="The relay is recording this session as a demo"
              >
                <span className={styles.RecDot} aria-hidden /> REC
              </span>
            ) : null}
            {isLive && isLiveConnected && streamDelayMs > 0 ? (
              <span
                className={`${styles.DelayBadge} ${styles.MetaGap}`}
                title="Tournament mode – this stream is delayed"
              >
                <LuClock className={styles.DelayIcon} aria-hidden />{" "}
                {formatDelay(streamDelayMs)} DELAY
              </span>
            ) : null}
            {hasRecordingInfo ? (
              <>
                <IoCalendarNumberOutline
                  className={`${styles.CalendarIcon} ${styles.MetaGap}`}
                  title="Recorded on"
                  aria-hidden
                />
                <span className={styles.RecordingDate}>
                  {recordedIso
                    ? `${recordedDayLabel(recordedIso)} ${formatRecordedTime(recordedIso)}`
                    : `${datePart!.replace(/-/g, " ")} ${(timePart ?? "").replace(/(AM|PM)$/, " $1")}`}
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
      {dataSource === "demo" && demoSourceUrl ? (
        <a
          className={styles.DemoDownloadButton}
          href={demoSourceUrl}
          download
          title="Download this demo (.rec)"
          aria-label="Download this demo (.rec)"
        >
          <PiCassetteTapeFill
            className={styles.DemoDownloadTapeIcon}
            aria-hidden
          />
          <FaArrowDown className={styles.DemoDownloadArrowIcon} aria-hidden />
        </a>
      ) : null}
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
