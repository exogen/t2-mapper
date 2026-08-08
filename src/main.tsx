import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./main.css";
import App from "./components/App.tsx";

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
