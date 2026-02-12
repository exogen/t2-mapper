"use client";
import { useState, useEffect, useCallback, Suspense, useRef } from "react";
import { Canvas, GLProps } from "@react-three/fiber";
import { NoToneMapping, SRGBColorSpace, PCFShadowMap, Camera } from "three";
import { Mission } from "@/src/components/Mission";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ObserverControls } from "@/src/components/ObserverControls";
import {
  TouchJoystick,
  TouchCameraMovement,
  type JoystickState,
} from "@/src/components/TouchControls";
import { InspectorControls } from "@/src/components/InspectorControls";
import { useTouchDevice } from "@/src/components/useTouchDevice";
import { SettingsProvider } from "@/src/components/SettingsProvider";
import { ObserverCamera } from "@/src/components/ObserverCamera";
import { AudioProvider } from "@/src/components/AudioContext";
import { DebugElements } from "@/src/components/DebugElements";
import { CamerasProvider } from "@/src/components/CamerasProvider";
import { getMissionList, getMissionInfo } from "@/src/manifest";
import { createParser, useQueryState } from "nuqs";

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

  const changeMission = useCallback(
    (mission: CurrentMission) => {
      window.location.hash = "";
      setCurrentMission(mission);
    },
    [setCurrentMission],
  );

  const isTouch = useTouchDevice();
  const { missionName, missionType } = currentMission;
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
        <SettingsProvider>
          <div id="canvasContainer">
            {showLoadingIndicator && (
              <div id="loadingIndicator" data-complete={!isLoading}>
                <div className="LoadingSpinner" />
                <div className="LoadingProgress">
                  <div
                    className="LoadingProgress-bar"
                    style={{ width: `${loadingProgress * 100}%` }}
                  />
                </div>
                <div className="LoadingProgress-text">
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
                  {isTouch === null ? null : isTouch ? (
                    <TouchCameraMovement
                      joystickState={joystickStateRef}
                      joystickZone={joystickZoneRef}
                      lookJoystickState={lookJoystickStateRef}
                      lookJoystickZone={lookJoystickZoneRef}
                    />
                  ) : (
                    <ObserverControls />
                  )}
                </AudioProvider>
              </CamerasProvider>
            </Canvas>
          </div>
          {isTouch && (
            <TouchJoystick
              joystickState={joystickStateRef}
              joystickZone={joystickZoneRef}
              lookJoystickState={lookJoystickStateRef}
              lookJoystickZone={lookJoystickZoneRef}
            />
          )}
          <InspectorControls
            missionName={missionName}
            missionType={missionType}
            onChangeMission={changeMission}
            cameraRef={cameraRef}
            isTouch={isTouch}
          />
        </SettingsProvider>
      </main>
    </QueryClientProvider>
  );
}

export default function HomePage() {
  return (
    <Suspense>
      <MapInspector />
    </Suspense>
  );
}
