"use client";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, N8AO } from "@react-three/postprocessing";
import { Mission } from "@/src/components/Mission";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ObserverControls } from "@/src/components/ObserverControls";
import { InspectorControls } from "@/src/components/InspectorControls";
import { SettingsProvider } from "@/src/components/SettingsProvider";
import { ObserverCamera } from "@/src/components/ObserverCamera";

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

  // Update query params when state changes
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("mission", missionName);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [missionName, router]);

  return (
    <QueryClientProvider client={queryClient}>
      <main>
        <SettingsProvider>
          <Canvas shadows>
            <ObserverControls />
            <Mission key={missionName} name={missionName} />
            <ObserverCamera />
            <EffectComposer>
              <N8AO intensity={3} aoRadius={3} quality="performance" />
            </EffectComposer>
          </Canvas>
          <InspectorControls
            missionName={missionName}
            onChangeMission={setMissionName}
          />
        </SettingsProvider>
      </main>
    </QueryClientProvider>
  );
}
