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
  DemoProvider,
  useDemoActions,
  useDemoRecording,
} from "@/src/components/DemoProvider";
import { DemoPlayback } from "@/src/components/DemoPlayback";
import { DemoControls } from "@/src/components/DemoControls";
import { PlayerHUD } from "@/src/components/PlayerHUD";
import { ChatSoundPlayer } from "@/src/components/ChatSoundPlayer";
import {
  getMissionList,
  getMissionInfo,
  findMissionByDemoName,
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
  const { missionName, missionType } = currentMission;
  const [mapInfoOpen, setMapInfoOpen] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [showLoadingIndicator, setShowLoadingIndicator] = useState(true);
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
      setLoadingProgress(progress);
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
        <DemoProvider>
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
                  <CamerasProvider>
                    <AudioProvider>
                      <Mission
                        key={`${missionName}~${missionType}`}
                        name={missionName}
                        missionType={missionType}
                        onLoadingChange={handleLoadingChange}
                      />
                      <ObserverCamera />
                      <DebugElements />
                      <DemoPlayback />
                      <ChatSoundPlayer />
                      <DemoAwareControls
                        isTouch={isTouch}
                        joystickStateRef={joystickStateRef}
                        joystickZoneRef={joystickZoneRef}
                        lookJoystickStateRef={lookJoystickStateRef}
                        lookJoystickZoneRef={lookJoystickZoneRef}
                      />
                    </AudioProvider>
                  </CamerasProvider>
                </Canvas>
              </div>
              <PlayerHUD />
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
              <DemoMissionSync
                changeMission={changeMission}
                currentMission={currentMission}
              />
              <DemoControls />
              <DemoWindowAPI />
            </KeyboardControls>
          </SettingsProvider>
        </DemoProvider>
      </main>
    </QueryClientProvider>
  );
}

/** Map from Tribes 2 game type display names to manifest mission type codes. */
const GAME_TYPE_TO_MISSION_TYPE: Record<string, string> = {
  "Capture the Flag": "CTF",
  "Capture and Hold": "CnH",
  Deathmatch: "DM",
  "Team Deathmatch": "TDM",
  Siege: "Siege",
  Bounty: "Bounty",
  Rabbit: "Rabbit",
};

/**
 * When a demo recording is loaded, switch to the mission it was recorded on.
 */
function DemoMissionSync({
  changeMission,
  currentMission,
}: {
  changeMission: (mission: CurrentMission) => void;
  currentMission: CurrentMission;
}) {
  const recording = useDemoRecording();

  useEffect(() => {
    if (!recording?.missionName) return;

    const missionName = findMissionByDemoName(recording.missionName);
    if (!missionName) {
      console.warn(
        `Demo mission "${recording.missionName}" not found in manifest`,
      );
      return;
    }

    const info = getMissionInfo(missionName);
    const missionTypeCode = recording.gameType
      ? GAME_TYPE_TO_MISSION_TYPE[recording.gameType]
      : undefined;
    const missionType =
      missionTypeCode && info.missionTypes.includes(missionTypeCode)
        ? missionTypeCode
        : info.missionTypes[0];

    // Skip if we're already on the correct mission to avoid unnecessary
    // remount cascades (e.g. after a Suspense boundary restores).
    if (
      currentMission.missionName === missionName &&
      currentMission.missionType === missionType
    ) {
      return;
    }

    changeMission({ missionName, missionType });
  }, [recording, changeMission, currentMission]);

  return null;
}

/**
 * Disables observer/touch controls when a demo recording is loaded so they
 * don't fight the animated camera.
 */
function DemoAwareControls({
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
  const recording = useDemoRecording();
  if (recording) return null;
  if (isTouch === null) return null;
  if (isTouch) {
    return (
      <TouchCameraMovement
        joystickState={joystickStateRef}
        joystickZone={joystickZoneRef}
        lookJoystickState={lookJoystickStateRef}
        lookJoystickZone={lookJoystickZoneRef}
      />
    );
  }
  return <ObserverControls />;
}

/** Exposes `window.loadDemoRecording` for automation/testing. */
function DemoWindowAPI() {
  const { setRecording } = useDemoActions();

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
      <MapInspector />
    </Suspense>
  );
}
