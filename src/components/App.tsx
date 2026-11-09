import { useEffect } from "react";
import {
  refreshAccount,
  refreshAccountOnFocus,
} from "../state/appAccountStore";
import { AppProviders } from "./AppProviders";
import { MapInspector } from "./MapInspector";
import { NewAddressDialog } from "./NewAddressDialog";

export default function App() {
  useEffect(() => {
    void refreshAccount();
    // Account state belongs to the app, including when the sidebar is hidden.
    const onFocus = () => void refreshAccountOnFocus();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  return (
    <AppProviders>
      <MapInspector />
      <NewAddressDialog />
    </AppProviders>
  );
}
