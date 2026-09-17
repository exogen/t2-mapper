import {
  useState,
  useEffect,
  useCallback,
  Suspense,
  useRef,
  Activity,
  ReactNode,
  // ViewTransition,
} from "react";
import { type RootState } from "@react-three/fiber";
import { type InvalidateFunction } from "./ThreeCanvas";
import { InspectorControls } from "./InspectorControls";
import { MissionSelect } from "./MissionSelect";
import { DemoSelect } from "./DemoSelect";
import { StreamingMissionInfo } from "./StreamingMissionInfo";
import { ServerBrowserHeader } from "./ServerBrowserHeader";
import { ViewModeToggle } from "./ViewModeToggle";
import { useSettings } from "./SettingsProvider";
import { useDevicePixelRatio } from "./useDevicePixelRatio";
import { useAutoScoreScreen } from "./useAutoScoreScreen";
import { useRecording } from "./usePlayback";
import { useFeatures } from "./FeaturesProvider";
import {
  liveConnectionStore,
  useLiveSelector,
} from "../state/liveConnectionStore";
import { usePublicWindowAPI } from "./usePublicWindowAPI";
import {
  CurrentMission,
  useMissionQueryState,
  useModeQueryState,
  useNavigationQueryState,
  clearEndedServerQuery,
} from "./useQueryParams";
import { useAppNavigation } from "./useAppNavigation";
import { useNavigationSync } from "./useNavigationSync";
import { useCommandCircuitUrlSync } from "./useCommandCircuitUrlSync";
import {
  commandCircuitStore,
  useCommandCircuit,
} from "../state/commandCircuitStore";
import { WatchErrorDialog } from "./WatchErrorDialog";
import { DemoDropScreen } from "./DemoDropScreen";
import { statsStore, useStats } from "../state/statsStore";
import { InputProvider } from "./InputProducer";
import { VisualInput } from "./VisualInput";
import { WelcomeSplash } from "./WelcomeSplash";
import { MapCompass } from "./MapCompass";
import { LoadingIndicator } from "./LoadingIndicator";
import { StreamDelayNotice } from "./StreamDelayNotice";
import { CommentarySubtitles } from "./CommentarySubtitles";
import { unloadDemo } from "../stream/demoFileLoader";
import { isRetryableDisconnect, normalizeAddress } from "../../relay/shared";
import {
  isStreamingSource,
  useDataSource,
  useMissionName,
  useMissionType,
} from "../state/gameEntityStore";
import { useCameraTour } from "../state/cameraTourStore";
import { useMediaQuery } from "./useMediaQuery";
import { useTouchDevice } from "./useTouchDevice";
import { GameDialogSpinner } from "./GameDialogSpinner";
import { ToggleSidebarButton } from "./ToggleSidebarButton";
import { ExitTourButton } from "./ExitTourButton";
import { TargetFinder } from "./TargetFinder";
import { lazyNamed } from "./lazyNamed";
import styles from "./MapInspector.module.css";

function ViewTransition({ children }: { children: ReactNode }) {
  return children;
}

const GameView = lazyNamed("GameView", () => import("./GameView"));
const DemoPlaybackControls = lazyNamed(
  "DemoPlaybackControls",
  () => import("./DemoPlaybackControls"),
);
const PlayerHUD = lazyNamed("PlayerHUD", () => import("./PlayerHUD"));
const MapInfoDialog = lazyNamed(
  "MapInfoDialog",
  () => import("./MapInfoDialog"),
);
const ServerBrowser = lazyNamed(
  "ServerBrowser",
  () => import("./ServerBrowser"),
);
const ScoreScreen = lazyNamed("ScoreScreen", () => import("./ScoreScreen"));

export function MapInspector() {
  const [currentMission] = useMissionQueryState();
  const navigation = useAppNavigation();
  useNavigationSync();
  useCommandCircuitUrlSync();
  const features = useFeatures();
  const { clearFogEnabledOverride, renderScale, sidebarOpen, setSidebarOpen } =
    useSettings();
  // Standard render resolution: devicePixelRatio clamped to [1, 2] (what
  // r3f's default dpr of [1, 2] resolves to). The render-scale preference
  // is a fraction of this, so 100% matches the default exactly and the
  // stored fraction stays meaningful across monitors. The hook keeps it
  // live when the window moves to a display with a different ratio.
  const devicePixelRatio = useDevicePixelRatio();
  const renderDpr = Math.min(Math.max(devicePixelRatio, 1), 2) * renderScale;
  const { missionName, missionType } = currentMission;
  const [mapInfoOpen, setMapInfoOpen] = useState(false);
  const [scoreScreenOpen, setScoreScreenOpen] = useState(false);
  useAutoScoreScreen(setScoreScreenOpen);
  const [choosingMap, setChoosingMap] = useState(false);
  const [missionLoadingProgress, setMissionLoadingProgress] = useState(0);
  const [showLoadingIndicator, setShowLoadingIndicator] = useState(true);
  const isTouch = useTouchDevice();
  // Below this width the sidebar overlays the content area instead of
  // sitting beside it — keep in sync with MapInspector.module.css.
  const sidebarOverlayMode = useMediaQuery("(max-width: 899px)") ?? false;
  const isTourActive = useCameraTour((s) => s.animation !== null);

  const [mode] = useModeQueryState();

  // Welcome splash: shown over the default explore view when the URL
  // carried no explicit selection (no mission/mode/demo/join params) —
  // the visitor just landed on the bare app. Decided once after mount
  // (URL reads aren't SSR-safe) and dismissed by any real navigation.
  const [showSplash, setShowSplash] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (
      !params.has("mission") &&
      !params.has("mode") &&
      !params.has("demo") &&
      !params.has("address") &&
      !params.has("name")
    ) {
      setShowSplash(true);
    }
  }, []);
  const splashVisible = showSplash && mode === "map" && !choosingMap;

  const changeMission = useCallback(
    (mission: CurrentMission) => {
      clearFogEnabledOverride();
      // Picking a map is a real selection — retire the welcome splash.
      setShowSplash(false);
      // Exit command circuit — switching missions always starts at the
      // default camera view.
      navigation.selectMission(mission);
      setChoosingMap(false);
      if (isTouch) {
        setSidebarOpen(false);
      }
    },
    [clearFogEnabledOverride, navigation, isTouch, setSidebarOpen],
  );

  usePublicWindowAPI({ onChangeMission: changeMission });

  const recording = useRecording();
  const dataSource = useDataSource();

  const isCommandCircuit = useCommandCircuit((s) => s.active);
  const liveReady = useLiveSelector((s) => s.liveReady);

  // Starting a tour or opening the command circuit while the splash is
  // up counts as real navigation — retire it (it would otherwise float
  // over the tour/CC view, and its VisualInput swap hides their overlays).
  useEffect(() => {
    if (showSplash && (isTourActive || isCommandCircuit)) {
      setShowSplash(false);
    }
  }, [showSplash, isTourActive, isCommandCircuit]);

  // Enter command circuit once a freshly loaded stats file's mission is ready.
  // Gate on the entity store's mission name (set only after the mission
  // actually loads) rather than the URL param, which updates before loading
  // — activating too early loses to the dataSource kill-switch during the
  // mission transition. Only consume the flag once activation sticks.
  const statsPending = useStats((s) => s.pendingCommandCircuit);
  const loadedMissionName = useMissionName();
  useEffect(() => {
    if (!statsPending || dataSource !== "map") return;
    const data = statsStore.getState().data;
    if (
      data &&
      loadedMissionName &&
      data.missionName.toLowerCase() === loadedMissionName.toLowerCase()
    ) {
      commandCircuitStore.getState().activate();
      if (commandCircuitStore.getState().active) {
        statsStore.getState().clearPendingCommandCircuit();
      }
    }
  }, [statsPending, dataSource, loadedMissionName]);
  const hasStreamData = isStreamingSource(dataSource);

  // Streams no longer sync the ?mission param, so anything that names
  // the current mission must prefer the store's (stream-fed) values.
  const loadedMissionType = useMissionType();
  const effectiveMissionName = hasStreamData
    ? (loadedMissionName ?? "")
    : missionName;
  const effectiveMissionType = hasStreamData
    ? (loadedMissionType ?? undefined)
    : missionType;

  // Cancel "choosing map" when a new recording loads.
  useEffect(() => {
    if (recording) {
      setChoosingMap(false);
    }
  }, [recording]);

  // ── Live spectating (shared relay watch sessions) ──
  const watchStatus = useLiveSelector((s) => s.watchStatus);
  const watchStatusMessage = useLiveSelector((s) => s.watchStatusMessage);
  const catchupProgress = useLiveSelector((s) => s.catchupProgress);
  // The stream-delay notice owns the screen during tournament buffering;
  // its own spinner-free banner replaces the loading indicator (they clash).
  const streamDelayNoticeUp = useLiveSelector(
    (s) => s.streamDelayMs > 0 && s.streamDelayReadyAt != null,
  );
  const watchServer = useLiveSelector((s) => s.watchServer);
  const relayConnected = useLiveSelector((s) => s.relayConnected);
  const servers = useLiveSelector((s) => s.servers);
  const serversLoading = useLiveSelector((s) => s.serversLoading);
  const listServers = useLiveSelector((s) => s.listServers);
  const isWatcher = useLiveSelector((s) => s.role === "watcher");
  const serverAddress = useLiveSelector((s) => s.serverAddress);
  const disconnectReason = useLiveSelector((s) => s.disconnectReason);
  const sessionEstablished = useLiveSelector((s) => s.sessionEstablished);

  // Last joined address, surviving leaveServer's reset so the
  // disconnect dialog can offer Rejoin after a voluntary leave too.
  const [lastServerAddress, setLastServerAddress] = useState<string | null>(
    null,
  );
  useEffect(() => {
    if (serverAddress) setLastServerAddress(serverAddress);
  }, [serverAddress]);
  // Share links: ?address=ip:port joins that host directly; ?name=Server
  // joins the first exact name match from the server list.
  const [{ address: autoAddress, name: autoName }, setNavigationQuery] =
    useNavigationQueryState();

  const sessionActive = watchStatus !== null && watchStatus !== "ended";

  // Close any open dialogs when the session ends (leave/kick) so they
  // don't reappear on the next join.
  useEffect(() => {
    if (mode === "live" && !sessionActive) {
      setScoreScreenOpen(false);
      setMapInfoOpen(false);
    }
  }, [mode, sessionActive]);

  // Subscribe to store transitions directly: React may batch connecting
  // and ended into one render, or the toolbar may be hidden by Activity.
  useEffect(() => {
    let stopped = false;
    const unsubscribe = liveConnectionStore.subscribe((state, previous) => {
      if (
        (state.watchStatus === "ended" && previous.watchStatus !== "ended") ||
        (state.role === null && previous.role !== null)
      ) {
        // A synchronous rejection can arrive inside the navigation action,
        // before nuqs has committed that action's queued selection.
        queueMicrotask(() => {
          const current = liveConnectionStore.getState();
          if (
            stopped ||
            current.role !== state.role ||
            current.adapter !== state.adapter ||
            current.watchStatus !== state.watchStatus
          )
            return;
          void setNavigationQuery((query) =>
            clearEndedServerQuery(query, previous),
          );
        });
      }
    });
    return () => {
      stopped = true;
      unsubscribe();
    };
  }, [setNavigationQuery]);

  // ── Auto-spectate from a share link ──
  // One attempt per URL target. Back/forward navigation can select another
  // target; an ordinary re-render must never retry a failed join.
  const [autoJoin, setAutoJoin] = useState<
    "pending" | "joined" | "notFound" | "off"
  >(mode === "live" && (autoAddress || autoName) ? "pending" : "off");
  // Join-failure dialog dismissal; re-arms on the next session so a
  // later "session ended" failure gets its own transmission.
  const [errorAcknowledged, setErrorAcknowledged] = useState(false);
  useEffect(() => {
    if (sessionActive) setErrorAcknowledged(false);
  }, [sessionActive]);
  const autoTargetRef = useRef<{
    key: string;
    attempted: boolean;
    requestedList: boolean;
  } | null>(null);
  useEffect(() => {
    const target =
      mode !== "live"
        ? null
        : autoAddress
          ? `address:${autoAddress}`
          : autoName
            ? `name:${autoName}`
            : null;
    if (!target) {
      const current = liveConnectionStore.getState();
      if (
        mode === "live" &&
        autoTargetRef.current &&
        current.role === "watcher" &&
        current.watchStatus !== null &&
        current.watchStatus !== "ended"
      ) {
        // History navigation to the browser also detaches the active stream.
        current.leaveServer();
        unloadDemo();
      }
      autoTargetRef.current = null;
      setAutoJoin("off");
      return;
    }
    if (autoTargetRef.current?.key !== target) {
      autoTargetRef.current = {
        key: target,
        attempted: false,
        requestedList: false,
      };
      setErrorAcknowledged(false);
    }
    const attempt = autoTargetRef.current;
    if (attempt.attempted) return;
    const current = liveConnectionStore.getState();
    const address = autoAddress
      ? normalizeAddress(autoAddress)
      : servers.find((s) => s.name === autoName)?.address;
    if (
      current.role === "watcher" &&
      current.watchStatus !== null &&
      address === current.serverAddress
    ) {
      // A manual join may already have failed before this effect runs.
      // It is still an attempted selection, not a reason to join again.
      attempt.attempted = true;
      setAutoJoin("joined");
      if (current.watchStatus === "ended")
        void setNavigationQuery((query) =>
          clearEndedServerQuery(query, current),
        );
      return;
    }
    setAutoJoin("pending");
    if (address) {
      attempt.attempted = true;
      setAutoJoin("joined");
      unloadDemo();
      watchServer(address);
      return;
    }
    if (!relayConnected || (!attempt.requestedList && servers.length === 0)) {
      attempt.requestedList = true;
      listServers();
      return;
    }
    if (serversLoading) return;
    attempt.attempted = true;
    setAutoJoin("notFound");
  }, [
    mode,
    autoAddress,
    autoName,
    relayConnected,
    servers,
    serversLoading,
    listServers,
    watchServer,
    setNavigationQuery,
  ]);

  const handleWatch = useCallback(
    (address: string) => {
      setAutoJoin("off");
      setErrorAcknowledged(false);
      navigation.watchServer(address);
      setSidebarOpen(false);
    },
    [navigation, setSidebarOpen],
  );

  // Reveal the view when the stream goes live on touch devices.
  useEffect(() => {
    if (watchStatus === "live" && isTouch) {
      setSidebarOpen(false);
    }
  }, [watchStatus, isTouch, setSidebarOpen]);

  // Close the sidebar when a live server connection is established.
  const gameStatus = useLiveSelector((s) => s.gameStatus);
  useEffect(() => {
    if (gameStatus === "connected" && isTouch) {
      setSidebarOpen(false);
    }
  }, [gameStatus, isTouch, setSidebarOpen]);

  useEffect(() => {
    if (recording && isTouch) {
      setSidebarOpen(false);
    }
  }, [isTouch, recording, setSidebarOpen]);

  useEffect(() => {
    if (isTourActive && isTouch) {
      setSidebarOpen(false);
    }
  }, [isTouch, isTourActive, setSidebarOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Backslash" && (e.metaKey || e.ctrlKey)) {
        e.stopPropagation();
        e.preventDefault();
        setSidebarOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [setSidebarOpen]);

  // Watch sessions load until the catch-up stream is live; map mode
  // tracks mission loading; demo mode starts blank (nothing to load).
  const watchConnecting =
    sessionActive && !(watchStatus === "live" && liveReady);
  const loadingProgress = sessionActive
    ? watchStatus === "syncing"
      ? catchupProgress
      : null
    : missionLoadingProgress;
  const isLoading = sessionActive
    ? watchConnecting
    : mode === "map"
      ? missionLoadingProgress < 1
      : false;

  const loadingIndicatorUp = showLoadingIndicator && !streamDelayNoticeUp;

  // Keep the loading indicator visible briefly after reaching 100%
  useEffect(() => {
    if (isLoading) {
      setShowLoadingIndicator(true);
    } else {
      const timer = setTimeout(() => setShowLoadingIndicator(false), 500);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  const handleLoadingChange = useCallback(
    (_loading: boolean, progress: number = 0) => {
      setMissionLoadingProgress(progress);
    },
    [],
  );

  const invalidateRef = useRef<InvalidateFunction | null>(null);

  const handleOpenMapInfo = useCallback(() => setMapInfoOpen(true), []);
  const handleOpenScoreScreen = useCallback(() => setScoreScreenOpen(true), []);
  // The Live sidebar button enters live mode: the content area swaps to
  // the server selector (no modal). Any active recording or dead live
  // view is cleared so the app isn't playing a demo (or holding a stale
  // frame) behind the join screen — leaveServer also resets an ended
  // session's status so its message doesn't resurface as a join error.
  const handleOpenServerBrowser = useCallback(() => {
    setAutoJoin("off");
    setErrorAcknowledged(false);
    navigation.serverBrowser();
    setChoosingMap(false);
    // When the sidebar overlays the content it would hide the server
    // browser it just opened; in side-by-side mode leave it be.
    if (sidebarOverlayMode) setSidebarOpen(false);
  }, [navigation, sidebarOverlayMode, setSidebarOpen]);

  // The Demo sidebar button enters demo mode: the content area swaps to
  // the drag & drop screen, clearing any live session or loaded stream.
  const handleEnterDemoMode = useCallback(() => {
    navigation.demoIndex();
    setChoosingMap(false);
    // Same as the server browser: don't leave the drop screen hidden
    // behind the overlay sidebar.
    if (sidebarOverlayMode) setSidebarOpen(false);
  }, [navigation, sidebarOverlayMode, setSidebarOpen]);
  const handleChooseMap = useCallback(() => setChoosingMap(true), []);
  const handleCancelChoosingMap = useCallback(() => {
    setChoosingMap(false);
  }, []);
  const handleCanvasCreated = useCallback((state: RootState) => {
    invalidateRef.current = state.invalidate;
  }, []);

  // Live mode without an active session — and without leftover stream
  // data: the content area shows the server selector (or the share-link
  // auto-join / failure states leading to it) instead of the 3D view.
  // A session that ENDS (kick, server gone) keeps rendering its last
  // frame with "Disconnected" in the toolbar; clicking Live again clears
  // the stream and lands here.
  const showJoinScreen = mode === "live" && !sessionActive && !hasStreamData;

  // Demo mode without a recording: the content area shows the drag &
  // drop landing instead of an empty 3D view.
  const showDemoScreen = mode === "demo" && !recording && !hasStreamData;

  // A session that ended — kicked, server gone, or a voluntary
  // disconnect — keeps the last frame rendered and offers rejoin/browse
  // in the failure dialog (Escape dismisses to the frozen view). Player
  // connections aren't watch sessions, so they must be excluded here.
  const showDisconnectDialog =
    mode === "live" &&
    !sessionActive &&
    gameStatus !== "connected" &&
    hasStreamData &&
    !errorAcknowledged;
  // Rejoin only makes sense when there's a session worth resuming: a
  // voluntary leave, or a drop after we actually reached the server.
  // A failed probe / name lookup never connected, so it offers no Rejoin.
  const canRejoin = disconnectReason === "voluntary" || sessionEstablished;
  const rejoinAddress = serverAddress ?? lastServerAddress;
  // A refusal the server itself calls temporary (mission cycling) is
  // worth another try even though the session never established.
  const retryAddress =
    !canRejoin && isRetryableDisconnect(watchStatusMessage ?? undefined)
      ? rejoinAddress
      : null;
  const joinErrorMessage = !showJoinScreen ? null : autoJoin === "notFound" ? (
    <>No server named &ldquo;{autoName}&rdquo; is currently listed.</>
  ) : watchStatus === "ended" && watchStatusMessage ? (
    watchStatusMessage
  ) : null;

  return (
    <main className={styles.Frame}>
      <>
        <header className={styles.Toolbar}>
          <ToggleSidebarButton
            orientation="top"
            isOpen={sidebarOpen}
            onClick={() => {
              setSidebarOpen((open) => !open);
            }}
          />
          <ToggleSidebarButton
            orientation="left"
            isOpen={sidebarOpen}
            onClick={() => {
              setSidebarOpen((open) => !open);
            }}
          />
          {/* Live sessions show the streaming header from the moment the
              join starts (status + disconnect), not just once stream data
              arrives — matching the dedicated watch page's behavior. */}
          <Activity
            mode={
              (hasStreamData || sessionActive) && !choosingMap
                ? "visible"
                : "hidden"
            }
          >
            <StreamingMissionInfo onOpenScoreScreen={handleOpenScoreScreen} />
          </Activity>
          <Activity
            mode={
              (!(hasStreamData || sessionActive) && !showJoinScreen) ||
              choosingMap
                ? "visible"
                : "hidden"
            }
          >
            {mode === "demo" && !choosingMap ? (
              <DemoSelect />
            ) : (
              <MissionSelect
                value={choosingMap || mode !== "map" ? "" : missionName}
                missionType={
                  choosingMap || mode !== "map" ? "" : (missionType ?? "")
                }
                onChange={changeMission}
                autoFocus={choosingMap}
                onCancel={handleCancelChoosingMap}
              />
            )}
          </Activity>
          {showJoinScreen && !choosingMap && <ServerBrowserHeader />}
          {isTourActive && <ExitTourButton />}
          {dataSource != null && (
            <ViewModeToggle
              className={
                isTourActive
                  ? styles.ViewModeToggleAfterButton
                  : styles.ViewModeToggle
              }
            />
          )}
        </header>
        {sidebarOpen ? <div className={styles.Backdrop} /> : null}
        <Activity mode={sidebarOpen ? "visible" : "hidden"}>
          <div className={styles.Sidebar} data-open={sidebarOpen}>
            <InspectorControls
              missionName={effectiveMissionName}
              missionType={effectiveMissionType}
              choosingMap={choosingMap}
              onChangeMission={changeMission}
              invalidateRef={invalidateRef}
              onOpenMapInfo={handleOpenMapInfo}
              onOpenScoreScreen={
                hasStreamData ? handleOpenScoreScreen : undefined
              }
              onOpenServerBrowser={
                features.live ? handleOpenServerBrowser : undefined
              }
              onEnterDemoMode={handleEnterDemoMode}
              onChooseMap={handleChooseMap}
              onCancelChoosingMap={handleCancelChoosingMap}
              onClose={() => {
                setSidebarOpen(false);
              }}
            />
          </div>
        </Activity>
        <InputProvider>
          <div className={styles.Content}>
            {showJoinScreen ? (
              autoJoin === "pending" ? (
                <LoadingIndicator isLoading progress={null} />
              ) : joinErrorMessage != null && !errorAcknowledged ? (
                <WatchErrorDialog
                  message={joinErrorMessage}
                  // This dialog only appears with no stream data, i.e. a
                  // connection that never established (probe fail, failed
                  // ?name lookup) — so Rejoin is offered only in the rare
                  // case we did reach the server before landing here.
                  onRejoin={
                    canRejoin && autoJoin !== "notFound" && rejoinAddress
                      ? () => handleWatch(rejoinAddress)
                      : undefined
                  }
                  onRetry={
                    retryAddress && autoJoin !== "notFound"
                      ? () => handleWatch(retryAddress)
                      : undefined
                  }
                  onBrowse={handleOpenServerBrowser}
                />
              ) : (
                <Suspense fallback={<GameDialogSpinner contained />}>
                  <ServerBrowser
                    joinLabel="Join game"
                    showWarriorField={false}
                    onJoin={handleWatch}
                  />
                </Suspense>
              )
            ) : showDemoScreen ? (
              <DemoDropScreen />
            ) : (
              <>
                <div className={styles.ThreeView}>
                  <Suspense>
                    <GameView
                      missionName={mode === "map" ? missionName : ""}
                      missionType={missionType}
                      spectator={isWatcher}
                      dpr={
                        mapInfoOpen || scoreScreenOpen || showDisconnectDialog
                          ? 0.25
                          : renderDpr
                      }
                      onCreated={handleCanvasCreated}
                      onLoadingChange={handleLoadingChange}
                    />
                  </Suspense>
                </div>
                {hasStreamData && !scoreScreenOpen ? (
                  <Suspense>
                    <PlayerHUD />
                  </Suspense>
                ) : null}
                {dataSource === "map" && !splashVisible ? <MapCompass /> : null}
                {splashVisible ? (
                  <WelcomeSplash
                    onWatchDemos={handleEnterDemoMode}
                    onWatchLive={
                      features.live ? handleOpenServerBrowser : undefined
                    }
                    onDismiss={() => setShowSplash(false)}
                    // The splash takes the indicator over rather than
                    // letting it show through the panel.
                    loading={
                      loadingIndicatorUp
                        ? { isLoading, progress: loadingProgress }
                        : null
                    }
                  />
                ) : (
                  <VisualInput />
                )}
                {loadingIndicatorUp && !splashVisible && (
                  <LoadingIndicator
                    id="loadingIndicator"
                    isLoading={isLoading}
                    progress={loadingProgress}
                  />
                )}
                <StreamDelayNotice />
                {hasStreamData &&
                (recording?.source === "demo" || isWatcher) &&
                !mapInfoOpen &&
                !scoreScreenOpen &&
                !showDisconnectDialog ? (
                  <TargetFinder key={`${dataSource}:${effectiveMissionName}`} />
                ) : null}
                {recording?.source === "demo" ? <CommentarySubtitles /> : null}
                {showDisconnectDialog ? (
                  <WatchErrorDialog
                    // A voluntary leave isn't an error — say so plainly.
                    title={
                      disconnectReason === "voluntary"
                        ? "Transmission ended"
                        : "Uplink failure"
                    }
                    message={
                      disconnectReason === "voluntary"
                        ? "Uplink to the server closed. The wilderzone awaits your return."
                        : (watchStatusMessage ??
                          "Connection to the server was lost.")
                    }
                    onRejoin={
                      canRejoin && rejoinAddress
                        ? () => handleWatch(rejoinAddress)
                        : undefined
                    }
                    onRetry={
                      retryAddress ? () => handleWatch(retryAddress) : undefined
                    }
                    onBrowse={handleOpenServerBrowser}
                    onDismiss={() => setErrorAcknowledged(true)}
                  />
                ) : null}
              </>
            )}
          </div>
        </InputProvider>
        <footer className={styles.PlayerBar}>
          {recording?.source === "demo" ? (
            <Suspense>
              <DemoPlaybackControls />
            </Suspense>
          ) : null}
        </footer>
        {mapInfoOpen ? (
          <ViewTransition>
            <Suspense
              fallback={
                <GameDialogSpinner onClose={() => setMapInfoOpen(false)} />
              }
            >
              <MapInfoDialog
                onClose={() => setMapInfoOpen(false)}
                missionName={effectiveMissionName}
                missionType={effectiveMissionType ?? ""}
              />
            </Suspense>
          </ViewTransition>
        ) : null}
        {scoreScreenOpen ? (
          <ViewTransition>
            <Suspense
              fallback={
                <GameDialogSpinner onClose={() => setScoreScreenOpen(false)} />
              }
            >
              <ScoreScreen onClose={() => setScoreScreenOpen(false)} />
            </Suspense>
          </ViewTransition>
        ) : null}
      </>
    </main>
  );
}
