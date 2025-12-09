"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Canvas } from "@react-three/fiber";
import { NoToneMapping, SRGBColorSpace } from "three";
import { Mission } from "@/src/components/Mission";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ObserverControls } from "@/src/components/ObserverControls";
import { InspectorControls } from "@/src/components/InspectorControls";
import { SettingsProvider } from "@/src/components/SettingsProvider";
import { ObserverCamera } from "@/src/components/ObserverCamera";
import { AudioProvider } from "@/src/components/AudioContext";
import { DebugElements } from "@/src/components/DebugElements";
import { CamerasProvider } from "@/src/components/CamerasProvider";
import { getMissionList, getMissionInfo } from "@/src/manifest";

// three.js has its own loaders for textures and models, but we need to load other
// stuff too, e.g. missions, terrains, and more. This client is used for those.
const queryClient = new QueryClient();

// Renderer settings to match Tribes 2's simple rendering pipeline.
// Tribes 2 (Torque engine, 2001) worked entirely in gamma/sRGB space with no HDR
// or tone mapping. We disable tone mapping and ensure proper sRGB output.
const glSettings = {
  toneMapping: NoToneMapping,
  outputColorSpace: SRGBColorSpace,
};

function MapInspector() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Initialize state from query params
  const [missionName, setMissionName] = useState(
    searchParams.get("mission") || "TWL2_WoodyMyrk",
  );
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
    window.setMissionName = setMissionName;
    window.getMissionList = getMissionList;
    window.getMissionInfo = getMissionInfo;

    return () => {
      delete window.setMissionName;
      delete window.getMissionList;
      delete window.getMissionInfo;
    };
  }, []);

  // Update query params when state changes
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("mission", missionName);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [missionName, router]);

  const handleLoadingChange = useCallback(
    (_loading: boolean, progress: number = 0) => {
      setLoadingProgress(progress);
    },
    [],
  );

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
            <Canvas shadows frameloop="always" gl={glSettings}>
              <CamerasProvider>
                <AudioProvider>
                  <Mission
                    key={missionName}
                    name={missionName}
                    onLoadingChange={handleLoadingChange}
                  />
                  <ObserverCamera />
                  <DebugElements />
                  <ObserverControls />
                </AudioProvider>
              </CamerasProvider>
            </Canvas>
          </div>
          <InspectorControls
            missionName={missionName}
            onChangeMission={setMissionName}
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
