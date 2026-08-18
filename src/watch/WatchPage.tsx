"use client";
import {
  Activity,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useQueryState } from "nuqs";
import { type RootState } from "@react-three/fiber";
import { type InvalidateFunction } from "@/src/components/ThreeCanvas";
import { InspectorControls } from "@/src/components/InspectorControls";
import { StreamingMissionInfo } from "@/src/components/StreamingMissionInfo";
import { ToggleSidebarButton } from "@/src/components/ToggleSidebarButton";
import { ExitCommandCircuitButton } from "@/src/components/ExitCommandCircuitButton";
import { GameDialogSpinner } from "@/src/components/GameDialogSpinner";
import { useSettings } from "@/src/components/SettingsProvider";
import { useTouchDevice } from "@/src/components/useTouchDevice";
import { useCommandCircuit } from "@/src/state/commandCircuitStore";
import { useLiveSelector } from "@/src/state/liveConnectionStore";
import { useMissionName, useMissionType } from "@/src/state/gameEntityStore";
import { InputProvider } from "@/src/components/InputProducer";
import { VisualInput } from "@/src/components/VisualInput";
import { LoadingIndicator } from "@/src/components/LoadingIndicator";
import { useAutoScoreScreen } from "@/src/components/useAutoScoreScreen";
import { startShapePreload } from "@/src/shapePreloader";
import frameStyles from "@/src/components/MapInspector.module.css";
import styles from "./WatchPage.module.css";
import { WatchErrorDialog } from "./WatchErrorDialog";

const GameView = lazy(() =>
  import("@/src/components/GameView").then((mod) => ({
    default: mod.GameView,
  })),
);
const PlayerHUD = lazy(() =>
  import("@/src/components/PlayerHUD").then((mod) => ({
    default: mod.PlayerHUD,
  })),
);
const ScoreScreen = lazy(() =>
  import("@/src/components/ScoreScreen").then((mod) => ({
    default: mod.ScoreScreen,
  })),
);
const MapInfoDialog = lazy(() =>
  import("@/src/components/MapInfoDialog").then((mod) => ({
    default: mod.MapInfoDialog,
  })),
);
const ServerBrowser = lazy(() =>
  import("@/src/components/ServerBrowser").then((mod) => ({
    default: mod.ServerBrowser,
  })),
);

/**
 * The /watch page: a spectator client using the same frame layout as
 * the main app (sidebar left, toolbar top) with a subset of controls.
 * Landing shows the server list; joining attaches to the relay's shared
 * watch session. No TorqueScript, no missions, no moves — everything
 * arrives over the live stream.
 */
export function WatchPage() {
  const watchStatus = useLiveSelector((s) => s.watchStatus);
  const watchStatusMessage = useLiveSelector((s) => s.watchStatusMessage);
  const liveReady = useLiveSelector((s) => s.liveReady);
  const catchupProgress = useLiveSelector((s) => s.catchupProgress);
  const watchServer = useLiveSelector((s) => s.watchServer);
  const relayConnected = useLiveSelector((s) => s.relayConnected);
  const servers = useLiveSelector((s) => s.servers);
  const serversLoading = useLiveSelector((s) => s.serversLoading);
  const listServers = useLiveSelector((s) => s.listServers);
  // Share links: ?address=ip:port joins that host directly; ?name=Server
  // joins the first exact name match from the server list.
  const [autoAddress, setAddressParam] = useQueryState("address");
  const [autoName, setNameParam] = useQueryState("name");
  const { sidebarOpen, setSidebarOpen } = useSettings();
  const [mapInfoOpen, setMapInfoOpen] = useState(false);
  const [scoreScreenOpen, setScoreScreenOpen] = useState(false);
  useAutoScoreScreen(setScoreScreenOpen);
  const isTouch = useTouchDevice();
  const isCommandCircuit = useCommandCircuit((s) => s.active);
  const invalidateRef = useRef<InvalidateFunction | null>(null);
  const missionName = useMissionName();
  const missionType = useMissionType();

  // Warm the shape cache during connect/catch-up dead time.
  const sessionActive = watchStatus !== null && watchStatus !== "ended";
  useEffect(() => {
    if (sessionActive) startShapePreload();
  }, [sessionActive]);

  // Close any open dialogs when the session ends (leave/kick) so they
  // don't reappear on the next join.
  useEffect(() => {
    if (!sessionActive) {
      setScoreScreenOpen(false);
      setMapInfoOpen(false);
    }
  }, [sessionActive]);

  // ── Auto-spectate from a share link ──
  // One attempt per page load: after a manual leave (or a failed match)
  // the normal server browser takes over.
  const [autoJoin, setAutoJoin] = useState<
    "pending" | "joined" | "notFound" | "off"
  >(autoAddress || autoName ? "pending" : "off");
  // Join-failure dialog dismissal; re-arms on the next session so a
  // later "session ended" failure gets its own transmission.
  const [errorAcknowledged, setErrorAcknowledged] = useState(false);
  useEffect(() => {
    if (sessionActive) setErrorAcknowledged(false);
  }, [sessionActive]);
  const requestedListRef = useRef(false);
  useEffect(() => {
    if (autoJoin !== "pending" || sessionActive) return;
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
    autoAddress,
    autoName,
    relayConnected,
    servers,
    serversLoading,
    listServers,
    watchServer,
  ]);

  const connecting = sessionActive && !(watchStatus === "live" && liveReady);

  // Match MapInspector: keep the indicator visible briefly after loading
  // completes so it fades rather than popping out.
  const [showLoadingIndicator, setShowLoadingIndicator] = useState(true);
  useEffect(() => {
    if (connecting) {
      setShowLoadingIndicator(true);
    } else {
      const timer = setTimeout(() => setShowLoadingIndicator(false), 500);
      return () => clearTimeout(timer);
    }
  }, [connecting]);

  // Reveal the view when the stream goes live on touch devices.
  useEffect(() => {
    if (watchStatus === "live" && isTouch) {
      setSidebarOpen(false);
    }
  }, [watchStatus, isTouch, setSidebarOpen]);

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

  const handleWatch = useCallback(
    (address: string) => {
      watchServer(address);
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
    [servers, watchServer, setSidebarOpen, setAddressParam, setNameParam],
  );

  const handleOpenMapInfo = useCallback(() => setMapInfoOpen(true), []);
  const handleOpenScoreScreen = useCallback(() => setScoreScreenOpen(true), []);
  const handleCanvasCreated = useCallback((state: RootState) => {
    invalidateRef.current = state.invalidate;
  }, []);

  if (!sessionActive) {
    // Share-link auto-join in progress: skip the server browser and show
    // the standard loading indicator until the session starts.
    if (autoJoin === "pending") {
      return (
        <div className={styles.Page}>
          <LoadingIndicator isLoading progress={null} />
        </div>
      );
    }
    // Join failures show as a transmission dialog first; the server
    // browser appears only via its call to action.
    const errorMessage =
      autoJoin === "notFound" ? (
        <>No server named &ldquo;{autoName}&rdquo; is currently listed.</>
      ) : watchStatus === "ended" && watchStatusMessage ? (
        watchStatusMessage
      ) : null;
    if (errorMessage != null && !errorAcknowledged) {
      return (
        <div className={styles.Page}>
          <WatchErrorDialog
            message={errorMessage}
            onBrowse={() => setErrorAcknowledged(true)}
          />
        </div>
      );
    }
    return (
      <div className={styles.Page}>
        <Suspense fallback={<GameDialogSpinner />}>
          <ServerBrowser
            title="Spectate a Tribes 2 Game"
            joinLabel="Spectate"
            fullScreen
            showWarriorField={false}
            dismissable={false}
            onJoin={handleWatch}
            onClose={() => {}}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <main className={frameStyles.Frame}>
      <header className={frameStyles.Toolbar}>
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
        <StreamingMissionInfo />
        {isCommandCircuit && isTouch && <ExitCommandCircuitButton />}
      </header>
      {sidebarOpen ? <div className={frameStyles.Backdrop} /> : null}
      <Activity mode={sidebarOpen ? "visible" : "hidden"}>
        <div className={frameStyles.Sidebar} data-open={sidebarOpen}>
          <InspectorControls
            variant="watch"
            missionName={missionName ?? ""}
            missionType={missionType ?? undefined}
            invalidateRef={invalidateRef}
            onOpenMapInfo={handleOpenMapInfo}
            onOpenScoreScreen={handleOpenScoreScreen}
            onClose={() => {
              setSidebarOpen(false);
            }}
          />
        </div>
      </Activity>
      <InputProvider>
        <div className={frameStyles.Content}>
          <div className={frameStyles.ThreeView}>
            <Suspense>
              <GameView
                spectator
                missionName=""
                dpr={mapInfoOpen || scoreScreenOpen ? 0.25 : undefined}
                onCreated={handleCanvasCreated}
              />
            </Suspense>
          </div>
          {liveReady && !scoreScreenOpen ? (
            <Suspense>
              <PlayerHUD />
            </Suspense>
          ) : null}
          <VisualInput />
          {showLoadingIndicator && (
            <LoadingIndicator
              id="loadingIndicator"
              isLoading={connecting}
              progress={watchStatus === "syncing" ? catchupProgress : null}
            />
          )}
        </div>
      </InputProvider>
      <footer className={frameStyles.PlayerBar} />
      {mapInfoOpen ? (
        <Suspense
          fallback={<GameDialogSpinner onClose={() => setMapInfoOpen(false)} />}
        >
          <MapInfoDialog
            onClose={() => setMapInfoOpen(false)}
            missionName={missionName ?? ""}
            missionType={missionType ?? ""}
          />
        </Suspense>
      ) : null}
      {scoreScreenOpen ? (
        <Suspense
          fallback={
            <GameDialogSpinner onClose={() => setScoreScreenOpen(false)} />
          }
        >
          <ScoreScreen onClose={() => setScoreScreenOpen(false)} />
        </Suspense>
      ) : null}
    </main>
  );
}
