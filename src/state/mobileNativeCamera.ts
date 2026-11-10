import { cameraTourStore } from "./cameraTourStore";
import { resolveCameraOwner } from "./cameraOwner";
import { commandCircuitStore } from "./commandCircuitStore";
import { demoDirectorStore } from "./demoDirectorStore";
import { engineStore, isCurrentPlayback } from "./engineStore";
import { notifySubscribers } from "./inputControls";
import { inputModeStore } from "./inputModeStore";
import { liveConnectionStore } from "./liveConnectionStore";
import type { LiveStreamAdapter } from "../stream/liveStreaming";
import type { StreamRecording } from "../stream/types";

type NativeMode = "fly" | "follow";

type NativeCameraIntent = {
  recording: StreamRecording;
  adapter: LiveStreamAdapter;
  desiredMode: NativeMode;
  playerDirection: 1 | -1 | null;
  update(): void;
  cancel(): void;
};

let pendingIntent: NativeCameraIntent | null = null;

function currentMode(recording: StreamRecording, adapter: LiveStreamAdapter) {
  const live = liveConnectionStore.getState();
  const mode = inputModeStore.getState().mode;
  return recording.source === "live" &&
    recording.streamingPlayback?.localSpectator !== true &&
    isCurrentPlayback(recording) &&
    resolveCameraOwner() === "input" &&
    live.adapter === adapter &&
    live.role === "player" &&
    live.gameStatus === "connected" &&
    live.liveReady &&
    (mode === "fly" || mode === "follow")
    ? mode
    : null;
}

/** Keep drawer requests idempotent while native mode changes await the server. */
export function requestNativeCameraMode(
  recording: StreamRecording,
  desiredMode: NativeMode,
  playerDirection: 1 | -1 | null = null,
): boolean {
  const adapter = liveConnectionStore.getState().adapter;
  if (!adapter || currentMode(recording, adapter) == null) return false;
  if (
    pendingIntent?.recording === recording &&
    pendingIntent.adapter === adapter
  ) {
    pendingIntent.desiredMode = desiredMode;
    // An explicit mode choice replaces any earlier player-cycle request.
    pendingIntent.playerDirection = playerDirection;
    pendingIntent.update();
    return true;
  }
  pendingIntent?.cancel();

  let unsubscribe = () => {};
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let awaitingMode: NativeMode | null = null;
  const intent: NativeCameraIntent = {
    recording,
    adapter,
    desiredMode,
    playerDirection,
    cancel() {
      unsubscribe();
      clearTimeout(timeout);
      if (pendingIntent === intent) pendingIntent = null;
    },
    update() {
      const mode = currentMode(recording, adapter);
      if (mode == null) {
        intent.cancel();
        return;
      }
      // A newer choice may arrive while the previous toggle is in flight.
      // Wait for that acknowledgement before deciding whether to toggle back.
      if (awaitingMode != null && mode !== awaitingMode) return;
      awaitingMode = null;
      if (mode !== intent.desiredMode) {
        awaitingMode = mode === "fly" ? "follow" : "fly";
        clearTimeout(timeout);
        // Match the existing observer-toggle retry window.
        timeout = setTimeout(intent.cancel, 1500);
        notifySubscribers("toggleObserverMode");
        return;
      }
      const direction = intent.playerDirection;
      intent.cancel();
      if (mode === "follow" && direction != null) {
        notifySubscribers(direction === 1 ? "nextPlayerKey" : "prevPlayerKey");
      }
    },
  };
  pendingIntent = intent;
  const cleanups = [
    inputModeStore.subscribe(intent.update),
    liveConnectionStore.subscribe(intent.update),
    engineStore.subscribe(intent.update),
    cameraTourStore.subscribe(intent.update),
    demoDirectorStore.subscribe(intent.update),
    commandCircuitStore.subscribe(intent.update),
  ];
  unsubscribe = () => cleanups.forEach((cleanup) => cleanup());
  intent.update();
  return true;
}
