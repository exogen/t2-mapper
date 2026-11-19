import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { cameraRegistry } from "../state/cameraRegistry";
import { useCaster } from "../state/casterStore";
import { clipStore } from "../state/clipStore";
import { useDataSource } from "../state/gameEntityStore";
import { inputControlsStore } from "../state/inputControls";
import { useInputMode } from "../state/inputModeStore";
import { selectCanChat, useLiveSelector } from "../state/liveConnectionStore";
import {
  selectCanPlayReplay,
  useReplaySelector,
} from "../state/replayConnectionStore";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { isFollowingPlayer } from "../state/watchFollow";
import { isWelcomeSplashOpen } from "../state/welcomeSplashState";
import { useClipDraftSaving } from "./clipControlsContext";
import { useSettings } from "./SettingsProvider";
import type { ShortcutHelpAvailability } from "./shortcutHelp";
import { useIsWatchSpectator } from "./useIsWatchSpectator";
import { SPEED_OPTIONS, useRecording, useSpeed } from "./usePlayback";
import { usePlayerOrbitLocked } from "./usePlayerOrbitLocked";
import { useTouchDevice } from "./useTouchDevice";

export function useShortcutHelpAvailability(
  wasPointerLocked: boolean,
  picker?: "map" | "demo",
): ShortcutHelpAvailability {
  const actionNames = useStore(
    inputControlsStore,
    useShallow((state) => Object.keys(state.actions)),
  );
  const { cameraMode, hasFollowTarget } = useStore(
    streamPlaybackStore,
    useShallow((state) => ({
      cameraMode: state.cameraMode,
      hasFollowTarget: isFollowingPlayer(),
    })),
  );
  const inputMode = useInputMode();
  const isTouchDevice = useTouchDevice();
  const orbitLocked = usePlayerOrbitLocked();
  const recording = useRecording();
  const dataSource = useDataSource();
  const isDemo = recording?.source === "demo";
  const localSpectator = useIsWatchSpectator();
  const spectatorReady = useIsWatchSpectator({ requireReady: true });
  const liveReady = useLiveSelector((state) => state.liveReady);
  const observerCameraReady =
    recording?.source === "live" &&
    (localSpectator ? spectatorReady : liveReady);
  const liveCanChat = useLiveSelector(selectCanChat);
  const { showChat } = useSettings();

  const activeClip = useStore(clipStore, (state) => state.active !== null);
  const draft = useStore(clipStore, (state) => state.draft !== null);
  const saving = useClipDraftSaving();
  const speedIndex = SPEED_OPTIONS.indexOf(useSpeed());
  const canPlayReplay = useReplaySelector(selectCanPlayReplay);

  const hasCastContext = useCaster((state) => state.context !== null);
  const quickCamReady =
    !activeClip &&
    !!cameraRegistry.perspective &&
    (dataSource === "demo" || (dataSource === "live" && spectatorReady));

  return {
    actions: new Set(actionNames),
    cameraMode,
    inputMode,
    pointerLocked: wasPointerLocked,
    mouseLockBlocked: !!isTouchDevice || isWelcomeSplashOpen(),
    observerCameraReady,
    localSpectator,
    orbitLocked,
    hasFollowTarget,
    quickCamRecallAvailable: quickCamReady,
    quickCamSaveAvailable: quickCamReady && hasCastContext,
    canPlayDemo: isDemo && !(draft && saving),
    canSeekDemo: isDemo && Number.isFinite(recording.duration),
    canDecreaseDemoSpeed: isDemo && !activeClip && speedIndex > 0,
    canIncreaseDemoSpeed:
      isDemo && !activeClip && speedIndex < SPEED_OPTIONS.length - 1,
    canPlayReplay,
    canChat: dataSource === "live" && showChat && liveCanChat,
    picker,
    isMac: /Mac|iPhone|iPad|iPod/.test(navigator.platform),
  };
}
