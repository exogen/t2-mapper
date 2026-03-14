"use client";
import { Suspense } from "react";
import { NuqsAdapter } from "nuqs/adapters/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FeaturesProvider } from "@/src/components/FeaturesProvider";
import { MapInspector } from "@/src/components/MapInspector";
import { SettingsProvider } from "@/src/components/SettingsProvider";

// Three.js has its own loaders for textures and models, but we need to load other
// stuff too, e.g. missions, terrains, and more. This client is used for those.
const queryClient = new QueryClient();

export default function HomePage() {
  return (
    <Suspense>
      <NuqsAdapter>
        <FeaturesProvider>
          <QueryClientProvider client={queryClient}>
            <SettingsProvider>
              <MapInspector />
            </SettingsProvider>
          </QueryClientProvider>
        </FeaturesProvider>
      </NuqsAdapter>
    </Suspense>
  );
}
