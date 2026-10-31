import { Suspense, type ReactNode } from "react";
import { NuqsAdapter } from "nuqs/adapters/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { loadSkinManifest } from "../engine/playerSkins";
import { FeaturesProvider } from "./FeaturesProvider";
import { SettingsProvider } from "./SettingsProvider";

// Three.js has its own loaders for textures and models, but we need to load other
// stuff too, e.g. missions, terrains, and more. This client is used for those.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

// Prefetch the custom skins manifest at startup so it's loaded before any
// player model is built.
void loadSkinManifest();

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
