"use client";
import {
  useState,
  useEffect,
  useCallback,
  Suspense,
  useRef,
  lazy,
  Activity,
  ReactNode,
  // ViewTransition,
} from "react";
import { type RootState } from "@react-three/fiber";
import { type InvalidateFunction } from "@/src/components/ThreeCanvas";
import { InspectorControls } from "@/src/components/InspectorControls";
import { MissionSelect } from "@/src/components/MissionSelect";
import { DemoSelect } from "@/src/components/DemoSelect";
import { StreamingMissionInfo } from "@/src/components/StreamingMissionInfo";
import { ServerBrowserHeader } from "@/src/components/ServerBrowserHeader";
import { ViewModeToggle } from "@/src/components/ViewModeToggle";
import { useSettings } from "@/src/components/SettingsProvider";
import { useAutoScoreScreen } from "@/src/components/useAutoScoreScreen";
import { useRecording } from "@/src/components/usePlayback";
import { useFeatures } from "@/src/components/FeaturesProvider";
import {
  liveConnectionStore,
  useLiveSelector,
} from "@/src/state/liveConnectionStore";
import { usePublicWindowAPI } from "@/src/components/usePublicWindowAPI";
import {
  CurrentMission,
  useMissionQueryState,
  useModeQueryState,
  useViewQueryState,
} from "@/src/components/useQueryParams";
import { useQueryState } from "nuqs";
import {
  commandCircuitStore,
  useCommandCircuit,
} from "../state/commandCircuitStore";
import { WatchErrorDialog } from "./WatchErrorDialog";
import { DemoDropScreen } from "./DemoDropScreen";
import { statsStore, useStats } from "../state/statsStore";
import { InputProvider } from "./InputProducer";
import { VisualInput } from "./VisualInput";
import { MapCompass } from "./MapCompass";
import { LoadingIndicator } from "./LoadingIndicator";
import { StreamDelayNotice } from "./StreamDelayNotice";
import { engineStore } from "../state/engineStore";
import {
  gameEntityStore,
  isStreamingSource,
  useDataSource,
  useMissionName,
  useMissionType,
} from "../state/gameEntityStore";
import { cameraTourStore, useCameraTour } from "../state/cameraTourStore";
import { useMediaQuery } from "./useMediaQuery";
import { useTouchDevice } from "./useTouchDevice";
import { GameDialogSpinner } from "./GameDialogSpinner";
import { ToggleSidebarButton } from "./ToggleSidebarButton";
import { ExitTourButton } from "./ExitTourButton";
import styles from "./MapInspector.module.css";

function ViewTransition({ children }: { children: ReactNode }) {
  return children;
}

function createLazy(
  name: string,
  loader: () => Promise<{
    [name]: React.ComponentType<any>;
  }>,
) {
  return lazy(() => loader().then((mod) => ({ default: mod[name] })));
}

const GameView = createLazy(
  "GameView",
  () => import("@/src/components/GameView"),
);
const DemoPlaybackControls = createLazy(
  "DemoPlaybackControls",
  () => import("@/src/components/DemoPlaybackControls"),
);
const PlayerHUD = createLazy(
  "PlayerHUD",
  () => import("@/src/components/PlayerHUD"),
);
const MapInfoDialog = createLazy(
  "MapInfoDialog",
  () => import("@/src/components/MapInfoDialog"),
);
const ServerBrowser = createLazy(
  "ServerBrowser",
  () => import("@/src/components/ServerBrowser"),
);
const ScoreScreen = createLazy(
  "ScoreScreen",
  () => import("@/src/components/ScoreScreen"),
);

export function MapInspector() {
  const [currentMission, setCurrentMission] = useMissionQueryState();
  const features = useFeatures();
  const { clearFogEnabledOverride, sidebarOpen, setSidebarOpen } =
    useSettings();
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

  const [mode, setMode] = useModeQueryState();
  const [view, setView] = useViewQueryState();

  const changeMission = useCallback(
    (mission: CurrentMission) => {
      window.location.hash = "";
      clearFogEnabledOverride();
      // Exit command circuit — switching missions always starts at the
      // default camera view.
      setView(null);
      setMode("map");
      commandCircuitStore.getState().deactivate();
      setChoosingMap(false);
      cameraTourStore.getState().cancel();
      // Leave any live session and close the relay socket — map mode
      // has no use for it. (leaveServer first so the detach message
      // goes out before the close.)
      const liveState = liveConnectionStore.getState();
      liveState.leaveServer();
      liveState.disconnectRelay();
      engineStore.getState().setRecording(null);
      gameEntityStore.getState().endStreaming();
      setCurrentMission(mission);
      if (isTouch) {
        setSidebarOpen(false);
      }
    },
    [
      clearFogEnabledOverride,
      setView,
      setMode,
      setCurrentMission,
      isTouch,
      setSidebarOpen,
    ],
  );

  usePublicWindowAPI({ onChangeMission: changeMission });

  const recording = useRecording();
  const dataSource = useDataSource();

  // ── Command circuit view in the URL ──
  // A shared ?view=cc link opens the command map once the current mode's
  // data is ready — activate() is a no-op before then. After the pending
  // restore is consumed, the param mirrors whether the command map is
  // open, so copying the URL always brings the current view along.
  const isCommandCircuit = useCommandCircuit((s) => s.active);
  const liveReady = useLiveSelector((s) => s.liveReady);
  const ccRestorePendingRef = useRef(view === "cc");
  useEffect(() => {
    if (!ccRestorePendingRef.current) return;
    const ready =
      dataSource === "map" ||
      dataSource === "demo" ||
      (dataSource === "live" && liveReady);
    if (!ready) return;
    ccRestorePendingRef.current = false;
    commandCircuitStore.getState().activate();
  }, [dataSource, liveReady]);
  useEffect(() => {
    // Leave the param alone until the pending restore has consumed it.
    if (ccRestorePendingRef.current) return;
    setView(isCommandCircuit ? "cc" : null);
  }, [isCommandCircuit, setView]);

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

  // Keep ?mode= in sync when a demo loads (drag/drop or the sidebar
  // button work from any mode).
  useEffect(() => {
    if (recording?.source === "demo") {
      setMode("demo");
    }
  }, [recording, setMode]);

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
  const [autoAddress, setAddressParam] = useQueryState("address");
  const [autoName, setNameParam] = useQueryState("name");

  // The share-link params only make sense in live mode.
  useEffect(() => {
    if (mode !== "live") {
      if (autoAddress != null) setAddressParam(null);
      if (autoName != null) setNameParam(null);
    }
  }, [mode, autoAddress, autoName, setAddressParam, setNameParam]);

  // The mission param belongs to map mode only. (The parsed value can't
  // signal absence — it has a default — so check the URL directly.)
  useEffect(() => {
    if (mode === "map") return;
    if (new URLSearchParams(window.location.search).has("mission")) {
      setCurrentMission(null);
    }
  }, [mode, setCurrentMission]);

  const sessionActive = watchStatus !== null && watchStatus !== "ended";

  // Close any open dialogs when the session ends (leave/kick) so they
  // don't reappear on the next join.
  useEffect(() => {
    if (mode === "live" && !sessionActive) {
      setScoreScreenOpen(false);
      setMapInfoOpen(false);
    }
  }, [mode, sessionActive]);

  // When a session ends (leave/kick), the share-link params no longer
  // describe the page — drop them. Only on the active→inactive edge so
  // share links still auto-join on a fresh load.
  const prevSessionActiveRef = useRef(false);
  useEffect(() => {
    if (prevSessionActiveRef.current && !sessionActive) {
      setNameParam(null);
      setAddressParam(null);
    }
    prevSessionActiveRef.current = sessionActive;
  }, [sessionActive, setNameParam, setAddressParam]);

  // ── Auto-spectate from a share link ──
  // One attempt per page load: after a manual leave (or a failed match)
  // the normal server browser takes over.
  const [autoJoin, setAutoJoin] = useState<
    "pending" | "joined" | "notFound" | "off"
  >(mode === "live" && (autoAddress || autoName) ? "pending" : "off");
  // Join-failure dialog dismissal; re-arms on the next session so a
  // later "session ended" failure gets its own transmission.
  const [errorAcknowledged, setErrorAcknowledged] = useState(false);
  useEffect(() => {
    if (sessionActive) setErrorAcknowledged(false);
  }, [sessionActive]);
  const requestedListRef = useRef(false);
  useEffect(() => {
    // Only attempt in live mode — leaving suspends a pending attempt.
    if (autoJoin !== "pending" || sessionActive || mode !== "live") return;
    // The params are cleared outside live mode and when a session ends;
    // a pending attempt with nothing to join simply disarms.
    if (!autoAddress && !autoName) {
      setAutoJoin("off");
      return;
    }
    // listServers() lazily connects the relay and is in-flight-guarded;
    // it also warms the cached list the relay uses to label sessions.
    if (!relayConnected) {
      requestedListRef.current = true;
      listServers();
      return;
    }
    if (autoAddress) {
      setAutoJoin("joined");
      watchServer(autoAddress);
      return;
    }
    // Name mode needs the list; wait for a completed query (one request
    // per attempt — an empty result means there's nothing to match).
    if (serversLoading) return;
    if (servers.length === 0) {
      if (!requestedListRef.current) {
        requestedListRef.current = true;
        listServers();
        return;
      }
      setAutoJoin("notFound");
      return;
    }
    const match = servers.find((sv) => sv.name === autoName);
    if (match) {
      setAutoJoin("joined");
      watchServer(match.address);
    } else {
      setAutoJoin("notFound");
    }
  }, [
    autoJoin,
    sessionActive,
    mode,
    autoAddress,
    autoName,
    relayConnected,
    servers,
    serversLoading,
    listServers,
    watchServer,
  ]);

  const handleWatch = useCallback(
    (address: string) => {
      watchServer(address);
      setMode("live");
      // Joining from the server browser always starts with the sidebar
      // closed (auto-join links keep the persisted preference).
      setSidebarOpen(false);
      // Reflect the joined server in the URL so the link is shareable
      // (nuqs updates via history.replaceState — no reload). Prefer the
      // friendly ?name= form; fall back to ?address= when the name is
      // ambiguous (or unknown) in the current list.
      const server = servers.find((sv) => sv.address === address);
      const nameIsUnique =
        server != null &&
        servers.filter((sv) => sv.name === server.name).length === 1;
      if (server && nameIsUnique) {
        setNameParam(server.name);
        setAddressParam(null);
      } else {
        setAddressParam(address);
        setNameParam(null);
      }
    },
    [
      servers,
      watchServer,
      setMode,
      setSidebarOpen,
      setAddressParam,
      setNameParam,
    ],
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
    liveConnectionStore.getState().leaveServer();
    engineStore.getState().setRecording(null);
    gameEntityStore.getState().endStreaming();
    commandCircuitStore.getState().deactivate();
    setChoosingMap(false);
    setMode("live");
    // When the sidebar overlays the content it would hide the server
    // browser it just opened; in side-by-side mode leave it be.
    if (sidebarOverlayMode) setSidebarOpen(false);
  }, [setMode, sidebarOverlayMode, setSidebarOpen]);

  // The Demo sidebar button enters demo mode: the content area swaps to
  // the drag & drop screen, clearing any live session or loaded stream.
  const handleEnterDemoMode = useCallback(() => {
    // Leave any live session and close the relay socket — demo mode has
    // no use for it.
    const liveState = liveConnectionStore.getState();
    liveState.leaveServer();
    liveState.disconnectRelay();
    engineStore.getState().setRecording(null);
    gameEntityStore.getState().endStreaming();
    commandCircuitStore.getState().deactivate();
    setChoosingMap(false);
    setMode("demo");
    // Same as the server browser: don't leave the drop screen hidden
    // behind the overlay sidebar.
    if (sidebarOverlayMode) setSidebarOpen(false);
  }, [setMode, sidebarOverlayMode, setSidebarOpen]);
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
                  onRejoin={(() => {
                    if (!canRejoin || autoJoin === "notFound") return undefined;
                    const address = serverAddress ?? lastServerAddress;
                    return address ? () => handleWatch(address) : undefined;
                  })()}
                  onBrowse={() => setErrorAcknowledged(true)}
                />
              ) : (
                <Suspense fallback={<GameDialogSpinner />}>
                  <ServerBrowser
                    joinLabel="Join Game"
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
                          : undefined
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
                {dataSource === "map" ? <MapCompass /> : null}
                <VisualInput />
                {showLoadingIndicator && !streamDelayNoticeUp && (
                  <LoadingIndicator
                    id="loadingIndicator"
                    isLoading={isLoading}
                    progress={loadingProgress}
                  />
                )}
                <StreamDelayNotice />
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
                    onRejoin={(() => {
                      if (!canRejoin) return undefined;
                      const address = serverAddress ?? lastServerAddress;
                      return address ? () => handleWatch(address) : undefined;
                    })()}
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
