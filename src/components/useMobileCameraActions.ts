import { useStore } from "zustand";
import { resolveCameraOwner, useCameraOwner } from "../state/cameraOwner";
import { commandCircuitStore } from "../state/commandCircuitStore";
import { isCurrentPlayback } from "../state/engineStore";
import { notifySubscribers } from "../state/inputControls";
import { inputModeStore, useInputMode } from "../state/inputModeStore";
import {
  liveConnectionStore,
  useLiveSelector,
} from "../state/liveConnectionStore";
import { replayConnectionStore } from "../state/replayConnectionStore";
import { requestNativeCameraMode } from "../state/mobileNativeCamera";
import {
  cycleLocalCameraPlayer,
  getLocalCameraCapabilities,
  selectLocalCameraMode,
} from "../state/selectCameraMode";
import {
  streamPlaybackStore,
  type DemoCameraMode,
} from "../state/streamPlaybackStore";
import { useStreamSnapshot } from "../state/streamSnapshotStore";
import { isRelayRecording } from "../stream/demoDate";
import { useFlagCameras } from "./useFlagCameras";
import { useFollowCamera } from "./useFollowCamera";
import { useIsWatchSpectator } from "./useIsWatchSpectator";
import { useRecording } from "./usePlayback";

/** Add touch buttons to the existing camera actions without replacing their behavior. */
export function useMobileCameraActions() {
  const recording = useRecording();
  const owner = useCameraOwner();
  const inputMode = useInputMode();
  const watching = useIsWatchSpectator();
  const watchingReady = useIsWatchSpectator({ requireReady: true });
  const nativeReady = useLiveSelector(
    (state) =>
      state.role === "player" &&
      state.gameStatus === "connected" &&
      state.liveReady,
  );
  const cameraMode = useStore(streamPlaybackStore, (state) => state.cameraMode);
  const followCapabilities = useStreamSnapshot(
    getLocalCameraCapabilities,
    (a, b) =>
      a.canFollow === b.canFollow &&
      a.canFirstPerson === b.canFirstPerson &&
      a.canCyclePlayers === b.canCyclePlayers,
  );
  const flags = useFlagCameras().filter(
    (flag) => flag.slot === 1 || flag.slot === 2,
  );
  const followCamera = useFollowCamera();

  const localCamera =
    recording?.source === "demo" ||
    (recording?.source === "live" && watchingReady);
  const nativeCamera =
    recording?.source === "live" &&
    !watching &&
    nativeReady &&
    (inputMode === "fly" || inputMode === "follow");
  const manualView = owner === "input" || owner === "commandCircuit";
  const currentPlayback = recording != null && isCurrentPlayback(recording);
  const canSelectMode =
    owner === "input" && currentPlayback && (localCamera || nativeCamera);
  const hasOriginalView =
    recording?.source === "demo" &&
    !isRelayRecording(recording.recorderName ?? null);
  const canFollowFlags = manualView && localCamera && followCamera.enabled;
  const canFindTarget = manualView && localCamera && currentPlayback;
  const canCyclePlayers =
    manualView &&
    currentPlayback &&
    (nativeCamera || (localCamera && followCapabilities.canCyclePlayers));
  const canSeek =
    recording?.source === "demo" &&
    owner !== "tour" &&
    Number.isFinite(recording.duration) &&
    currentPlayback;
  const selectedMode: DemoCameraMode = nativeCamera
    ? inputMode === "follow"
      ? "orbitOverride"
      : "freeFly"
    : cameraMode;
  const modeAvailable = {
    original: true,
    freeFly: true,
    orbitOverride: nativeCamera || followCapabilities.canFollow,
    firstPersonOverride: nativeCamera || followCapabilities.canFirstPerson,
  };
  const modes = [
    ...(hasOriginalView
      ? [{ id: "original" as const, label: "Original view" }]
      : []),
    { id: "freeFly" as const, label: "Free-fly" },
    { id: "orbitOverride" as const, label: "Follow" },
    ...(!(recording?.source === "live" && !watching)
      ? [{ id: "firstPersonOverride" as const, label: "First person" }]
      : []),
  ].map((mode) => ({
    ...mode,
    active: selectedMode === mode.id,
    enabled: canSelectMode && modeAvailable[mode.id],
  }));

  function cameraAccess(
    allowCommandCircuit = false,
  ): "local" | "native" | null {
    // Deferred actions run after the drawer exits; readiness and native input
    // mode may have changed while its closing animation was running.
    const currentOwner = resolveCameraOwner();
    if (
      !recording ||
      !isCurrentPlayback(recording) ||
      (currentOwner !== "input" &&
        !(allowCommandCircuit && currentOwner === "commandCircuit"))
    ) {
      return null;
    }
    if (recording.source === "demo") {
      return "local";
    }
    const live = liveConnectionStore.getState();
    const localSpectator = recording.streamingPlayback?.localSpectator === true;
    if (live.role === "watcher" || localSpectator) {
      const ready =
        (live.role === "watcher" && live.liveReady) ||
        (localSpectator && replayConnectionStore.getState().ready);
      return ready ? "local" : null;
    }
    const currentInputMode = inputModeStore.getState().mode;
    if (
      live.role !== "player" ||
      live.gameStatus !== "connected" ||
      !live.liveReady ||
      (currentInputMode !== "fly" && currentInputMode !== "follow")
    ) {
      return null;
    }
    return "native";
  }

  function selectMode(mode: DemoCameraMode): boolean {
    const access = cameraAccess();
    if (!access) return false;
    if (access === "local") {
      return selectLocalCameraMode(
        mode,
        recording?.source === "demo" &&
          !isRelayRecording(recording.recorderName ?? null),
      );
    }
    if (mode !== "freeFly" && mode !== "orbitOverride") return false;
    return requestNativeCameraMode(
      recording!,
      mode === "freeFly" ? "fly" : "follow",
    );
  }

  function cyclePlayer(direction: "next" | "prev") {
    const access = cameraAccess(true);
    if (!access) return;
    if (access === "local") {
      if (cycleLocalCameraPlayer(direction === "next" ? 1 : -1)) {
        leaveCommandCircuit();
      }
      return;
    }
    leaveCommandCircuit();
    requestNativeCameraMode(
      recording!,
      "follow",
      direction === "next" ? 1 : -1,
    );
  }

  function leaveCommandCircuit() {
    if (resolveCameraOwner() === "commandCircuit") {
      commandCircuitStore.getState().deactivate();
    }
  }

  function seek(action: string) {
    if (canSeek) notifySubscribers(action);
  }

  return {
    modes,
    selectMode,
    flags,
    canFollowFlags,
    followFlag(slot: number): boolean {
      return (
        canFollowFlags &&
        (slot === 1 || slot === 2) &&
        followCamera.followFlag(slot)
      );
    },
    canCyclePlayers,
    previousPlayer() {
      cyclePlayer("prev");
    },
    nextPlayer() {
      cyclePlayer("next");
    },
    canFindTarget,
    findTarget() {
      if (cameraAccess(true) === "local") {
        notifySubscribers("findTarget");
      }
    },
    canSeek,
    rewind30() {
      seek("seekBackwardLarge");
    },
    rewind5() {
      seek("seekBackward");
    },
    forward5() {
      seek("seekForward");
    },
    forward30() {
      seek("seekForwardLarge");
    },
  };
}
