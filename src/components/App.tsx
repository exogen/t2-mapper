"use client";
import { AppProviders } from "@/src/components/AppProviders";
import { MapInspector } from "@/src/components/MapInspector";
import { NewAddressDialog } from "@/src/components/NewAddressDialog";

export default function HomePage() {
  return (
    <AppProviders>
      <MapInspector />
      <NewAddressDialog />
    </AppProviders>
  );
}
