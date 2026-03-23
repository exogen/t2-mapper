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
import { type Camera } from "three";
import { type RootState } from "@react-three/fiber";
import { type InvalidateFunction } from "@/src/components/ThreeCanvas";
import { InspectorControls } from "@/src/components/InspectorControls";
import { MissionSelect } from "@/src/components/MissionSelect";
import { StreamingMissionInfo } from "@/src/components/StreamingMissionInfo";
import { useSettings } from "@/src/components/SettingsProvider";
import {
  RecordingProvider,
  useRecording,
} from "@/src/components/RecordingProvider";
import { useFeatures } from "@/src/components/FeaturesProvider";
import {
  liveConnectionStore,
  useLiveSelector,
} from "@/src/state/liveConnectionStore";
import { usePublicWindowAPI } from "@/src/components/usePublicWindowAPI";
import {
  CurrentMission,
  useMissionQueryState,
} from "@/src/components/useQueryParams";
import { InputProvider } from "./InputProducer";
import { VisualInput } from "./VisualInput";
import { LoadingIndicator } from "./LoadingIndicator";
import { engineStore } from "../state/engineStore";
import {
  gameEntityStore,
  useDataSource,
  useMissionName,
  useMissionType,
} from "../state/gameEntityStore";
import { getMissionInfo } from "../manifest";
import {
  LuPanelLeftClose,
  LuPanelLeftOpen,
  LuPanelTopClose,
  LuPanelTopOpen,
} from "react-icons/lu";
import { cameraTourStore, useCameraTour } from "../state/cameraTourStore";
import { useTouchDevice } from "./useTouchDevice";
import { HiMiniArrowLeftEndOnRectangle } from "react-icons/hi2";
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
  const [serverBrowserOpen, setServerBrowserOpen] = useState(false);
  const [scoreScreenOpen, setScoreScreenOpen] = useState(false);
  const [choosingMap, setChoosingMap] = useState(false);
  const [missionLoadingProgress, setMissionLoadingProgress] = useState(0);
  const [showLoadingIndicator, setShowLoadingIndicator] = useState(true);
  const isTouch = useTouchDevice();
  const isTourActive = useCameraTour((s) => s.animation !== null);

  const changeMission = useCallback(
    (mission: CurrentMission) => {
      window.location.hash = "";
      clearFogEnabledOverride();
      setChoosingMap(false);
      cameraTourStore.getState().cancel();
      // Disconnect from any live server, unload any active recording, and
      // clear stream state before loading the new mission in map mode.
      const liveState = liveConnectionStore.getState();
      liveState.disconnectServer();
      engineStore.getState().setRecording(null);
      gameEntityStore.getState().endStreaming();
      setCurrentMission(mission);
      if (isTouch) {
        setSidebarOpen(false);
      }
    },
    [clearFogEnabledOverride, setCurrentMission, isTouch, setSidebarOpen],
  );

  usePublicWindowAPI({ onChangeMission: changeMission });

  const recording = useRecording();
  const dataSource = useDataSource();
  const hasStreamData = dataSource === "demo" || dataSource === "live";
  // Sync the mission query param when streaming data provides a mission name.
  const streamMissionName = useMissionName();
  const streamMissionType = useMissionType();

  useEffect(() => {
    if (!hasStreamData || !streamMissionName) return;
    try {
      const info = getMissionInfo(streamMissionName);
      const matchedType =
        streamMissionType && info.missionTypes.includes(streamMissionType)
          ? streamMissionType
          : undefined;
      setCurrentMission({
        missionName: streamMissionName,
        missionType: matchedType,
      });
    } catch {
      // Mission not in manifest — remove the query param.
      setCurrentMission(null);
    }
  }, [hasStreamData, streamMissionName, streamMissionType, setCurrentMission]);

  // Cancel "choosing map" when a new recording loads.
  useEffect(() => {
    if (recording) {
      setChoosingMap(false);
    }
  }, [recording]);

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

  const loadingProgress = missionLoadingProgress;
  const isLoading = loadingProgress < 1;

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

  const cameraRef = useRef<Camera | null>(null);
  const invalidateRef = useRef<InvalidateFunction | null>(null);

  const handleOpenMapInfo = useCallback(() => setMapInfoOpen(true), []);
  const handleOpenScoreScreen = useCallback(() => setScoreScreenOpen(true), []);
  const handleOpenServerBrowser = useCallback(() => {
    setServerBrowserOpen(true);
  }, []);
  const handleChooseMap = useCallback(() => setChoosingMap(true), []);
  const handleCancelChoosingMap = useCallback(() => {
    setChoosingMap(false);
  }, []);
  const handleCanvasCreated = useCallback((state: RootState) => {
    cameraRef.current = state.camera;
    invalidateRef.current = state.invalidate;
  }, []);

  return (
    <main className={styles.Frame}>
      <RecordingProvider>
        <header className={styles.Toolbar}>
          <button
            type="button"
            className={styles.ToggleSidebarButton}
            data-orientation="top"
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            onClick={(event) => {
              setSidebarOpen((open) => !open);
            }}
          >
            {sidebarOpen ? <LuPanelTopClose /> : <LuPanelTopOpen />}
          </button>
          <button
            type="button"
            className={styles.ToggleSidebarButton}
            data-orientation="left"
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            onClick={(event) => {
              setSidebarOpen((open) => !open);
            }}
          >
            {sidebarOpen ? <LuPanelLeftClose /> : <LuPanelLeftOpen />}
          </button>
          <Activity mode={hasStreamData && !choosingMap ? "visible" : "hidden"}>
            <StreamingMissionInfo />
          </Activity>
          <Activity mode={!hasStreamData || choosingMap ? "visible" : "hidden"}>
            <MissionSelect
              value={choosingMap ? "" : missionName}
              missionType={choosingMap ? "" : (missionType ?? "")}
              onChange={changeMission}
              autoFocus={choosingMap}
              onCancel={handleCancelChoosingMap}
            />
            {choosingMap && (
              <button
                type="button"
                className={styles.CancelButton}
                onClick={() => {
                  setChoosingMap(false);
                }}
              >
                Cancel
              </button>
            )}
          </Activity>
          {isTourActive && (
            <button
              type="button"
              className={styles.ExitTourButton}
              onClick={() => cameraTourStore.getState().cancel()}
            >
              <HiMiniArrowLeftEndOnRectangle />
              <span className={styles.ButtonLabel}>Exit tour</span>
            </button>
          )}
        </header>
        {sidebarOpen ? <div className={styles.Backdrop} /> : null}
        <Activity mode={sidebarOpen ? "visible" : "hidden"}>
          <div className={styles.Sidebar} data-open={sidebarOpen}>
            <InspectorControls
              missionName={missionName}
              missionType={missionType}
              choosingMap={choosingMap}
              cameraRef={cameraRef}
              invalidateRef={invalidateRef}
              onOpenMapInfo={handleOpenMapInfo}
              onOpenScoreScreen={
                hasStreamData ? handleOpenScoreScreen : undefined
              }
              onOpenServerBrowser={
                features.live ? handleOpenServerBrowser : undefined
              }
              onChooseMap={handleChooseMap}
              onCancelChoosingMap={handleCancelChoosingMap}
            />
          </div>
        </Activity>
        <InputProvider>
          <div className={styles.Content}>
            <div className={styles.ThreeView}>
              <Suspense>
                <GameView
                  missionName={missionName}
                  missionType={missionType}
                  dpr={
                    mapInfoOpen || serverBrowserOpen || scoreScreenOpen
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
            <VisualInput />
            {showLoadingIndicator && (
              <LoadingIndicator
                isLoading={isLoading}
                progress={loadingProgress}
              />
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
            <Suspense>
              <MapInfoDialog
                onClose={() => setMapInfoOpen(false)}
                missionName={missionName}
                missionType={missionType ?? ""}
              />
            </Suspense>
          </ViewTransition>
        ) : null}
        {serverBrowserOpen ? (
          <ViewTransition>
            <Suspense>
              <ServerBrowser onClose={() => setServerBrowserOpen(false)} />
            </Suspense>
          </ViewTransition>
        ) : null}
        {scoreScreenOpen ? (
          <ViewTransition>
            <Suspense>
              <ScoreScreen onClose={() => setScoreScreenOpen(false)} />
            </Suspense>
          </ViewTransition>
        ) : null}
      </RecordingProvider>
    </main>
  );
}
