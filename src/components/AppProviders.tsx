"use client";
import { Suspense, type ReactNode } from "react";
import { NuqsAdapter } from "nuqs/adapters/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  skinManifestQueryKey,
  fetchSkinManifest,
} from "@/src/components/PlayerModel";
import { FeaturesProvider } from "@/src/components/FeaturesProvider";
import { SettingsProvider } from "@/src/components/SettingsProvider";

// Three.js has its own loaders for textures and models, but we need to load other
// stuff too, e.g. missions, terrains, and more. This client is used for those.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

// Prefetch the custom skins manifest at startup so it's in the cache before
// any PlayerModel renders. This avoids a race where useQuery inside PlayerModel
// can't trigger a re-render during streaming (store mutations starve React's
// concurrent rendering).
queryClient.prefetchQuery({
  queryKey: skinManifestQueryKey,
  queryFn: fetchSkinManifest,
  staleTime: Infinity,
});

/** Shared provider stack for the main app and the /watch page. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <NuqsAdapter>
        <FeaturesProvider>
          <QueryClientProvider client={queryClient}>
            <SettingsProvider>{children}</SettingsProvider>
          </QueryClientProvider>
        </FeaturesProvider>
      </NuqsAdapter>
    </Suspense>
  );
}
