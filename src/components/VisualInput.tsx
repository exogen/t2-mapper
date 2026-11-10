import { lazy, Suspense } from "react";
import { useStore } from "zustand";
import { useTouchDevice } from "./useTouchDevice";
import { useIsWatchSpectator } from "./useIsWatchSpectator";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { subtitlesStore } from "../state/commentaryTrack";
import { useControls, useSettings } from "./SettingsProvider";
import { useRecording } from "./usePlayback";
import { WatchedPlayerHUD } from "./WatchedPlayerHUD";
import styles from "./VisualInput.module.css";
import { useCameraOwner } from "../state/cameraOwner";
import { useInputMode } from "../state/inputModeStore";

const TouchJoystick = lazy(() =>
  import("./TouchJoystick").then((mod) => ({
    default: mod.TouchJoystick,
  })),
);

const KeyboardOverlay = lazy(() =>
  import("./KeyboardOverlay").then((mod) => ({
    default: mod.KeyboardOverlay,
  })),
);

export function VisualInput({
  menuOpen = false,
  cameraLauncherVisible = false,
}: {
  menuOpen?: boolean;
  cameraLauncherVisible?: boolean;
}) {
  const isTouch = useTouchDevice();
  const cameraOwner = useCameraOwner();
  const inputMode = useInputMode();
  // Tour > director > command circuit > input. The joysticks show only
  // while local input owns the camera: a touch is the director's
  // interrupt gesture, and the command circuit pans and zooms by direct
  // touch, so joysticks would fight both.
  const { showInputOverlay } = useSettings();
  const { touchMode } = useControls();
  const recording = useRecording();
  const isWatcher = useIsWatchSpectator();
  const cameraMode = useStore(streamPlaybackStore, (s) => s.cameraMode);

  // Only free-fly shows touch sticks during demo playback or watch-mode
  // spectating. Live server observers track follow separately in inputMode.
  // Map exploration ignores the inactive stream camera's default mode.
  const isStreamCamera =
    recording?.source === "demo" || (recording?.source === "live" && isWatcher);
  const hasCameraControls = isStreamCamera
    ? cameraMode === "freeFly"
    : inputMode !== "follow";

  // isTouch can be `null` before we know for sure — only render the
  // desktop HUD once it's definitively false.
  const isDesktop = isTouch === false;
  // Keep the followed player's name available on touch screens, clearing
  // the bottom controls while the camera menu is open.
  const showWatchedPlayer =
    !!recording && (isDesktop || (isTouch === true && !menuOpen));
  // Subtitles sit where the overlay does; when they are actually up
  // (setting on AND lines found for this demo) they take the space.
  const subtitlesUp = useStore(subtitlesStore, (s) => s.showing);
  const showOverlay = isDesktop && showInputOverlay && !subtitlesUp;
  let stackClass = styles.Stack;
  if (isTouch) {
    stackClass =
      cameraLauncherVisible && touchMode !== "dualStick"
        ? styles.MobileStackWithLauncher
        : styles.MobileStack;
  }

  return (
    <>
      {isTouch && !menuOpen && cameraOwner === "input" && hasCameraControls ? (
        <div className={styles.TouchControls}>
          <Suspense>
            <TouchJoystick />
          </Suspense>
        </div>
      ) : null}
      {showWatchedPlayer || showOverlay ? (
        <div className={stackClass}>
          {showOverlay ? (
            <Suspense>
              <KeyboardOverlay />
            </Suspense>
          ) : null}
          {/* Not lazy, and kept outside the overlay's Suspense so the
              overlay's first chunk load never hides the chip. */}
          {showWatchedPlayer ? <WatchedPlayerHUD /> : null}
        </div>
      ) : null}
    </>
  );
}
