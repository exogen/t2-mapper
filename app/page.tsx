"use client";
import {
  useState,
  useEffect,
  useCallback,
  Suspense,
  useRef,
  lazy,
} from "react";
import { Canvas, GLProps } from "@react-three/fiber";
import { NoToneMapping, SRGBColorSpace, PCFShadowMap, Camera } from "three";
import { Mission } from "@/src/components/Mission";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  ObserverControls,
  KEYBOARD_CONTROLS,
} from "@/src/components/ObserverControls";
import { KeyboardOverlay } from "@/src/components/KeyboardOverlay";
import {
  TouchJoystick,
  TouchCameraMovement,
  type JoystickState,
} from "@/src/components/TouchControls";
import { KeyboardControls } from "@react-three/drei";
import { InspectorControls } from "@/src/components/InspectorControls";
import { useTouchDevice } from "@/src/components/useTouchDevice";
import { SettingsProvider } from "@/src/components/SettingsProvider";
import { ObserverCamera } from "@/src/components/ObserverCamera";
import { AudioProvider } from "@/src/components/AudioContext";
import { DebugElements } from "@/src/components/DebugElements";
import { CamerasProvider } from "@/src/components/CamerasProvider";
import {
  RecordingProvider,
  usePlaybackActions,
  useRecording,
} from "@/src/components/RecordingProvider";
import { EntityScene } from "@/src/components/EntityScene";
import { TickProvider } from "@/src/components/TickProvider";
import { SceneLighting } from "@/src/components/SceneLighting";
import { PlayerHUD } from "@/src/components/PlayerHUD";
import {
  LiveConnectionProvider,
  useLiveConnection,
} from "@/src/components/LiveConnection";
import { ServerBrowser } from "@/src/components/ServerBrowser";
import {
  FeaturesProvider,
  useFeatures,
} from "@/src/components/FeaturesProvider";

// Lazy-load demo and live streaming modules — they pull in heavy dependencies
// (demo parser, streaming engine, particles) that aren't needed for mission-only mode.
const DemoPlayback = lazy(() =>
  import("@/src/components/DemoPlayback").then((mod) => ({
    default: mod.DemoPlayback,
  })),
);
const DemoPlaybackControls = lazy(() =>
  import("@/src/components/DemoPlaybackControls").then((mod) => ({
    default: mod.DemoPlaybackControls,
  })),
);
const LiveObserver = lazy(() =>
  import("@/src/components/LiveObserver").then((mod) => ({
    default: mod.LiveObserver,
  })),
);
const ChatSoundPlayer = lazy(() =>
  import("@/src/components/ChatSoundPlayer").then((mod) => ({
    default: mod.ChatSoundPlayer,
  })),
);
import {
  getMissionList,
  getMissionInfo,
} from "@/src/manifest";
import { createParser, parseAsBoolean, useQueryState } from "nuqs";
import styles from "./page.module.css";

const MapInfoDialog = lazy(() =>
  import("@/src/components/MapInfoDialog").then((mod) => ({
    default: mod.MapInfoDialog,
  })),
);

// Three.js has its own loaders for textures and models, but we need to load other
// stuff too, e.g. missions, terrains, and more. This client is used for those.
const queryClient = new QueryClient();

// Renderer settings to match Tribes 2's simple rendering pipeline.
// Tribes 2 (Torque engine, 2001) worked entirely in gamma/sRGB space with no HDR
// or tone mapping. We disable tone mapping and ensure proper sRGB output.
const glSettings: GLProps = {
  toneMapping: NoToneMapping,
  outputColorSpace: SRGBColorSpace,
};

type CurrentMission = {
  missionName: string;
  missionType?: string;
};

const defaultMission: CurrentMission = {
  missionName: "RiverDance",
  missionType: "CTF",
};

const parseAsMissionWithType = createParser<CurrentMission>({
  parse(query: string) {
    const [missionName, missionType] = query.split("~");
    let selectedMissionType = missionType;
    const availableMissionTypes = getMissionInfo(missionName).missionTypes;
    if (!missionType || !availableMissionTypes.includes(missionType)) {
      selectedMissionType = availableMissionTypes[0];
    }
    return { missionName, missionType: selectedMissionType };
  },
  serialize({ missionName, missionType }): string {
    const availableMissionTypes = getMissionInfo(missionName).missionTypes;
    if (availableMissionTypes.length === 1) {
      return missionName;
    }
    return `${missionName}~${missionType}`;
  },
  eq(a, b) {
    return a.missionName === b.missionName && a.missionType === b.missionType;
  },
}).withDefault(defaultMission);

function MapInspector() {
  const [currentMission, setCurrentMission] = useQueryState(
    "mission",
    parseAsMissionWithType,
  );
  const [fogEnabledOverride, setFogEnabledOverride] = useQueryState(
    "fog",
    parseAsBoolean,
  );

  const clearFogEnabledOverride = useCallback(() => {
    setFogEnabledOverride(null);
  }, [setFogEnabledOverride]);

  const changeMission = useCallback(
    (mission: CurrentMission) => {
      window.location.hash = "";
      clearFogEnabledOverride();
      setCurrentMission(mission);
    },
    [setCurrentMission, clearFogEnabledOverride],
  );

  const isTouch = useTouchDevice();
  const features = useFeatures();
  const live = useLiveConnection();
  const { missionName, missionType } = currentMission;
  const [mapInfoOpen, setMapInfoOpen] = useState(false);
  const [serverBrowserOpen, setServerBrowserOpen] = useState(false);
  const [missionLoadingProgress, setMissionLoadingProgress] = useState(0);
  const [showLoadingIndicator, setShowLoadingIndicator] = useState(true);

  // During live join, show progress based on connection status.
  // Relay status order: connecting → challenging → authenticating → connected.
  // Once liveReady (first ghost arrives), loading is complete.
  const liveLoadingProgress = live.adapter != null
    ? live.liveReady
      ? 1
      : live.gameStatus === "connected" ? 0.8
      : live.gameStatus === "authenticating" ? 0.6
      : live.gameStatus === "challenging" ? 0.3
      : live.gameStatus === "connecting" ? 0.2
      : 0.1
    : null;

  // Reset stale mission progress when live mode takes over, so it can't
  // flash through if liveLoadingProgress briefly becomes null.
  useEffect(() => {
    if (liveLoadingProgress != null) {
      setMissionLoadingProgress(0);
    }
  }, [liveLoadingProgress != null]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadingProgress = liveLoadingProgress ?? missionLoadingProgress;
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

  useEffect(() => {
    // For automation, like the t2-maps app!
    window.setMissionName = (missionName: string) => {
      const availableMissionTypes = getMissionInfo(missionName).missionTypes;
      changeMission({
        missionName,
        missionType: availableMissionTypes[0],
      });
    };
    window.getMissionList = getMissionList;
    window.getMissionInfo = getMissionInfo;

    return () => {
      delete window.setMissionName;
      delete window.getMissionList;
      delete window.getMissionInfo;
    };
  }, [changeMission]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyI" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
      setMapInfoOpen(true);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const handleLoadingChange = useCallback(
    (_loading: boolean, progress: number = 0) => {
      setMissionLoadingProgress(progress);
    },
    [],
  );

  const cameraRef = useRef<Camera | null>(null);
  const joystickStateRef = useRef<JoystickState>({ angle: 0, force: 0 });
  const joystickZoneRef = useRef<HTMLDivElement | null>(null);
  const lookJoystickStateRef = useRef<JoystickState>({ angle: 0, force: 0 });
  const lookJoystickZoneRef = useRef<HTMLDivElement | null>(null);

  return (
    <QueryClientProvider client={queryClient}>
      <main>
        <RecordingProvider>
          <SettingsProvider
            fogEnabledOverride={fogEnabledOverride}
            onClearFogEnabledOverride={clearFogEnabledOverride}
          >
            <KeyboardControls map={KEYBOARD_CONTROLS}>
              <div id="canvasContainer" className={styles.CanvasContainer}>
                {showLoadingIndicator && (
                  <div
                    id="loadingIndicator"
                    className={styles.LoadingIndicator}
                    data-complete={!isLoading}
                  >
                    <div className={styles.Spinner} />
                    <div className={styles.Progress}>
                      <div
                        className={styles.ProgressBar}
                        style={{ width: `${loadingProgress * 100}%` }}
                      />
                    </div>
                    <div className={styles.ProgressText}>
                      {Math.round(loadingProgress * 100)}%
                    </div>
                  </div>
                )}
                <Canvas
                  frameloop="always"
                  gl={glSettings}
                  shadows={{ type: PCFShadowMap }}
                  onCreated={(state) => {
                    cameraRef.current = state.camera;
                  }}
                >
                  <TickProvider>
                  <CamerasProvider>
                    <AudioProvider>
                      <MissionWhenIdle
                        missionName={missionName}
                        missionType={missionType}
                        onLoadingChange={handleLoadingChange}
                      />
                      <SceneLighting />
                      <EntityScene missionType={missionType} />
                      <ObserverCamera />
                      <DebugElements />
                      <StreamingComponents
                        isTouch={isTouch}
                        joystickStateRef={joystickStateRef}
                        joystickZoneRef={joystickZoneRef}
                        lookJoystickStateRef={lookJoystickStateRef}
                        lookJoystickZoneRef={lookJoystickZoneRef}
                      />
                    </AudioProvider>
                  </CamerasProvider>
                  </TickProvider>
                </Canvas>
              </div>
              <StreamingHUD />
              {isTouch && (
                <TouchJoystick
                  joystickState={joystickStateRef}
                  joystickZone={joystickZoneRef}
                  lookJoystickState={lookJoystickStateRef}
                  lookJoystickZone={lookJoystickZoneRef}
                />
              )}
              {isTouch === false && <KeyboardOverlay />}
              <InspectorControls
                missionName={missionName}
                missionType={missionType}
                onChangeMission={changeMission}
                onOpenMapInfo={() => setMapInfoOpen(true)}
                onOpenServerBrowser={features.live ? () => setServerBrowserOpen(true) : undefined}
                cameraRef={cameraRef}
                isTouch={isTouch}
              />
              {mapInfoOpen && (
                <Suspense fallback={null}>
                  <MapInfoDialog
                    open={mapInfoOpen}
                    onClose={() => setMapInfoOpen(false)}
                    missionName={missionName}
                    missionType={missionType ?? ""}
                  />
                </Suspense>
              )}
              <ServerBrowserDialog
                open={serverBrowserOpen}
                onClose={() => setServerBrowserOpen(false)}
              />
              <StreamingOverlay />
              <DemoWindowAPI />
            </KeyboardControls>
          </SettingsProvider>
        </RecordingProvider>
      </main>
    </QueryClientProvider>
  );
}

/**
 * Only mount Mission (TorqueScript runtime, .mis loading) when NOT streaming.
 * During demo/live playback, all scene data comes from ghosts — no need for
 * the heavy TorqueScript execution pipeline.
 */
function MissionWhenIdle({
  missionName,
  missionType,
  onLoadingChange,
}: {
  missionName: string;
  missionType: string;
  onLoadingChange: (isLoading: boolean, progress?: number) => void;
}) {
  const recording = useRecording();
  const { adapter: liveAdapter } = useLiveConnection();
  const isStreaming = recording != null || liveAdapter != null;

  if (isStreaming) return null;

  return (
    <Mission
      key={`${missionName}~${missionType}`}
      name={missionName}
      missionType={missionType}
      onLoadingChange={onLoadingChange}
    />
  );
}

/**
 * In-Canvas components that depend on streaming mode. Mounts the appropriate
 * controller (DemoPlayback or LiveObserver) and disables observer controls
 * during streaming.
 */
function StreamingComponents({
  isTouch,
  joystickStateRef,
  joystickZoneRef,
  lookJoystickStateRef,
  lookJoystickZoneRef,
}: {
  isTouch: boolean | null;
  joystickStateRef: React.RefObject<JoystickState>;
  joystickZoneRef: React.RefObject<HTMLDivElement | null>;
  lookJoystickStateRef: React.RefObject<JoystickState>;
  lookJoystickZoneRef: React.RefObject<HTMLDivElement | null>;
}) {
  const recording = useRecording();
  const live = useLiveConnection();
  const isLive = live.adapter != null;
  const isStreaming = recording != null || isLive;

  // Show ObserverControls for: non-streaming mode, OR live mode.
  // During live, ObserverControls provides the same camera controls
  // (pointer lock, drag-to-rotate, WASD fly) and LiveObserver intercepts
  // click-while-locked to cycle observed players instead of nextCamera.
  // During demo playback, the demo drives the camera so no controls needed.
  const showObserverControls = !isStreaming || isLive;

  return (
    <>
      {recording && (
        <Suspense fallback={null}>
          <DemoPlayback />
        </Suspense>
      )}
      {isLive && (
        <Suspense fallback={null}>
          <LiveObserver />
        </Suspense>
      )}
      {isStreaming && (
        <Suspense fallback={null}>
          <ChatSoundPlayer />
        </Suspense>
      )}
      {showObserverControls && isTouch !== null && (
        isTouch ? (
          <TouchCameraMovement
            joystickState={joystickStateRef}
            joystickZone={joystickZoneRef}
            lookJoystickState={lookJoystickStateRef}
            lookJoystickZone={lookJoystickZoneRef}
          />
        ) : (
          <ObserverControls />
        )
      )}
    </>
  );
}

/** HUD overlay — shown during streaming (demo or live). */
function StreamingHUD() {
  const recording = useRecording();
  const live = useLiveConnection();
  if (!recording && !live.adapter) return null;
  return <PlayerHUD />;
}

/** Playback controls overlay — only shown during demo playback. */
function StreamingOverlay() {
  const recording = useRecording();
  const live = useLiveConnection();
  if (!recording || live.adapter != null) return null;
  return (
    <Suspense fallback={null}>
      <DemoPlaybackControls />
    </Suspense>
  );
}

/** Server browser dialog connected to live state. */
function ServerBrowserDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const live = useLiveConnection();
  return (
    <ServerBrowser
      open={open}
      onClose={onClose}
      servers={live.servers}
      loading={live.serversLoading}
      onRefresh={live.listServers}
      onJoin={(address) => live.joinServer(address)}
      wsPing={live.wsPing}
    />
  );
}

/** Exposes `window.loadDemoRecording` for automation/testing. */
function DemoWindowAPI() {
  const { setRecording } = usePlaybackActions();

  useEffect(() => {
    window.loadDemoRecording = setRecording;
    return () => {
      delete window.loadDemoRecording;
    };
  }, [setRecording]);

  return null;
}

export default function HomePage() {
  return (
    <Suspense>
      <FeaturesProvider>
        <LiveConnectionProvider>
          <MapInspector />
        </LiveConnectionProvider>
      </FeaturesProvider>
    </Suspense>
  );
}
