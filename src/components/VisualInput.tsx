import { lazy, Suspense } from "react";
import { useStore } from "zustand";
import { useTouchDevice } from "./useTouchDevice";
import { useCameraTour } from "../state/cameraTourStore";
import { useDirector } from "../state/demoDirectorStore";
import { useCommandCircuit } from "../state/commandCircuitStore";
import { useLiveSelector } from "../state/liveConnectionStore";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { useSettings } from "./SettingsProvider";
import { useRecording } from "./usePlayback";
import { WatchedPlayerHud } from "./WatchedPlayerHud";
import styles from "./VisualInput.module.css";

const TouchJoystick = lazy(() =>
  import("@/src/components/TouchJoystick").then((mod) => ({
    default: mod.TouchJoystick,
  })),
);

const KeyboardOverlay = lazy(() =>
  import("@/src/components/KeyboardOverlay").then((mod) => ({
    default: mod.KeyboardOverlay,
  })),
);

export function VisualInput() {
  const isTouch = useTouchDevice();
  const isTourActive = useCameraTour((s) => s.animation !== null);
  // While the auto-director drives the camera, a touch is the interrupt
  // gesture — the joysticks would fight it.
  const isDirecting = useDirector((s) => s.status === "playing");
  // Command circuit pans/zooms via direct touch gestures; the free-fly
  // joysticks don't apply.
  const isCommandCircuit = useCommandCircuit((s) => s.active);
  const { showInputOverlay } = useSettings();
  const recording = useRecording();
  const isWatcher = useLiveSelector((s) => s.role === "watcher");
  const cameraMode = useStore(streamPlaybackStore, (s) => s.cameraMode);

  // Demo playback and watch-mode spectating drive the camera from the
  // stream unless the user breaks it free: the recorded view ("original")
  // and first-person follow accept no movement or look input, so the
  // joysticks would be dead weight. Free-fly has full controls and
  // orbit-follow consumes look input. Everything else (map explore, live
  // observer fly and follow) always has camera controls.
  const isStreamCamera =
    recording?.source === "demo" || (recording?.source === "live" && isWatcher);
  const hasCameraControls = isStreamCamera
    ? cameraMode === "freeFly" || cameraMode === "orbitOverride"
    : true;

  // isTouch can be `null` before we know for sure — only render the
  // desktop HUD once it's definitively false.
  const isDesktop = isTouch === false;
  // The watched-player chip shows during any stream, independent of the
  // input-overlay setting; the overlay obeys it.
  const showWatchedPlayer = isDesktop && !!recording;
  const showOverlay = isDesktop && showInputOverlay;

  return (
    <>
      {isTouch &&
      !isTourActive &&
      !isDirecting &&
      !isCommandCircuit &&
      hasCameraControls ? (
        <Suspense>
          <TouchJoystick />
        </Suspense>
      ) : null}
      {showWatchedPlayer || showOverlay ? (
        <div className={styles.Stack}>
          {showOverlay ? (
            <Suspense>
              <KeyboardOverlay />
            </Suspense>
          ) : null}
          {/* Not lazy, and kept outside the overlay's Suspense so the
              overlay's first chunk load never hides the chip. */}
          {showWatchedPlayer ? <WatchedPlayerHud /> : null}
        </div>
      ) : null}
    </>
  );
}
