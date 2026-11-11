import {
  useDataSource,
  useMissionDisplayName,
  useMissionType,
  useMissionTypeDisplayName,
  useRecorderName,
  useRecordingDate,
  useServerDisplayName,
} from "../state/gameEntityStore";
import { selectPing, useLiveSelector } from "../state/liveConnectionStore";
import { useReplaySelector } from "../state/replayConnectionStore";
import { useRecording } from "./usePlayback";
import { useAppNavigation } from "./useAppNavigation";
import {
  LuCircleArrowOutUpLeft,
  LuClock,
  LuEye,
  LuUser,
  LuUsers,
} from "react-icons/lu";
import { MdVerified } from "react-icons/md";
import { PiCassetteTapeFill, PiGlobe } from "react-icons/pi";
import { useDemoLoad } from "../state/demoLoadStore";
import { publishedDemoFilename } from "../state/editableGame";
import { isMapGeniusDemo } from "../stream/demoIndex";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
import { useCaster } from "../state/casterStore";
import { WifiSignalIcon } from "./WifiSignalIcon";
import { IoCalendarNumberOutline } from "react-icons/io5";
import { isRelayRecording, parseDemoHeaderDate } from "../stream/demoDate";
import {
  findIndexedDemo,
  formatRecordedTime,
  recordedDayLabel,
} from "./demoFormat";
import { useDemoIndex } from "./useDemoIndex";
import { BiSolidEject } from "react-icons/bi";
import { FaArrowDown } from "react-icons/fa";
import { formatDelay, formatPing } from "../stringUtils";
import { lookupMissionType } from "../mission";
import { GameDetailsButton } from "./GameDetailsEditor";
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
  const gameTitle = useCaster(
    (state) => state.publishedGame?.presentation.title,
  );
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
  const recordingDate = useRecordingDate();
  const replay = useReplaySelector((s) => s.state);
  const dateString = replay ? replay.recordingDate : recordingDate;
  const dateRecorderName = replay ? (replay.recorderName ?? null) : playerName;
  const isLive = dataSource === "live";
  const isLiveServer = isLive && !replay;
  const ServerIcon = isLiveServer ? WifiSignalIcon : PiGlobe;
  const demoSourceUrl = useDemoLoad((s) => s.sourceUrl);
  // Prefer the indexed date and timezone policy. Without one, relay headers
  // use UTC; retail recordings keep their timezone-free clock as written.
  const { data: demos } = useDemoIndex();
  const indexedDemo = !replay
    ? findIndexedDemo(demos, demoSourceUrl)
    : undefined;
  const recordedIso =
    indexedDemo?.recordedAt ??
    (dateString && isRelayRecording(dateRecorderName)
      ? parseDemoHeaderDate(dateString)
      : null);
  const [datePart, timePart] = dateString
    ? dateString.split(" ")
    : [null, null];
  const recording = useRecording();
  const liveWatcher = useLiveSelector((s) => s.role === "watcher");
  const isWatcher = liveWatcher || replay !== null;
  const liveWatcherCount = useLiveSelector((s) => s.watcherCount);
  const watcherCount = replay?.watcherCount ?? liveWatcherCount;
  const relayRecording = useLiveSelector((s) => s.recording);
  const streamDelayMs = useLiveSelector((s) => s.streamDelayMs);
  const watchingDisabled = useLiveSelector(
    (s) => s.watchEndReason === "watchingDisabled",
  );
  const liveConnected = useLiveSelector(
    (s) =>
      s.gameStatus === "connected" ||
      s.gameStatus === "authenticating" ||
      (s.role === "watcher" &&
        s.watchStatus !== null &&
        s.watchStatus !== "ended"),
  );
  const isLiveConnected =
    liveConnected || (replay !== null && replay.status !== "ended");
  // Natural replay EOF remains a shared room until the creator closes it.
  const showSpectatorCount = replay
    ? !replay.closed
    : isLive && isLiveConnected && isWatcher;
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
  const hasRecorder = !isLive && !!playerName;
  const demoFilename = publishedDemoFilename(demoSourceUrl);
  const mapGeniusRecorder =
    hasRecorder &&
    !!demoFilename &&
    isMapGeniusDemo({ filename: demoFilename, recorder: playerName });
  const hasRecordingDate =
    (!isLive || replay !== null) && !!(recordedIso || dateString);

  const playerCount = useStreamSnapshot((s) => s?.playerRoster?.length);
  const showPlayerCount =
    (isLive ? isLiveConnected : dataSource === "demo") &&
    playerCount != null &&
    !!onOpenScoreScreen;

  // The right-side metadata column, omitted entirely when empty (e.g.
  // spectating and demo playback — the server line carries everything).
  const metadata = replay ? (
    <span className={styles.ReplayBadge}>Replay</span>
  ) : isLive ? (
    isLiveConnected ? (
      playerName && !isWatcher ? (
        <div className={styles.Attribution}>
          Connected as <span className={styles.PlayerName}>{playerName}</span>
        </div>
      ) : null
    ) : (
      <div className={styles.Error}>
        {watchingDisabled ? "Watching disabled" : "Disconnected"}
      </div>
    )
  ) : null;

  const navigation = useAppNavigation();

  return (
    <div className={styles.Header}>
      <div className={styles.MissionInfo}>
        <div className={styles.MissionLine}>
          {/* Some servers (mods) never report a game type — still show the
              mission name and just omit the type chip. */}
          {missionDisplayName ? (
            <span className={styles.MissionIdentity}>
              <span className={styles.MissionName}>{missionDisplayName}</span>
              {missionTypeLabel && (
                <span
                  className={styles.MissionType}
                  data-mission-type={missionTypeLabel}
                >
                  {missionTypeLabel}
                </span>
              )}
            </span>
          ) : null}
          {gameTitle && (
            <span className={styles.GameTitle} title={gameTitle}>
              {gameTitle}
            </span>
          )}
          <GameDetailsButton />
        </div>
        {serverName ||
        hasRecorder ||
        hasRecordingDate ||
        (replay && showSpectatorCount) ? (
          <div className={styles.ServerInfo}>
            {hasRecorder ? (
              <span className={styles.MetaItem}>
                {mapGeniusRecorder ? (
                  <MdVerified
                    className={styles.VerifiedRecorderIcon}
                    title="Recorded by MapGenius"
                    aria-hidden
                  />
                ) : (
                  <LuUser
                    className={styles.RecorderIcon}
                    title="Recorded by"
                    aria-hidden
                  />
                )}
                <span className={styles.PlayerName}>{playerName}</span>
              </span>
            ) : null}
            {serverName ? (
              <span className={styles.ServerItem}>
                <ServerIcon
                  className={styles.ServerIcon}
                  data-quality={isLiveServer ? pingQuality : undefined}
                  title={
                    isLiveServer && isLiveConnected && ping != null
                      ? `Connected – ${formatPing(ping)}`
                      : "Server"
                  }
                  aria-hidden
                />
                <span className={styles.ServerName}>{serverName}</span>
              </span>
            ) : null}
            {/* Live and demo both count the roster at the CURRENT stream
                time (the demo's roster tracks joins/drops through playback
                and seeks — not the sidecar's all-players-ever list). */}
            {showPlayerCount ? (
              <button
                type="button"
                className={styles.PlayersButton}
                title="Show scores (F2)"
                onClick={onOpenScoreScreen}
              >
                <LuUsers className={styles.PlayersIcon} aria-label="Players" />
                <span className={styles.PlayerCount}>{playerCount}</span>
              </button>
            ) : null}
            {showSpectatorCount ? (
              <span className={styles.MetaItem}>
                <LuEye
                  className={styles.SpectatorIcon}
                  aria-label="Spectators"
                  title={`${watcherCount} spectating`}
                />
                <span className={styles.SpectatorCount}>{watcherCount}</span>
              </span>
            ) : null}
            {isLive && isLiveConnected && relayRecording ? (
              <span
                className={styles.RecBadge}
                title="Demo saving is enabled for this mission"
              >
                <span className={styles.RecDot} aria-hidden /> REC
              </span>
            ) : null}
            {isLive && isLiveConnected && streamDelayMs > 0 ? (
              <span
                className={styles.DelayBadge}
                title="Tournament mode – this stream is delayed"
              >
                <LuClock className={styles.DelayIcon} aria-hidden />{" "}
                {formatDelay(streamDelayMs)} DELAY
              </span>
            ) : null}
            {hasRecordingDate ? (
              <span className={styles.RecordingDateItem}>
                <IoCalendarNumberOutline
                  className={styles.CalendarIcon}
                  title="Recorded on"
                  aria-hidden
                />
                <span className={styles.RecordingDate}>
                  {recordedIso
                    ? `${recordedDayLabel(recordedIso, indexedDemo?.recordedAtTimezone)} ${formatRecordedTime(recordedIso, indexedDemo?.recordedAtTimezone)}`
                    : `${datePart!.replace(/-/g, " ")} ${(timePart ?? "").replace(/(AM|PM)$/, " $1")}`}
                </span>
              </span>
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
          onClick={navigation.demoIndex}
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
          title={replay ? "Leave replay" : "Disconnect"}
          aria-label={replay ? "Leave replay" : "Disconnect"}
          onClick={replay ? navigation.demoIndex : navigation.disconnectServer}
          disabled={isWatcher ? false : !isLiveConnected}
        >
          <LuCircleArrowOutUpLeft />
        </button>
      ) : null}
    </div>
  );
}
