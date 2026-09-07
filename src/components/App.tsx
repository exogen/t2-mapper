import { AppProviders } from "./AppProviders";
import { MapInspector } from "./MapInspector";
import { NewAddressDialog } from "./NewAddressDialog";

export default function App() {
  return (
    <AppProviders>
      <MapInspector />
      <NewAddressDialog />
    </AppProviders>
  );
}
