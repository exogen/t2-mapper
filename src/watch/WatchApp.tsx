"use client";
import { AppProviders } from "@/src/components/AppProviders";
import { WatchPage } from "./WatchPage";

export function WatchApp() {
  return (
    <AppProviders>
      <WatchPage />
    </AppProviders>
  );
}
