"use client";
import { Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// import { LiveConnectionProvider } from "@/src/components/LiveConnection";
import { FeaturesProvider } from "@/src/components/FeaturesProvider";
import { MapInspector } from "@/src/components/MapInspector";

// Three.js has its own loaders for textures and models, but we need to load other
// stuff too, e.g. missions, terrains, and more. This client is used for those.
const queryClient = new QueryClient();

export default function HomePage() {
  return (
    <Suspense>
      <FeaturesProvider>
        <QueryClientProvider client={queryClient}>
          <MapInspector />
        </QueryClientProvider>
      </FeaturesProvider>
    </Suspense>
  );
}
