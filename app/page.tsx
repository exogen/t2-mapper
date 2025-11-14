"use client";
import { useState, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { Mission } from "./Mission";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ObserverControls } from "./ObserverControls";
import { InspectorControls } from "./InspectorControls";
import { SettingsProvider } from "./SettingsProvider";
import { PerspectiveCamera } from "@react-three/drei";
import { EffectComposer, N8AO } from "@react-three/postprocessing";
import { useSearchParams, useRouter } from "next/navigation";

// three.js has its own loaders for textures and models, but we need to load other
// stuff too, e.g. missions, terrains, and more. This client is used for those.
const queryClient = new QueryClient();

export default function HomePage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Initialize state from query params
  const [missionName, setMissionName] = useState(
    searchParams.get("mission") || "TWL2_WoodyMyrk"
  );
  const [fogEnabled, setFogEnabled] = useState(
    searchParams.get("fog") === "true"
  );

  // Update query params when state changes
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("mission", missionName);
    params.set("fog", String(fogEnabled));
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [missionName, fogEnabled, router]);

  return (
    <SettingsProvider fogEnabled={fogEnabled}>
      <QueryClientProvider client={queryClient}>
        <main>
          <Canvas shadows>
            <ObserverControls />
            <Mission key={missionName} name={missionName} />
            <PerspectiveCamera
              makeDefault
              position={[-512, 256, -512]}
              fov={90}
            />
            <EffectComposer>
              <N8AO intensity={3} aoRadius={3} quality="performance" />
            </EffectComposer>
          </Canvas>
          <InspectorControls
            missionName={missionName}
            onChangeMission={setMissionName}
            fogEnabled={fogEnabled}
            onChangeFogEnabled={setFogEnabled}
          />
        </main>
      </QueryClientProvider>
    </SettingsProvider>
  );
}
