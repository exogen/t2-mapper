"use client";
import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Mission } from "./Mission";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ObserverControls } from "./ObserverControls";
import { InspectorControls } from "./InspectorControls";
import { SettingsProvider } from "./SettingsProvider";
import { PerspectiveCamera } from "@react-three/drei";
import { EffectComposer, N8AO } from "@react-three/postprocessing";

// three.js has its own loaders for textures and models, but we need to load other
// stuff too, e.g. missions, terrains, and more. This client is used for those.
const queryClient = new QueryClient();

export default function HomePage() {
  const [missionName, setMissionName] = useState("TWL2_WoodyMyrk");
  const [fogEnabled, setFogEnabled] = useState(false);

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
