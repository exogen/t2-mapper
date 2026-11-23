import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./main.css";
import App from "./components/App.tsx";
import {
  initializeBrowserDiagnostics,
  stopBrowserDiagnostics,
} from "./diagnostics/browserDiagnostics";
import { installPlaybackMetrics } from "./diagnostics/playbackMetrics";

const stopPlaybackMetrics = initializeBrowserDiagnostics()
  ? installPlaybackMetrics()
  : undefined;
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    stopPlaybackMetrics?.();
    stopBrowserDiagnostics();
  });

// iOS Safari can still pinch-zoom the page via its proprietary GestureEvents
// in cases touch-action doesn't cover (it ignores the viewport meta's
// user-scalable=no since iOS 10). Cancelling them blocks that zoom path.
for (const type of ["gesturestart", "gesturechange"]) {
  document.addEventListener(type, (e) => e.preventDefault(), {
    passive: false,
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Warm the mission-load critical path (asset-host connection, .mis, root
// script, terrain, sky) in parallel with the initial React render.
import("./prefetchMission")
  .then((mod) => mod.prefetchFromLocation())
  .catch(() => {});
